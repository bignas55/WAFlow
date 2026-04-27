/**
 * reset-db.cjs
 * Full data wipe — clears all data tables, keeps schema and users intact.
 * Run with: node reset-db.cjs
 */

const mysql = require("mysql2/promise");
require("dotenv").config();

const DATA_TABLES = [
  // Conversation & messaging
  "conversation_tags",
  "conversation_assignments",
  "message_status",
  "conversations",
  "webhook_logs",
  "spam_logs",

  // Customers & CRM
  "loyalty_points",
  "tags",
  "customers",

  // Appointments & scheduling
  "available_slots",
  "holidays",
  "appointments",
  "waitlist",
  "self_service_tokens",

  // Knowledge base
  "knowledge_base",

  // Agents & escalation
  "agent_metrics",
  "escalation_rules",
  "conversation_assignments",
  "agents",

  // Notifications & surveys
  "notification_logs",
  "notification_templates",
  "staff_notifications",
  "surveys",

  // Automation
  "automated_follow_ups",
  "broadcast_schedules",
  "business_rules",
  "rate_limits",

  // Calls
  "phone_calls",
  "call_queue",

  // Misc
  "audit_logs",
  "google_calendar_integration",
];

async function reset() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  console.log("🗑️  Starting full data wipe...\n");

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");

  for (const table of DATA_TABLES) {
    try {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
      console.log(`  ✅ Cleared: ${table}`);
    } catch (err) {
      // Table might not exist yet — skip silently
      if (err.code !== "ER_NO_SUCH_TABLE") {
        console.log(`  ⚠️  Skipped ${table}: ${err.message}`);
      }
    }
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 1");

  // Reset bot_config to defaults (keep tenant rows, clear custom settings)
  try {
    await conn.query(`
      UPDATE bot_config SET
        system_prompt = 'You are a helpful WhatsApp assistant for {businessName}. Be friendly, concise, and professional.',
        business_name = 'My Business',
        business_hours_start = '08:00',
        business_hours_end = '17:00',
        enable_business_hours = 0,
        enable_service_menu = 0,
        enable_booking = 0,
        enable_multi_language = 0,
        ai_temperature = 0.7,
        max_tokens = 500,
        updated_at = NOW()
    `);
    console.log("  ✅ Reset: bot_config (settings cleared, tenant rows kept)");
  } catch (err) {
    console.log(`  ⚠️  bot_config reset skipped: ${err.message}`);
  }

  await conn.end();

  console.log("\n✅ Done! Database wiped. Users and tenants are still intact.");
  console.log("   Log in and set up your bot config from scratch.\n");
}

reset().catch((err) => {
  console.error("❌ Reset failed:", err.message);
  process.exit(1);
});
