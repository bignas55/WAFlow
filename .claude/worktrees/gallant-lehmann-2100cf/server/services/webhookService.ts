/**
 * Outbound Webhook Service
 *
 * Fires JSON POST events to a tenant-configured URL when key events occur:
 *   - appointment.booked
 *   - appointment.status_changed
 *   - conversation.escalated
 *   - customer.opted_out
 */

import { db } from "../db.js";
import { botConfig } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

export type WebhookEventType =
  | "appointment.booked"
  | "appointment.status_changed"
  | "conversation.escalated"
  | "customer.opted_out";

export async function fireWebhookEvent(
  tenantId: number,
  event: WebhookEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const [config] = await db
      .select({ enableWebhook: botConfig.enableWebhook, webhookUrl: botConfig.webhookUrl })
      .from(botConfig)
      .where(eq(botConfig.tenantId, tenantId))
      .limit(1);

    if (!config?.enableWebhook || !config.webhookUrl) return;

    const body = JSON.stringify({
      event,
      tenantId,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-WAFlow-Event": event },
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      console.warn(`⚠️  Webhook to ${config.webhookUrl} returned ${res.status} for event ${event}`);
    } else {
      console.log(`🔗 Webhook fired: ${event} → ${config.webhookUrl}`);
    }

    // Also dispatch to multi-endpoint outbound webhooks (new system)
    const { dispatchWebhook } = await import("./webhookDispatch.js");
    await dispatchWebhook(tenantId, event as any, payload);

  } catch (err: any) {
    // Never throw — webhook failures must not affect the main flow
    console.warn(`⚠️  Webhook error (${event}):`, err?.message ?? String(err));
  }
}
