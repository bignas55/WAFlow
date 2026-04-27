/**
 * bibleStudyService.ts
 * Handles: quiz sessions, 7-day reading plans, verse of the day, daily verse generation.
 */

import OpenAI from "openai";
import fs from "fs";
import path from "path";

// ─── BIBLE SESSION (menu-driven conversation, in-memory, 2-hour TTL) ─────────

export type BibleSessionMode = "study" | "topic" | "encouragement" | "prayer";

export interface BibleSession {
  mode: BibleSessionMode;
  topic: string;                // label/description set when mode is chosen
  messageCount: number;         // how many AI exchanges have happened in this session
  askedForVerse: boolean;       // have we already offered the closing verse?
  waitingForVerseConsent: boolean; // are we waiting for a yes/no reply?
  expiresAt: number;
}

const bibleSessions = new Map<string, BibleSession>();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Periodically evict expired entries so the Maps don't grow unbounded on long-running servers.
// Runs every 30 minutes — lightweight scan of in-memory keys only.
setInterval(() => {
  const now = Date.now();
  for (const [key, s] of bibleSessions) if (now > s.expiresAt) bibleSessions.delete(key);
}, 30 * 60 * 1000);

export function getBibleSession(tenantId: number, phone: string): BibleSession | undefined {
  const key = qKey(tenantId, phone);
  const s = bibleSessions.get(key);
  if (!s) return undefined;
  if (Date.now() > s.expiresAt) { bibleSessions.delete(key); return undefined; }
  return s;
}

export function setBibleSession(tenantId: number, phone: string, s: Omit<BibleSession, "expiresAt">) {
  bibleSessions.set(qKey(tenantId, phone), { ...s, expiresAt: Date.now() + SESSION_TTL_MS });
}

export function clearBibleSession(tenantId: number, phone: string) {
  bibleSessions.delete(qKey(tenantId, phone));
}

/** Increment message count and return updated session (or undefined if no session). */
export function incrementSessionMessages(tenantId: number, phone: string): BibleSession | undefined {
  const s = getBibleSession(tenantId, phone);
  if (!s) return undefined;
  const updated = { ...s, messageCount: s.messageCount + 1 };
  setBibleSession(tenantId, phone, updated);
  return updated;
}

/**
 * Generate a single, targeted Bible verse + explanation for a session topic.
 * Uses the recent conversation context to pick the most relevant scripture.
 */
export async function generateVerseForSession(
  mode: BibleSessionMode,
  topic: string,
  conversationContext: string,
  apiUrl: string,
  apiKey: string,
  aiModel: string,
): Promise<string> {
  const client = new OpenAI({ baseURL: apiUrl, apiKey });

  // Brief pause to let the Groq TPM window recover
  await new Promise(r => setTimeout(r, 5000));

  const modeDesc: Record<BibleSessionMode, string> = {
    study: "Bible study session",
    topic: "topic discussion",
    encouragement: "personal encouragement and support",
    prayer: "prayer request conversation",
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await client.chat.completions.create({
        model: aiModel,
        messages: [
          {
            role: "system",
            content:
              `You are a Bible teacher. Based on the conversation context below (a ${modeDesc[mode]} about "${topic}"), ` +
              `choose ONE perfect Bible verse that speaks directly to what was discussed.\n\n` +
              `Format the verse EXACTLY like this — nothing before it:\n\n` +
              `✨━━━━━━━━━━━━━━━━━━━━✨\n` +
              `📖 *Book Chapter:Verse (NIV)*\n` +
              `*"Full verse text here."*\n` +
              `✨━━━━━━━━━━━━━━━━━━━━✨\n\n` +
              `Then write 3-4 warm sentences explaining exactly how this verse connects to the specific ` +
              `things discussed in the conversation. Be personal and direct — not generic.`,
          },
          {
            role: "user",
            content: `Recent conversation:\n${conversationContext.slice(0, 800)}`,
          },
        ],
        max_tokens: 450,
        temperature: 0.7,
      });
      return result.choices[0]?.message?.content?.trim() ?? "";
    } catch (err: any) {
      if (err?.status === 429 && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 10000));
      } else {
        throw err;
      }
    }
  }
  return "";
}

