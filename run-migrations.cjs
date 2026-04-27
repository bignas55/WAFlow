#!/usr/bin/env node
/**
 * Standalone migration runner — no drizzle-kit required.
 * Usage:  node run-migrations.js
 *
 * Reads DATABASE_URL from .env, connects via mysql2, then
 * executes any migration files not yet recorded in __drizzle_migrations.
 */

const fs   = require("fs");
const path = require("path");

// ── 1. Load .env ────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l.trim() && !l.startsWith("#"))
    .forEach(l => {
      const idx = l.indexOf("=");
      if (idx === -1) return;
      const key = l.slice(0, idx).trim();
      const val = l.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL not set in .env");
  process.exit(1);
}

// ── 2. Connect ───────────────────────────────────────────────────────────────
const mysql = require("mysql2/promise");

async function run() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log("✅  Connected to MySQL");

  // Ensure tracking table exists
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      hash       VARCHAR(255) NOT NULL UNIQUE,
      created_at BIGINT
    )
  `);

  // ── 3. Find migration files ─────────────────────────────────────────────
  const migrationsDir = path.join(__dirname, "drizzle", "migrations");
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  // Which hashes are already applied?
  // Force re-run migrations that recorded 0 statements (bad parse from old bug)
  const FORCE_RERUN = [
    // Previously had 0 statements due to parser bug — keep empty now that they're applied
  ];
  if (FORCE_RERUN.length) {
    await conn.execute(
      `DELETE FROM __drizzle_migrations WHERE hash IN (${FORCE_RERUN.map(() => "?").join(",")})`,
      FORCE_RERUN
    );
    console.log(`🔁  Reset ${FORCE_RERUN.length} migration(s) for re-run`);
  }

  const [applied] = await conn.execute("SELECT hash FROM __drizzle_migrations");
  const appliedSet = new Set(applied.map(r => r.hash));

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`⏭   Already applied: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

    // Split on semicolons; strip comment lines WITHIN each chunk before filtering
    const statements = sql
      .split(";")
      .map(s =>
        s.split("\n")
          .filter(line => !line.trim().startsWith("--"))
          .join("\n")
          .trim()
      )
      .filter(s => s.length > 0);

    // Expand multi-column ALTER TABLE ... ADD COLUMN IF NOT EXISTS a, ADD COLUMN IF NOT EXISTS b
    // into individual single-column statements (MySQL doesn't support IF NOT EXISTS syntax)
    function expandAlter(stmt) {
      if (!/ADD\s+COLUMN/i.test(stmt)) return [stmt];
      const tableMatch = stmt.match(/ALTER\s+TABLE\s+(`?\w+`?)/i);
      if (!tableMatch) return [stmt];
      const tbl = tableMatch[1];
      // everything after "ALTER TABLE tablename"
      const body = stmt.replace(/ALTER\s+TABLE\s+`?\w+`?\s*/i, "").trim();
      // split on commas that precede ADD COLUMN / ADD INDEX etc.
      const clauses = body.split(/,\s*(?=ADD\s)/i).map(c => c.trim()).filter(Boolean);
      if (clauses.length <= 1) {
        // single clause — just strip IF NOT EXISTS
        return [`ALTER TABLE ${tbl} ${body.replace(/IF\s+NOT\s+EXISTS\s+/gi, "")}`];
      }
      return clauses.map(c => `ALTER TABLE ${tbl} ${c.replace(/IF\s+NOT\s+EXISTS\s+/gi, "")}`);
    }

    const expanded = statements.flatMap(expandAlter);
    console.log(`\n🔄  Applying: ${file} (${expanded.length} statements)`);

    for (const stmt of expanded) {
      try {
        await conn.execute(stmt);
      } catch (err) {
        // Column/table/index already exists → safe to ignore
        if (
          err.code === "ER_DUP_FIELDNAME" ||
          err.code === "ER_TABLE_EXISTS_ERROR" ||
          err.code === "ER_DUP_KEYNAME" ||
          err.code === "ER_CANT_DROP_FIELD_OR_KEY" ||
          (err.message && err.message.includes("Duplicate column"))
        ) {
          console.log(`   ⚠️   Already exists (skipping): ${err.message.slice(0, 80)}`);
        } else {
          console.error(`   ❌  Error in ${file}:\n      ${err.message}`);
          console.error("      Statement:", stmt.slice(0, 150));
          await conn.end();
          process.exit(1);
        }
      }
    }

    await conn.execute(
      "INSERT IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
      [file, Date.now()]
    );
    console.log(`   ✅  Done: ${file}`);
    ran++;
  }

  await conn.end();

  if (ran === 0) {
    console.log("\n✨  All migrations already applied — nothing to do.");
  } else {
    console.log(`\n🎉  Applied ${ran} migration(s) successfully.`);
  }
}

run().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
