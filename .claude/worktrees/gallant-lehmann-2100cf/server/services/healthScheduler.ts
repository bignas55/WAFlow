/**
 * Health Scheduler — runs automatic platform health checks on a schedule.
 *
 * Every HEALTH_CHECK_INTERVAL_MS (default 30 min), it:
 * 1. Checks all tenant WhatsApp states
 * 2. Checks AI connectivity for each tenant
 * 3. Checks for long-inactive tenants
 * 4. Sends an alert email if critical issues are found
 *
 * Configure via env:
 *   HEALTH_CHECK_INTERVAL_MIN  — check interval in minutes (default: 30)
 *   HEALTH_CHECK_ENABLED       — set "false" to disable
 */

import { getAllTenantStates } from "../whatsapp/WhatsAppWebManager.js";
import { alertCriticalIssues, alertAIConnectionFailed } from "./alertService.js";
import { db } from "../db.js";
import { users, botConfig, conversations } from "../../drizzle/schema.js";
import { eq, sql, gte, and, isNotNull, lte } from "drizzle-orm";
import { decrypt } from "./encryptionService.js";

const ENABLED = process.env.HEALTH_CHECK_ENABLED !== "false";
const INTERVAL_MIN = parseInt(process.env.HEALTH_CHECK_INTERVAL_MIN || "30", 10);
const INTERVAL_MS = INTERVAL_MIN * 60 * 1000;

let _timer: NodeJS.Timeout | null = null;
let _running = false;

export function startHealthScheduler(): void {
  if (!ENABLED) {
    console.log("⏭️  Health scheduler disabled (HEALTH_CHECK_ENABLED=false)");
    return;
  }
  if (_timer) return; // already running

  console.log(`🏥 Health scheduler started — checking every ${INTERVAL_MIN} minutes`);

  // Run billing reset immediately on startup (catches any tenants whose reset date passed while server was off)
  runBillingReset().catch(err => console.error("❌ Billing reset error on startup:", err));

  // Run first health check after 5 minutes (let everything initialise)
  setTimeout(() => runHealthCheck(), 5 * 60 * 1000);

  // Then run on interval
  _timer = setInterval(() => {
    runHealthCheck();
    runBillingReset().catch(err => console.error("❌ Billing reset error:", err));
  }, INTERVAL_MS);
}

export function stopHealthScheduler(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

async function runHealthCheck(): Promise<void> {
  if (_running) return; // skip if previous run still going
  _running = true;
  console.log("🏥 Running scheduled health check…");

  const criticalIssues: string[] = [];
  const since1h = new Date(Date.now() - 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    // 1. All tenants
    const tenants = await db.select({ id: users.id, name: users.name, isActive: users.isActive })
      .from(users).where(eq(users.role, "user"));

    // 2. WhatsApp states
    const wwjsStates = getAllTenantStates();

    // 3. Bot configs
    const configs = await db.select({
      tenantId: botConfig.tenantId, aiApiUrl: botConfig.aiApiUrl,
      aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel,
    }).from(botConfig).where(isNotNull(botConfig.aiApiUrl));

    // 4. Message activity (has any message come in the last 24h per tenant)
    const activity = await db.select({
      tenantId:   conversations.tenantId,
      lastMsg:    sql<Date>`MAX(${conversations.createdAt})`,
      count1h:    sql<number>`SUM(CASE WHEN ${conversations.createdAt} >= ${since1h} THEN 1 ELSE 0 END)`,
    }).from(conversations).groupBy(conversations.tenantId);

    for (const tenant of tenants) {
      if (!tenant.isActive) continue;

      const wa  = wwjsStates.find(s => s.tenantId === tenant.id);
      const cfg = configs.find(c => c.tenantId === tenant.id);
      const act = activity.find(a => a.tenantId === tenant.id);

      // Check WhatsApp
      const waStatus = wa?.state.status ?? "disconnected";
      if (waStatus === "disconnected" || waStatus === "qr_ready") {
        criticalIssues.push(`[CRITICAL] ${tenant.name}: WhatsApp is ${waStatus}`);
      }

      // Check AI connectivity (lightweight ping, only if config exists)
      if (cfg?.aiApiUrl) {
        const headers: Record<string, string> = {};
        const decryptedKey = decrypt(cfg.aiApiKey || "") || cfg.aiApiKey || "";
        if (decryptedKey && decryptedKey !== "ollama") {
          headers["Authorization"] = `Bearer ${decryptedKey}`;
        }
        try {
          const res = await fetch(`${cfg.aiApiUrl.replace(/\/+$/, "")}/models`, {
            headers,
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) {
            criticalIssues.push(`[CRITICAL] ${tenant.name}: AI endpoint returned HTTP ${res.status}`);
            await alertAIConnectionFailed(tenant.name, tenant.id, `HTTP ${res.status}`);
          }
        } catch (e: any) {
          criticalIssues.push(`[CRITICAL] ${tenant.name}: AI endpoint unreachable — ${e?.message ?? "timeout"}`);
          await alertAIConnectionFailed(tenant.name, tenant.id, e?.message ?? "timeout");
        }
      } else {
        criticalIssues.push(`[CRITICAL] ${tenant.name}: No AI provider configured`);
      }
    }

    if (criticalIssues.length > 0) {
      console.log(`🚨 Health check found ${criticalIssues.length} critical issue(s):\n${criticalIssues.join("\n")}`);
      const healthScore = Math.max(0, 100 - criticalIssues.length * 15);
      await alertCriticalIssues(
        criticalIssues.length,
        criticalIssues.slice(0, 5).join("; "),
        healthScore
      );
    } else {
      console.log("✅ Health check: all tenants healthy");
    }
  } catch (e: any) {
    console.error("❌ Health check error:", e.message);
  } finally {
    _running = false;
  }
}

// ── Monthly billing reset ─────────────────────────────────────────────────────
// Finds all tenants whose billingResetAt date has passed and resets their
// messagesUsedThisMonth counter to 0, then sets the next reset date.

async function runBillingReset(): Promise<void> {
  const now = new Date();

  // Find tenants due for a reset (billingResetAt is in the past)
  const due = await db.select({ id: users.id, name: users.name })
    .from(users)
    .where(and(
      eq(users.role, "user"),
      lte(users.billingResetAt, now),
    ));

  if (due.length === 0) return;

  // Next reset = first day of next month at midnight UTC
  const nextReset = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);

  for (const tenant of due) {
    await db.update(users).set({
      messagesUsedThisMonth: 0,
      billingResetAt:        nextReset,
    }).where(eq(users.id, tenant.id));
    console.log(`🔄 [Billing] Reset message count for tenant "${tenant.name}" (ID ${tenant.id}) — next reset: ${nextReset.toISOString().slice(0,10)}`);
  }
}