// ─── QUIZ SESSIONS (in-memory, 30-min TTL) ────────────────────────────────────

export interface QuizQuestion {
  question: string;
  options: string[];      // ['A) ...', 'B) ...', 'C) ...', 'D) ...']
  correct: string;        // 'A' | 'B' | 'C' | 'D'
  explanation: string;    // why the correct answer is right
}

export interface QuizSession {
  questions: QuizQuestion[];   // all 10 questions pre-generated
  userAnswers: string[];        // answers collected so far (index matches question index)
  currentIndex: number;         // which question we're waiting for (0–9)
  verseResponse: string;
  expiresAt: number;
}

const quizSessions = new Map<string, QuizSession>();
const QUIZ_TTL_MS = 30 * 60 * 1000; // 30 minutes — enough time for 10 questions

setInterval(() => {
  const now = Date.now();
  for (const [key, s] of quizSessions) if (now > s.expiresAt) quizSessions.delete(key);
}, 30 * 60 * 1000);

// Stores the last verse explanation for a user so we can start a quiz on demand.
// Cleared once a quiz is started or a new verse is explained.
const pendingQuizVerses = new Map<string, string>();

const qKey = (tenantId: number, phone: string) => `${tenantId}:${phone}`;

export function getPendingQuizVerse(tenantId: number, phone: string): string | undefined {
  return pendingQuizVerses.get(qKey(tenantId, phone));
}

export function setPendingQuizVerse(tenantId: number, phone: string, verse: string) {
  pendingQuizVerses.set(qKey(tenantId, phone), verse);
}

export function clearPendingQuizVerse(tenantId: number, phone: string) {
  pendingQuizVerses.delete(qKey(tenantId, phone));
}

export function getQuizSession(tenantId: number, phone: string): QuizSession | undefined {
  const s = quizSessions.get(qKey(tenantId, phone));
  if (!s) return undefined;
  if (Date.now() > s.expiresAt) { quizSessions.delete(qKey(tenantId, phone)); return undefined; }
  return s;
}

export function setQuizSession(tenantId: number, phone: string, s: Omit<QuizSession, "expiresAt">) {
  quizSessions.set(qKey(tenantId, phone), { ...s, expiresAt: Date.now() + QUIZ_TTL_MS });
}

export function clearQuizSession(tenantId: number, phone: string) {
  quizSessions.delete(qKey(tenantId, phone));
}

// ─── 7-DAY READING PLANS (persisted to data/reading_plans.json) ───────────────

export interface ReadingPlanState {
  topic: string;
  currentDay: number;   // 1–7
  startedAt: string;    // ISO
  lastVerseAt: string;  // ISO — date of last verse sent (prevents duplicate sends same day)
}

const PLANS_FILE = path.join(process.cwd(), "data", "reading_plans.json");

function loadPlans(): Record<string, ReadingPlanState> {
  try {
    if (!fs.existsSync(PLANS_FILE)) return {};
    return JSON.parse(fs.readFileSync(PLANS_FILE, "utf8"));
  } catch { return {}; }
}

function savePlans(plans: Record<string, ReadingPlanState>) {
  try {
    fs.mkdirSync(path.dirname(PLANS_FILE), { recursive: true });
    fs.writeFileSync(PLANS_FILE, JSON.stringify(plans, null, 2));
  } catch (e) { console.warn("⚠️  Could not save reading plans:", e); }
}

export function getReadingPlan(tenantId: number, phone: string): ReadingPlanState | undefined {
  return loadPlans()[qKey(tenantId, phone)];
}

export function startReadingPlan(tenantId: number, phone: string, topic: string): ReadingPlanState {
  const plans = loadPlans();
  const state: ReadingPlanState = { topic, currentDay: 1, startedAt: new Date().toISOString(), lastVerseAt: "" };
  plans[qKey(tenantId, phone)] = state;
  savePlans(plans);
  return state;
}

/** Advance to the next day. Returns null when the plan is complete (day > 7). */
export function advanceReadingPlan(tenantId: number, phone: string): ReadingPlanState | null {
  const plans = loadPlans();
  const key = qKey(tenantId, phone);
  if (!plans[key]) return null;
  plans[key].currentDay += 1;
  plans[key].lastVerseAt = new Date().toISOString();
  if (plans[key].currentDay > 7) {
    delete plans[key];
    savePlans(plans);
    return null; // completed
  }
  savePlans(plans);
  return plans[key];
}

