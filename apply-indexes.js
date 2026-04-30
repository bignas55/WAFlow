#!/usr/bin/env node

import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set in .env file");
  process.exit(1);
}

async function applyMigration() {
  let connection;
  try {
    console.log("🚀 Applying database migration: Add missing indexes...\n");

    // Parse DATABASE_URL: mysql://user:password@host:port/database
    const url = new URL(DATABASE_URL);
    const config = {
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    };

    console.log(`📍 Connecting to database at ${config.host}:${config.port}/${config.database}\n`);

    // Create connection
    connection = await mysql.createConnection(config);
    console.log("✅ Connected to database\n");

    // List of indexes to create
    const indexes = [
      // Users table
      {
        table: "users",
        indexes: [
          "CREATE INDEX `idx_users_email_verified` ON `users` (`email_verified`)",
          "CREATE INDEX `idx_users_account_status` ON `users` (`account_status`)",
          "CREATE INDEX `idx_users_is_active` ON `users` (`is_active`)",
          "CREATE INDEX `idx_users_created_at` ON `users` (`created_at`)",
        ],
      },
      // BotConfig table
      {
        table: "bot_config",
        indexes: [
          "CREATE INDEX `idx_bot_config_tenant_onboarding` ON `bot_config` (`tenant_id`, `onboarding_completed`)",
          "CREATE INDEX `idx_bot_config_tenant` ON `bot_config` (`tenant_id`)",
        ],
      },
      // Conversations table
      {
        table: "conversations",
        indexes: [
          "CREATE INDEX `idx_conv_tenant` ON `conversations` (`tenant_id`)",
          "CREATE INDEX `idx_conv_tenant_source` ON `conversations` (`tenant_id`, `source`)",
          "CREATE INDEX `idx_conv_tenant_resolved` ON `conversations` (`tenant_id`, `is_resolved`)",
        ],
      },
      // Appointments table
      {
        table: "appointments",
        indexes: [
          "CREATE INDEX `idx_apt_customer_id` ON `appointments` (`customer_id`)",
          "CREATE INDEX `idx_apt_date` ON `appointments` (`date`)",
          "CREATE INDEX `idx_apt_status` ON `appointments` (`status`)",
        ],
      },
      // ConversationAssignments table
      {
        table: "conversation_assignments",
        indexes: [
          "CREATE INDEX `idx_conv_assign_conv` ON `conversation_assignments` (`conversation_id`)",
          "CREATE INDEX `idx_conv_assign_agent` ON `conversation_assignments` (`agent_id`)",
          "CREATE INDEX `idx_conv_assign_status` ON `conversation_assignments` (`status`)",
        ],
      },
    ];

    let totalCreated = 0;
    let skipped = 0;

    // Create each index
    for (const group of indexes) {
      console.log(`📊 ${group.table.toUpperCase()}`);
      for (const indexSQL of group.indexes) {
        try {
          await connection.query(indexSQL);
          console.log(`  ✅ ${indexSQL.match(/`idx_[^`]+`/)[0]} created`);
          totalCreated++;
        } catch (err) {
          if (err.code === "ER_DUP_KEYNAME") {
            console.log(`  ⏭️  ${indexSQL.match(/`idx_[^`]+`/)[0]} already exists`);
            skipped++;
          } else {
            console.error(`  ❌ Error: ${err.message}`);
            throw err;
          }
        }
      }
      console.log();
    }

    console.log("=====================================");
    console.log(`✅ Migration completed!`);
    console.log(`   • Indexes created: ${totalCreated}`);
    console.log(`   • Already existed: ${skipped}`);
    console.log(`   • Total: ${totalCreated + skipped}`);
    console.log("=====================================\n");

    console.log("📊 To verify indexes were created, run:");
    console.log("   SHOW INDEX FROM users;");
    console.log("   SHOW INDEX FROM conversations;");
    console.log("   SHOW INDEX FROM appointments;\n");

    await connection.end();
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    if (connection) await connection.end();
    process.exit(1);
  }
}

applyMigration();
