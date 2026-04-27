/**
 * WAFlow — Database Migration Runner
 *
 * Applies all pending SQL migrations in order.
 * Safe to run multiple times — skips already-applied migrations.
 *
 * Usage:
 *   node scripts/migrate.mjs
 */

import { createConnection } from "mysql2/promise";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load .env
config({ path: join(root, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌  DATABASE_URL not set in .env");
  process.exit(1);
}

// Parse mysql://user:pass@host:port/dbname
function parseUrl(url) {
  const u = new URL(url);
  return {
    host:     u.hostname,
    port:     parseInt(u.port || "3306"),
    user:     u.username || "root",
    password: decodeURIComponent(u.password || ""),
    database: u.pathname.replace(/^\//, ""),
    multipleStatements: true,
  };
}

async function main() {
  const cfg = parseUrl(DATABASE_URL);
  console.log(`\nConnecting to ${cfg.host}:${cfg.port}/${cfg.database} as ${cfg.user}...`);

  const conn = await createConnection(cfg);

  // ── Create migrations tracking table if it doesn't exist ──────────────────
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // ── Read already-applied migrations ───────────────────────────────────────
  const [applied] = await conn.execute("SELECT name FROM _migrations");
  const appliedSet = new Set(applied.map((r) => r.name));

  // ── Discover migration files ───────────────────────────────────────────────
  const migrationsDir = join(root, "drizzle", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // lexicographic order = 0000, 0001, 0002, …

  console.log(`\nFound ${files.length} migration file(s)\n`);

  let ranCount = 0;

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  -- ${file}  (already applied)`);
      continue;
    }

    const raw = readFileSync(join(migrationsDir, file), "utf8");

    // Drizzle migrations use "--> statement-breakpoint" as a delimiter.
    // Split on that marker, then also split on semicolons to handle
    // multi-statement blocks, and filter out empty/comment-only chunks.
    const statements = raw
      .split("--> statement-breakpoint")
      .flatMap((chunk) => chunk.split(/;\s*\n/))
      .map((s) => s.replace(/--[^\n]*/g, "").trim()) // strip line comments
      // MySQL doesn't support ADD COLUMN IF NOT EXISTS (MariaDB-only syntax).
      // Remove the IF NOT EXISTS so MySQL tries to add the column normally;
      // ER_DUP_FIELDNAME is already in SKIP_CODES so duplicates are ignored.
      .map((s) => s.replace(/\bADD COLUMN IF NOT EXISTS\b/gi, "ADD COLUMN"))
      .filter((s) => s.length > 0);

    if (statements.length === 0) {
      console.log(`  -- ${file}  (empty — skipping)`);
      continue;
    }

    process.stdout.write(`  >> ${file} (${statements.length} statement(s)) ... `);

    // MySQL error codes that mean "already applied" — safe to skip
    const SKIP_CODES = new Set([
      "ER_TABLE_EXISTS_ERROR",      // CREATE TABLE — table already exists
      "ER_DUP_FIELDNAME",           // ADD COLUMN   — column already exists
      "ER_DUP_KEYNAME",             // ADD INDEX    — index already exists
      "ER_DUP_ENTRY",               // INSERT       — unique row already there
      "ER_CANT_DROP_FIELD_OR_KEY",  // DROP INDEX/COLUMN — already removed
    ]);

    let skipped = 0;
    let failed = null;

    for (const stmt of statements) {
      try {
        await conn.execute(stmt);
      } catch (err) {
        if (SKIP_CODES.has(err.code)) {
          skipped++;
        } else {
          failed = err;
          break;
        }
      }
    }

    if (failed) {
      console.log(`\n\nFAILED: ${file}`);
      console.error(`  Error: ${failed.message}\n`);
      await conn.end();
      process.exit(1);
    }

    await conn.execute("INSERT INTO _migrations (name) VALUES (?)", [file]);
    const note = skipped > 0 ? ` (${skipped} already existed, skipped)` : "";
    console.log(`done${note}`);
    ranCount++;
  }

  await conn.end();

  if (ranCount === 0) {
    console.log("\nAll migrations already up to date.\n");
  } else {
    console.log(`\nApplied ${ranCount} migration(s) successfully.\n`);
  }
}

main().catch((err) => {
  console.error("\n❌  Unexpected error:", err.message);
  process.exit(1);
});
