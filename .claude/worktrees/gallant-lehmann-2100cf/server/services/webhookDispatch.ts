/**
 * Outbound Webhook Dispatch Service
 *
 * Fires HTTP POST to tenant-configured URLs when platform events occur.
 * Supports HMAC-SHA256 signature via X-WAFlow-Signature header.
 * Retries up to 3 times on failure with exponential backoff.
 */

import axios from "axios";
import crypto from "crypto";
import { db } from "../db.js";
import { outboundWebhooks, outboundWebhookLogs } from "../../drizzle/schema.js";
import { eq, and } from "drizzle-orm";

// ── Supported event types ─────────────────────────────────────────────────────
export type WebhookEvent =
  | "appointment.booked"
  | "appointment.completed"
  | "appointment.cancelled"
  | "appointment.no_show"
  | "message.received"
  | "customer.new"
  | "broadcast.sent"
  | "review.received";

// ── Sign payload ──────────────────────────────────────────────────────────────
function sign(payload: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// ── Dispatch to a single webhook ──────────────────────────────────────────────
async function deliverWebhook(
  webhookId: number,
  tenantId:  number,
  event:     WebhookEvent,
  payload:   Record<string, unknown>,
  url:       string,
  secret:    string | null,
  attempt:   number,
): Promise<void> {
  const body = JSON.stringify({ event, tenantId, timestamp: new Date().toISOString(), data: payload });
  const headers: Record<string, string> = {
    "Content-Type":  "application/json",
    "User-Agent":    "WAFlow-Webhook/1.0",
    "X-WAFlow-Event": event,
  };
  if (secret) headers["X-WAFlow-Signature"] = sign(body, secret);

  try {
    const resp = await axios.post(url, body, { headers, timeout: 10_000 });
    await db.insert(outboundWebhookLogs).values({
      webhookId, tenantId, event, payload, status: "success",
      responseCode: resp.status, responseBody: JSON.stringify(resp.data).slice(0, 500), attempt,
    });
    await db.update(outboundWebhooks)
      .set({ lastTriggeredAt: new Date(), failureCount: 0 })
      .where(eq(outboundWebhooks.id, webhookId));
  } catch (err: any) {
    const msg = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 300) : err.message;
    await db.insert(outboundWebhookLogs).values({
      webhookId, tenantId, event, payload, status: "failed",
      responseCode: err?.response?.status ?? null, errorMessage: msg, attempt,
    });
    // Increment failure count; disable after 10 consecutive failures
    const [row] = await db.select({ failureCount: outboundWebhooks.failureCount })
      .from(outboundWebhooks).where(eq(outboundWebhooks.id, webhookId)).limit(1);
    const newCount = (row?.failureCount ?? 0) + 1;
    await db.update(outboundWebhooks)
      .set({ failureCount: newCount, ...(newCount >= 10 ? { isActive: 0 } : {}) })
      .where(eq(outboundWebhooks.id, webhookId));

    // Retry up to 3 times with exponential backoff
    if (attempt < 3) {
      const delay = Math.pow(2, attempt) * 2000; // 2s, 4s
      setTimeout(
        () => deliverWebhook(webhookId, tenantId, event, payload, url, secret, attempt + 1).catch(() => {}),
        delay
      );
    }
  }
}

// ── Public dispatch function ──────────────────────────────────────────────────
export async function dispatchWebhook(
  tenantId: number,
  event:    WebhookEvent,
  data:     Record<string, unknown>,
): Promise<void> {
  try {
    const hooks = await db.select().from(outboundWebhooks)
      .where(and(eq(outboundWebhooks.tenantId, tenantId), eq(outboundWebhooks.isActive, 1)));

    for (const hook of hooks) {
      const events = hook.events as string[];
      if (events.includes("*") || events.includes(event)) {
        // Fire and forget
        deliverWebhook(hook.id, tenantId, event, data, hook.url, hook.secret ?? null, 1)
          .catch(err => console.error(`Webhook dispatch error for hook ${hook.id}:`, err));
      }
    }
  } catch (err) {
    console.error("webhookDispatch error:", err);
  }
}