export function markReadingPlanSent(tenantId: number, phone: string) {
  const plans = loadPlans();
  const key = qKey(tenantId, phone);
  if (!plans[key]) return;
  plans[key].lastVerseAt = new Date().toISOString();
  savePlans(plans);
}

export function clearReadingPlan(tenantId: number, phone: string) {
  const plans = loadPlans();
  delete plans[qKey(tenantId, phone)];
  savePlans(plans);
}

/** Returns true if a verse has already been sent today for this plan */
export function alreadySentToday(tenantId: number, phone: string): boolean {
  const plan = getReadingPlan(tenantId, phone);
  if (!plan || !plan.lastVerseAt) return false;
  const last = new Date(plan.lastVerseAt);
  const now = new Date();
  return last.toDateString() === now.toDateString();
}

// ─── AI GENERATION FUNCTIONS ──────────────────────────────────────────────────

/** Generate a structured Bible book summary */
export async function generateBookSummary(
  bookName: string,
  apiUrl: string, apiKey: string, aiModel: string,
): Promise<string> {
  const client = new OpenAI({ baseURL: apiUrl, apiKey });
  await new Promise(r => setTimeout(r, 3000));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await client.chat.completions.create({
        model: aiModel,
        messages: [
          {
            role: "system",
            content:
              "You are a Bible scholar. Write a concise, engaging summary of a Bible book. " +
              "Structure your response EXACTLY like this (plain text, no JSON):\n\n" +
              "📚 *[Book Name]*\n" +
              "_[one-sentence tagline]_\n\n" +
              "*Author & Date:* [info]\n" +
              "*Theme:* [2-3 key themes]\n\n" +
              "*Summary:* [3-4 sentences covering the main storyline/message]\n\n" +
              "*Key Verses:*\n" +
              "• 📖 *[ref]* — _\"[short quote]\"_\n" +
              "• 📖 *[ref]* — _\"[short quote]\"_\n" +
              "• 📖 *[ref]* — _\"[short quote]\"_\n\n" +
              "*Why It Matters Today:* [2-3 sentences on relevance]\n\n" +
              "Keep the whole response under 300 words.",
          },
          { role: "user", content: `Summarise the book of ${bookName}` },
        ],
        max_tokens: 600,
        temperature: 0.6,
      });
      return result.choices[0]?.message?.content?.trim() ?? "";
    } catch (err: any) {
      if (err?.status === 429 && attempt < 3) await new Promise(r => setTimeout(r, attempt * 10000));
      else throw err;
    }
  }
  return "";
}

/** Generate a structured sermon preparation outline */
export async function generateSermonPrep(
  topic: string,
  apiUrl: string, apiKey: string, aiModel: string,
): Promise<string> {
  const client = new OpenAI({ baseURL: apiUrl, apiKey });
  await new Promise(r => setTimeout(r, 3000));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await client.chat.completions.create({
        model: aiModel,
        messages: [
          {
            role: "system",
            content:
              "You are an experienced pastor helping prepare a sermon. Output ONLY plain text in this structure:\n\n" +
              "📝 *Sermon Outline: [Topic]*\n\n" +
              "*Main Scripture:* 📖 *[Book Chapter:Verse]* — _\"[verse text]\"_ (NIV)\n\n" +
              "*Big Idea (one sentence):* [central message]\n\n" +
              "*Introduction Hook:* [1-2 sentences — a story, question, or stat to open with]\n\n" +
              "*Point 1:* [Title]\n" +
              "Scripture: 📖 *[ref]* — _\"[quote]\"_\n" +
              "Explanation: [2-3 sentences]\n\n" +
              "*Point 2:* [Title]\n" +
              "Scripture: 📖 *[ref]* — _\"[quote]\"_\n" +
              "Explanation: [2-3 sentences]\n\n" +
              "*Point 3:* [Title]\n" +
              "Scripture: 📖 *[ref]* — _\"[quote]\"_\n" +
              "Explanation: [2-3 sentences]\n\n" +
              "*Illustration:* [A short story or real-life example for the main point]\n\n" +
              "*Call to Action:* [What should the congregation do or decide?]\n\n" +
              "*Closing Prayer Point:* [One sentence to close in prayer]",
          },
          { role: "user", content: `Prepare a sermon outline on: ${topic}` },
        ],
        max_tokens: 900,
        temperature: 0.7,
      });
      return result.choices[0]?.message?.content?.trim() ?? "";
    } catch (err: any) {
      if (err?.status === 429 && attempt < 3) await new Promise(r => setTimeout(r, attempt * 10000));
      else throw err;
    }
  }
  return "";
}

