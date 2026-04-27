/**
 * followUpScheduler.ts
 * Sends an automatic follow-up message to users who went silent after a conversation.
 * Checks every 15 minutes. Sends once per conversation gap (tracked in-memory).
 *
 * Config (from botConfig):
 *  - enableFollowUp: must be true
 *  - followUpDelayHours: hours of silence before sending (default 4)
 *  - followUpMessage: message text (default fallback provided)
 */

import { db } from "../db.js";
import { botConfig, conversations, customers } from "../../drizzle/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { sendViaWhatsAppWeb, getStateForTenant } from "../whatsapp/WhatsAppWebManager.js";

// Track which (tenantId:phoneNumber) follow-ups we've already sent
// to avoid sending again until a new conversation starts.
// Key: "tenantId:phone" → timestamp of follow-up sent
const followUpSent = new Map<string, number>();

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

async function runFollowUpCheck() {
  try {
    // Get all tenants with follow-up enabled and WWJS connected
    const configs = await db.select({
      tenantId: botConfig.tenantId,
      enableFollowUp: botConfig.enableFollowUp,
      businessName: botConfig.businessName,
    }).from(botConfig).where(eq(botConfig.enableFollowUp, true));

    for (const cfg of configs) {
      const state = getStateForTenant(cfg.tenantId);
      if (state.status !== "connected") continue;

      const delayHours = 4; // hours of silence before following up
      const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000);

      // Find the most recent conversation per customer for this tenant
      const recent = await db.execute(
        sql`SELECT phone_number, MAX(created_at) as last_msg
            FROM conversations
            WHERE tenant_id = ${cfg.tenantId}
            GROUP BY phone_number
            HAVING last_msg < ${cutoff} AND last_msg > DATE_SUB(NOW(), INTERVAL 7 DAY)`
      ) as any;

      const rows: { phone_number: string; last_msg: Date }[] = Array.isArray(recent) ? recent[0] ?? [] : [];

      for (const row of rows) {
        const phone = row.phone_number;
        const key = `${cfg.tenantId}:${phone}`;

        // Don't re-send if we already followed up since this silence started
        const lastSent = followUpSent.get(key) ?? 0;
        if (lastSent > new Date(row.last_msg).getTime()) continue;

        // Don't send to opted-out customers
        const [cust] = await db.select({ optedOut: customers.optedOut })
          .from(customers)
          .where(and(eq(customers.tenantId, cfg.tenantId), eq(customers.phoneNumber, phone)))
          .limit(1);
        if (cust?.optedOut) continue;

        const message = "👋 Hi! Just checking in — is there anything else we can help you with today?";

        try {
          await sendViaWhatsAppWeb(cfg.tenantId, phone, message);
          followUpSent.set(key, Date.now());
          console.log(`🔔 [${cfg.businessName ?? `Tenant ${cfg.tenantId}`}] Follow-up sent to ${phone}`);
        } catch (err: any) {
          console.warn(`⚠️  Follow-up send failed for ${phone}:`, err.message);
        }

        await new Promise(r => setTimeout(r, 1500)); // small gap between sends
      }
    }
  } catch (err: any) {
    console.error("❌ [Follow-up Scheduler] Error:", err.message);
  }
}

export function startFollowUpScheduler() {
  setInterval(runFollowUpCheck, CHECK_INTERVAL_MS);
  console.log("🔔 Auto follow-up scheduler started (checks every 15 minutes)");
}
