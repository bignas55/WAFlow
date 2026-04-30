import { getInsertId } from "../utils.js";
import { db } from "../db.js";
import {
  botConfig, conversations, templates,
  customers, escalationRules, spamLogs, rateLimits, users, appointments, services, systemSettings, staff,
} from "../../drizzle/schema.js";
import { eq, and, sql, desc, gt, or, asc } from "drizzle-orm";
import { callAiWithFallback } from "../services/dualAiService.js";
import { callClaudeAPI } from "../services/claudeAiService.js";
import { decrypt } from "../services/encryptionService.js";
import { getRelevantContext, type KBResult } from "../services/knowledgeRetrieval.js";
import { handleBookingFlow } from "../services/bookingFlow.js";
import { getCustomerContext, updateCustomerMemory } from "../services/customerMemory.js";
import { WhatsAppBusinessAPI } from "./WhatsAppBusinessAPI.js";
import { sendViaWhatsAppWeb, getStateForTenant, sendTypingIndicator } from "./WhatsAppWebManager.js";
import { generatePrayerTopics, generateConversationalPrayer } from "../services/imageGenService.js";
import {
  getQuizSession, setQuizSession, clearQuizSession,
  getPendingQuizVerse, setPendingQuizVerse, clearPendingQuizVerse,
  getReadingPlan, startReadingPlan, advanceReadingPlan, markReadingPlanSent, clearReadingPlan, alreadySentToday,
  generateVerseOfDay, generateReadingPlanVerse, generateAllQuizQuestions, formatQuizQuestion, formatQuizResults,
  getBibleSession, setBibleSession, clearBibleSession, incrementSessionMessages, generateVerseForSession,
  generateBookSummary, generateSermonPrep,
  type BibleSessionMode,
} from "../services/bibleStudyService.js";
import {
  updateStreak, streakMilestoneMessage,
  getMemoryVerse, setMemoryVerse, clearMemoryVerse,
  getFasting, startFast, endFast,
  getUserPrefs, setUserPrefs,
  getPrayerWall, addPrayerRequest, incrementPrayerCount, formatPrayerWall,
  schedulePostCheckIn,
} from "../services/userFeaturesService.js";
import { langName, generateSpeech } from "../services/voiceService.js";
import {
  getITSession, setITSession, clearITSession,
  generateTicketId, saveTicket, updateTicketStatus,
  detectPriority, generateITDiagnosis,
  formatITMenu, formatDiagnosisMessage, formatAdminAlert, formatEscalationConfirmation,
} from "../services/itSupportService.js";
import { IT_FLOWS } from "../services/itKnowledgeBase.js";
import type { ITCategory } from "../services/itKnowledgeBase.js";
import OpenAI from "openai";
import { io } from "../index.js";
import { getDay } from "date-fns";
import { toZonedTime, format as tzFormat } from "date-fns-tz";
import { detectLanguage } from "../services/multiLanguageService.js";
import { analyzeSentiment } from "../services/sentimentService.js";
import { alertNewEscalation, alertNewBooking } from "../services/alertService.js";
import { sanitizeIncomingMessage, logSuspiciousInput } from "../services/inputSanitizer.js";
import { checkPhoneMessageLimit } from "../middleware/rateLimiter.js";
import { botMenuOptions } from "../../drizzle/schema.js";
import {
  isBibleGuideBusiness,
  handleBibleGuideFeature,
  getCustomerAgeGroup,
  getBibleGuideEnhancedPrompt,
  BIBLEGUIDE_MAIN_MENU,
} from "../services/bibleGuideFeatures.js";

// All 66 canonical Bible book names — used to validate book summary requests
const BIBLE_BOOKS_RE = /^(genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|1\s*samuel|2\s*samuel|1\s*kings|2\s*kings|1\s*chronicles|2\s*chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|song of songs?|song of solomon|isaiah|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|1\s*corinthians|2\s*corinthians|galatians|ephesians|philippians|colossians|1\s*thessalonians|2\s*thessalonians|1\s*timothy|2\s*timothy|titus|philemon|hebrews|james|1\s*peter|2\s*peter|1\s*john|2\s*john|3\s*john|jude|revelation)$/i;

/** Retry wrapper — calls fn up to maxAttempts times with exponential backoff */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 1500): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, baseDelayMs * attempt));
        console.warn(`↩️  Retry ${attempt}/${maxAttempts - 1}…`);
      }
    }
  }
  throw lastErr;
}

/** Send a WhatsApp message — prefers WWJS (QR) when connected, falls back to Meta API */
async function sendMessage(tenantId: number, phoneNumber: string, message: string, asVoice = false, chatId?: string): Promise<void> {
  // Use chatId (e.g. @lid) for WWJS if available, otherwise use phoneNumber
  const wwjsTarget = chatId ?? phoneNumber;

  // Attempt TTS voice response if requested
  if (asVoice) {
    try {
      const audioBuffer = await generateSpeech(message);
      if (audioBuffer) {
        const ok = await sendViaWhatsAppWeb(tenantId, wwjsTarget, message, audioBuffer);
        if (ok) return;
      }
    } catch { /* fall through to text */ }
  }

  const ok = await sendViaWhatsAppWeb(tenantId, wwjsTarget, message);
  if (ok) return;

  // Meta API fallback — only if WWJS not connected or send failed, with retries
  await withRetry(async () => {
    const api = await WhatsAppBusinessAPI.fromConfig(tenantId);
    const id = await api.sendTextMessage(phoneNumber, message);
    if (!id) {
      throw new Error(
        "Meta WhatsApp send returned no message id — configure whatsappPhoneNumberId + whatsappAccessToken in bot settings (or WHATSAPP_* env vars)",
      );
    }
  }, 3);
}

export interface WebhookMessage {
  tenantId: number;
  phoneNumber: string;
  chatId?: string;   // full WhatsApp chat ID (may be @lid or @c.us) — used for WWJS replies
  messageText: string;
  contactName: string | null;
  messageId: string;
  isVoice?: boolean; // true when message was transcribed from an audio/voice note
}

// ── handleMenuInteraction ─────────────────────────────────────────────────────
// Handles two cases:
//   1. Customer sends trigger word → show the numbered menu (stop pipeline).
//   2. Customer sends a digit (1-9) →
//        • escalate action: hand to human immediately (stop pipeline).
//        • everything else: rewrite the message as a natural intent phrase so
//          the AI pipeline responds in its own voice with full personality.
//          Returns { handled: false, intentText } so the caller can swap msg.messageText.
//
// Returns true  → pipeline should STOP (menu or escalation handled it fully).
// Returns false → pipeline should CONTINUE (AI will handle with injected context).
async function handleMenuInteraction(
  msg: WebhookMessage,
  config: any,
): Promise<{ stop: boolean; messageOverride?: string }> {
  const text  = msg.messageText.trim();
  const lower = text.toLowerCase();

  // ── Skip menu processing for BibleGuide feature selections (1-5, 0) ──────────
  // These digits are BibleGuide feature options, not menu items
  // Let the BibleGuide handler process them instead
  if (config.businessName === "BibleGuide") {
    const digit = parseInt(text, 10);
    if (!isNaN(digit) && digit >= 0 && digit <= 5) {
      return { stop: false }; // Skip menu handler, let BibleGuide handler catch it
    }
  }

  // Load active menu items for this tenant
  const items = await db
    .select()
    .from(botMenuOptions)
    .where(and(
      eq(botMenuOptions.tenantId, msg.tenantId),
      eq(botMenuOptions.isActive, 1),
    ))
    .orderBy(asc(botMenuOptions.sortOrder), asc(botMenuOptions.itemNumber));

  if (items.length === 0) return { stop: false }; // no items — let AI handle freely

  const trigger = (config.menuTrigger || "menu").toLowerCase();

  // ── Show the menu when the customer sends a trigger / greeting ────────────
  const isMenuTrigger =
    lower === trigger ||
    lower === "hi" || lower === "hello" || lower === "hey" ||
    lower === "start" || lower === "help" ||
    lower === "0" ||
    lower.includes(trigger);

  if (isMenuTrigger) {
    const greeting = config.menuGreeting ||
      `👋 Welcome to *${config.businessName || "our business"}*!\n\nHow can we help you today? Please reply with a number:`;
    const footer = config.menuFooter || "";
    const menuLines = items.map(item => {
      const desc = item.description ? ` — ${item.description}` : "";
      return `*${item.itemNumber}*. ${item.title}${desc}`;
    });
    const fullMenu = `${greeting}\n\n${menuLines.join("\n")}${footer ? `\n\n${footer}` : ""}`;

    await sendMessage(msg.tenantId, msg.phoneNumber, fullMenu, false, msg.chatId);
    await db.insert(conversations).values({
      tenantId: msg.tenantId, phoneNumber: msg.phoneNumber,
      contactName: msg.contactName, message: msg.messageText,
      response: fullMenu, source: "ai",
    });
    return { stop: true };
  }

  // ── Customer pressed a digit ──────────────────────────────────────────────
  const digit = parseInt(text, 10);
  if (!isNaN(digit) && digit >= 1 && digit <= 9) {
    const chosen = items.find(i => i.itemNumber === digit);

    // ── BibleGuide: Detect age group selection (digits 1-5) ──────────────────
    // For BibleGuide bots, digits 1-5 in first menu are age group selections
    const isBibleGuideBotMode = config.businessName === "BibleGuide";
    const isAgeGroupDigit = digit >= 1 && digit <= 5;
    const hasAgeGroupKeyword = chosen?.title?.includes("Kids") ||
                                chosen?.title?.includes("Teens") ||
                                chosen?.title?.includes("Young Adults") ||
                                chosen?.title?.includes("Adults") ||
                                chosen?.title?.includes("Seniors");

    const isBibleAgeGroup = isBibleGuideBotMode && isAgeGroupDigit && hasAgeGroupKeyword;

    if (chosen) {

      // Escalate: hand straight to a human — AI is not involved
      if (chosen.actionType === "escalate") {
        const reply = chosen.response ||
          "Connecting you to one of our team members now. Please hold — someone will be with you shortly! 🙏";
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await db.insert(conversations).values({
          tenantId: msg.tenantId, phoneNumber: msg.phoneNumber,
          contactName: msg.contactName, message: msg.messageText,
          response: reply, source: "ai", isEscalated: true,
        });
        io.to("dashboard").emit("conversation:new", {
          phoneNumber: msg.phoneNumber, contactName: msg.contactName,
          message: msg.messageText, response: reply, source: "ai", isEscalated: true,
        });
        return { stop: true };
      }

      if (isBibleAgeGroup) {
        console.log(`📖 [BibleGuide] Age group selected: ${chosen.title} (digit: ${digit})`);

        // Store age group preference in customer memory for this user
        // This will personalize future AI responses based on their age group
        const ageGroupName = chosen.title?.replace(/[👶👨‍🦱🎓👔👴🧓]/g, '').trim() || "User";

        // Get or create customer record and update metadata
        const [customer] = await db.select().from(customers).where(and(eq(customers.tenantId, msg.tenantId), eq(customers.phoneNumber, msg.phoneNumber))).limit(1);
        const metadata = customer?.metadata ? JSON.parse(customer.metadata) : {};
        metadata.bibleguideAgeGroup = ageGroupName;
        metadata.bibleguideAgeGroupSelectedAt = new Date().toISOString();

        if (customer) {
          await db.update(customers).set({ metadata: JSON.stringify(metadata) }).where(and(eq(customers.tenantId, msg.tenantId), eq(customers.phoneNumber, msg.phoneNumber)));
        } else {
          await db.insert(customers).values({
            tenantId: msg.tenantId,
            phoneNumber: msg.phoneNumber,
            contactName: msg.contactName || "Customer",
            metadata: JSON.stringify(metadata),
          });
        }

        // Send acknowledgment + menu in correct order
        const ageGroupAck = `✅ Got it! You selected: 😊 *${ageGroupName}*`;

        // Send acknowledgment first
        await sendMessage(msg.tenantId, msg.phoneNumber, ageGroupAck, false, msg.chatId);
        await db.insert(conversations).values({
          tenantId: msg.tenantId, phoneNumber: msg.phoneNumber,
          contactName: msg.contactName, message: msg.messageText,
          response: ageGroupAck, source: "ai",
        });

        // Small delay to ensure messages arrive in order
        await new Promise(r => setTimeout(r, 600));

        // Show the main BibleGuide menu after age group selection
        const mainMenu = `📖 *BibleGuide Menu*
What would you like to do today?

1️⃣ Daily Verse & Devotional
2️⃣ Ask a Bible Question
3️⃣ Guided Study (by book or topic)
4️⃣ Bible Quiz
5️⃣ Prayer Guide
0️⃣ Change Age Group`;

        await sendMessage(msg.tenantId, msg.phoneNumber, mainMenu, false, msg.chatId);
        await db.insert(conversations).values({
          tenantId: msg.tenantId, phoneNumber: msg.phoneNumber,
          contactName: msg.contactName, message: "",
          response: mainMenu, source: "ai",
        });
        console.log(`📖 [BibleGuide] Age group menu sent to ${msg.phoneNumber}`);
        return { stop: true }; // Stop here — don't pass to AI
      }

      // For every other action type (reply, booking, kb_search):
      // Re-phrase the customer's bare digit into a meaningful intent statement
      // so the AI can respond naturally in its own voice.
      // The "response" field stored by the admin becomes a HINT to the AI,
      // not a literal text that bypasses it.
      const hint = chosen.response ? `\n\n[Context for AI: the admin's guidance for this topic is: "${chosen.response}"]` : "";
      const intentText =
        `The customer selected menu option ${digit}: "${chosen.title}".` +
        (chosen.description ? ` (${chosen.description})` : "") +
        ` Please help them with this topic.${hint}`;

      // Return the rewritten intent — processWhatsAppWebhook will swap msg.messageText
      return { stop: false, messageOverride: intentText };
    }
  }

  return { stop: false }; // not a menu interaction — fall through normally
}
// ── End handleMenuInteraction ─────────────────────────────────────────────────