/** Generate a personalised scripture affirmation based on user context */
export async function generateScriptureAffirmation(
  userContext: string, // recent memory / what the user has been going through
  translation: string,
  apiUrl: string, apiKey: string, aiModel: string,
): Promise<string> {
  const client = new OpenAI({ baseURL: apiUrl, apiKey });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await client.chat.completions.create({
        model: aiModel,
        messages: [
          {
            role: "system",
            content:
              `You are a Christian encourager sending a personalised morning affirmation. ` +
              `Based on the user context provided, pick ONE Bible verse (${translation}) that speaks directly to their situation. ` +
              `Format your response EXACTLY like this:\n\n` +
              `☀️ *Good morning!*\n\n` +
              `✨━━━━━━━━━━━━━━━━━━━━✨\n` +
              `📖 *Book Chapter:Verse (${translation})*\n` +
              `*"Verse text here."*\n` +
              `✨━━━━━━━━━━━━━━━━━━━━✨\n\n` +
              `[2-3 warm sentences connecting this verse to what the user is going through]\n\n` +
              `_Today's declaration: "[short, powerful affirmation based on the verse, starting with 'I am' or 'God is']"_\n\n` +
              `Have a blessed day! 🙏`,
          },
          {
            role: "user",
            content: userContext
              ? `User context: ${userContext.slice(0, 400)}`
              : "No specific context — choose an uplifting verse for today.",
          },
        ],
        max_tokens: 350,
        temperature: 0.75,
      });
      return result.choices[0]?.message?.content?.trim() ?? "";
    } catch (err: any) {
      if (err?.status === 429 && attempt < 3) await new Promise(r => setTimeout(r, attempt * 10000));
      else throw err;
    }
  }
  return "";
}

/** Generate a memory verse test message */
export async function generateMemoryVerseTest(
  reference: string,
  verseText: string,
  testCount: number,
  apiUrl: string, apiKey: string, aiModel: string,
  translation = "NIV",
): Promise<string> {
  const client = new OpenAI({ baseURL: apiUrl, apiKey });
  // Choose test style based on how many times they've been tested
  const style = testCount === 0 ? "fill-in-blank" : testCount < 3 ? "first-words" : "full-recall";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await client.chat.completions.create({
        model: aiModel,
        messages: [
          {
            role: "system",
            content:
              `You are helping someone memorise a Bible verse (${translation} translation). Create a short, friendly test message. ` +
              `Test style: ${style}.\n` +
              `- fill-in-blank: Give the verse with 3-4 key words replaced by _____\n` +
              `- first-words: Give only the first 4-5 words and ask them to complete it\n` +
              `- full-recall: Ask them to type the verse entirely from memory\n\n` +
              `Format: Start with "🧠 *Memory Verse Check!*" then the test. Keep it short and encouraging.`,
          },
          {
            role: "user",
            content: `Reference: ${reference}\nVerse (${translation}): "${verseText}"`,
          },
        ],
        max_tokens: 200,
        temperature: 0.6,
      });
      return result.choices[0]?.message?.content?.trim() ?? "";
    } catch (err: any) {
      if (err?.status === 429 && attempt < 3) await new Promise(r => setTimeout(r, attempt * 10000));
      else if (attempt === 3) return "";
      else throw err;
    }
  }
  return "";
}

