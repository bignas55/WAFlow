/**
 * autoMigrate.ts
 *
 * Runs lightweight, idempotent schema migrations at server startup.
 * Each migration checks information_schema before altering — safe to run
 * multiple times without risk of duplicate-column errors.
 *
 * Add new migrations to the MIGRATIONS array in order; never remove old ones.
 */

import mysql from "mysql2/promise";
import { encryptIfNeeded } from "./encryptionService.js";

async function columnExists(
  conn: mysql.Connection,
  table: string,
  column: string,
): Promise<boolean> {
  const dbName = new URL(
    process.env.DATABASE_URL || "mysql://waflow:waflow_password@localhost:3306/waflow"
  ).pathname.slice(1);

  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column],
  );
  return rows.length > 0;
}

async function tableExists(
  conn: mysql.Connection,
  table: string,
): Promise<boolean> {
  const dbName = new URL(
    process.env.DATABASE_URL || "mysql://waflow:waflow_password@localhost:3306/waflow"
  ).pathname.slice(1);

  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table],
  );
  return rows.length > 0;
}

const MIGRATIONS: Array<{
  name: string;
  run: (conn: mysql.Connection) => Promise<void>;
}> = [
  // ── 0010–0022: All bot_config columns added after migration 0006 ──────────
  // These were previously only applied via drizzle-kit push/migrate.
  // Running them here ensures every fresh install gets the full schema
  // automatically on server startup without any manual CLI steps.
  {
    name: "0010_to_0022_bot_config_columns",
    async run(conn) {
      const cols: Array<[string, string]> = [
        // 0010 features
        ["enable_daily_summary",         "BOOLEAN NOT NULL DEFAULT TRUE"],
        ["enable_weekly_report",         "BOOLEAN NOT NULL DEFAULT TRUE"],
        ["enable_follow_up",             "BOOLEAN NOT NULL DEFAULT TRUE"],
        ["enable_no_show_notify",        "BOOLEAN NOT NULL DEFAULT TRUE"],
        ["enable_re_engagement",         "BOOLEAN NOT NULL DEFAULT FALSE"],
        ["re_engagement_days",           "INT NOT NULL DEFAULT 30"],
        ["re_engagement_message",        "TEXT"],
        ["enable_appt_confirmation",     "BOOLEAN NOT NULL DEFAULT TRUE"],
        ["enable_webhook",               "BOOLEAN NOT NULL DEFAULT FALSE"],
        ["webhook_url",                  "VARCHAR(1000) NOT NULL DEFAULT ''"],
        // 0011 AI fallback
        ["ai_fallback_model",            "VARCHAR(100) NOT NULL DEFAULT ''"],
        ["ai_fallback_api_url",          "VARCHAR(255) NOT NULL DEFAULT ''"],
        ["ai_fallback_api_key",          "TEXT"],
        // 0012 birthday + auto-close
        ["enable_birthday_messages",     "BOOLEAN NOT NULL DEFAULT FALSE"],
        ["birthday_message",             "TEXT"],
        ["enable_conversation_auto_close","BOOLEAN NOT NULL DEFAULT FALSE"],
        ["auto_close_days",              "INT NOT NULL DEFAULT 7"],
        // 0014 booking page
        ["booking_slug",                 "VARCHAR(100)"],
        ["booking_page_title",           "VARCHAR(255) NOT NULL DEFAULT 'Book an Appointment'"],
        ["booking_page_description",     "TEXT"],
        ["deposit_required",             "BOOLEAN NOT NULL DEFAULT FALSE"],
        ["deposit_amount",               "DECIMAL(10,2) NOT NULL DEFAULT 0.00"],
        ["payment_link_template",        "VARCHAR(1000) NOT NULL DEFAULT ''"],
        // 0016 advert / business profile
        ["business_whatsapp_number",     "VARCHAR(30)"],
        ["business_website",             "VARCHAR(500)"],
        ["business_tagline",             "VARCHAR(500)"],
        ["business_logo_url",            "VARCHAR(1000)"],
        // 0018 loyalty
        ["loyalty_enabled",              "TINYINT NOT NULL DEFAULT 0"],
        ["loyalty_points_per_visit",     "INT NOT NULL DEFAULT 10"],
        ["loyalty_bronze_threshold",     "INT NOT NULL DEFAULT 0"],
        ["loyalty_silver_threshold",     "INT NOT NULL DEFAULT 50"],
        ["loyalty_gold_threshold",       "INT NOT NULL DEFAULT 150"],
        // 0021 SMS fallback + service menu
        ["enable_sms_fallback",          "TINYINT NOT NULL DEFAULT 0"],
        ["enable_service_menu",          "TINYINT NOT NULL DEFAULT 0"],
        ["service_menu_trigger",         "VARCHAR(255)"],
        // users table: sub_role + 2FA (0014)
      ];

      for (const [col, def] of cols) {
        if (!(await columnExists(conn, "bot_config", col))) {
          await conn.execute(`ALTER TABLE bot_config ADD COLUMN \`${col}\` ${def}`);
          console.log(`  ✅ Added bot_config.${col}`);
        }
      }

      // users table: 2FA + sub_role columns (added in 0014 / 0015)
      const userCols: Array<[string, string]> = [
        ["two_factor_enabled",      "BOOLEAN NOT NULL DEFAULT FALSE"],
        ["two_factor_secret",       "VARCHAR(64)"],
        ["two_factor_backup_codes", "JSON"],
        ["sub_role",                "ENUM('owner','manager','agent','viewer') NOT NULL DEFAULT 'owner'"],
        ["password_version",        "INT NOT NULL DEFAULT 1"],
        ["reset_token",             "VARCHAR(128)"],
        ["reset_token_expires",     "DATETIME"],
        ["invite_token",            "VARCHAR(128)"],
        ["invite_expires_at",       "DATETIME"],
        ["invite_accepted",         "BOOLEAN NOT NULL DEFAULT TRUE"],
      ];
      for (const [col, def] of userCols) {
        if (!(await columnExists(conn, "users", col))) {
          await conn.execute(`ALTER TABLE users ADD COLUMN \`${col}\` ${def}`);
          console.log(`  ✅ Added users.${col}`);
        }
      }
    },
  },

  // ── 0024: Update stale Ollama model names ─────────────────────────────────
  // Replaces hardcoded legacy model names with the current default so tenants
  // whose config was created with an old model name work out-of-the-box.
  {
    name: "0024_update_default_model",
    async run(conn) {
      const legacyModels = ["llama3.2", "llama3.1:8b", "llama-3.1-8b-instant", "llama3-8b-8192", "llama3:latest"];
      const defaultModel = process.env.AI_MODEL || "gemma4:latest";
      const defaultUrl   = process.env.AI_API_URL || "http://localhost:11434/v1";
      // Always encrypt the key — pipeline calls decrypt() on every read
      const defaultKey   = encryptIfNeeded(process.env.AI_API_KEY || "ollama");

      for (const old of legacyModels) {
        const [result] = await conn.execute<mysql.OkPacket>(
          `UPDATE bot_config SET ai_model = ?, ai_api_url = ?, ai_api_key = ? WHERE ai_model = ?`,
          [defaultModel, defaultUrl, defaultKey, old],
        );
        if (result.affectedRows > 0) {
          console.log(`  ✅ Updated ${result.affectedRows} tenant(s) from model "${old}" → "${defaultModel}"`);
        }
      }
    },
  },

  // ── 0023: Menu options feature ────────────────────────────────────────────
  {
    name: "0023_bot_menu_options",
    async run(conn) {
      // Add menu columns to bot_config
      const menuCols: Array<[string, string]> = [
        ["enable_menu_mode", "TINYINT NOT NULL DEFAULT 0"],
        ["menu_trigger",     "VARCHAR(255) DEFAULT 'menu'"],
        ["menu_greeting",    "TEXT"],
        ["menu_footer",      "VARCHAR(500)"],
      ];
      for (const [col, def] of menuCols) {
        if (!(await columnExists(conn, "bot_config", col))) {
          await conn.execute(`ALTER TABLE bot_config ADD COLUMN ${col} ${def}`);
          console.log(`  ✅ Added bot_config.${col}`);
        }
      }

      // Create bot_menu_options table
      if (!(await tableExists(conn, "bot_menu_options"))) {
        await conn.execute(`
          CREATE TABLE bot_menu_options (
            id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            tenant_id    INT NOT NULL,
            item_number  TINYINT NOT NULL,
            title        VARCHAR(255) NOT NULL,
            description  VARCHAR(500),
            response     TEXT,
            action_type  VARCHAR(50) NOT NULL DEFAULT 'reply',
            is_active    TINYINT NOT NULL DEFAULT 1,
            sort_order   INT NOT NULL DEFAULT 0,
            created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_tenant_item (tenant_id, item_number)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("  ✅ Created bot_menu_options table");
      }
    },
  },
  // ── 0025: Live AI receptionist leads table ───────────────────────────────
  {
    name: "0025_receptionist_leads",
    async run(conn) {
      if (!(await tableExists(conn, "receptionist_leads"))) {
        await conn.execute(`
          CREATE TABLE receptionist_leads (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            name       VARCHAR(255) NOT NULL,
            email      VARCHAR(255) NOT NULL,
            phone      VARCHAR(30),
            notes      TEXT,
            session_id VARCHAR(128) NOT NULL,
            converted  TINYINT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_leads_email (email),
            INDEX idx_leads_created (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("  ✅ Created receptionist_leads table");
      }
    },
  },

  // ── 0026: Subscription & billing columns ─────────────────────────────────
  {
    name: "0026_subscription_billing",
    async run(conn) {
      // users: trial + account status columns
      const userCols: Array<[string, string]> = [
        ["account_status",        "ENUM('trial_active','trial_expired','active_paid','suspended') NOT NULL DEFAULT 'trial_active'"],
        ["trial_start_date",      "DATETIME"],
        ["trial_end_date",        "DATETIME"],
        ["trial_reminder_10_sent","BOOLEAN NOT NULL DEFAULT FALSE"],
        ["trial_reminder_13_sent","BOOLEAN NOT NULL DEFAULT FALSE"],
        ["trial_reminder_14_sent","BOOLEAN NOT NULL DEFAULT FALSE"],
      ];
      for (const [col, def] of userCols) {
        if (!(await columnExists(conn, "users", col))) {
          await conn.execute(`ALTER TABLE users ADD COLUMN \`${col}\` ${def}`);
          console.log(`  ✅ Added users.${col}`);
        }
      }

      // payment_history table
      if (!(await tableExists(conn, "payment_history"))) {
        await conn.execute(`
          CREATE TABLE payment_history (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id      INT NOT NULL,
            plan           VARCHAR(50) NOT NULL,
            billing_cycle  ENUM('monthly','yearly','once') NOT NULL DEFAULT 'monthly',
            amount_zar     DECIMAL(10,2) NOT NULL,
            currency       VARCHAR(10) NOT NULL DEFAULT 'ZAR',
            payment_ref    VARCHAR(128) NOT NULL,
            easypay_ref    VARCHAR(128),
            easypay_number VARCHAR(50),
            status         ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
            paid_at        DATETIME,
            metadata       JSON,
            created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_payments_tenant (tenant_id),
            INDEX idx_payments_ref (payment_ref)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("  ✅ Created payment_history table");
      }

      // Backfill existing users: set trial dates if missing
      await conn.execute(`
        UPDATE users
        SET trial_start_date = created_at,
            trial_end_date   = DATE_ADD(created_at, INTERVAL 14 DAY),
            account_status   = CASE
              WHEN plan IN ('pro','enterprise','starter') THEN 'active_paid'
              WHEN DATE_ADD(created_at, INTERVAL 14 DAY) < NOW() THEN 'trial_expired'
              ELSE 'trial_active'
            END
        WHERE trial_start_date IS NULL AND role = 'user'
      `);
      console.log("  ✅ Backfilled trial dates for existing users");
    },
  },

  // ── 0027: Email verification columns ─────────────────────────────────────
  {
    name: "0027_email_verification",

    async run(conn) {
      const cols: [string, string][] = [
        ["email_verified",                    "BOOLEAN NOT NULL DEFAULT FALSE"],
        ["email_verification_code",           "VARCHAR(255) NULL"],
        ["email_verification_expires",        "DATETIME NULL"],
        ["email_verification_attempts",       "INT NOT NULL DEFAULT 0"],
        ["email_verification_resend_count",   "INT NOT NULL DEFAULT 0"],
        ["email_verification_resend_window_at","DATETIME NULL"],
      ];
      for (const [col, def] of cols) {
        try {
          await conn.execute(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
          console.log(`  ✅ Added users.${col}`);
        } catch (e: any) {
          if (!e.message?.includes("Duplicate column")) throw e;
        }
      }
      // Backfill: all existing users are considered already verified so they keep access
      await conn.execute(`UPDATE users SET email_verified = TRUE WHERE email_verified = FALSE`);
      console.log("  ✅ Backfilled email_verified=TRUE for existing users");
    },
  },

  // ── 0028: conversation_flows table (replaces data/flows.json) ─────────────
  {
    name: "0028_conversation_flows",
    async run(conn) {
      if (!(await tableExists(conn, "conversation_flows"))) {
        await conn.execute(`
          CREATE TABLE conversation_flows (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id  INT NOT NULL,
            flow_id    VARCHAR(50) NOT NULL,
            name       VARCHAR(120) NOT NULL,
            \`trigger\` VARCHAR(500) NOT NULL,
            nodes      JSON NOT NULL,
            is_active  BOOLEAN NOT NULL DEFAULT FALSE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX cf_tenant_idx (tenant_id),
            UNIQUE KEY cf_flow_id_tenant (flow_id, tenant_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("  ✅ Created conversation_flows table");

        // Migrate existing data from flows.json if it exists
        try {
          const fs = await import("fs");
          const path = await import("path");
          const filePath = path.resolve("data/flows.json");
          if (fs.existsSync(filePath)) {
            const rows: any[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            let migrated = 0;
            for (const row of rows) {
              if (!row.id || !row.tenantId) continue;
              await conn.execute(
                `INSERT IGNORE INTO conversation_flows (tenant_id, flow_id, name, \`trigger\`, nodes, is_active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  row.tenantId,
                  row.id,
                  row.name ?? "Untitled",
                  row.trigger ?? "",
                  JSON.stringify(row.nodes ?? []),
                  row.isActive ? 1 : 0,
                  row.createdAt ? new Date(row.createdAt) : new Date(),
                  row.updatedAt ? new Date(row.updatedAt) : new Date(),
                ]
              );
              migrated++;
            }
            console.log(`  ✅ Migrated ${migrated} flows from flows.json`);
          }
        } catch (e: any) {
          console.warn("  ⚠️  Could not migrate flows.json:", e.message);
        }
      } else {
        console.log("  ⏭️  conversation_flows already exists");
      }
    },
  },

  // ── 0029: it_support_tickets table (replaces data/it_tickets.json) ────────
  {
    name: "0029_it_support_tickets",
    async run(conn) {
      if (!(await tableExists(conn, "it_support_tickets"))) {
        await conn.execute(`
          CREATE TABLE it_support_tickets (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            tenant_id      INT NOT NULL,
            ticket_id      VARCHAR(50) NOT NULL,
            phone_number   VARCHAR(50) NOT NULL,
            contact_name   VARCHAR(255),
            category       VARCHAR(100) NOT NULL,
            priority       ENUM('high','medium','low') NOT NULL DEFAULT 'medium',
            status         ENUM('open','resolved','escalated') NOT NULL DEFAULT 'open',
            description    TEXT NOT NULL,
            answers        JSON NOT NULL,
            diagnosis      TEXT,
            sla_deadline_at DATETIME,
            resolved_at    DATETIME,
            created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX its_tenant_idx (tenant_id),
            INDEX its_status_idx (status),
            UNIQUE KEY its_ticket_tenant (ticket_id, tenant_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("  ✅ Created it_support_tickets table");
      } else {
        console.log("  ⏭️  it_support_tickets already exists");
      }
    },
  },

  // ── 0030: media columns on conversations ──────────────────────────────────
  {
    name: "0030_conversations_media",
    async run(conn) {
      const mediaCols: [string, string][] = [
        ["media_url",     "VARCHAR(1000) NULL"],
        ["media_type",    "ENUM('image','video','audio','document','sticker') NULL"],
        ["media_caption", "VARCHAR(1000) NULL"],
      ];
      for (const [col, def] of mediaCols) {
        if (!(await columnExists(conn, "conversations", col))) {
          await conn.execute(`ALTER TABLE conversations ADD COLUMN \`${col}\` ${def}`);
          console.log(`  ✅ Added conversations.${col}`);
        }
      }
    },
  },

  // ── 0031: tenant_id on business_rules ─────────────────────────────────────
  {
    name: "0031_business_rules_tenant",
    async run(conn) {
      if (!(await columnExists(conn, "business_rules", "tenant_id"))) {
        await conn.execute(
          `ALTER TABLE business_rules ADD COLUMN tenant_id INT NOT NULL DEFAULT 0 AFTER id`
        );
        await conn.execute(
          `ALTER TABLE business_rules ADD INDEX br_tenant_idx (tenant_id)`
        );
        console.log("  ✅ Added business_rules.tenant_id");
      }
    },
  },
];

/**
 * Run all pending migrations against the configured database.
 * Called once during server startup — safe to call on every boot.
 */
export async function runAutoMigrations(): Promise<void> {
  const conn = await mysql.createConnection(
    process.env.DATABASE_URL || "mysql://waflow:waflow_password@localhost:3306/waflow"
  );
  try {
    console.log("🔧 Running auto-migrations…");
    for (const migration of MIGRATIONS) {
      try {
        await migration.run(conn);
      } catch (err: any) {
        // Log but don't crash — a failed migration shouldn't prevent startup
        console.error(`❌ Migration "${migration.name}" failed:`, err.message);
      }
    }
    console.log("🔧 Auto-migrations complete.");
  } finally {
    await conn.end();
  }
}
