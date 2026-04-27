/**
 * dailyVerseScheduler.ts
 * Sends a daily Bible verse to all opted-in customers of Bible-study tenants.
 * A "Bible study tenant" is any tenant whose systemPrompt contains "Bible" or "📖".
 *
 * Send time is per-user from UserPrefs.dailyVerseTime (default "07:00").
 * Users who have opted out (optedInDailyVerse = false) are skipped.
 * Runs a check every minute using setInterval.
 */

import { db } from "../db.js";
import { botConfig, customers } from "../../drizzle/schema.js";
import { eq, and } from "drizzle-orm";
import { generateVerseOfDay } from "./bibleStudyService.js";
import { generatePrayerTopics } from "./imageGenService.js";
import { sendViaWhatsAppWeb, getStateForTenant } from "../whatsapp/WhatsAppWebManager.js";
import { getUserPrefs } from "./userFeaturesService.js";
import { decrypt } from "./encryptionService.js";

// Track which users have already received their daily verse today.
// Key: "tenantId:phoneNumber" → date string "YYYY-MM-DD"
const sentToday = new Map<string, string>();

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

async function runDailyVerseCheck() {
  const today = todayString();
  const nowHHMM = currentHHMM();

  try {
    // Find all tenants that look like Bible study bots and have WWJS connected
    const configs = await db.select({
      tenantId: botConfig.tenantId,
      systemPrompt: botConfig.systemPrompt,
      aiApiUrl: botConfig.aiApiUrl,
      aiApiKey: botConfig.aiApiKey,
      aiModel: botConfig.aiModel,
      businessName: botConfig.businessName,
    }).from(botConfig);

    for (const cfg of configs) {
      // Only process Bible-study tenants
      const isBibleBot = cfg.systemPrompt?.includes("Bible") || cfg.systemPrompt?.includes("📖") || cfg.systemPrompt?.includes("bible");
      if (!isBibleBot) continue;

      // Only proceed if WWJS is connected for this tenant
      const state = getStateForTenant(cfg.tenantId);
      if (state.status !== "connected") continue;

      // Get all opted-in customers for this tenant
      const allCustomers = await db.select({ phoneNumber: customers.phoneNumber })
        .from(customers)
        .where(and(eq(customers.tenantId, cfg.tenantId), eq(customers.optedOut, false)));

      // Filter to customers whose send time matches the current minute
      const dueCustomers = allCustomers.filter(c => {
        const prefs = getUserPrefs(cfg.tenantId, c.phoneNumber);
        // Respect per-user opt-in flag
        if (!prefs.optedInDailyVerse) return false;
        const sendTime = prefs.dailyVerseTime || "07:00";
        if (sendTime !== nowHHMM) return false;
        // Only send once per day per user
        const key = `${cfg.tenantId}:${c.phoneNumber}`;
        if (sentToday.get(key) === today) return false;
        return true;
      });

      if (dueCustomers.length === 0) continue;

      const apiUrl  = cfg.aiApiUrl  || process.env.AI_API_URL  || "https://api.groq.com/openai/v1";
      const apiKey  = decrypt(cfg.aiApiKey || "") || process.env.AI_API_KEY  || "";
      const aiModel = cfg.aiModel   || process.env.AI_MODEL    || "gemma4:latest";

      console.log(`📅 [Daily Verse] ${cfg.businessName ?? `Tenant ${cfg.tenantId}`}: ${dueCustomers.length} user(s) due at ${nowHHMM}`);

      // Generate one verse per tenant (shared across all users in this batch)
      let verse: string;
      try {
        verse = await generateVerseOfDay(apiUrl, apiKey, aiModel);
      } catch (err: any) {
        console.warn(`⚠️  [Daily Verse] Failed to generate verse for tenant ${cfg.tenantId}:`, err.message);
        continue;
      }

      for (const c of dueCustomers) {
        const key = `${cfg.tenantId}:${c.phoneNumber}`;
        try {
          await sendViaWhatsAppWeb(cfg.tenantId, c.phoneNumber, `🌅 *Good morning! Here is your daily verse:*\n\n${verse}`);
          sentToday.set(key, today); // Mark sent before the prayer so we don't resend on failure
          await new Promise(r => setTimeout(r, 2000)); // 2s gap to avoid rate limits

          // Send prayer topics 30s after the verse (non-blocking)
          setTimeout(async () => {
            try {
              const prayer = await generatePrayerTopics(verse, apiUrl, apiKey, aiModel);
              await sendViaWhatsAppWeb(cfg.tenantId, c.phoneNumber, prayer);
            } catch { /* non-fatal — verse was already delivered */ }
          }, 30_000);

        } catch (err: any) {
          console.warn(`⚠️  [Daily Verse] Failed to send to ${c.phoneNumber}:`, err.message);
          // Don't mark as sent so it can retry next minute
          sentToday.delete(key);
        }
      }

      console.log(`✅ [Daily Verse] Sent to ${dueCustomers.length} user(s) for ${cfg.businessName ?? `Tenant ${cfg.tenantId}`}`);
    }
  } catch (err: any) {
    console.error("❌ [Daily Verse Scheduler] Error:", err.message);
  }
}

export function startDailyVerseScheduler() {
  setInterval(runDailyVerseCheck, 60 * 1000);
  console.log("📅 Daily verse scheduler started (checks every minute, per-user send times)");
}