/** Generate a fasting check-in encouragement message */
export async function generateFastingCheckIn(
  intention: string,
  hoursElapsed: number,
  hoursRemaining: number,
  apiUrl: string, apiKey: string, aiModel: string,
): Promise<string> {
  const client = new OpenAI({ baseURL: apiUrl, apiKey });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await client.chat.completions.create({
        model: aiModel,
        messages: [
          {
            role: "system",
            content:
              "You are a spiritual companion sending a brief fasting check-in. " +
              "Write a warm, encouraging 3-4 sentence message. " +
              "Include ONE relevant Bible verse about fasting, prayer, or perseverance (formatted: 📖 *Ref* — _\"text\"_). " +
              "Keep it under 80 words. End with a short encouragement.",
          },
          {
            role: "user",
            content:
              `Fasting for: "${intention}"\n` +
              `Hours elapsed: ${hoursElapsed.toFixed(1)}\n` +
              `Hours remaining: ${hoursRemaining.toFixed(1)}`,
          },
        ],
        max_tokens: 200,
        temperature: 0.7,
      });
      const text = result.choices[0]?.message?.content?.trim() ?? "";
      return `⏳ *Fasting Check-In*\n\n${text}`;
    } catch (err: any) {
      if (err?.status === 429 && attempt < 3) await new Promise(r => setTimeout(r, attempt * 10000));
      else throw err;
    }
  }
  return "";
}

/** Generate a random verse of the day with full explanation */
export async function generateVerseOfDay(
  apiUrl: string, apiKey: string, aiModel: string
): Promise<string> {
  const client = new OpenAI({ baseURL: apiUrl, apiKey });
  const topics = [
    "faith", "hope", "love", "forgiveness", "strength", "peace", "purpose",
    "grace", "trust", "prayer", "wisdom", "courage", "patience", "joy",
  ];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const result = await client.chat.completions.create({
    model: aiModel,
    messages: [
      {
        role: "system",
        content:
          "You are a Bible teacher. Choose one powerful, uplifting verse and give a full explanation. " +
          "Format: start with 📖 *Book Chapter:Verse (NIV)* then *\"verse text\"* in bold, followed by the explanation, " +
          "historical context, a real-life example, and 2 related verses.",
      },
      {
        role: "user",
        content: `Give me today's verse of the day on the theme of "${topic}" with a full explanation.`,
      },
    ],
    max_tokens: 600,
    temperature: 0.95,
  });

  return (
    result.choices[0]?.message?.content?.trim() ??
    `📖 *Psalm 46:10 (NIV)*\n*"Be still, and know that I am God."*\n\nTake a moment today to be still before God...`
  );
}

/** Generate a specific day's verse for a 7-day reading plan */
export async function generateReadingPlanVerse(
  topic: string,
  day: number,
  apiUrl: string,
  apiKey: string,
  aiModel: string,
): Promise<string> {
  const client = new OpenAI({ baseURL: apiUrl, apiKey });
  const result = await client.chat.completions.create({
    model: aiModel,
    messages: [
      {
        role: "system",
        content:
          "You are a Bible teacher creating a 7-day reading plan. Each day builds progressively on the theme. " +
          "Format the verse with 📖 *Book Chapter:Verse (NIV)* and *\"verse text\"* in bold. " +
          "Include explanation, historical context, real-life example, and 1 related verse.",
      },
      {
        role: "user",
        content: `7-day reading plan theme: "${topic}". This is day ${day} of 7. Give one verse that fits day ${day}'s progression on this theme.`,
      },
    ],
    max_tokens: 600,
    temperature: 0.8,
  });
  return result.choices[0]?.message?.content?.trim() ?? "";
}

/**
 * Generate all 10 quiz questions at once in a single API call.
 * Returns an array of QuizQuestion. Each question is challenging — testing
 * theological depth, historical context, cross-references and application.
 */
