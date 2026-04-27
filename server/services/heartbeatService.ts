/**
 * WAFlow Phone-Home Heartbeat Service
 *
 * When a WAFlow instance is self-hosted by a client, it can "phone home" to
 * Nathan's cloud admin platform so he can monitor it remotely.
 *
 * Activated by setting these environment variables:
 *   LICENSE_KEY=WAFL-XXXX-XXXX-XXXX-XXXX
 *   CLOUD_ADMIN_URL=https://app.waflow.com     (Nathan's hosted platform)
 *   INSTANCE_URL=https://myserver.com:3000      (this instance's public URL)
 *
 * The heartbeat fires every HEARTBEAT_INTERVAL_MIN minutes (default: 5).
 * It sends lightweight stats to the cloud admin's /api/trpc/license.heartbeat endpoint.
 */

import { db } from "../db.js";
import { conversations, users } from "../../drizzle/schema.js";
import { eq, and, gte, sql } from "drizzle-orm";
import { getStateForTenant } from "../whatsapp/WhatsAppWebManager.js";
import os from "os";

const LICENSE_KEY             = process.env.LICENSE_KEY;
const CLOUD_ADMIN_URL         = process.env.CLOUD_ADMIN_URL?.replace(/\/+$/, "");
const INSTANCE_URL            = process.env.INSTANCE_URL;
const INTERVAL_MIN            = Number(process.env.HEARTBEAT_INTERVAL_MIN ?? 5);
const WAFLOW_VERSION          = "1.0.0";

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let startTime = Date.now();

// ── Data collection ───────────────────────────────────────────────────────────

async function collectStats(): Promise<Record<string, unknown>> {
  const stats: Record<string, unknown> = {
    version: WAFLOW_VERSION,
    uptime:  Math.round((Date.now() - startTime) / 1000),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };

  try {
    // Count tenants
    const [tenantRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.role, "user"));
    stats.tenantCount = Number(tenantRow?.count ?? 0);

    // Count messages in last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [msgRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(gte(conversations.createdAt, since));
    stats.messagesLast24h = Number(msgRow?.count ?? 0);

    // Check if any tenant has WA connected
    const allTenants = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "user"), eq(users.isActive, true)));
    const anyConnected = allTenants.some(t => {
      const state = getStateForTenant(t.id);
      return state.status === "connected";
    });
    stats.waConnected = anyConnected;
  } catch (err) {
    console.warn("[Heartbeat] Could not collect stats:", (err as Error).message);
  }

  return stats;
}

// ── Registration (called once on first boot when self-hosted) ─────────────────

export async function registerWithCloud(): Promise<void> {
  if (!LICENSE_KEY || !CLOUD_ADMIN_URL) return;
  if (!INSTANCE_URL) {
    console.warn("[Heartbeat] INSTANCE_URL not set — skipping cloud registration. Set INSTANCE_URL to your server's public URL.");
    return;
  }

  try {
    const res = await fetch(`${CLOUD_ADMIN_URL}/api/trpc/license.registerInstance`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: { licenseKey: LICENSE_KEY, instanceUrl: INSTANCE_URL, version: WAFLOW_VERSION },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json() as any;
    const result = json?.result?.data?.json;

    if (result?.success) {
      console.log(`✅ [Heartbeat] Registered with cloud admin as "${result.clientName}" (${result.plan} plan)`);
    } else {
      console.warn("[Heartbeat] Registration failed:", json?.error?.message ?? "Unknown error");
    }
  } catch (err) {
    console.warn("[Heartbeat] Could not reach cloud admin for registration:", (err as Error).message);
  }
}

// ── Heartbeat send ────────────────────────────────────────────────────────────

async function sendHeartbeat(): Promise<void> {
  if (!LICENSE_KEY || !CLOUD_ADMIN_URL) return;

  try {
    const data  = await collectStats();
    const res   = await fetch(`${CLOUD_ADMIN_URL}/api/trpc/license.heartbeat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: { licenseKey: LICENSE_KEY, data } }),
      signal: AbortSignal.timeout(8_000),
    });
    const json  = await res.json() as any;
    const result = json?.result?.data?.json;

    if (result?.ok) {
      console.log(`💓 [Heartbeat] Sent to cloud admin — msgs24h=${data.messagesLast24h}, wa=${data.waConnected}`);
    } else {
      console.warn("[Heartbeat] Cloud admin rejected heartbeat:", result?.reason ?? "unknown");
    }
  } catch (err) {
    // Heartbeat failure is non-fatal — just log it
    console.warn("[Heartbeat] Failed to reach cloud admin:", (err as Error).message);
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function startHeartbeat(): void {
  if (!LICENSE_KEY || !CLOUD_ADMIN_URL) {
    // Not configured for self-hosted mode — skip silently
    return;
  }

  console.log(`💓 [Heartbeat] Starting — reporting to ${CLOUD_ADMIN_URL} every ${INTERVAL_MIN} min`);
  startTime = Date.now();

  // Register first (non-blocking)
  registerWithCloud().catch(() => {/* already logged */});

  // First heartbeat after 1 minute (give the server time to fully start up)
  const firstTimer = setTimeout(() => {
    sendHeartbeat().catch(() => {});
  }, 60_000);

  // Then every N minutes
  heartbeatTimer = setInterval(() => {
    sendHeartbeat().catch(() => {});
  }, INTERVAL_MIN * 60 * 1000);

  // Cleanup on process exit
  process.once("SIGTERM", stopHeartbeat);
  process.once("SIGINT",  stopHeartbeat);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
