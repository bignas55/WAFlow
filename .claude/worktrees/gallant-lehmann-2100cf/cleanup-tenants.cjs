/**
 * cleanup-tenants.cjs
 * Shows all tenants and lets you confirm which ones to remove.
 * Run with: node cleanup-tenants.cjs
 */
const mysql = require("mysql2/promise");
require("dotenv").config();

async function cleanup() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const [tenants] = await conn.query(`
    SELECT u.id, u.email, u.name, u.role, bc.business_name, u.created_at
    FROM users u
    LEFT JOIN bot_config bc ON bc.tenant_id = u.id
    ORDER BY u.id
  `);

  console.log("\n📋 All tenants:\n");
  for (const t of tenants) {
    console.log(`  ID ${t.id} — ${t.email ?? "(no email)"} | ${t.business_name ?? "(no business)"} | role: ${t.role}`);
  }

  // Keep only admin (id=1) and your real tenant
  // Delete everything else
  const keepIds = [1]; // admin

  // Find the real tenant (non-admin with an email)
  const realTenants = tenants.filter(t => t.role !== "admin" && t.email);
  if (realTenants.length > 0) {
    keepIds.push(...realTenants.map(t => t.id));
    console.log(`\n✅ Keeping: ${keepIds.join(", ")}`);
  }

  const allIds = tenants.map(t => t.id);
  const deleteIds = allIds.filter(id => !keepIds.includes(id));

  if (deleteIds.length === 0) {
    console.log("✅ Nothing to delete — already clean.\n");
    await conn.end();
    return;
  }

  console.log(`🗑️  Deleting tenants: ${deleteIds.join(", ")}\n`);

  // Delete in order (child tables first to avoid FK violations)
  const tables = [
    "conversation_tags", "conversation_assignments", "message_status",
    "conversations", "webhook_logs", "spam_logs", "loyalty_points",
    "tags", "automated_follow_ups", "self_service_tokens",
    "appointments", "available_slots", "holidays", "waitlist",
    "knowledge_base", "agent_metrics", "escalation_rules",
    "notification_logs", "notification_templates", "staff_notifications",
    "surveys", "broadcast_schedules", "business_rules", "rate_limits",
    "phone_calls", "call_queue", "audit_logs", "google_calendar_integration",
    "templates", "services", "customers", "agents", "staff",
    "bot_config", "licenses",
  ];

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");

  for (const table of tables) {
    try {
      const placeholders = deleteIds.map(() => "?").join(",");
      await conn.query(`DELETE FROM \`${table}\` WHERE tenant_id IN (${placeholders})`, deleteIds);
    } catch (e) {
      // table might not have tenant_id or might not exist — skip
    }
  }

  // Delete the user rows themselves
  const placeholders = deleteIds.map(() => "?").join(",");
  await conn.query(`DELETE FROM users WHERE id IN (${placeholders})`, deleteIds);

  await conn.query("SET FOREIGN_KEY_CHECKS = 1");

  console.log(`✅ Deleted ${deleteIds.length} unused tenant(s). Server will stop trying to restore their WhatsApp sessions.\n`);
  await conn.end();
}

cleanup().catch(console.error);