export async function generateAllQuizQuestions(
  verseResponse: string,
  apiUrl: string,
  apiKey: string,
  aiModel: string,
): Promise<QuizQuestion[]> {
  const client = new OpenAI({ baseURL: apiUrl, apiKey });

  // Wait for the Groq TPM window to recover after the main AI call
  await new Promise(r => setTimeout(r, 12000));

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await client.chat.completions.create({
        model: aiModel,
        messages: [
          {
            role: "system",
            content:
              "You are a challenging Bible scholar creating a 10-question multiple-choice quiz. " +
              "Questions must test deep understanding — NOT surface-level recall. " +
              "Include questions about: theological meaning, original Hebrew/Greek word meaning, historical context, " +
              "who wrote it and why, cross-references to other books, practical application, common misconceptions, " +
              "what the verse does NOT mean, and connections to the New/Old Testament. " +
              "Wrong options must be plausible and require genuine knowledge to dismiss. " +
              "Output ONLY a valid JSON array of exactly 10 objects:\n" +
              "[{\"question\":\"...\",\"options\":[\"A) ...\",\"B) ...\",\"C) ...\",\"D) ...\"],\"correct\":\"B\",\"explanation\":\"The correct answer is B because...(2-3 sentences explaining clearly)\"}]" +
              "\nNo extra text. No markdown. Return only the JSON array.",
          },
          {
            role: "user",
            content: `Bible verse explanation to base all 10 questions on:\n\n${verseResponse.slice(0, 700)}`,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      });

      const raw = result.choices[0]?.message?.content?.trim() ?? "[]";
      // Strip markdown code fences if the model wrapped the JSON
      const cleaned = raw.replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "").trim();

      let parsed: any[];
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // The AI returned non-JSON — treat as a retryable error
        console.warn(`⚠️  Quiz JSON parse failed (attempt ${attempt}) — retrying...`);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 8000));
          continue;
        }
        return [];
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        console.warn(`⚠️  Quiz returned empty or non-array (attempt ${attempt})`);
        if (attempt < 3) { await new Promise(r => setTimeout(r, 8000)); continue; }
        return [];
      }

      return parsed.slice(0, 10).map(q => ({
        question: q.question ?? "",
        options: Array.isArray(q.options) ? q.options : [],
        correct: ((q.correct ?? "A") as string).toUpperCase().charAt(0),
        explanation: q.explanation ?? "",
      })).filter(q => q.question && q.options.length >= 2); // drop malformed questions
    } catch (err: any) {
      if (err?.status === 429 && attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 12000));
      } else {
        console.warn(`⚠️  Quiz generation failed (attempt ${attempt}):`, err.message);
        if (attempt === 3) return [];
      }
    }
  }
  return [];
}

/** Format a single quiz question for WhatsApp */
export function formatQuizQuestion(q: QuizQuestion, num: number, total = 10): string {
  return [
    `━━━━━━━━━━━━━━━━━━━━`,
    `🧠 *QUIZ — Question ${num} of ${total}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    q.question,
    ``,
    ...q.options,
    ``,
    `_Reply with A, B, C or D_`,
  ].join("\n");
}

/** Format the full results after all 10 answers are collected */
export function formatQuizResults(questions: QuizQuestion[], userAnswers: string[]): string {
  let correct = 0;
  const lines: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const given = (userAnswers[i] ?? "?").toUpperCase();
    const isCorrect = given === q.correct;
    if (isCorrect) correct++;

    const correctOption = q.options.find(o => o.startsWith(q.correct + ")")) ?? q.correct;
    lines.push(
      `${isCorrect ? "✅" : "❌"} *Q${i + 1}:* ${q.question}\n` +
      `   Your answer: *${given}*${isCorrect ? " ✅" : ` ❌ (Correct: *${q.correct}*)`}\n` +
      `   💡 _${q.explanation}_`
    );
  }

  const pct = Math.round((correct / questions.length) * 100);
  const grade =
    pct === 100 ? "🏆 Perfect score! Outstanding Bible knowledge!"
    : pct >= 80  ? "🌟 Excellent! You have a deep understanding of this passage."
    : pct >= 60  ? "👍 Good effort! Keep studying and you will get even better."
    : pct >= 40  ? "📖 Keep going! Every question you get wrong is a chance to learn."
    :              "🙏 Don't give up! The more you study God's Word, the more it reveals itself.";

  return [
    `━━━━━━━━━━━━━━━━━━━━`,
    `🧠 *QUIZ RESULTS*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `Score: *${correct}/${questions.length}* (${pct}%)`,
    ``,
    grade,
    ``,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📋 *ANSWERS & EXPLANATIONS*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
    lines.join("\n\n"),
  ].join("\n");
}