export async function processWhatsAppWebhook(msg: WebhookMessage): Promise<void> {
  const startTime = Date.now();

  // ── Per-phone rate limiting ────────────────────────────────────────────────
  // Prevent a single customer from flooding the pipeline with rapid-fire messages.
  const phoneLimit = checkPhoneMessageLimit(msg.tenantId, msg.phoneNumber);
  if (!phoneLimit.allowed) {
    console.warn(`🚫 [Security] Per-phone rate limit hit: tenant=${msg.tenantId} phone=${msg.phoneNumber} — silently dropped`);
    return; // Silently drop — no AI reply, no error (avoids confirming the limit to attackers)
  }

  // ── Input sanitization & prompt injection detection ────────────────────────
  const sanitized = sanitizeIncomingMessage(msg.messageText);
  if (sanitized.injectionDetected) {
    logSuspiciousInput(msg.tenantId, msg.phoneNumber, sanitized.original);
    // Replace the raw message with the sanitized (delimited) version so the AI
    // cannot be manipulated, but still attempt to respond naturally.
  }
  if (sanitized.truncated) {
    console.warn(`⚠️  [Security] Message truncated (was ${sanitized.original.length} chars): tenant=${msg.tenantId}`);
  }
  // Replace message text with sanitized version for all downstream processing
  msg = { ...msg, messageText: sanitized.text };

  try {
    const [config] = await db.select().from(botConfig).where(eq(botConfig.tenantId, msg.tenantId)).orderBy(desc(botConfig.updatedAt)).limit(1);
    if (!config) {
      console.warn(`⚠️  No bot config found for tenant ${msg.tenantId}`);
      return;
    }

    const label = config.businessName || `Tenant ${msg.tenantId}`;

    console.log(`🔄 Pipeline started for ${label}, ${msg.phoneNumber}: "${msg.messageText.slice(0, 60)}"`);

    // Human takeover check — check the MOST RECENT conversation row for this user.
    // Only block AI if the latest row is escalated; an old escalated row should not
    // permanently lock the conversation after the agent has resolved it.
    const [latestConv] = await db
      .select({ id: conversations.id, isEscalated: conversations.isEscalated })
      .from(conversations)
      .where(and(
        eq(conversations.tenantId, msg.tenantId),
        eq(conversations.phoneNumber, msg.phoneNumber),
      ))
      .orderBy(desc(conversations.createdAt))
      .limit(1);
    const escalated = latestConv?.isEscalated ? latestConv : null;

    if (escalated) {
      console.log(`🧑 [${label}] Human takeover active for ${msg.phoneNumber} — saving inbound, skipping AI`);
      await db.insert(conversations).values({
        tenantId: msg.tenantId,
        phoneNumber: msg.phoneNumber,
        contactName: msg.contactName,
        message: msg.messageText,
        response: null,
        source: "agent",
        isEscalated: true,
      });
      // Emit to dashboard so inbox updates in real-time
      io.to("dashboard").emit("conversation:new", {
        id: 0, phoneNumber: msg.phoneNumber, contactName: msg.contactName,
        message: msg.messageText, response: null, source: "agent",
      });
      return;
    }

    // Rate limiting
    const isSpam = await checkRateLimit(msg.tenantId, msg.phoneNumber);
    if (isSpam) {
      console.log(`🚫 Rate limited: tenant ${msg.tenantId}, ${msg.phoneNumber}`);
      return;
    }

    const isITBot    = config.systemPrompt?.toLowerCase().includes("it support") || config.systemPrompt?.toLowerCase().includes("tech support") || config.systemPrompt?.toLowerCase().includes("helpdesk");

    // ── BibleGuide Feature Handler (SIMPLIFIED) ──────────────────────────────────
    if (isBibleGuideBusiness(config.businessName)) {
      const textLower = msg.messageText.toLowerCase().trim();
      const digit = parseInt(msg.messageText.trim(), 10);

      // Menu triggers: show age group selection menu
      if (textLower === "hello" || textLower === "hi" || textLower === "start" || textLower === "menu" || textLower === "help") {
        const ageGroupMenu = `👋 Welcome to *BibleGuide* 📖🙏
I'm here to help you grow in God's Word every day!

Please choose your age group so I can teach in a way that fits you:

1️⃣ 👶 Kids (6–12 years old)
2️⃣ 👨‍🦱 Teens (13–17 years old)
3️⃣ 🎓 Young Adults (18–30 years old)
4️⃣ 👔 Adults (31–59 years old)
5️⃣ 🧓 Seniors (60+ years old)`;

        // Clear age group so next digit (1-5) will be treated as age selection
        const [customer] = await db.select().from(customers).where(and(eq(customers.tenantId, msg.tenantId), eq(customers.phoneNumber, msg.phoneNumber))).limit(1);
        if (customer) {
          const metadata = customer?.metadata ? JSON.parse(customer.metadata) : {};
          delete metadata.bibleguideAgeGroup; // Clear it temporarily
          await db.update(customers).set({ metadata: JSON.stringify(metadata) }).where(and(eq(customers.tenantId, msg.tenantId), eq(customers.phoneNumber, msg.phoneNumber)));
        }

        await sendMessage(msg.tenantId, msg.phoneNumber, ageGroupMenu, false, msg.chatId);
        await db.insert(conversations).values({
          tenantId: msg.tenantId,
          phoneNumber: msg.phoneNumber,
          contactName: msg.contactName,
          message: msg.messageText,
          response: ageGroupMenu,
          source: "bibleguide",
        });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      // Check if user sent a digit (1-5 for age group / features, 0 for change)
      if (!isNaN(digit) && digit >= 0 && digit <= 5) {
        const ageGroup = await getCustomerAgeGroup(msg.tenantId, msg.phoneNumber);

        // If no age group selected yet, this is age group selection (1-5)
        if (!ageGroup && digit >= 1 && digit <= 5) {
          const ageGroupNames: Record<number, string> = {
            1: "Kids",
            2: "Teens",
            3: "Young Adults",
            4: "Adults",
            5: "Seniors",
          };

          const selectedAge = ageGroupNames[digit];

          // Store age group in metadata
          const [customer] = await db.select().from(customers).where(and(eq(customers.tenantId, msg.tenantId), eq(customers.phoneNumber, msg.phoneNumber))).limit(1);
          const metadata = customer?.metadata ? JSON.parse(customer.metadata) : {};
          metadata.bibleguideAgeGroup = selectedAge;
          metadata.bibleguideAgeGroupSelectedAt = new Date().toISOString();

          if (customer) {
            await db.update(customers).set({ metadata: JSON.stringify(metadata) }).where(and(eq(customers.tenantId, msg.tenantId), eq(customers.phoneNumber, msg.phoneNumber)));
          } else {
            await db.insert(customers).values({
              tenantId: msg.tenantId,
              phoneNumber: msg.phoneNumber,
              contactName: msg.contactName || "Customer",
              metadata: JSON.stringify(metadata),
            });
          }

          // Send acknowledgment
          const ack = `✅ Got it! You selected: 😊 *${selectedAge}*`;
          await sendMessage(msg.tenantId, msg.phoneNumber, ack, false, msg.chatId);
          await db.insert(conversations).values({
            tenantId: msg.tenantId,
            phoneNumber: msg.phoneNumber,
            contactName: msg.contactName,
            message: msg.messageText,
            response: ack,
            source: "bibleguide",
          });

          // Delay then send feature menu
          await new Promise(r => setTimeout(r, 600));
          await sendMessage(msg.tenantId, msg.phoneNumber, BIBLEGUIDE_MAIN_MENU, false, msg.chatId);
          await db.insert(conversations).values({
            tenantId: msg.tenantId,
            phoneNumber: msg.phoneNumber,
            contactName: msg.contactName,
            message: "",
            response: BIBLEGUIDE_MAIN_MENU,
            source: "bibleguide",
          });
          await incrementMessageUsage(msg.tenantId);
          return;
        }

        // If age group is selected, handle feature selection (1-5, 0)
        if (ageGroup && (digit === 0 || (digit >= 1 && digit <= 5))) {
          const bibleGuideResponse = await handleBibleGuideFeature(msg.tenantId, msg.phoneNumber, msg.messageText);

          if (bibleGuideResponse) {
            console.log(`📖 [BibleGuide] Feature response ready, sending...`);

            // Message 1: Response
            await sendMessage(msg.tenantId, msg.phoneNumber, bibleGuideResponse, false, msg.chatId);
            console.log(`📖 [BibleGuide] Message 1 sent: ${msg.phoneNumber}`);

            await db.insert(conversations).values({
              tenantId: msg.tenantId,
              phoneNumber: msg.phoneNumber,
              contactName: msg.contactName,
              message: msg.messageText,
              response: bibleGuideResponse,
              source: "bibleguide",
            });

            // Delay then Message 2: Menu (unless changing age group)
            if (digit !== 0) {
              console.log(`📖 [BibleGuide] Waiting 1000ms before menu...`);
              await new Promise(r => setTimeout(r, 1000));

              console.log(`📖 [BibleGuide] Sending menu message...`);
              await sendMessage(msg.tenantId, msg.phoneNumber, BIBLEGUIDE_MAIN_MENU, false, msg.chatId);
              console.log(`📖 [BibleGuide] Message 2 (menu) sent: ${msg.phoneNumber}`);

              await db.insert(conversations).values({
                tenantId: msg.tenantId,
                phoneNumber: msg.phoneNumber,
                contactName: msg.contactName,
                message: "",
                response: BIBLEGUIDE_MAIN_MENU,
                source: "bibleguide",
              });
            }

            await incrementMessageUsage(msg.tenantId);
            io.to("dashboard").emit("conversation:new", {
              phoneNumber: msg.phoneNumber,
              contactName: msg.contactName,
              message: msg.messageText,
              response: bibleGuideResponse,
              source: "bibleguide",
            });
            return;
          }
        }
      }
    }

    // ── IT Support Assistant ─────────────────────────────────────────────────
    if (isITBot) {
      const itResult = await handleITSupport(msg, config, startTime);
      if (itResult) return; // IT support handled this message — stop pipeline
    }

    // ── Numbered menu mode ────────────────────────────────────────────────────
    // When enableMenuMode is on, show the menu on greeting/trigger words.
    // When a digit is received, either escalate directly (escalate action) or
    // translate the selection into a natural intent phrase and let the AI
    // respond in its own voice — menu is navigation, not a static reply bot.
    if (config.enableMenuMode) {
      const menuResult = await handleMenuInteraction(msg, config);
      if (menuResult.stop) return; // menu or escalation fully handled the message
      if (menuResult.messageOverride) {
        // Swap the bare digit for a descriptive intent so the AI understands context
        msg = { ...msg, messageText: menuResult.messageOverride };
      }
    }
    // ── End menu mode ─────────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────────────────────────

    // Detect personal / emotional messages so the bot responds as an empathetic
    // counsellor and follows up with a personalised prayer rather than a quiz invite.
    // Also active for any session in encouragement, prayer, or advice mode.
    const _activeSessionSnapshot = getBibleSession(msg.tenantId, msg.phoneNumber);
    const activeSessionMode  = _activeSessionSnapshot?.mode;
    const activeSessionTopic = _activeSessionSnapshot?.topic ?? "";
    const isPersonalMessage = false && (
      activeSessionMode === "encouragement" ||
      activeSessionMode === "prayer" ||
      /\b(i feel|i'm feeling|i am feeling|feeling (so |very )?(sad|down|lost|empty|broken|hopeless|hurt)|i am sad|i'm sad|i feel sad|i feel lost|i feel empty|i feel broken|i feel hopeless|i feel alone|i feel lonely|i feel overwhelmed|i feel anxious|i feel scared|i feel afraid|i feel stressed|i feel depressed|i feel helpless|i feel worthless|i feel like giving up|i feel tired|i feel exhausted|i'm struggling|i am struggling|struggling with|going through a hard|going through a tough|difficult time|hard time|tough time|i need (help|support|prayer|motivation|encouragement)|pray for me|need prayer|need motivation|motivate me|i'm depressed|i am depressed|depression|i'm anxious|i am anxious|anxiety|i'm overwhelmed|i am overwhelmed|i'm stressed|i am stressed|i'm lonely|i am lonely|i'm scared|i am scared|i'm afraid|i am afraid|i'm hurting|i am hurting|heartbroken|heart is broken|i'm broken|i am broken|lost my|lost a|can't cope|cannot cope|don't know what to do|don't know how to|no hope|giving up|want to give up|life is hard|life is difficult|things are hard|i need god|need god's|need jesus|help me god|help me lord|i'm not okay|i am not okay|not doing well|not doing okay|having a hard|having a tough)\b/i.test(msg.messageText)
    );

    let apiUrl  = config.aiApiUrl  || process.env.AI_API_URL  || "https://api.groq.com/openai/v1";
    // Decrypt the API key — it may be stored encrypted if ENCRYPTION_KEY is set.
    // Falls back cleanly to plaintext for legacy rows or the env-var default.
    let apiKey  = decrypt(config.aiApiKey  || "") || process.env.AI_API_KEY  || "";
    let aiModel = config.aiModel   || process.env.AI_MODEL    || "gemma4:latest";

    // ── Check for global AI model override (admin can set global defaults) ──────
    try {
      const globalSettings = await db.query.systemSettings.findFirst({
        where: eq(systemSettings.key, "global_ai"),
      });

      if (globalSettings?.globalAiModel) {
        apiUrl = globalSettings.globalAiApiUrl;
        apiKey = globalSettings.globalAiApiKey;
        aiModel = globalSettings.globalAiModel;
        console.log(`ℹ️  Tenant ${msg.tenantId} using global AI model: ${aiModel}`);
      }
    } catch (err: any) {
      console.warn(`⚠️  Could not fetch global AI settings:`, err.message);
      // Continue with tenant's own settings if global fetch fails
    }

    // ── Bible bot: block new verse if a quiz is already in progress ──────────────
    if (false) {
      const activeQuiz = getQuizSession(msg.tenantId, msg.phoneNumber);
      const isAnswering = /^[abcd]$/i.test(msg.messageText.trim());
      const isQuizTime  = /\bquiz\s*time\b/i.test(msg.messageText);

      if (activeQuiz && !isAnswering && !isQuizTime) {
        const remaining = activeQuiz.questions.length - activeQuiz.userAnswers.length;
        const reminder = `🧠 *You have an active quiz!*\n\nYou still have *${remaining} question${remaining !== 1 ? "s" : ""}* to answer. Please complete the quiz before studying a new verse.\n\n_Reply with A, B, C or D to continue where you left off._\n\n${formatQuizQuestion(activeQuiz.questions[activeQuiz.userAnswers.length], activeQuiz.userAnswers.length + 1, activeQuiz.questions.length)}`;
        await sendMessage(msg.tenantId, msg.phoneNumber, reminder, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reminder, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }
    }

    // ── Quiz time trigger — user-initiated ────────────────────────────────────
    if (false && /\bquiz\s*time\b/i.test(msg.messageText)) {
      const pendingVerse = getPendingQuizVerse(msg.tenantId, msg.phoneNumber);
      if (!pendingVerse) {
        const reply = `🧠 *No verse to quiz yet!*\n\nSend me a Bible verse or type *verse of the day* first, then type *Quiz time* when you're ready to be tested.`;
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      // Acknowledge immediately then generate questions in background
      const ack = `🧠 *Quiz time!* Generating your 10 questions... this takes about 15 seconds. Get ready! 💪`;
      await sendMessage(msg.tenantId, msg.phoneNumber, ack, false, msg.chatId);
      clearPendingQuizVerse(msg.tenantId, msg.phoneNumber);

      (async () => {
        try {
          const questions = await generateAllQuizQuestions(pendingVerse, apiUrl, apiKey, aiModel);
          if (questions.length > 0) {
            setQuizSession(msg.tenantId, msg.phoneNumber, { questions, userAnswers: [], currentIndex: 0, verseResponse: pendingVerse });
            const intro = `✅ *Quiz ready!*\n\n_${questions.length} challenging questions. Answer all of them first — results and explanations will be revealed at the end. Good luck!_ 🧠`;
            await sendMessage(msg.tenantId, msg.phoneNumber, intro, false, msg.chatId);
            await new Promise(r => setTimeout(r, 1500));
            await sendMessage(msg.tenantId, msg.phoneNumber, formatQuizQuestion(questions[0], 1, questions.length), false, msg.chatId);
            console.log(`🧠 [${label}] ✅ Quiz started (${questions.length} questions) for ${msg.phoneNumber}`);
          } else {
            // Restore the pending verse so the user can retry
            setPendingQuizVerse(msg.tenantId, msg.phoneNumber, pendingVerse);
            await sendMessage(msg.tenantId, msg.phoneNumber,
              `⚠️ *Quiz generation hit a snag.* This is usually temporary due to high AI traffic.\n\nPlease type *Quiz time* again in about 2 minutes and it should work! 🙏`,
              false, msg.chatId);
          }
        } catch (err: any) {
          console.warn(`⚠️  [${label}] Quiz generation failed:`, err.message);
        }
      })();

      await saveConversation(msg.tenantId, { ...msg, response: ack, source: "ai", responseTimeMs: Date.now() - startTime });
      await incrementMessageUsage(msg.tenantId);
      return;
    }

    // ── Quiz answer handler ────────────────────────────────────────────────────
    if (false) {
      const quizSession = getQuizSession(msg.tenantId, msg.phoneNumber);
      const answerMatch = /^[abcd]$/i.test(msg.messageText.trim());

      if (quizSession && answerMatch) {
        const given = msg.messageText.trim().toUpperCase();

        // Record this answer
        quizSession.userAnswers.push(given);
        const answeredCount = quizSession.userAnswers.length;
        const totalQuestions = quizSession.questions.length;

        if (answeredCount < totalQuestions) {
          // More questions remain — send the next one with a progress indicator
          const nextQ = quizSession.questions[answeredCount];
          const ack = `✏️ _Answer ${answeredCount} recorded. Question ${answeredCount + 1} of ${totalQuestions}:_`;
          // Update session with new answers
          setQuizSession(msg.tenantId, msg.phoneNumber, { ...quizSession, userAnswers: quizSession.userAnswers, currentIndex: answeredCount });
          await sendMessage(msg.tenantId, msg.phoneNumber, `${ack}\n\n${formatQuizQuestion(nextQ, answeredCount + 1, totalQuestions)}`, false, msg.chatId);
          await saveConversation(msg.tenantId, { ...msg, response: ack, source: "ai", responseTimeMs: Date.now() - startTime });
        } else {
          // All 10 answers collected — clear session and reveal results
          clearQuizSession(msg.tenantId, msg.phoneNumber);

          const processingMsg = `✅ _All ${totalQuestions} answers received! Marking your quiz now..._`;
          await sendMessage(msg.tenantId, msg.phoneNumber, processingMsg, false, msg.chatId);

          const results = formatQuizResults(quizSession.questions, quizSession.userAnswers);

          // Split results if over WhatsApp limit (results with 10 explanations can be long)
          const MAX_WA = 3800;
          if (results.length <= MAX_WA) {
            await sendMessage(msg.tenantId, msg.phoneNumber, results, false, msg.chatId);
          } else {
            // Send in two halves split at a natural line break
            const half = Math.floor(results.length / 2);
            const splitAt = results.lastIndexOf("\n\n", half);
            const part1 = results.slice(0, splitAt);
            const part2 = results.slice(splitAt).trimStart();
            await sendMessage(msg.tenantId, msg.phoneNumber, part1, false, msg.chatId);
            await new Promise(r => setTimeout(r, 1500));
            await sendMessage(msg.tenantId, msg.phoneNumber, part2, false, msg.chatId);
          }

          console.log(`🧠 [${label}] ✅ Quiz results sent to ${msg.phoneNumber}`);
          await saveConversation(msg.tenantId, { ...msg, response: results.slice(0, 500), source: "ai", responseTimeMs: Date.now() - startTime });
        }

        await incrementMessageUsage(msg.tenantId);
        return;
      }
    }

    // ── Bible Session: verse consent handler ─────────────────────────────────
    // When we offered a closing verse and are waiting for yes/no, handle it here
    // before anything else so a "yes" or "no" doesn't pass through to the AI.
    if (false) {
      const activeSession = getBibleSession(msg.tenantId, msg.phoneNumber);
      if (activeSession?.waitingForVerseConsent) {
        const isYes = /\b(yes|yeah|yep|yup|sure|please|ok|okay|definitely|of course|go ahead|send it|absolutely|i do|i would|i'd love|love to)\b/i.test(msg.messageText);
        const isNo  = /\b(no|nope|not now|maybe later|i'm good|i'm fine|no thanks|skip|not really|later|pass)\b/i.test(msg.messageText);

        if (isYes || isNo) {
          if (isYes) {
            const ack = `📖 *Perfect!* Let me find the right verse for our conversation... just a moment 🙏`;
            await sendMessage(msg.tenantId, msg.phoneNumber, ack, false, msg.chatId);

            // Snapshot session details before clearing
            const sessionMode = activeSession.mode;
            const sessionTopic = activeSession.topic;
            // Schedule a 24h follow-up check-in for this session
            if (sessionMode === "encouragement" || sessionMode === "prayer") {
              schedulePostCheckIn(msg.tenantId, msg.phoneNumber, sessionMode);
            }
            clearBibleSession(msg.tenantId, msg.phoneNumber);

            // Build a brief conversation context from recent history
            const recentHistory = await db.select({ message: conversations.message, response: conversations.response })
              .from(conversations)
              .where(and(eq(conversations.tenantId, msg.tenantId), eq(conversations.phoneNumber, msg.phoneNumber)))
              .orderBy(desc(conversations.createdAt))
              .limit(6);
            const context = [...recentHistory].reverse()
              .map(h => `User: ${h.message ?? ""}\nBot: ${h.response ?? ""}`)
              .join("\n");

            (async () => {
              try {
                const verse = await generateVerseForSession(sessionMode, sessionTopic, context, apiUrl, apiKey, aiModel);
                if (verse) {
                  await sendMessage(msg.tenantId, msg.phoneNumber, verse, false, msg.chatId);
                  const prayer = await generatePrayerTopics(verse, apiUrl, apiKey, aiModel);
                  await sendMessage(msg.tenantId, msg.phoneNumber, prayer, false, msg.chatId);
                  console.log(`📖 [${label}] ✅ Session closing verse + prayer sent to ${msg.phoneNumber}`);
                }
              } catch (err: any) {
                console.warn(`⚠️  [${label}] Session verse failed:`, err.message);
                await sendMessage(msg.tenantId, msg.phoneNumber,
                  `⚠️ I couldn't fetch a closing verse right now — please try again in a moment. 🙏`,
                  false, msg.chatId).catch(() => {});
              }
            })();
          } else {
            // User declined — send a warm closing blessing
            const closing = `🙏 That's perfectly okay! It was a blessing talking with you. Come back anytime you want to study or just chat. *God bless you!* 💙`;
            await sendMessage(msg.tenantId, msg.phoneNumber, closing, false, msg.chatId);
            clearBibleSession(msg.tenantId, msg.phoneNumber);
          }

          await saveConversation(msg.tenantId, { ...msg, response: "[Verse consent handled]", source: "ai", responseTimeMs: Date.now() - startTime });
          await incrementMessageUsage(msg.tenantId);
          return;
        }

        // Not a clear yes/no — let the AI continue the conversation but keep session alive
      }
    }

    // ── Bible Session: menu option selection ─────────────────────────────────
    if (false) {
      const optionText = msg.messageText.trim();
      const optionNum = /^([1-6])$/.exec(optionText)?.[1];
      const hasActiveSession = !!getBibleSession(msg.tenantId, msg.phoneNumber);
      const hasActiveQuiz = !!getQuizSession(msg.tenantId, msg.phoneNumber);

      if (optionNum && !hasActiveSession && !hasActiveQuiz) {

        // Option 5 = Daily Verse → generate and send a verse immediately (no ongoing session)
        if (optionNum === "5") {
          const ack = `🌅 *Today's verse is on its way!* Give me just a moment... 🙏`;
          await sendMessage(msg.tenantId, msg.phoneNumber, ack, false, msg.chatId);
          await saveConversation(msg.tenantId, { ...msg, response: ack, source: "ai", responseTimeMs: Date.now() - startTime });
          await incrementMessageUsage(msg.tenantId);

          // Generate verse + prayer topics in the background
          const dailyVersePrefs = getUserPrefs(msg.tenantId, msg.phoneNumber);
          ;(async () => {
            try {
              const verse = await generateVerseForSession("study", `daily verse and devotional (${dailyVersePrefs.translation} translation)`, "", apiUrl, apiKey, aiModel);
              if (verse) {
                await sendMessage(msg.tenantId, msg.phoneNumber, verse, false, msg.chatId);
                const prayer = await generatePrayerTopics(verse, apiUrl, apiKey, aiModel);
                await sendMessage(msg.tenantId, msg.phoneNumber, prayer, false, msg.chatId);
                console.log(`🌅 [${label}] ✅ Daily verse sent to ${msg.phoneNumber}`);
              } else {
                await sendMessage(msg.tenantId, msg.phoneNumber,
                  `⚠️ I couldn't generate today's verse right now. Please try again in a moment or type *5* again. 🙏`,
                  false, msg.chatId);
              }
            } catch (err: any) {
              console.warn(`⚠️  [${label}] Daily verse (menu) failed:`, err.message);
              await sendMessage(msg.tenantId, msg.phoneNumber,
                `⚠️ I'm having trouble connecting to the AI service right now. Please try again in a few minutes. 🙏`,
                false, msg.chatId).catch(() => {});
            }
          })();
          return;
        }

        const optionMap: Record<string, { mode: BibleSessionMode; topic: string; reply: string }> = {
          "1": {
            mode: "prayer",
            topic: "prayer request",
            reply: `🙏 *Let's bring this to God together.*\n\nWhat would you like prayer for? Share your request and I will pray with you. 💙`,
          },
          "2": {
            mode: "topic",
            topic: "general chat",
            reply: `💬 *I'm here to chat!*\n\nWhat's on your mind? Feel free to talk about anything — I'm all ears. 😊`,
          },
          "3": {
            mode: "encouragement",
            topic: "advice and guidance",
            reply: `❤️ *I'm here to help.*\n\nWhat's going on? Share what's on your heart and I'll listen first, then offer some honest and gentle guidance. 🙏`,
          },
          "4": {
            mode: "study",
            topic: "Bible verse and encouragement",
            reply: `📖 *Let's open the Word together!*\n\nWhat topic or area of life would you like a Bible verse on? For example: *stress, fear, hope, love, forgiveness, purpose...* — or anything else. 🌟`,
          },
          "6": {
            mode: "encouragement",
            topic: "motivational word and speech",
            reply: `💪 *Let's get you fired up for the day!*\n\nI'm about to share something powerful with you. But first — what area of your life needs a boost right now? _(e.g. confidence, work, relationships, faith, strength, purpose...)_ 🔥`,
          },
        };

        const chosen = optionMap[optionNum];
        setBibleSession(msg.tenantId, msg.phoneNumber, {
          mode: chosen.mode,
          topic: chosen.topic,
          messageCount: 0,
          askedForVerse: false,
          waitingForVerseConsent: false,
        });

        await sendMessage(msg.tenantId, msg.phoneNumber, chosen.reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: chosen.reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }
    }

    // ── Bible Session: menu trigger for greeting / opener messages ────────────
    if (false) {
      const isGreeting = /^(hi|hello|hey|howzit|good morning|good afternoon|good evening|good day|morning|evening|greetings|shalom|start|begin|menu|options|help me|help)[\s!.]*$/i.test(msg.messageText.trim());
      const hasActiveSession = !!getBibleSession(msg.tenantId, msg.phoneNumber);
      const hasActiveQuiz = !!getQuizSession(msg.tenantId, msg.phoneNumber);

      if (isGreeting && !hasActiveSession && !hasActiveQuiz) {
        const menu =
          `👋 *Hi! I'm here for you.* How can I help today?\n\n` +
          `1️⃣  🙏 *Request a Prayer*\n` +
          `2️⃣  💬 *Talk / Chat*\n` +
          `3️⃣  ❤️ *Get Advice*\n` +
          `4️⃣  📖 *Bible Verse & Encouragement*\n` +
          `5️⃣  🌅 *Daily Verse*\n` +
          `6️⃣  💪 *Motivational Word*\n\n` +
          `_Reply with a number to get started._`;

        await sendMessage(msg.tenantId, msg.phoneNumber, menu, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: menu, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }
    }

    // ── Reading plan commands ─────────────────────────────────────────────────
    if (false) {
      const text = msg.messageText.trim();
      const startPlanMatch = /\b(start|begin|new)?\s*(reading plan|7.?day plan|bible plan)\s*(on|about|for)?\s*(.+)/i.exec(text);
      const checkPlanMatch = /\b(my reading|today.?s (reading|verse)|continue|next verse|day \d)\b/i.test(text);
      const stopPlanMatch  = /\b(stop|cancel|end)\s*(reading plan|plan)\b/i.test(text);

      if (startPlanMatch) {
        const topic = (startPlanMatch[4]?.trim() ?? "faith").slice(0, 100); // cap length
        const plan = startReadingPlan(msg.tenantId, msg.phoneNumber, topic);
        const intro = `📖 *7-Day Reading Plan: ${topic.charAt(0).toUpperCase() + topic.slice(1)}*\n\nWelcome! You will receive one verse per day for 7 days on the theme of *${topic}*.\n\nHere is your *Day 1* verse:`;
        await sendMessage(msg.tenantId, msg.phoneNumber, intro, false, msg.chatId);

        // Generate day 1 verse
        (async () => {
          try {
            const verse = await generateReadingPlanVerse(topic, 1, apiUrl, apiKey, aiModel);
            if (verse) {
              await sendMessage(msg.tenantId, msg.phoneNumber, verse, false, msg.chatId);
              markReadingPlanSent(msg.tenantId, msg.phoneNumber);
              // Prayer topics for the reading plan verse
              const prayer = await generatePrayerTopics(verse, apiUrl, apiKey, aiModel);
              await sendMessage(msg.tenantId, msg.phoneNumber, prayer, false, msg.chatId);
            }
          } catch (err: any) {
            console.warn(`⚠️  [${label}] Reading plan day 1 failed:`, err.message);
          }
        })();

        await saveConversation(msg.tenantId, { ...msg, response: intro, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (stopPlanMatch) {
        clearReadingPlan(msg.tenantId, msg.phoneNumber);
        const reply = "📖 Your reading plan has been cancelled. You can start a new one anytime by typing *reading plan [topic]*.";
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (checkPlanMatch) {
        const plan = getReadingPlan(msg.tenantId, msg.phoneNumber);
        if (plan) {
          if (alreadySentToday(msg.tenantId, msg.phoneNumber)) {
            const nextDay = plan.currentDay < 7 ? `Come back tomorrow for Day ${plan.currentDay + 1}! 📅` : `You've completed all 7 days — amazing! 🎉`;
            const reply = `📖 You have already received today's verse (Day ${plan.currentDay} of 7 — *${plan.topic}*). ${nextDay}`;
            await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
            await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
          } else {
            const header = `📖 *Day ${plan.currentDay} of 7 — ${plan.topic.charAt(0).toUpperCase() + plan.topic.slice(1)}*`;
            await sendMessage(msg.tenantId, msg.phoneNumber, header, false, msg.chatId);
            // Mark sent immediately so duplicate requests in same session don't re-trigger
            markReadingPlanSent(msg.tenantId, msg.phoneNumber);
            let conversationResponse = `[Reading plan day ${plan.currentDay} of 7 — ${plan.topic}]`;
            (async () => {
              try {
                const verse = await generateReadingPlanVerse(plan.topic, plan.currentDay, apiUrl, apiKey, aiModel);
                if (verse) {
                  await sendMessage(msg.tenantId, msg.phoneNumber, verse, false, msg.chatId);
                  const advanced = advanceReadingPlan(msg.tenantId, msg.phoneNumber);
                  if (!advanced) {
                    // Plan completed
                    await sendMessage(msg.tenantId, msg.phoneNumber, `🎉 *Congratulations!* You have completed your 7-day reading plan on *${plan.topic}*!\n\nType *reading plan [new topic]* to start another journey. God bless you! 🙏`, false, msg.chatId);
                    conversationResponse = `[Reading plan COMPLETED — ${plan.topic}]`;
                  }
                  const prayer = await generatePrayerTopics(verse, apiUrl, apiKey, aiModel);
                  await sendMessage(msg.tenantId, msg.phoneNumber, prayer, false, msg.chatId);
                }
              } catch (err: any) {
                console.warn(`⚠️  [${label}] Reading plan verse failed:`, err.message);
                await sendMessage(msg.tenantId, msg.phoneNumber,
                  `⚠️ I couldn't load today's reading plan verse right now. Please try again in a moment. 🙏`,
                  false, msg.chatId).catch(() => {});
              }
            })();
            await saveConversation(msg.tenantId, { ...msg, response: conversationResponse, source: "ai", responseTimeMs: Date.now() - startTime });
          }
          await incrementMessageUsage(msg.tenantId);
          return;
        } else {
          // User asked about their reading plan but none exists
          const reply = `📖 You don't have an active reading plan yet.\n\nType *reading plan [topic]* to start a 7-day journey — for example: _reading plan on faith_, _reading plan on prayer_, or _reading plan on hope_. 🌟`;
          await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
          await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
          await incrementMessageUsage(msg.tenantId);
          return;
        }
      }
    }

    // ── Book summary ──────────────────────────────────────────────────────────
    if (false) {
      const bookMatch = /\b(?:summaris[e|ing]?|summary of|overview of|tell me about)\s+([\w\s]+?)(?:\s*$|\s*book)/i.exec(msg.messageText.trim());
      if (bookMatch) {
        const bookName = bookMatch[1].trim();
        // Validate it's a recognised Bible book before sending to the AI
        if (!BIBLE_BOOKS_RE.test(bookName)) {
          const notFound = `📚 I couldn't find *"${bookName}"* in the Bible. Try a book like *Genesis, Psalms, Matthew, John, Romans, Revelation* etc.`;
          await sendMessage(msg.tenantId, msg.phoneNumber, notFound, false, msg.chatId);
          await saveConversation(msg.tenantId, { ...msg, response: notFound, source: "ai", responseTimeMs: Date.now() - startTime });
          await incrementMessageUsage(msg.tenantId);
          return;
        }
        const ack = `📚 *Generating summary of ${bookName}...* just a moment!`;
        await sendMessage(msg.tenantId, msg.phoneNumber, ack, false, msg.chatId);
        (async () => {
          try {
            const summary = await generateBookSummary(bookName, apiUrl, apiKey, aiModel);
            if (summary) await sendMessage(msg.tenantId, msg.phoneNumber, summary, false, msg.chatId);
          } catch (err: any) { console.warn(`⚠️  Book summary failed:`, err.message); }
        })();
        await saveConversation(msg.tenantId, { ...msg, response: ack, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }
    }

    // ── Sermon prep ───────────────────────────────────────────────────────────
    if (false) {
      const sermonMatch = /\b(?:sermon prep|sermon on|preach on|sermon outline|prepare sermon|prepare a sermon|preach about)\s*(?:on\s+|about\s+)?(.+)/i.exec(msg.messageText.trim());
      if (sermonMatch) {
        const topic = sermonMatch[1].trim();
        const ack = `📝 *Preparing sermon outline on "${topic}"...* give me a moment!`;
        await sendMessage(msg.tenantId, msg.phoneNumber, ack, false, msg.chatId);
        (async () => {
          try {
            const outline = await generateSermonPrep(topic, apiUrl, apiKey, aiModel);
            if (outline) await sendMessage(msg.tenantId, msg.phoneNumber, outline, false, msg.chatId);
          } catch (err: any) { console.warn(`⚠️  Sermon prep failed:`, err.message); }
        })();
        await saveConversation(msg.tenantId, { ...msg, response: ack, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }
    }

    // ── Memory verse tracker ──────────────────────────────────────────────────
    if (false) {
      const memText = msg.messageText.trim();
      const startMemMatch = /\b(?:memoris[e|ing]?|memory verse|i want to memorise|help me memorise)\s+(.+)/i.exec(memText);
      const checkMemMatch = /\b(my memory verse|test me|memory test|check memory verse)\b/i.test(memText);
      const clearMemMatch = /\b(clear memory verse|stop memorising|done memorising|remove memory verse)\b/i.test(memText);

      if (startMemMatch) {
        const verseRef = startMemMatch[1].trim();
        const ack = `🧠 *Memory Verse set!*\n\n*${verseRef}*\n\nI'll test you on this verse daily to help you memorise it. Type *test me* anytime to practice!`;
        setMemoryVerse(msg.tenantId, msg.phoneNumber, verseRef, "");
        await sendMessage(msg.tenantId, msg.phoneNumber, ack, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: ack, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (checkMemMatch) {
        const mv = getMemoryVerse(msg.tenantId, msg.phoneNumber);
        if (!mv) {
          const reply = `🧠 You don't have a memory verse set yet. Type *memorise [verse reference]* to start tracking one!`;
          await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        } else {
          const { generateMemoryVerseTest } = await import("../services/bibleStudyService.js");
          const ack = `📖 *Testing you on ${mv.reference}...* 🧠`;
          await sendMessage(msg.tenantId, msg.phoneNumber, ack, false, msg.chatId);
          (async () => {
            try {
              const test = await generateMemoryVerseTest(mv.reference, mv.text, mv.testCount, apiUrl, apiKey, aiModel);
              if (test) await sendMessage(msg.tenantId, msg.phoneNumber, test, false, msg.chatId);
            } catch (err: any) { console.warn(`⚠️  Memory verse test failed:`, err.message); }
          })();
        }
        await saveConversation(msg.tenantId, { ...msg, response: "[Memory verse test]", source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (clearMemMatch) {
        clearMemoryVerse(msg.tenantId, msg.phoneNumber);
        const reply = `✅ Memory verse cleared. Type *memorise [verse]* to set a new one!`;
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }
    }

    // ── Fasting companion ─────────────────────────────────────────────────────
    if (false) {
      const fastText = msg.messageText.trim();
      const startFastMatch = /\b(?:start(?:ing)? a fast|i(?:'m| am) fasting|begin fast|fasting for)\s+(.+)/i.exec(fastText);
      const checkFastMatch = /\b(fasting status|how(?:'s| is) my fast|fast check|fast update)\b/i.test(fastText);
      const endFastMatch   = /\b(end(?:ing)? fast|stop(?:ping)? fast|broke? my fast|fast (?:is )?done|i ate)\b/i.test(fastText);

      if (startFastMatch) {
        const rawIntention = startFastMatch[1].trim();
        // Extract duration from the intention string (e.g. "24h", "3 hours")
        const durationMatch = /(\d+)\s*h(?:ours?)?/i.exec(rawIntention);
        const hours = durationMatch ? parseInt(durationMatch[1]) : 24;
        // Remove the duration fragment to get a clean intention description
        const cleanIntention = rawIntention
          .replace(/\b\d+\s*h(?:ours?)?\b/gi, "")
          .replace(/\s{2,}/g, " ")
          .trim();
        // Fall back to a generic label if nothing remains after stripping the duration
        const intention = cleanIntention || "seeking God";
        startFast(msg.tenantId, msg.phoneNumber, intention, hours);
        const reply =
          `⏳ *Fast started!*\n\n` +
          `*Intention:* ${intention}\n` +
          `*Duration:* ${hours} hours\n\n` +
          `I'll check in on you during your fast with encouragement and scripture. Type *fast check* anytime. 🙏`;
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (checkFastMatch || endFastMatch) {
        const fast = getFasting(msg.tenantId, msg.phoneNumber);
        if (!fast) {
          const reply = `⏳ You don't have an active fast. Type *start fast for [reason]* to begin one!`;
          await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        } else if (endFastMatch) {
          endFast(msg.tenantId, msg.phoneNumber);
          const reply = `🙌 *Fast complete!* Well done for your dedication. God heard every prayer. May He answer in His perfect timing. 🙏`;
          await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        } else {
          const elapsed = (Date.now() - new Date(fast.startedAt).getTime()) / 3_600_000;
          const total   = (new Date(fast.endsAt).getTime() - new Date(fast.startedAt).getTime()) / 3_600_000;
          const remaining = Math.max(0, total - elapsed);
          const pct = Math.min(100, Math.round((elapsed / total) * 100));
          const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
          const reply =
            `⏳ *Fasting Update*\n\n` +
            `*Intention:* ${fast.intention}\n` +
            `*Progress:* ${bar} ${pct}%\n` +
            `*Elapsed:* ${elapsed.toFixed(1)}h / ${total}h\n` +
            `*Remaining:* ~${remaining.toFixed(1)}h\n\n` +
            `Keep going — you're doing amazing! 💪🙏`;
          await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        }
        await saveConversation(msg.tenantId, { ...msg, response: "[Fasting status]", source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }
    }

    // ── User preferences ──────────────────────────────────────────────────────
    if (false) {
      const prefText = msg.messageText.trim();
      const viewPrefs   = /\b(my (?:settings|prefs|preferences)|show settings|my profile)\b/i.test(prefText);
      const setTransMatch = /\b(?:set|change|use|prefer)\s+(?:translation\s+)?(?:to\s+)?(NIV|KJV|ESV|NLT|NKJV)\b/i.exec(prefText);
      const setTimeMatch  = /\b(?:send|set|change|daily verse)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i.exec(prefText);
      const optOutMatch   = /\b(opt out|unsubscribe|stop daily verse|no daily verse)\b/i.test(prefText);
      const optInPrefsMatch = /\b(opt in|subscribe|daily verse on|start daily verse|resume daily verse)\b/i.test(prefText);

      if (setTransMatch) {
        const translation = setTransMatch[1].toUpperCase() as any;
        setUserPrefs(msg.tenantId, msg.phoneNumber, { translation });
        const reply = `✅ Bible translation set to *${translation}*. All future verses will use ${translation}.`;
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (setTimeMatch) {
        const rawTime = setTimeMatch[1].trim();
        // Normalise to HH:MM 24h
        let hh = 7, mm = 0;
        const amPmMatch = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(rawTime);
        const plainMatch = /^(\d{1,2}):(\d{2})$/.exec(rawTime);
        if (amPmMatch) {
          hh = parseInt(amPmMatch[1]);
          mm = amPmMatch[2] ? parseInt(amPmMatch[2]) : 0;
          if (/pm/i.test(amPmMatch[3]) && hh !== 12) hh += 12;
          if (/am/i.test(amPmMatch[3]) && hh === 12) hh = 0;
        } else if (plainMatch) {
          hh = parseInt(plainMatch[1]); mm = parseInt(plainMatch[2]);
        }
        const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
        setUserPrefs(msg.tenantId, msg.phoneNumber, { dailyVerseTime: time });
        const reply = `✅ Daily verse time set to *${time}*. You'll receive your verse at ${time} each day! 🌅`;
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (optOutMatch) {
        setUserPrefs(msg.tenantId, msg.phoneNumber, { optedInDailyVerse: false });
        const reply = `✅ Daily verse paused. You won't receive automatic daily verses. Type *start daily verse* to resume anytime.`;
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (optInPrefsMatch) {
        setUserPrefs(msg.tenantId, msg.phoneNumber, { optedInDailyVerse: true });
        const prefs = getUserPrefs(msg.tenantId, msg.phoneNumber);
        const reply = `✅ Daily verse re-enabled! You'll receive your verse at *${prefs.dailyVerseTime}* each day. 🌅`;
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (viewPrefs) {
        const prefs = getUserPrefs(msg.tenantId, msg.phoneNumber);
        const mv = getMemoryVerse(msg.tenantId, msg.phoneNumber);
        const streak = updateStreak(msg.tenantId, msg.phoneNumber);
        const reply =
          `⚙️ *Your Settings*\n\n` +
          `📖 *Translation:* ${prefs.translation}\n` +
          `🌅 *Daily verse:* ${prefs.optedInDailyVerse ? `${prefs.dailyVerseTime} ✅` : "Paused ⏸️"}\n` +
          `🧠 *Memory verse:* ${mv ? `_${mv.reference}_ (tested ${mv.testCount}×)` : "None set"}\n` +
          `🔥 *Streak:* ${streak.streak} day${streak.streak !== 1 ? "s" : ""}\n\n` +
          `_Type *set NIV/KJV/ESV/NLT/NKJV* to change translation._\n` +
          `_Type *send at 8am* to change daily verse time._`;
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }
    }

    // ── Prayer wall ───────────────────────────────────────────────────────────
    if (false) {
      const pwText = msg.messageText.trim();
      const viewWall  = /\b(prayer wall|community prayer|see prayers|prayer requests)\b/i.test(pwText);
      const addToWall = /\b(add to prayer wall|prayer request|submit prayer)\s*[:\-]?\s*(.+)/is.exec(pwText);
      const iPrayed   = /\b(i prayed|prayed for them|said a prayer)\b/i.test(pwText);

      if (addToWall) {
        const request = addToWall[2]?.trim() ?? pwText.replace(/add to prayer wall/i, "").trim();
        const anonymous = /\b(anonymous|anonymously|don't use my name|no name)\b/i.test(pwText);
        const req = addPrayerRequest(msg.tenantId, msg.phoneNumber, msg.contactName, request, anonymous);
        const reply =
          `🙏 *Prayer request added to the Prayer Wall!*\n\n` +
          `_"${request.slice(0, 100)}${request.length > 100 ? "..." : ""}"_\n\n` +
          `Your request will be visible to the community for 7 days. We are praying with you! 💙`;
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (viewWall) {
        const wall = getPrayerWall(msg.tenantId);
        const reply = formatPrayerWall(wall);
        await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }

      if (iPrayed) {
        const wall = getPrayerWall(msg.tenantId);
        if (wall.length > 0) {
          // Increment the most recent request they haven't added themselves
          const req = wall.filter(r => r.phoneNumber !== msg.phoneNumber).at(-1);
          if (req) {
            incrementPrayerCount(msg.tenantId, req.id);
            const reply = `🙏 *Amen!* Thank you for praying. That means so much to someone today. God bless you! 💙`;
            await sendMessage(msg.tenantId, msg.phoneNumber, reply, false, msg.chatId);
            await saveConversation(msg.tenantId, { ...msg, response: reply, source: "ai", responseTimeMs: Date.now() - startTime });
            await incrementMessageUsage(msg.tenantId);
            return;
          }
        }
      }
    }

    // ── Help / command list ───────────────────────────────────────────────────
    if (false && /^(help|commands|what can you do|features|all features)[\s!?]*$/i.test(msg.messageText.trim())) {
      const helpMsg =
        `📋 *All Features*\n\n` +
        `*📖 Bible Study*\n` +
        `• Type _Hi_ → main menu (6 options)\n` +
        `• _Verse of the day_ or reply *5* — daily verse\n` +
        `• _Motivational word_ or reply *6* — motivational speech\n` +
        `• _Summarise [book]_ — book summary\n` +
        `• _Sermon prep on [topic]_ — sermon outline\n` +
        `• _Reading plan [topic]_ — 7-day plan\n\n` +
        `*🧠 Learning*\n` +
        `• _Memorise [verse ref]_ — track a verse\n` +
        `• _Test me_ — memory verse quiz\n` +
        `• _Quiz time_ — 10-question quiz\n\n` +
        `*🙏 Prayer & Community*\n` +
        `• _Prayer wall_ — see community requests\n` +
        `• _Add to prayer wall: [request]_ — share yours\n` +
        `• _I prayed_ — encourage someone\n\n` +
        `*⏳ Fasting*\n` +
        `• _Start fast for [reason]_ — start fasting companion\n` +
        `• _Fast check_ — check your progress\n\n` +
        `*⚙️ Settings*\n` +
        `• _My settings_ — view your profile & streak\n` +
        `• _Set NIV/KJV/ESV/NLT/NKJV_ — change translation\n` +
        `• _Send at 8am_ — change daily verse time\n`;
      await sendMessage(msg.tenantId, msg.phoneNumber, helpMsg, false, msg.chatId);
      await saveConversation(msg.tenantId, { ...msg, response: helpMsg, source: "ai", responseTimeMs: Date.now() - startTime });
      await incrementMessageUsage(msg.tenantId);
      return;
    }

    // ── Verse of the day on demand ─────────────────────────────────────────────
    if (false) {
      const isVerseOfDayRequest = /\b(verse of the day|daily verse|today.?s verse|devotional|give me a verse|random verse)\b/i.test(msg.messageText);
      if (isVerseOfDayRequest) {
        const ack = "🌅 *Here is your verse for today...*";
        await sendMessage(msg.tenantId, msg.phoneNumber, ack, false, msg.chatId);
        if (msg.chatId) sendTypingIndicator(msg.tenantId, msg.chatId).catch(() => {});

        (async () => {
          try {
            const verse = await generateVerseOfDay(apiUrl, apiKey, aiModel);
            await sendMessage(msg.tenantId, msg.phoneNumber, verse, false, msg.chatId);
            // Prayer topics
            const prayer = await generatePrayerTopics(verse, apiUrl, apiKey, aiModel);
            await sendMessage(msg.tenantId, msg.phoneNumber, prayer, false, msg.chatId);
            // Store verse and invite user to take quiz when ready
            setPendingQuizVerse(msg.tenantId, msg.phoneNumber, verse);
            await new Promise(r => setTimeout(r, 1500));
            await sendMessage(msg.tenantId, msg.phoneNumber, `🧠 *Ready to test your knowledge?*\n\nType *Quiz time* whenever you're ready to take a 10-question quiz on this verse!`, false, msg.chatId);
          } catch (err: any) {
            console.warn(`⚠️  [${label}] Verse of day failed:`, err.message);
          }
        })();

        await saveConversation(msg.tenantId, { ...msg, response: ack, source: "ai", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        return;
      }
    }

    // ── Opt-out / opt-in handling ──────────────────────────────────────────
    const normalizedText = msg.messageText.trim().toUpperCase();
    const isOptOut = /^(STOP|UNSUBSCRIBE|OPT[\s-]?OUT|CANCEL|QUIT|END)$/.test(normalizedText);
    const isOptIn  = /^(START|SUBSCRIBE|OPT[\s-]?IN|YES|HELLO|HI)$/.test(normalizedText);

    if (isOptOut) {
      // Mark customer as opted out
      await db.insert(customers).values({ tenantId: msg.tenantId, phoneNumber: msg.phoneNumber, name: null, optedOut: true })
        .onDuplicateKeyUpdate({ set: { optedOut: true, updatedAt: new Date() } });
      await sendMessage(msg.tenantId, msg.phoneNumber,
        "You have been unsubscribed and will no longer receive messages from us. Reply START at any time to re-subscribe.",
        false, msg.chatId);
      console.log(`🚫 Opt-out received from ${msg.phoneNumber} (tenant ${msg.tenantId})`);
      return;
    }

    // Check existing opt-out status
    const [existingCustomer] = await db.select({ optedOut: customers.optedOut })
      .from(customers)
      .where(and(eq(customers.tenantId, msg.tenantId), eq(customers.phoneNumber, msg.phoneNumber)))
      .limit(1);

    if (existingCustomer?.optedOut) {
      if (isOptIn) {
        // Re-subscribe
        await db.update(customers).set({ optedOut: false, updatedAt: new Date() })
          .where(and(eq(customers.tenantId, msg.tenantId), eq(customers.phoneNumber, msg.phoneNumber)));
        await sendMessage(msg.tenantId, msg.phoneNumber,
          "Welcome back! You have been re-subscribed. How can we help you today?",
          false, msg.chatId);
        console.log(`✅ Opt-in received from ${msg.phoneNumber} (tenant ${msg.tenantId})`);
      } else {
        console.log(`⏭️  Skipping opted-out customer ${msg.phoneNumber} (tenant ${msg.tenantId})`);
      }
      return;
    }

    // ── Satisfaction rating capture (1-5 reply after follow-up survey) ──────
    const ratingMatch = /^([1-5])$/.test(msg.messageText.trim());
    if (ratingMatch) {
      const rating = parseInt(msg.messageText.trim(), 10);
      // Find this customer
      const [cust] = await db.select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.tenantId, msg.tenantId), eq(customers.phoneNumber, msg.phoneNumber)))
        .limit(1);

      if (cust) {
        // Find their most recent appointment with survey sent (confirmationSent=true) but no score yet
        const [appt] = await db
          .select({ id: appointments.id, satisfactionScore: appointments.satisfactionScore })
          .from(appointments)
          .where(and(
            eq(appointments.customerId, cust.id),
            eq(appointments.confirmationSent, true),
            sql`${appointments.satisfactionScore} IS NULL`,
            sql`${appointments.status} IN ('completed', 'scheduled')`
          ))
          .orderBy(sql`${appointments.updatedAt} DESC`)
          .limit(1);

        if (appt) {
          await db.update(appointments)
            .set({ satisfactionScore: rating, updatedAt: new Date() })
            .where(eq(appointments.id, appt.id));

          const stars = "⭐".repeat(rating);
          const thankMsg = rating >= 4
            ? `${stars} Thank you for the amazing feedback! We're thrilled you had a great experience. See you next time! 😊`
            : rating === 3
            ? `${stars} Thank you for your feedback! We'll use it to keep improving our service. 🙏`
            : `${stars} Thank you for letting us know. We're sorry your experience wasn't perfect — we'll do better next time. 🙏`;

          await sendMessage(msg.tenantId, msg.phoneNumber, thankMsg, false, msg.chatId);
          await saveConversation(msg.tenantId, { ...msg, response: thankMsg, source: "ai", responseTimeMs: Date.now() - startTime });
          await incrementMessageUsage(msg.tenantId);
          console.log(`⭐ [${label}] Satisfaction score ${rating}/5 captured for appt #${appt.id}`);
          return;
        }
      }
    }

    // ── Service menu trigger ───────────────────────────────────────────────
    if (config.enableServiceMenu) {
      const trigger = (config.serviceMenuTrigger ?? "MENU").trim().toUpperCase();
      if (msg.messageText.trim().toUpperCase() === trigger) {
        const activeServices = await db.select().from(services)
          .where(eq(services.isActive, true))
          .orderBy(services.name);

        let menuText: string;
        if (activeServices.length === 0) {
          menuText = `Hi! Here are our services:\n\nPlease contact us for more details.`;
        } else {
          const lines = activeServices.map(s => {
            const price = parseFloat(s.price) > 0 ? ` — $${parseFloat(s.price).toFixed(2)}` : "";
            const duration = s.duration ? ` (${s.duration} min)` : "";
            return `• *${s.name}*${price}${duration}${s.description ? `\n  ${s.description}` : ""}`;
          });
          menuText = `Hi! Here are our services:\n\n${lines.join("\n\n")}\n\nReply with the service name to book an appointment, or ask us anything!`;
        }

        await sendMessage(msg.tenantId, msg.phoneNumber, menuText, false, msg.chatId);
        await saveConversation(msg.tenantId, { ...msg, response: menuText, source: "template", responseTimeMs: Date.now() - startTime });
        await incrementMessageUsage(msg.tenantId);
        console.log(`📋 [${label}] Service menu sent to ${msg.phoneNumber}`);
        return;
      }
    }

    // Business hours check (only when the feature is enabled)
    const isOpen = !config.enableBusinessHours || isBusinessOpen(config);
    console.log(`🕐 Business hours check: enabled=${config.enableBusinessHours}, isOpen=${isOpen}`);

    if (!isOpen) {
      const response = config.afterHoursMessage
        .replace("{businessName}", config.businessName)
        .replace("{hours}", `${config.businessHoursStart}-${config.businessHoursEnd}`);

      await sendMessage(msg.tenantId, msg.phoneNumber, response, false, msg.chatId);
      await saveConversation(msg.tenantId, { ...msg, response, source: "after_hours", responseTimeMs: Date.now() - startTime });
      await incrementMessageUsage(msg.tenantId);
      return;
    }

    // Template matching
    const templateMatch = await matchTemplate(msg.tenantId, msg.messageText);
    if (templateMatch) {
      await sendMessage(msg.tenantId, msg.phoneNumber, templateMatch.response, false, msg.chatId);
      await db.update(templates).set({ matchCount: sql`${templates.matchCount} + 1` }).where(eq(templates.id, templateMatch.id));
      await saveConversation(msg.tenantId, { ...msg, response: templateMatch.response, source: "template", templateId: templateMatch.id, responseTimeMs: Date.now() - startTime });
      await incrementMessageUsage(msg.tenantId);
      return;
    }

    // Appointment booking flow — handles multi-turn booking conversations.
    // Pass null for customerName so the bot never assumes the customer's name from
    // WhatsApp metadata — the customer must introduce themselves first.
    const bookingResult = await handleBookingFlow(
      msg.tenantId,
      msg.phoneNumber,
      null,
      msg.messageText
    );
    if (bookingResult.handled) {
      await sendMessage(msg.tenantId, msg.phoneNumber, bookingResult.response, false, msg.chatId);
      await saveConversation(msg.tenantId, {
        ...msg,
        response: bookingResult.response,
        source: "ai",
        responseTimeMs: Date.now() - startTime,
      });
      await incrementMessageUsage(msg.tenantId);

      // If a booking was just confirmed, push a real-time update to the dashboard
      // so the appointments page refreshes automatically without a manual reload.
      if (bookingResult.appointmentId) {
        io.to("dashboard").emit("appointment:new", {
          appointmentId: bookingResult.appointmentId,
          tenantId: msg.tenantId,
          contactName: msg.contactName,
          phoneNumber: msg.phoneNumber,
        });
        console.log(`📅 [${label}] Appointment #${bookingResult.appointmentId} created via WhatsApp — dashboard notified`);

        // Send booking notification email to business owner (non-blocking)
        if (bookingResult.bookingDetails) {
          const { serviceName, date, time } = bookingResult.bookingDetails;
          alertNewBooking(
            config.businessName,
            msg.tenantId,
            msg.contactName ?? msg.phoneNumber,
            msg.phoneNumber,
            serviceName,
            date,
            time,
            bookingResult.appointmentId
          ).catch(err => console.error("⚠️  Booking alert email failed:", err));
        }
      }

      return;
    }

    // Escalation rules
    const shouldEscalate = await checkEscalationRules(msg.tenantId, msg.messageText);
    if (shouldEscalate) {
      const response = "Your request has been escalated to our team. An agent will contact you shortly.";
      await sendMessage(msg.tenantId, msg.phoneNumber, response, false, msg.chatId);
      await saveConversation(msg.tenantId, { ...msg, response, source: "agent", isEscalated: true, responseTimeMs: Date.now() - startTime });
      await incrementMessageUsage(msg.tenantId);
      // Fire escalation email alert (non-blocking — don't let email failure stop the pipeline)
      alertNewEscalation(
        config.businessName,
        msg.tenantId,
        msg.contactName ?? msg.phoneNumber,
        msg.messageText
      ).catch(err => console.error("⚠️  Escalation alert failed:", err));
      return;
    }

    // Plan limit check — if tenant has hit their monthly message cap, block AI responses
    const limitReached = await isMessageLimitReached(msg.tenantId);
    if (limitReached) {
      console.warn(`⚠️  [${label}] Monthly message limit reached — dropping AI response`);
      const limitMsg =
        "Thanks for your message. We've reached our automated reply limit for this month. A team member will assist you as soon as possible.";
      try {
        await sendMessage(msg.tenantId, msg.phoneNumber, limitMsg, false, msg.chatId);
      } catch (e) {
        console.error(`⚠️  Could not send limit notice to ${msg.phoneNumber}:`, e);
      }
      await saveConversation(msg.tenantId, {
        ...msg,
        response: limitMsg,
        source: "agent",
        responseTimeMs: Date.now() - startTime,
      });
      return;
    }

    // Show typing indicator while AI is thinking
    if (msg.chatId) sendTypingIndicator(msg.tenantId, msg.chatId).catch(() => {});

    // AI fallback (Groq primary → Ollama fallback)
    const aiResult = await generateAIResponse(msg, config, isPersonalMessage, activeSessionMode, activeSessionTopic);
    if (aiResult) {
      // Send as voice only when: customer sent a voice message AND voice response is enabled
      const replyAsVoice = !!msg.isVoice && config.enableVoiceResponse;
      await sendMessage(msg.tenantId, msg.phoneNumber, aiResult.response, replyAsVoice, msg.chatId);
      await saveConversation(msg.tenantId, {
        ...msg,
        response: aiResult.response,
        source: "ai",
        language: aiResult.language,
        sentiment: aiResult.sentiment,
        responseTimeMs: aiResult.responseTime,
        modelUsed: aiResult.modelUsed,
        usedFallback: aiResult.usedFallback,
      });
      await incrementMessageUsage(msg.tenantId);

      // A *real* verse is only present when the AI used the full ✨━━ banner format.
      const hasFormattedVerse = aiResult.response.includes("✨━━");

      // Auto prayer-topics + quiz only fires for:
      //   • Option 4 (study mode) — the user explicitly asked for Bible verse & encouragement
      //   • No session at all — legacy / direct Bible-study conversations outside the menu
      // For sessions in chat / advice / prayer mode the verse offer comes at the
      // END of the conversation (after 3 exchanges), not mid-conversation.
      const shouldAutoFireVerseFlow = !activeSessionMode || activeSessionMode === "study";

      // Post-response follow-up — personal prayer OR prayer topics + quiz invite
      // Auto-fire conversational prayer ONLY when:
      //   • isPersonalMessage is true (emotional keywords detected), AND
      //   • there is NO active session — i.e. the user sent a raw emotional message
      //     without going through the menu.
      // For active sessions (encouragement / prayer / chat modes) the prayer is
      // delivered at the END via the verse-consent offer after 3+ exchanges.
      if (isPersonalMessage && !activeSessionMode) {
        // Direct heart-to-heart: send a personalised prayer based on what was shared
        (async () => {
          try {
            const prayer = await generateConversationalPrayer(
              msg.messageText,
              aiResult.response,
              apiUrl, apiKey, aiModel,
            );
            if (prayer) {
              await sendMessage(msg.tenantId, msg.phoneNumber, prayer, false, msg.chatId);
              console.log(`🙏 [${label}] ✅ Personal prayer sent to ${msg.phoneNumber}`);
            }
          } catch (err: any) {
            console.warn(`⚠️  [${label}] Personal prayer failed: ${err.message}`);
            await sendMessage(msg.tenantId, msg.phoneNumber,
              `⚠️ I'm having a moment of difficulty connecting. Please try again shortly. 🙏`,
              false, msg.chatId).catch(() => {});
          }
        })();
      } else if (hasFormattedVerse && shouldAutoFireVerseFlow) {
        // Regular Bible verse response — prayer topics + quiz invite (non-blocking)
        (async () => {
          try {
            // 1. Prayer topics + prayer
            const prayer = await generatePrayerTopics(aiResult.response, apiUrl, apiKey, aiModel);
            await sendMessage(msg.tenantId, msg.phoneNumber, prayer, false, msg.chatId);
            console.log(`🙏 [${label}] ✅ Prayer topics sent to ${msg.phoneNumber}`);

            // 2. Store this verse as the pending quiz verse and invite the user
            if (false) {
              setPendingQuizVerse(msg.tenantId, msg.phoneNumber, aiResult.response);
              await new Promise(r => setTimeout(r, 1500));
              await sendMessage(msg.tenantId, msg.phoneNumber, `🧠 *Ready to test your knowledge?*\n\nType *Quiz time* whenever you're ready to take a 10-question quiz on this verse!`, false, msg.chatId);
            }
          } catch (err: any) {
            console.warn(`⚠️  [${label}] Prayer/quiz failed: ${err.message}`);
            await sendMessage(msg.tenantId, msg.phoneNumber,
              `⚠️ I couldn't generate prayer topics right now. Please try again in a moment. 🙏`,
              false, msg.chatId).catch(() => {});
          }
        })();
      }

      // ── Bible Session: increment message count + offer closing verse ──────
      // After 3 exchanges in a session, ask once if the user wants a closing verse.
      // Skip if: no session, already asked, the response already had a formatted verse.
      if (false && !hasFormattedVerse && !isPersonalMessage) {
        const updatedSession = incrementSessionMessages(msg.tenantId, msg.phoneNumber);
        if (updatedSession && updatedSession.messageCount >= 3 && !updatedSession.askedForVerse) {
          // Mark as asked so we only offer once
          setBibleSession(msg.tenantId, msg.phoneNumber, { ...updatedSession, askedForVerse: true, waitingForVerseConsent: true });
          await new Promise(r => setTimeout(r, 2000));
          const verseOffer =
            `💬 _We've had a wonderful conversation!_\n\n` +
            `Before we wrap up — would you like me to share a *Bible verse* that speaks directly to what we've been discussing?\n\n` +
            `Reply *Yes* for a verse + prayer topics, or *No* to end here. 🙏`;
          await sendMessage(msg.tenantId, msg.phoneNumber, verseOffer, false, msg.chatId);
          console.log(`📖 [${label}] Session verse offer sent to ${msg.phoneNumber}`);
        }
      }

      // ── Streak update (Bible bot only) ───────────────────────────────────────
      if (false) {
        const streakInfo = updateStreak(msg.tenantId, msg.phoneNumber);
        if (streakInfo.isNewDay && streakInfo.milestone) {
          const milestoneMsg = streakMilestoneMessage(streakInfo.streak);
          if (milestoneMsg) {
            await new Promise(r => setTimeout(r, 1500));
            await sendMessage(msg.tenantId, msg.phoneNumber, milestoneMsg, false, msg.chatId);
            console.log(`🔥 [${label}] Streak milestone ${streakInfo.streak} sent to ${msg.phoneNumber}`);
          }
        }
      }
    }

  } catch (error) {
    console.error("❌ Pipeline error:", error);
  }
}

// ── Usage tracking helpers ────────────────────────────────────────────────────

// Track which tenants have received a usage alert this billing cycle
const _usageAlertSent = new Set<number>();

/** Increment the tenant's monthly message counter by 1; fire 80% alert if needed */
async function incrementMessageUsage(tenantId: number): Promise<void> {
  try {
    await db.update(users)
      .set({ messagesUsedThisMonth: sql`${users.messagesUsedThisMonth} + 1` })
      .where(eq(users.id, tenantId));

    // Usage alert — only once per billing cycle per tenant
    if (!_usageAlertSent.has(tenantId)) {
      const [tenant] = await db
        .select({ used: users.messagesUsedThisMonth, limit: users.messageLimit, email: users.email, name: users.name })
        .from(users).where(eq(users.id, tenantId)).limit(1);
      if (tenant && tenant.limit > 0) {
        const pct = ((tenant.used + 1) / tenant.limit) * 100;
        if (pct >= 80 && pct < 100) {
          _usageAlertSent.add(tenantId);
          const remaining = tenant.limit - (tenant.used + 1);
          console.warn(`⚠️  [Tenant ${tenantId}] Usage alert: ${Math.round(pct)}% (${remaining} remaining)`);
          // WhatsApp alert to business owner (fire-and-forget)
          const [cfg] = await db.select({ businessName: botConfig.businessName })
            .from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);
          const alertMsg = `⚠️ *Usage Alert — ${cfg?.businessName ?? "WAFlow"}*\n\nYou have used *${Math.round(pct)}%* of your monthly message allowance (${tenant.used + 1} / ${tenant.limit}).\n\n*${remaining} messages remaining* this billing cycle. Please upgrade your plan to avoid interruptions.`;
          sendViaWhatsAppWeb(tenantId, tenant.email, alertMsg).catch(() => {}); // best-effort
          // Email alert
          const emailAlertConfig = await db.select({ smtpHost: botConfig.smtpHost, smtpPort: botConfig.smtpPort, smtpUser: botConfig.smtpUser, smtpPass: botConfig.smtpPass })
            .from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);
          const ec = emailAlertConfig[0];
          if (ec?.smtpHost && ec.smtpUser && ec.smtpPass && tenant.email) {
            const nodemailer = await import("nodemailer");
            const transporter = nodemailer.createTransport({ host: ec.smtpHost, port: ec.smtpPort, secure: ec.smtpPort === 465, auth: { user: ec.smtpUser, pass: ec.smtpPass } });
            transporter.sendMail({
              from: ec.smtpUser,
              to: tenant.email,
              subject: `⚠️ WAFlow: ${Math.round(pct)}% of message limit used`,
              text: `Hi ${tenant.name},\n\nYou have used ${Math.round(pct)}% of your monthly message allowance (${tenant.used + 1}/${tenant.limit} messages).\n\nPlease upgrade your plan to avoid interruptions.\n\n— WAFlow`,
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error("⚠️  Failed to increment message usage:", err);
  }
}

/** Returns true if the tenant has reached their plan message limit */
async function isMessageLimitReached(tenantId: number): Promise<boolean> {
  try {
    const [tenant] = await db
      .select({ used: users.messagesUsedThisMonth, limit: users.messageLimit })
      .from(users)
      .where(eq(users.id, tenantId))
      .limit(1);
    if (!tenant) return false;
    // 0 or negative limit = unlimited (enterprise)
    if (tenant.limit <= 0) return false;
    return tenant.used >= tenant.limit;
  } catch {
    return false; // fail open — never block messages due to a DB error
  }
}

function isBusinessOpen(config: typeof botConfig.$inferSelect): boolean {
  try {
    const now = new Date();
    const zonedNow = toZonedTime(now, config.timezone);
    const dayOfWeek = getDay(zonedNow).toString();
    const businessDays = config.businessDays.split(",");
    if (!businessDays.includes(dayOfWeek)) return false;
    const currentTime = tzFormat(zonedNow, "HH:mm", { timeZone: config.timezone });
    return currentTime >= config.businessHoursStart && currentTime < config.businessHoursEnd;
  } catch {
    return true;
  }
}

async function matchTemplate(tenantId: number, message: string): Promise<{ id: number; response: string } | null> {
  const allTemplates = await db.select().from(templates)
    .where(and(eq(templates.tenantId, tenantId), eq(templates.isActive, true)))
    .orderBy(sql`${templates.priority} DESC`);

  const lower = message.toLowerCase();
  for (const t of allTemplates) {
    const kws = t.keywords as string[];
    if (kws.some(k => lower.includes(k.toLowerCase()))) {
      return { id: t.id, response: t.response };
    }
  }
  return null;
}

async function checkEscalationRules(tenantId: number, message: string): Promise<boolean> {
  const rules = await db.select().from(escalationRules)
    .where(and(eq(escalationRules.tenantId, tenantId), eq(escalationRules.isActive, true)));
  const lower = message.toLowerCase();
  for (const rule of rules) {
    const kws = rule.triggerKeywords as string[];
    if (kws.some(k => lower.includes(k.toLowerCase()))) return true;
  }
  return false;
}

async function generateAIResponse(
  msg: WebhookMessage,
  config: typeof botConfig.$inferSelect,
  isPersonalMessage = false,
  sessionMode?: BibleSessionMode,
  sessionTopic = "",
): Promise<{ response: string; language: string; sentiment: string; modelUsed: "groq" | "ollama" | "claude"; usedFallback: boolean; responseTime: number } | null> {
  try {
    const apiUrl = config.aiApiUrl || process.env.AI_API_URL || "http://localhost:11434/v1";
    const apiKey = decrypt(config.aiApiKey || "") || process.env.AI_API_KEY || "ollama";
    const model = config.aiModel || process.env.AI_MODEL || "gemma4:latest";

    // Fallback AI configuration
    const fallbackAiEnabled = config.fallbackAiEnabled ?? true;
    const fallbackApiUrl = (config.fallbackAiUrl || process.env.FALLBACK_AI_URL || "http://localhost:11434/v1").trim();
    const fallbackApiKey = decrypt(config.fallbackAiKey || "") || process.env.FALLBACK_AI_KEY || "ollama";
    const fallbackModel = (config.fallbackAiModel || process.env.FALLBACK_AI_MODEL || "mistral").trim();

    // Load recent conversation history — capped at 12 to give good context without blowing token budget.
    // The customer memory profile already summarises older conversations, so 12 is sufficient.
    const history = await db.select().from(conversations)
      .where(and(eq(conversations.tenantId, msg.tenantId), eq(conversations.phoneNumber, msg.phoneNumber)))
      .orderBy(desc(conversations.createdAt))
      .limit(12);

    // Load persistent customer memory (what the AI has learned about this person)
    const customerMemory = await getCustomerContext(msg.tenantId, msg.phoneNumber);

    // Get relevant knowledge base context with confidence signal
    const kbResult  = await getRelevantContext(msg.messageText, msg.tenantId, 3, 800, true);
    const kbContext = kbResult.context;

    // Detect language
    const language = config.enableMultiLanguage
      ? await detectLanguage(msg.messageText)
      : config.language;

    const detectedLangName = langName(language);
    const voiceNote = msg.isVoice ? " The customer sent a voice message (transcribed above). " : "";

    // Trim customer memory to 400 chars max to protect token budget
    const trimmedMemory = customerMemory.length > 400
      ? customerMemory.slice(0, 400) + "…"
      : customerMemory;

    // ── Fetch customer appointments for context (for cancellation, rescheduling, etc.) ──
    const appointmentKeywords = ["cancel", "reschedule", "modify", "change", "move", "appointment", "booking", "schedule"];
    const messageHasAppointmentKeyword = appointmentKeywords.some(kw =>
      msg.messageText.toLowerCase().includes(kw)
    );

    let appointmentContext = "";
    if (messageHasAppointmentKeyword) {
      // Get customer ID from phone
      const [customer] = await db.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.tenantId, msg.tenantId), eq(customers.phoneNumber, msg.phoneNumber)))
        .limit(1);

      if (customer) {
        // Fetch upcoming appointments (next 30 days)
        const upcomingAppointments = await db.select({
          id: appointments.id,
          date: appointments.date,
          time: appointments.time,
          status: appointments.status,
          serviceName: services.name,
          staffName: staff.name,
        })
          .from(appointments)
          .innerJoin(services, eq(appointments.serviceId, services.id))
          .leftJoin(staff, eq(appointments.staffId, staff.id))
          .where(and(
            eq(appointments.customerId, customer.id),
            eq(appointments.status, "scheduled"),
          ))
          .orderBy(asc(appointments.date), asc(appointments.time))
          .limit(5);

        if (upcomingAppointments.length > 0) {
          appointmentContext = "\n\nCUSTOMER'S UPCOMING APPOINTMENTS:\n";
          for (const apt of upcomingAppointments) {
            appointmentContext += `- ${apt.date} at ${apt.time}: ${apt.serviceName}${apt.staffName ? ` with ${apt.staffName}` : ""}\n`;
          }
          appointmentContext += "The customer may reference these appointments when asking to cancel or reschedule. Use this information to provide accurate, personalized responses.\n";
        }
      }
    }

    // Build a knowledge-confidence instruction based on how well the KB matched
    const kbConfidenceInstruction =
      kbResult.confidence === "high"
        ? `\n\nKNOWLEDGE CONFIDENCE: HIGH — the knowledge base has direct information about this topic. Base your answer on it.`
        : kbResult.confidence === "low"
        ? `\n\nKNOWLEDGE CONFIDENCE: PARTIAL — the knowledge base has some related info but may not directly cover this exact question. Use what you have, and be honest if something is not confirmed.`
        : !kbResult.hasKB
        ? `\n\nKNOWLEDGE CONFIDENCE: NONE (empty KB) — no knowledge base has been set up yet. Answer from the system prompt and conversation history only. If you truly cannot answer, say so and offer to connect to a human.`
        : `\n\nKNOWLEDGE CONFIDENCE: LOW — the customer's question did not match any specific knowledge base articles. General business info was included as context. Follow these rules strictly:\n` +
          `  • Do NOT make up specific details (prices, times, names, policies) that are not in the context.\n` +
          `  • If you cannot find the answer in the context or conversation history, say: "I don't have that specific information right now — would you like me to connect you to a team member who can help?"\n` +
          `  • Do NOT guess. Honest uncertainty is better than a confident wrong answer.`;

    let baseSystemPrompt = config.systemPrompt.replace("{businessName}", config.businessName);

    // Enhance system prompt for BibleGuide bots with age group personalization
    if (isBibleGuideBusiness(config.businessName)) {
      const ageGroup = await getCustomerAgeGroup(msg.tenantId, msg.phoneNumber);
      baseSystemPrompt = getBibleGuideEnhancedPrompt(baseSystemPrompt, ageGroup);
    }

    const systemPrompt =
      `CRITICAL: This system prompt is the ONLY authoritative source of truth. Always follow these instructions exactly, even if previous messages in the conversation history say something different. If there is any conflict between this system prompt and something you said earlier in the conversation, this system prompt ALWAYS wins.\n\n` +
      baseSystemPrompt +
      trimmedMemory +            // ← persistent memory of this customer (trimmed)
      kbContext +                // ← relevant KB articles (trimmed)
      kbConfidenceInstruction +  // ← tells AI how confident to be about its KB answer
      appointmentContext +       // ← customer's upcoming appointments (if relevant)
      `\n\nCURRENCY: Always use South African Rand (R) for all prices and amounts. Never use $ (dollars), € (euros), or any other currency. Example: "R299 per month" not "$299".` +
      `\n\nCUSTOMER NAME: Never address the customer by name or assume their name unless they have explicitly told you their name during this conversation. Do not use names from any other source.` +
      `\n\nCLARIFICATION RULES — follow these every time the customer's message is unclear:\n` +
      `1. WHEN TO ASK FOR CLARIFICATION: If the customer's request could mean two or more different things, or if essential information is missing to give a helpful answer, ask ONE short clarifying question before attempting to answer. Do NOT guess.\n` +
      `   • Too vague: "I need help" → Ask: "Of course! What can I help you with today? Is it about [service A], [service B], or something else?"\n` +
      `   • Missing info: "When can I come in?" → Ask: "Happy to help! Are you looking to book a specific service, or do you just want to know our opening hours?"\n` +
      `   • Multiple meanings: "Can I change it?" → Ask: "Sure! Just to make sure I understand — are you looking to change your appointment date, or change the service you booked?"\n` +
      `2. NEVER ask more than ONE question at a time. Pick the single most important thing you need to know.\n` +
      `3. NEVER say "I don't understand" bluntly. Instead, acknowledge what they said, then ask for the one detail you need.\n` +
      `4. If the message is garbled, contains symbols, or looks like an accidental send — gently ask them to resend or rephrase.\n` +
      `5. GOOD PATTERN: "[Acknowledge] + [One precise question]". Example: "Happy to help with that! Could you let me know which service you're asking about?"\n` +
      `6. SHORT MESSAGES ARE NOT ALWAYS UNCLEAR: Single-word or short messages like "yes", "no", "book", "hello", "prices", "hours" are clear enough — do NOT ask for clarification on these.\n\n` +
      `LEARNING FROM CONVERSATION — use conversation history to give smarter replies:\n` +
      `1. Read ALL prior messages before replying. If the customer mentioned a preference, concern, name, or detail earlier — remember it now.\n` +
      `2. If the customer already answered something earlier, do NOT ask it again.\n` +
      `3. Build on what you know: "Based on what you mentioned about [X], I'd recommend..."\n` +
      `4. If the customer corrects you or says you misunderstood, apologise briefly and ask them to clarify what you got wrong. Do NOT repeat your previous answer.\n` +
      `\n\nBIBLE VERSE FORMATTING: The 📖 emoji and the ✨━━ banner are RESERVED for actual quoted Bible verses only. NEVER use 📖 as a decorative emoji in greetings, topic introductions, or any sentence that does not contain a quoted verse. Wrong: "Let's study! 📖" — Right: only inside the banner below.\n\n` +
      `Whenever you quote or reference a Bible verse, ALWAYS format it exactly like this:\n\n` +
      `✨━━━━━━━━━━━━━━━━━━━━✨\n` +
      `📖 *Book Chapter:Verse (NIV)*\n` +
      `*"Verse text goes here."*\n` +
      `✨━━━━━━━━━━━━━━━━━━━━✨\n\n` +
      `Use *bold* (asterisks) for the verse reference and the quoted verse text. The decorative banner (✨━━) must always wrap the verse. After the banner, continue with your full explanation.\n` +
      `If you reference additional related verses, use the same bold format: 📖 *Book Chapter:Verse* — *"verse text"* (NIV)` +
      `\n\nCONVERSATIONAL FLOW: If the user sends a general message like "Bible study", "let's study", a topic name, or anything that is NOT a specific request for a verse, do NOT immediately share a verse. Instead:\n` +
      `1. Engage them in conversation — ask what topic or passage they would like to explore, or what is on their heart.\n` +
      `2. Once the user specifies a topic/question/passage, ask: "Would you like me to share a Bible verse to support this?" (or a natural variation).\n` +
      `3. Only share the full verse + explanation + banner AFTER the user confirms or explicitly asks for a verse.\n` +
      `This keeps the interaction feeling like a real conversation rather than an automated lecture.` +
      `\n\n${voiceNote}Important: Always respond in ${detectedLangName}. Keep responses under 250 words. Be warm, engaging, and conversational.` +
      `\n\nCONTEXT AWARENESS: Read the FULL conversation history before responding. NEVER repeat anything you have already said. If you already explained a point, do not say it again — build on it or go deeper instead. If the customer's current message references something from earlier in the conversation ("that one you mentioned", "the same thing", "last time"), look back through the history to find what they mean before responding.` +
      `\n\nBIBLE TEACHER BEHAVIOUR: You are an interactive Bible teacher, not a one-way preacher. Follow these rules in every response:\n` +
      `- NEVER repeat an explanation you already gave in this conversation. Always go deeper or approach from a new angle.\n` +
      `- When the user says "explain more", "go deeper", "I don't understand", or similar — do NOT summarise what you already said. Instead: (1) pick ONE specific part of the verse or concept, (2) unpack it in a new way using a real-life story, modern example, or comparison, (3) end with a question that makes the user think and respond.\n` +
      `- Teach in layers: start simple, then progressively go deeper as the conversation continues. Each reply should reveal something NEW that was not in the previous reply.\n` +
      `- Use relatable real-life examples (work stress, family, relationships, daily struggles) to connect the verse to the user's life.\n` +
      `- Ask ONE engaging question at the end of every reply to keep the conversation going and help the user reflect. Examples: "Can you think of a time in your own life when this felt true?", "What part of this verse do you find hardest to apply?", "Does this connect to anything you are going through right now?"\n` +
      `- If the user shares something personal in response, acknowledge it warmly before continuing the teaching.\n` +
      `- Vary your teaching style: sometimes use a short story, sometimes a comparison ("it is like..."), sometimes a question-first approach, sometimes walk through the verse word by word.\n` +
      (isPersonalMessage
        ? `\n\n🤍 HEART-TO-HEART MODE — The person has shared something personal. Your job right now is to be a caring, listening friend — NOT to immediately give advice or quote verses. Follow these rules STRICTLY:\n` +
          `1. FIRST: Acknowledge what they said and validate their feelings with genuine empathy. Show that you heard them and that what they feel makes sense.\n` +
          `2. SECOND: Ask ONE thoughtful follow-up question to understand their situation more deeply before offering anything. Examples: "How long have you been feeling this way?", "What has this been like for you?", "Tell me more — what started this?"\n` +
          `3. ONLY after 2-3 exchanges of listening and understanding: gently bring in a Biblical perspective or encouragement.\n` +
          `4. If you do share a Bible reference, weave it naturally into the conversation in plain language (e.g. "The Bible reminds us in Psalm 46 that God is our refuge..."). Do NOT use the ✨━━ verse banner mid-conversation.\n` +
          `5. NEVER give a list of advice points or bullet points. Keep it warm, like a real conversation between two people.\n` +
          `6. Keep each response SHORT — 3-5 sentences maximum. This is a dialogue, not a lecture.\n` +
          `7. Do NOT write a prayer in your response — a personalised prayer will be offered to them at the end of the conversation.\n`
        : "") +
      (sessionMode === "study"
        ? `\n\n📖 SESSION MODE: BIBLE VERSE & ENCOURAGEMENT — The user chose this mode to explore a Bible topic or verse. When they name a topic, share a relevant verse using the full ✨━━ banner format and explain it clearly. This is the ONLY mode where you should use the verse banner.\n`
        : "") +
      (sessionMode === "topic"
        ? `\n\n💬 SESSION MODE: CHAT — The user wants a friendly, natural conversation. Be warm and conversational, ask follow-up questions, keep replies short. Do NOT use the ✨━━ verse banner or quote Bible verses with the 📖 emoji. You may refer to biblical ideas in plain conversational language, but no banners, no verse quotes. A Bible verse will be offered to them at the END of our conversation.\n`
        : "") +
      (sessionMode === "prayer"
        ? `\n\n🙏 SESSION MODE: PRAYER — The user wants to share a prayer request and talk it through. Listen first, then pray with them in plain text (no verse banner). Do NOT use the ✨━━ verse banner. You may gently mention relevant biblical promises in plain language. A personalised prayer will be sent after your reply.\n`
        : "") +
      (sessionMode === "encouragement" && sessionTopic !== "motivational word and speech"
        ? `\n\n❤️ SESSION MODE: GET ADVICE — The user is looking for advice and encouragement. Your approach:\n` +
          `- Message 1: Acknowledge their situation warmly. Ask ONE follow-up question to understand better. Do NOT give advice yet.\n` +
          `- Message 2: Reflect back what you heard ("It sounds like..."). Ask another gentle question if needed, or begin to gently affirm and encourage.\n` +
          `- Message 3+: Offer practical, compassionate guidance rooted in Christian values. Reference scripture naturally in plain language — NO ✨━━ banner.\n` +
          `- Keep replies SHORT (3-5 sentences). This is a real two-way conversation. A Bible verse will be offered at the end.\n`
        : "") +
      (sessionMode === "encouragement" && sessionTopic === "motivational word and speech"
        ? `\n\n💪 SESSION MODE: MOTIVATIONAL WORD — The user wants to be energised and fired up through God's Word. Your approach:\n` +
          `- Deliver BOLD, passionate, Spirit-filled motivational messages rooted in scripture.\n` +
          `- Open each reply with a powerful statement of truth or affirmation (e.g. "You were created for MORE than this moment." / "God did not give you a spirit of fear — He gave you POWER!").\n` +
          `- Weave in relevant Bible promises naturally in plain language (e.g. "Philippians 4:13 reminds us..."). Do NOT use the ✨━━ verse banner.\n` +
          `- Be like a pastor/coach combination — warm, bold, and deeply encouraging.\n` +
          `- After your motivational message, ask ONE energising question to keep the momentum going (e.g. "What is one step you can take TODAY to move towards that goal?").\n` +
          `- Keep replies focused and punchy — 4-6 sentences. Energy is contagious. A Bible verse will be offered at the end.\n`
        : "") +
      `\n\nAPPOINTMENTS: You cannot book, reschedule, or cancel appointments yourself — the booking system handles that automatically when the customer uses the right trigger words. Your role is to understand the situation from the conversation history and the appointment details provided above, then respond helpfully:\n- If the customer is asking to make a NEW appointment → tell them to say "I want to book an appointment"\n- If the customer is asking about an EXISTING appointment → reference their specific appointment details from above and answer their question\n- If the customer wants to CANCEL an appointment → acknowledge the specific appointment they mentioned (e.g., "Your ${date} ${time} appointment for ${serviceName}") and tell them to say "I want to cancel my appointment"\n- If the customer wants to RESCHEDULE → acknowledge which appointment they're referring to and tell them to say "I want to reschedule my appointment"\n- When a customer says "that appointment" or "it" or "my booking" → use context from above to know exactly which one they mean\n- NEVER say "I've booked you in", "you're confirmed", or imply you made a booking yourself`;

    // ── Token-budget enforcement ──────────────────────────────────────────────
    // Gemma 4 supports 128K natively, but Ollama defaults to only 2048 num_ctx.
    // We request 4096 from Ollama and enforce a pre-send budget of 3200 tokens
    // (leaving ~900 tokens headroom for the response).
    //
    // If a conversation is very long, we progressively drop the oldest exchanges
    // until it fits — the persistent customer memory profile already summarises
    // older conversations so context quality stays high.
    const OLLAMA_NUM_CTX  = 8192;  // tokens to request from Ollama per call (Gemma 4 handles this fine)
    const TOKEN_BUDGET    = 6000;  // max input tokens to send (leaving ~2000 for the response)
    const AVG_MSG_TOKENS  = 120;   // conservative estimate per message pair

    // history is DESC (newest first). Build a mutable chronological working copy.
    const chronological = [...history].reverse();

    // Estimate total tokens for this request
    let approxTokens =
      Math.round(systemPrompt.length / 4) +
      chronological.length * AVG_MSG_TOKENS +
      Math.round(msg.messageText.length / 4);

    // Drop oldest exchanges one-by-one until we fit inside the budget
    let droppedCount = 0;
    while (approxTokens > TOKEN_BUDGET && chronological.length > 1) {
      chronological.shift();
      approxTokens -= AVG_MSG_TOKENS;
      droppedCount++;
    }
    if (droppedCount > 0) {
      console.warn(`⚠️  [Tenant ${msg.tenantId}] Token budget: dropped ${droppedCount} oldest message(s) to fit within ${TOKEN_BUDGET} tokens`);
    }

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const conv of chronological) {
      if (conv.message) messages.push({ role: "user", content: conv.message });
      if (conv.response) messages.push({ role: "assistant", content: conv.response });
    }
    messages.push({ role: "user", content: msg.messageText });

    // Base params — pass Ollama's num_ctx option when talking to a local Ollama instance.
    // Also clamp max_tokens so that input + output never overflows the context window.
    const isOllama = apiUrl.includes("11434") || apiUrl.toLowerCase().includes("ollama");
    const contextWindow = isOllama ? OLLAMA_NUM_CTX : 32_000; // safe default for cloud models
    const safeMaxTokens = Math.min(
      config.maxTokens ?? 1024,
      Math.max(256, contextWindow - approxTokens - 50), // always allow at least 256 response tokens
    );
    const createParams: Record<string, unknown> = {
      model,
      messages,
      temperature: parseFloat(config.aiTemperature?.toString() || "0.7"),
      max_tokens: safeMaxTokens,
      ...(isOllama ? { options: { num_ctx: OLLAMA_NUM_CTX } } : {}),
    };

    console.log(`🤖 Sending to ${model} @ ${apiUrl} | history=${chronological.length}${droppedCount > 0 ? ` (trimmed ${droppedCount})` : ""} | ~${approxTokens} tokens | memory=${trimmedMemory.length > 0 ? "✓" : "none"}`);

    // ── Determine which AI provider to use ─────────────────────────────────────
    const aiProvider = config.aiProvider || "groq";
    let response: string;
    let modelUsed: "groq" | "ollama" | "claude";
    let usedFallback = false;
    const startAiTime = Date.now();

    if (aiProvider === "claude") {
      // ── Call Claude API ──────────────────────────────────────────────────────
      const claudeApiKey = decrypt(config.claudeApiKey || "") || process.env.CLAUDE_API_KEY || "";
      const claudeModel = config.claudeModel || "claude-3-5-sonnet-20241022";

      if (!claudeApiKey) {
        console.error("❌ Claude API key not configured for this tenant");
        response = "I apologize, but Claude AI is not properly configured. Please contact the administrator.";
      } else {
        try {
          // Build system prompt (join systemPrompt with customer memory for context)
          const fullSystemPrompt = systemPrompt +
            (trimmedMemory.length > 0 ? `\n\n[Customer Context: ${trimmedMemory}]` : "");

          // Convert messages to string format for Claude (systemPrompt is already first message)
          const userMessage = msg.messageText;

          console.log(`🎯 Calling Claude (${claudeModel}) with ${messages.length} messages`);

          const claudeResponse = await callClaudeAPI({
            systemPrompt: fullSystemPrompt,
            userMessage,
            apiKey: claudeApiKey,
            model: claudeModel,
            maxTokens: safeMaxTokens,
            temperature: parseFloat(config.aiTemperature?.toString() || "0.7"),
          });

          response = claudeResponse || "I apologize, I couldn't process your message. Please try again.";
          modelUsed = "claude";
          console.log(`✅ Claude responded in ${Date.now() - startAiTime}ms`);
        } catch (claudeError: any) {
          console.error(`❌ Claude API call failed:`, claudeError.message);
          response = "I apologize, I couldn't process your message. Please try again.";
          modelUsed = "claude";
        }
      }
    } else {
      // ── Call Groq or Ollama with fallback ────────────────────────────────────
      const aiResult = await callAiWithFallback(
        messages,
        {
          model,
          apiUrl,
          apiKey,
        },
        {
          enabled: fallbackAiEnabled,
          model: fallbackModel,
          apiUrl: fallbackApiUrl,
          apiKey: fallbackApiKey,
        },
        {
          tenantId: msg.tenantId,
          primaryTimeout: 3000,
          fallbackTimeout: 8000,
          logFallback: true,
          maxTokens: safeMaxTokens,
          aiTemperature: config.aiTemperature?.toString(),
        }
      );

      response = aiResult.response
        || "I apologize, I couldn't process your message. Please try again.";

      // Track which model was used
      modelUsed = aiResult.model === "ollama" ? "ollama" : "groq";
      usedFallback = aiResult.usedFallback;
    }

    // Log fallback usage and update tracking
    if (usedFallback) {
      console.log(`📊 [Tenant ${msg.tenantId}] Fallback AI was used (${aiResult.responseTime}ms)`);
      // Update fallback usage stats
      await db.update(botConfig)
        .set({
          usedFallbackCount: (config.usedFallbackCount || 0) + 1,
          lastFallbackAt: new Date(),
        })
        .where(eq(botConfig.tenantId, msg.tenantId));

      // Emit Socket.IO alert to admin dashboard
      io.to(`tenant:${msg.tenantId}`).emit("system:fallbackUsed", {
        tenantId: msg.tenantId,
        model: aiResult.model,
        responseTime: aiResult.responseTime,
        timestamp: new Date(),
      });
    }

    const sentiment = config.enableSentimentAnalysis
      ? await analyzeSentiment(msg.messageText)
      : "neutral";

    console.log(`✅ AI responded: ${response.slice(0, 80)}...`);

    // Update customer memory in the background — non-blocking.
    // history is still DESC here (not mutated), so .slice(0,10) = 10 most recent,
    // then .reverse() puts them chronological for the extraction prompt.
    const recentPairs = history.slice(0, 10).reverse().map(c => ({
      message: c.message,
      response: c.response,
    }));
    recentPairs.push({ message: msg.messageText, response });

    updateCustomerMemory(msg.tenantId, msg.phoneNumber, apiUrl, apiKey, model, recentPairs);

    return {
      response,
      language,
      sentiment,
      modelUsed,
      usedFallback,
      responseTime: aiResult.responseTime,
    };
  } catch (error: any) {
    console.error("❌ AI error:", error.message);
    return {
      response: "I'm having difficulty responding right now. Please try again in a moment, or contact us directly.",
      language: "en",
      sentiment: "neutral",
      modelUsed: "groq" as const,
      usedFallback: false,
      responseTime: 0,
    };
  }
}

async function saveConversation(tenantId: number, data: {
  phoneNumber: string;
  contactName: string | null;
  messageText: string;
  response: string;
  source: "template" | "ai" | "agent" | "after_hours";
  templateId?: number;
  agentId?: number;
  language?: string;
  sentiment?: string;
  isEscalated?: boolean;
  responseTimeMs?: number;
  modelUsed?: "groq" | "ollama";
  usedFallback?: boolean;
}) {
  const [result] = await db.insert(conversations).values({
    tenantId,
    phoneNumber: data.phoneNumber,
    contactName: data.contactName,
    message: data.messageText,
    response: data.response,
    source: data.source,
    templateId: data.templateId,
    agentId: data.agentId,
    language: data.language,
    sentiment: data.sentiment as any,
    isEscalated: data.isEscalated || false,
    responseTimeMs: data.responseTimeMs,
    modelUsed: data.modelUsed || "groq",
    usedFallback: data.usedFallback || false,
  });

  // Upsert customer record — intentionally do NOT store the WhatsApp contact name
  // (that's the name saved in the business's phone contacts, not what the customer told us).
  // The customer's name is extracted by the AI memory system only after they introduce themselves.
  await db.insert(customers).values({
    tenantId,
    phoneNumber: data.phoneNumber,
    name: null,
    preferredLanguage: data.language,
  }).onDuplicateKeyUpdate({
    set: {
      // Preserve whatever name the AI memory may have already stored; update language only
      preferredLanguage: data.language ?? sql`preferred_language`,
      updatedAt: new Date(),
    },
  });

  // ── Auto-label contacts based on message keywords + sentiment ─────────────
  (async () => {
    try {
      const text = (data.messageText ?? "").toLowerCase();
      const newLabels: string[] = [];
      if (data.sentiment === "negative") newLabels.push("unhappy");
      if (data.sentiment === "positive") newLabels.push("happy");
      if (/\b(urgent|asap|emergency|immediately)\b/.test(text)) newLabels.push("urgent");
      if (/\b(complain|complaint|terrible|awful|bad service|unacceptable)\b/.test(text)) newLabels.push("complaint");
      if (/\b(book|appointment|schedule|reserve|slot)\b/.test(text)) newLabels.push("booking");
      if (/\b(price|cost|how much|fee|charge|quote)\b/.test(text)) newLabels.push("pricing");
      if (/\b(refer|told by|my friend|recommended)\b/.test(text)) newLabels.push("referral");
      if (/\b(cancel|cancellation|refund|money back)\b/.test(text)) newLabels.push("cancellation");
      if (newLabels.length === 0) return;

      const [cust] = await db.select({ tags: customers.tags })
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneNumber, data.phoneNumber)))
        .limit(1);

      const existingTags: string[] = (cust?.tags as string[]) ?? [];
      const merged = [...new Set([...existingTags, ...newLabels])].slice(0, 20);
      if (newLabels.some(l => !existingTags.includes(l))) {
        await db.update(customers)
          .set({ tags: merged, updatedAt: new Date() })
          .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneNumber, data.phoneNumber)));
      }
    } catch { /* non-fatal */ }
  })();

  // Real-time broadcast
  try {
    io.to("dashboard").emit("conversation:new", {
      id: getInsertId(result),
      tenantId,
      phoneNumber: data.phoneNumber,
      contactName: data.contactName,
      message: data.messageText,
      response: data.response,
      source: data.source,
      language: data.language,
      sentiment: data.sentiment,
      createdAt: new Date(),
    });
  } catch { /* socket may not be ready */ }
}

async function checkRateLimit(tenantId: number, phoneNumber: string): Promise<boolean> {
  const windowMs = 60 * 1000;
  const maxMessages = 10;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  const [existing] = await db.select().from(rateLimits)
    .where(and(eq(rateLimits.tenantId, tenantId), eq(rateLimits.phoneNumber, phoneNumber)))
    .limit(1);

  if (!existing) {
    await db.insert(rateLimits).values({ tenantId, phoneNumber, messageCount: 1, windowStart: now });
    return false;
  }

  if (existing.isBlocked && existing.blockedUntil && existing.blockedUntil > now) return true;

  if (existing.windowStart < windowStart) {
    await db.update(rateLimits).set({ messageCount: 1, windowStart: now, isBlocked: false, blockedUntil: null, updatedAt: now })
      .where(and(eq(rateLimits.tenantId, tenantId), eq(rateLimits.phoneNumber, phoneNumber)));
    return false;
  }

  const newCount = existing.messageCount + 1;
  if (newCount > maxMessages) {
    const blockedUntil = new Date(now.getTime() + 5 * 60 * 1000);
    await db.update(rateLimits).set({ messageCount: newCount, isBlocked: true, blockedUntil, updatedAt: now })
      .where(and(eq(rateLimits.tenantId, tenantId), eq(rateLimits.phoneNumber, phoneNumber)));
    await db.insert(spamLogs).values({ phoneNumber, message: "Rate limit exceeded", reason: `${newCount} messages/min`, messageCount: newCount, blockedUntil });
    return true;
  }

  await db.update(rateLimits).set({ messageCount: newCount, updatedAt: now })
    .where(and(eq(rateLimits.tenantId, tenantId), eq(rateLimits.phoneNumber, phoneNumber)));
  return false;
}

// ── IT Support Assistant handler ──────────────────────────────────────────────
/**
 * Handles all IT support bot interactions.
 * Returns true if the message was handled (pipeline should stop).
 * Returns false if the message should fall through to the general AI.
 */
async function handleITSupport(
  msg: WebhookMessage,
  config: typeof botConfig.$inferSelect,
  startTime: number,
): Promise<boolean> {
  const label   = config.businessName || `Tenant ${msg.tenantId}`;
  const apiUrl  = config.aiApiUrl  || process.env.AI_API_URL  || "https://api.groq.com/openai/v1";
  const apiKey  = decrypt(config.aiApiKey || "") || process.env.AI_API_KEY  || "";
  const aiModel = config.aiModel   || process.env.AI_MODEL    || "gemma4:latest";
  const userName = msg.contactName || msg.phoneNumber;
  const text     = msg.messageText.trim();

  const save = (response: string) =>
    saveConversation(msg.tenantId, { ...msg, response, source: "ai", responseTimeMs: Date.now() - startTime });

  const send = (text: string) =>
    sendMessage(msg.tenantId, msg.phoneNumber, text, false, msg.chatId);

  // ── Greeting → show main menu ────────────────────────────────────────────
  const isGreeting = /^(hi|hello|hey|start|menu|help|support|it|tech|issue|problem)[\s!.?]*$/i.test(text);
  const activeSession = getITSession(msg.tenantId, msg.phoneNumber);

  if (isGreeting && !activeSession) {
    const ticketId = generateTicketId();
    setITSession(msg.tenantId, msg.phoneNumber, {
      ticketId,
      tenantId: msg.tenantId,
      phoneNumber: msg.phoneNumber,
      userName,
      category: null,
      step: 0,
      answers: {},
      diagnosis: "",
      suggestedFix: "",
      priority: "low",
      waitingForResolution: false,
    });
    const menu = formatITMenu();
    await send(menu);
    await save(menu);
    await incrementMessageUsage(msg.tenantId);
    return true;
  }

  // ── No active session → show menu for any IT-related message ────────────
  if (!activeSession) {
    const ticketId = generateTicketId();
    setITSession(msg.tenantId, msg.phoneNumber, {
      ticketId,
      tenantId: msg.tenantId,
      phoneNumber: msg.phoneNumber,
      userName,
      category: null,
      step: 0,
      answers: {},
      diagnosis: "",
      suggestedFix: "",
      priority: "low",
      waitingForResolution: false,
    });
    const menu = formatITMenu();
    await send(menu);
    await save(menu);
    await incrementMessageUsage(msg.tenantId);
    return true;
  }

  // ── Waiting for resolution confirmation (Yes / No) ───────────────────────
  if (activeSession.waitingForResolution) {
    const isYes = /\b(yes|yeah|yep|fixed|resolved|working|sorted|done|it works|thank|great|perfect)\b/i.test(text);
    const isNo  = /\b(no|nope|still|not|doesn't|doesn't work|same|worse|issue|problem|help)\b/i.test(text);

    if (isYes) {
      updateTicketStatus(activeSession.ticketId, "resolved");
      clearITSession(msg.tenantId, msg.phoneNumber);
      const closing =
        `✅ *Issue Resolved!*\n\n` +
        `Great to hear! Your ticket *${activeSession.ticketId}* has been marked as resolved. 🎉\n\n` +
        `If you run into any other issues, just say *Hi* to start a new session. Have a productive day! 💪`;
      await send(closing);
      await save(closing);
      await incrementMessageUsage(msg.tenantId);
      console.log(`🔧 [${label}] ✅ IT ticket ${activeSession.ticketId} resolved by ${msg.phoneNumber}`);
      return true;
    }

    if (isNo) {
      // Escalate — save ticket, send admin alert, confirm to user
      const ticket = {
        ticketId:     activeSession.ticketId,
        tenantId:     activeSession.tenantId,
        phoneNumber:  activeSession.phoneNumber,
        userName:     activeSession.userName,
        category:     activeSession.category ?? "other",
        answers:      activeSession.answers,
        diagnosis:    activeSession.diagnosis,
        suggestedFix: activeSession.suggestedFix,
        priority:     activeSession.priority,
        status:       "escalated" as const,
        createdAt:    new Date().toISOString(),
        resolvedAt:   null,
      };
      saveTicket(ticket);

      // Send admin WhatsApp alert (IT_ADMIN_PHONE env var)
      const adminPhone = process.env.IT_ADMIN_PHONE?.trim();
      if (adminPhone) {
        const alertMsg = formatAdminAlert(ticket);
        sendViaWhatsAppWeb(msg.tenantId, adminPhone, alertMsg)
          .catch(err => console.warn(`⚠️  [${label}] IT admin alert failed:`, err.message));
      }

      clearITSession(msg.tenantId, msg.phoneNumber);
      const confirmation = formatEscalationConfirmation(activeSession.ticketId, activeSession.priority);
      await send(confirmation);
      await save(confirmation);
      await incrementMessageUsage(msg.tenantId);
      console.log(`🔧 [${label}] 🔴 IT ticket ${activeSession.ticketId} escalated — priority: ${activeSession.priority}`);
      return true;
    }

    // Unclear response — nudge
    await send(`Please reply *Yes* if the issue is resolved, or *No* if you still need help. 🙏`);
    await incrementMessageUsage(msg.tenantId);
    return true;
  }

  // ── Category selection (main menu options 1-5) ───────────────────────────
  if (activeSession.category === null) {
    const optionMap: Record<string, ITCategory | "escalate"> = {
      "1": "internet", "2": "device", "3": "login", "4": "other", "5": "escalate",
    };
    const pick = /^([1-5])$/.exec(text.trim())?.[1];

    if (pick) {
      const chosen = optionMap[pick];

      // Option 5 → immediate escalation
      if (chosen === "escalate") {
        const ticket = {
          ticketId:     activeSession.ticketId,
          tenantId:     activeSession.tenantId,
          phoneNumber:  activeSession.phoneNumber,
          userName:     activeSession.userName,
          category:     "other",
          answers:      { request: "User requested human agent directly" },
          diagnosis:    "User requested human escalation without troubleshooting.",
          suggestedFix: "N/A — user chose to speak with a human.",
          priority:     "medium" as const,
          status:       "escalated" as const,
          createdAt:    new Date().toISOString(),
          resolvedAt:   null,
        };
        saveTicket(ticket);
        const adminPhone = process.env.IT_ADMIN_PHONE?.trim();
        if (adminPhone) {
          sendViaWhatsAppWeb(msg.tenantId, adminPhone, formatAdminAlert(ticket))
            .catch(() => {});
        }
        clearITSession(msg.tenantId, msg.phoneNumber);
        const esc = formatEscalationConfirmation(activeSession.ticketId, "medium");
        await send(esc);
        await save(esc);
        await incrementMessageUsage(msg.tenantId);
        return true;
      }

      // Start the selected category flow — ask first question
      const category = chosen as ITCategory;
      const firstQuestion = IT_FLOWS[category][0].question;
      setITSession(msg.tenantId, msg.phoneNumber, {
        ...activeSession,
        category,
        step: 0,
      });
      await send(firstQuestion);
      await save(firstQuestion);
      await incrementMessageUsage(msg.tenantId);
      return true;
    }

    // Not a valid menu option — re-show menu
    await send(`Please reply with a number *1 to 5* to select your issue type.\n\n${formatITMenu()}`);
    await incrementMessageUsage(msg.tenantId);
    return true;
  }

  // ── Step-by-step Q&A collection ──────────────────────────────────────────
  const flow      = IT_FLOWS[activeSession.category];
  const currentStep = activeSession.step;
  const currentQ  = flow[currentStep];

  // Store the answer for this step
  const updatedAnswers = { ...activeSession.answers, [currentQ.key]: text };
  const nextStep = currentStep + 1;

  if (nextStep < flow.length) {
    // More questions remain — ask the next one
    setITSession(msg.tenantId, msg.phoneNumber, {
      ...activeSession,
      step: nextStep,
      answers: updatedAnswers,
    });
    await send(flow[nextStep].question);
    await save(flow[nextStep].question);
    await incrementMessageUsage(msg.tenantId);
    return true;
  }

  // ── All questions answered — run AI diagnosis ────────────────────────────
  const thinking = `🔍 *Analysing your responses...*\n\n_Give me just a moment while I diagnose the issue._ 🧠`;
  await send(thinking);

  const priority = detectPriority(activeSession.category, updatedAnswers);

  // Generate AI diagnosis (non-blocking after sending the thinking message)
  ;(async () => {
    try {
      const { diagnosis, suggestedFix } = await generateITDiagnosis(
        activeSession.category!,
        updatedAnswers,
        userName,
        apiUrl,
        apiKey,
        aiModel,
      );

      // Update session with diagnosis results
      setITSession(msg.tenantId, msg.phoneNumber, {
        ...activeSession,
        step: nextStep,
        answers: updatedAnswers,
        diagnosis,
        suggestedFix,
        priority,
        waitingForResolution: true,
      });

      // Save the ticket at this point (open status)
      saveTicket({
        ticketId:     activeSession.ticketId,
        tenantId:     activeSession.tenantId,
        phoneNumber:  activeSession.phoneNumber,
        userName:     activeSession.userName,
        category:     activeSession.category!,
        answers:      updatedAnswers,
        diagnosis,
        suggestedFix,
        priority,
        status:       "open",
        createdAt:    new Date().toISOString(),
        resolvedAt:   null,
      });

      const diagMsg = formatDiagnosisMessage(diagnosis, suggestedFix, activeSession.ticketId);
      await send(diagMsg);
      console.log(`🔧 [${label}] ✅ IT diagnosis sent for ticket ${activeSession.ticketId} (${priority} priority)`);
    } catch (err: any) {
      console.warn(`⚠️  [${label}] IT diagnosis failed:`, err.message);
      await send(
        `⚠️ I had trouble generating a diagnosis right now. Let me connect you with an IT technician.\n\n` +
        `🎫 *Ticket ID:* \`${activeSession.ticketId}\`\n\n` +
        `Someone will be in touch shortly. 🙏`,
      );
    }
  })();

  await save(thinking);
  await incrementMessageUsage(msg.tenantId);
  return true;
}
