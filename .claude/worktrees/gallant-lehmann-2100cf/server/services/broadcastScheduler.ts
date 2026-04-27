/**
 * Broadcast Scheduler — checks every minute for pending scheduled broadcasts
 * and fires them when their scheduledAt time has passed.
 */

import { db } from "../db.js";
import { broadcastSchedules, customers, conversations } from "../../drizzle/schema.js";
import { eq, and, lte, sql } from "drizzle-orm";
import { sendViaWhatsAppWeb, getStateForTenant } from "../whatsapp/WhatsAppWebManager.js";

async function runScheduledBroadcasts() {
  const now = new Date();

  // Find all pending broadcasts that are due
  const due = await db.select().from(broadcastSchedules)
    .where(and(
      eq(broadcastSchedules.status, "pending"),
      lte(broadcastSchedules.scheduledAt, now),
    ));

  for (const broadcast of due) {
    // Mark as processing immediately to avoid double-fire
    await db.update(broadcastSchedules)
      .set({ status: "sending" })
      .where(eq(broadcastSchedules.id, broadcast.id));

    try {
      const tenantId = broadcast.tenantId;
      const state = getStateForTenant(tenantId);

      if (state.status !== "connected") {
        await db.update(broadcastSchedules)
          .set({ status: "failed", errorMessage: "WhatsApp not connected" })
          .where(eq(broadcastSchedules.id, broadcast.id));
        continue;
      }

      // Determine target customers
      let targets: { phoneNumber: string; name: string | null }[] = [];

      if (broadcast.phoneNumbers && (broadcast.phoneNumbers as string[]).length > 0) {
        const nums = broadcast.phoneNumbers as string[];
        const rows = await db.select({ phoneNumber: customers.phoneNumber, name: customers.name })
          .from(customers)
          .where(eq(customers.tenantId, tenantId));
        targets = rows.filter(r => nums.includes(r.phoneNumber));
      } else {
        const allCustomers = await db.select({ phoneNumber: customers.phoneNumber, name: customers.name })
          .from(customers).where(eq(customers.tenantId, tenantId));

        if (!broadcast.filter || broadcast.filter === "all") {
          targets = allCustomers;
        } else {
          const days   = broadcast.filter === "active_7d" ? 7 : 30;
          const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
          for (const c of allCustomers) {
            const [lastMsg] = await db.select({ createdAt: conversations.createdAt })
              .from(conversations)
              .where(and(eq(conversations.tenantId, tenantId), eq(conversations.phoneNumber, c.phoneNumber)))
              .orderBy(sql`${conversations.createdAt} DESC`)
              .limit(1);
            if (lastMsg && lastMsg.createdAt >= cutoff) targets.push(c);
          }
        }
      }

      let sent = 0, failed = 0;
      for (const t of targets) {
        try {
          const msg = broadcast.message.replace("{name}", t.name || "there");
          const ok  = await sendViaWhatsAppWeb(tenantId, t.phoneNumber, msg);
          if (ok) sent++; else failed++;
        } catch { failed++; }
        await new Promise(r => setTimeout(r, 1500));
      }

      await db.update(broadcastSchedules)
        .set({ status: "sent", sentAt: new Date(), recipientCount: sent })
        .where(eq(broadcastSchedules.id, broadcast.id));

      console.log(`📅 Scheduled broadcast #${broadcast.id} sent: ${sent} delivered, ${failed} failed`);
    } catch (err: any) {
      await db.update(broadcastSchedules)
        .set({ status: "failed", errorMessage: String(err?.message ?? err) })
        .where(eq(broadcastSchedules.id, broadcast.id));
    }
  }
}

export function startBroadcastScheduler() {
  console.log("📅 Broadcast scheduler started");
  // Run immediately, then every 60 seconds
  runScheduledBroadcasts().catch(console.error);
  setInterval(() => runScheduledBroadcasts().catch(console.error), 60_000);
}
