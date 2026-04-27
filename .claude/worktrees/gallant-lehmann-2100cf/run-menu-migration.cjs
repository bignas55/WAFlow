/**
 * run-menu-migration.cjs
 *
 * Adds bot_menu_options table + menu columns to bot_config.
 * Safe to run multiple times — skips anything already in place.
 *
 * Run from the project root:
 *   node run-menu-migration.cjs
 */

require("dotenv/config");
const mysql = require("mysql2/promise");

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set in .env"); process.exit(1); }

  const conn = await mysql.createConnection(url);

  // ── 1. Create bot_menu_options table ──────────────────────────────────────
  await exec(conn,
    `CREATE TABLE IF NOT EXISTS bot_menu_options (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id   INT NOT NULL,
      item_number INT NOT NULL,
      title       VARCHAR(255) NOT NULL,
      description VARCHAR(500),
      response    TEXT NOT NULL,
      action_type VARCHAR(50) NOT NULL DEFAULT 'reply',
      is_active   TINYINT(1) NOT NULL DEFAULT 1,
      sort_order  INT NOT NULL DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_menu_item (tenant_id, item_number)
    )`,
    "Create bot_menu_options table"
  );

  // ── 2. Add columns to bot_config (one at a time, skip if already exists) ──
  const columns = [
    { name: "enable_menu_mode", def: "TINYINT(1) NOT NULL DEFAULT 0" },
    { name: "menu_trigger",     def: "VARCHAR(255) DEFAULT 'menu'"   },
    { name: "menu_greeting",    def: "TEXT"                          },
    { name: "menu_footer",      def: "VARCHAR(500)"                  },
  ];

  for (const col of columns) {
    // Check if column already exists
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'bot_config'
         AND COLUMN_NAME  = ?`,
      [col.name]
    );
    if (rows[0].cnt > 0) {
      console.log(`⏭️  bot_config.${col.name} already exists — skipped`);
      continue;
    }
    await exec(conn,
      `ALTER TABLE bot_config ADD COLUMN ${col.name} ${col.def}`,
      `Add bot_config.${col.name}`
    );
  }

  await conn.end();
  console.log("\n🎉 Migration complete — restart your dev server.");
}

async function exec(conn, sql, label) {
  try {
    await conn.query(sql);
    console.log(`✅  ${label}`);
  } catch (e) {
    console.error(`❌  ${label}: ${e.message}`);
    throw e;
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
