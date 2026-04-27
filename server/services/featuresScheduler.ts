/**
 * featuresScheduler.ts
 * Periodic background jobs for:
 *  - Memory verse daily reminders (if not tested in 23+ hours)
 *  - Fasting check-ins (every ~3 hours)
 *  - Post-session check-ins (20-36 hour window after a session ends)
 *
 * Call `startFeaturesScheduler(apiUrl, apiKey, aiModel)` once on server startup.
 */

import {
  getAllMemoryVerses,
  getAllActiveFasts,
  updateFastingCheckIn,
  getPendingCheckIns,
  markCheckInSent,
  getUserPrefs,
} from "./userFeaturesService.js";
import { generateMemoryVerseTest, generateFastingCheckIn } from "./bibleStudyService.js";
import { sendViaWhatsAppWeb } from "../whatsapp/WhatsAppWebManager.js";

// ── interval ──────────────────────────────────────────────────────────────────
const INTERVAL_MS = 30 * 60 * 1000; // run every 30 minutes

// ── MEMORY VERSE REMINDERS ────────────────────────────────────────────────────
async function handleMemoryVerseReminders(
  apiUrl: string,
  apiKey: string,
  aiModel: string,
): Promise<void> {
  const allVerses = getAllMemoryVerses();
  const now = Date.now();

  for (const [key, state] of Object.entries(allVerses)) {
    try {
      if (state.mastered) continue; // already mastered — no reminder needed

      const lastTested = state.lastTestedAt ? new Date(state.lastTestedAt).getTime() : 0;
      const hoursSinceTested = (now - lastTested) / 3_600_000;

      // Only remind if not tested in the last 23 hours
      if (hoursSinceTested < 23) continue;

      const [tenantIdStr, phone] = key.split(":");
      const tenantId = parseInt(tenantIdStr);

      const prefs = getUserPrefs(tenantId, phone);

      const testMessage = await generateMemoryVerseTest(
        state.reference,
        state.text,
        state.testCount,
        apiUrl,
        apiKey,
        aiModel,
        prefs.translation,
      );

      if (testMessage) {
        await sendViaWhatsAppWeb(tenantId, phone, testMessage);
        console.log(`🧠 [FeaturesScheduler] Memory verse test sent to ${phone} (${state.reference})`);
      }
    } catch (err: any) {
      console.warn(`⚠️  [FeaturesScheduler] Memory verse reminder failed for ${key}:`, err.message);
    }
  }
}

// ── FASTING CHECK-INS ─────────────────────────────────────────────────────────
async function handleFastingCheckIns(
  apiUrl: string,
  apiKey: string,
  aiModel: string,
): Promise<void> {
  const activeFasts = getAllActiveFasts();
  const now = Date.now();

  for (const { tenantId, phone, state } of activeFasts) {
    try {
      const lastCheckIn = state.lastCheckInAt ? new Date(state.lastCheckInAt).getTime() : 0;
      const hoursSinceCheckIn = (now - lastCheckIn) / 3_600_000;

      // Only check in if it's been 3+ hours since the last check-in
      if (hoursSinceCheckIn < 3) continue;

      const started = new Date(state.startedAt).getTime();
      const ends = new Date(state.endsAt).getTime();
      const hoursElapsed = (now - started) / 3_600_000;
      const hoursRemaining = Math.max(0, (ends - now) / 3_600_000);

      const checkInMsg = await generateFastingCheckIn(
        state.intention,
        hoursElapsed,
        hoursRemaining,
        apiUrl,
        apiKey,
        aiModel,
      );

      if (checkInMsg) {
        await sendViaWhatsAppWeb(tenantId, phone, checkInMsg);
        updateFastingCheckIn(tenantId, phone);
        console.log(`⏳ [FeaturesScheduler] Fasting check-in sent to ${phone} (${hoursRemaining.toFixed(1)}h remaining)`);
      }
    } catch (err: any) {
      console.warn(`⚠️  [FeaturesScheduler] Fasting check-in failed for ${phone}:`, err.message);
    }
  }
}

// ── POST-SESSION CHECK-INS ────────────────────────────────────────────────────
async function handlePostSessionCheckIns(): Promise<void> {
  const pending = getPendingCheckIns();

  for (const { tenantId, phone, state } of pending) {
    try {
      let checkInMsg: string;

      if (state.mode === "prayer") {
        checkInMsg =
          `🙏 *Checking in on you!*\n\n` +
          `It's been about a day since we prayed together. How are you doing? ` +
          `Did God answer your prayer? 💙\n\n` +
          `Feel free to share — I'm here to listen and pray with you again anytime.`;
      } else {
        checkInMsg =
          `✨ *How are you doing today?*\n\n` +
          `I was thinking about our conversation yesterday and wanted to check in. ` +
          `How has your day been going? Are you feeling encouraged? 😊\n\n` +
          `Come back anytime — I'm always here to study the Word with you or just chat. *God bless!* 🙏`;
      }

      await sendViaWhatsAppWeb(tenantId, phone, checkInMsg);
      markCheckInSent(tenantId, phone);
      console.log(`💬 [FeaturesScheduler] Post-session check-in sent to ${phone}`);
    } catch (err: any) {
      console.warn(`⚠️  [FeaturesScheduler] Post-session check-in failed for ${phone}:`, err.message);
    }
  }
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────

/**
 * Start the features background scheduler.
 *
 * @param apiUrl   - OpenAI-compatible AI base URL
 * @param apiKey   - API key
 * @param aiModel  - Model name
 */
export function startFeaturesScheduler(
  apiUrl: string,
  apiKey: string,
  aiModel: string,
): void {
  console.log("⏰ [FeaturesScheduler] Starting features scheduler (every 30 min)");

  const run = async () => {
    try {
      await handlePostSessionCheckIns();
      await handleFastingCheckIns(apiUrl, apiKey, aiModel);
      await handleMemoryVerseReminders(apiUrl, apiKey, aiModel);
    } catch (err: any) {
      console.error("❌ [FeaturesScheduler] Unhandled error in scheduler tick:", err.message);
    }
  };

  // Wait 1 minute after startup so everything is initialised, then run every 30 min
  setTimeout(() => {
    run();
    setInterval(run, INTERVAL_MS);
  }, 60_000);
}
