import { db } from "./server/db.js";
import { users, botConfig, conversations, templates, customers, appointments, services, staff, broadcastSchedules, knowledgeBase, botMenuOptions } from "./drizzle/schema.js";
import { eq } from "drizzle-orm";

const TENANT_ID = 2;

async function deleteTenant() {
  try {
    console.log(`🗑️  Starting deletion of tenant ${TENANT_ID}...`);

    // Delete all tenant-associated data
    await db.delete(conversations).where(eq(conversations.tenantId, TENANT_ID));
    console.log("✅ Deleted conversations");

    await db.delete(templates).where(eq(templates.tenantId, TENANT_ID));
    console.log("✅ Deleted templates");

    await db.delete(customers).where(eq(customers.tenantId, TENANT_ID));
    console.log("✅ Deleted customers");

    await db.delete(appointments).where(eq(appointments.tenantId, TENANT_ID));
    console.log("✅ Deleted appointments");

    await db.delete(services).where(eq(services.tenantId, TENANT_ID));
    console.log("✅ Deleted services");

    await db.delete(staff).where(eq(staff.tenantId, TENANT_ID));
    console.log("✅ Deleted staff");

    await db.delete(broadcastSchedules).where(eq(broadcastSchedules.tenantId, TENANT_ID));
    console.log("✅ Deleted broadcast schedules");

    await db.delete(knowledgeBase).where(eq(knowledgeBase.tenantId, TENANT_ID));
    console.log("✅ Deleted knowledge base");

    await db.delete(botMenuOptions).where(eq(botMenuOptions.tenantId, TENANT_ID));
    console.log("✅ Deleted bot menu options");

    await db.delete(botConfig).where(eq(botConfig.tenantId, TENANT_ID));
    console.log("✅ Deleted bot config");

    // Finally, delete the user/tenant record
    await db.delete(users).where(eq(users.id, TENANT_ID));
    console.log("✅ Deleted tenant user record");

    console.log(`\n✅ TENANT ${TENANT_ID} COMPLETELY REMOVED`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Deletion failed:", err.message);
    process.exit(1);
  }
}

deleteTenant();
