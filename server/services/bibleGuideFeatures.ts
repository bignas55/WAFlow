/**
 * BibleGuide Features Handler
 * Handles all BibleGuide-specific features: Daily Verse, Ask Question, Study, Quiz, Prayer
 */

import {
  getAgeGroupLabel,
  getAgeGroupPersonalization,
  getDailyVerse,
  getBibleVerseByTopic,
  getParable,
  BIBLE_KNOWLEDGE_BASE,
  formatVerseWithCitation,
  formatMultipleVerses,
  searchKnowledgeBaseByTopic,
  type AgeGroup,
} from "./bibleGuideService.js";
import { db } from "../db.js";
import { customers } from "../../drizzle/schema.js";
import { eq, and } from "drizzle-orm";

/**
 * Parse customer's age group from their stored memory
 */
export async function getCustomerAgeGroup(tenantId: number, phoneNumber: string): Promise<AgeGroup> {
  const [customer] = await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), eq(customers.phoneNumber, phoneNumber)));
  if (!customer) return null;

  try {
    const metadata = JSON.parse(customer.metadata || "{}");
    const ageGroup = metadata.bibleguideAgeGroup;
    // Normalize variations
    if (ageGroup === "Young Adults") return "young_adults";
    if (ageGroup === "Kids") return "kids";
    if (ageGroup === "Teens") return "teens";
    if (ageGroup === "Adults") return "adults";
    if (ageGroup === "Seniors") return "seniors";
    return ageGroup || null;
  } catch {
    return null;
  }
}

/**
 * Handle "Daily Verse" feature
 */
export async function handleDailyVerse(tenantId: number, phoneNumber: string): Promise<string> {
  const ageGroup = await getCustomerAgeGroup(tenantId, phoneNumber);
  if (!ageGroup) {
    return `📖 Please select your age group first by typing "1" for Kids, "2" for Teens, etc.`;
  }

  return getDailyVerse(ageGroup);
}

/**
 * Handle "Ask a Bible Question" feature
 * Detects question intent and provides relevant verses
 */
export async function handleBibleQuestion(tenantId: number, phoneNumber: string, question: string): Promise<string> {
  const ageGroup = await getCustomerAgeGroup(tenantId, phoneNumber);
  if (!ageGroup) {
    return `📖 Please select your age group first!`;
  }

  const questionLower = question.toLowerCase();
  const personalization = getAgeGroupPersonalization(ageGroup);

  // Map common questions to topics
  const topicMap: Record<string, string> = {
    "salvation": "salvation",
    "saved": "salvation",
    "believe": "salvation",
    "faith": "faith",
    "trust": "faith",
    "pray": "prayer",
    "prayer": "prayer",
    "love": "love",
    "strength": "strength",
    "weak": "strength",
    "afraid": "anxiety",
    "worry": "anxiety",
    "anxious": "anxiety",
    "scared": "anxiety",
    "forgive": "forgiveness",
    "forgiveness": "forgiveness",
    "sin": "forgiveness",
    "hope": "hope",
    "hopeless": "hope",
    "wisdom": "wisdom",
    "purpose": "purpose",
    "calling": "purpose",
    "suffering": "suffering",
    "pain": "suffering",
    "eternal": "eternal",
    "heaven": "eternal",
    "afterlife": "eternal",
  };

  // Find matching topic
  let topic = null;
  for (const [keyword, topicName] of Object.entries(topicMap)) {
    if (questionLower.includes(keyword)) {
      topic = topicName;
      break;
    }
  }

  if (!topic) {
    // Default response if we can't match a topic
    return `❓ Great question! I can help with topics like:\n\n• Salvation & Faith\n• Prayer\n• Love & Relationships\n• Strength & Courage\n• Anxiety & Peace\n• Forgiveness\n• Hope & Purpose\n• Suffering & Trials\n• Eternal Life\n\nWhich of these interests you?`;
  }

  return getBibleVerseByTopic(topic, ageGroup);
}

/**
 * Handle "Guided Study" feature
 * Let user choose a Bible book or topic to study
 */
export async function handleGuidedStudy(tenantId: number, phoneNumber: string, input?: string): Promise<string> {
  const ageGroup = await getCustomerAgeGroup(tenantId, phoneNumber);
  if (!ageGroup) {
    return `📖 Please select your age group first!`;
  }

  const personalization = getAgeGroupPersonalization(ageGroup);

  if (!input || input.toLowerCase() === "study") {
    // Show study options
    return `📚 *Guided Study*

Choose what you'd like to explore:

1️⃣ *By Book* — Pick a Bible book (e.g., "Genesis", "John", "Romans")
2️⃣ *By Topic* — Explore a theme (e.g., "Prayer", "Love", "Forgiveness")
3️⃣ *Parables* — Learn through Jesus' stories
4️⃣ *The Ten Commandments* — God's moral law
5️⃣ *The Sermon on the Mount* — Jesus' greatest teaching

What would you like to study?`;
  }

  const inputLower = input.toLowerCase();

  // Check if it's a Bible book
  if (inputLower.includes("genesis") || inputLower.includes("john") || inputLower.includes("romans")) {
    return `📖 *${input}* — Summary & Key Themes

I can provide summaries and key verses from any of the 66 Bible books. Which book would you like to explore?

${personalization.endingPrompt}`;
  }

  // Check if it's a parable
  if (inputLower.includes("parable")) {
    return getParable(input, ageGroup);
  }

  // Check if it's the Ten Commandments
  if (inputLower.includes("command")) {
    const commandsList = BIBLE_KNOWLEDGE_BASE.commandments.map((cmd, i) => `${i + 1}. ${cmd}`).join("\n");
    return `⚖️ *The Ten Commandments* (Exodus 20:1-17)

${commandsList}

${personalization.endingPrompt}`;
  }

  // Default: ask for clarification
  return `I can help with Bible books, topics, parables, and more. What would you like to study?`;
}

/**
 * Handle "Bible Quiz" feature
 * Generate quiz questions to test Bible knowledge
 */
export async function handleBibleQuiz(tenantId: number, phoneNumber: string): Promise<string> {
  const ageGroup = await getCustomerAgeGroup(tenantId, phoneNumber);
  if (!ageGroup) {
    return `📖 Please select your age group first!`;
  }

  const personalization = getAgeGroupPersonalization(ageGroup);

  // Quiz questions based on knowledge base
  const quizQuestions = [
    {
      question: "Which book of the Bible contains the Sermon on the Mount?",
      options: ["A) John", "B) Matthew", "C) Luke", "D) Mark"],
      answer: "B) Matthew",
    },
    {
      question: "Who was called the 'father of faith'?",
      options: ["A) Isaac", "B) Jacob", "C) Abraham", "D) David"],
      answer: "C) Abraham",
    },
    {
      question: "How many books are in the Bible?",
      options: ["A) 39", "B) 27", "C) 66", "D) 100"],
      answer: "C) 66",
    },
    {
      question: "What does John 3:16 teach?",
      options: ["A) God's judgment", "B) God's love for the world", "C) Jesus' parables", "D) The Ten Commandments"],
      answer: "B) God's love for the world",
    },
    {
      question: "Which parable teaches about God's unconditional love?",
      options: ["A) The Sower", "B) The Good Samaritan", "C) The Prodigal Son", "D) The Talents"],
      answer: "C) The Prodigal Son",
    },
  ];

  const question = quizQuestions[Math.floor(Math.random() * quizQuestions.length)];

  return `🎯 *Bible Quiz*

${question.question}

${question.options.join("\n")}

Reply with the letter (A, B, C, or D)!`;
}

/**
 * Handle "Prayer Guide" feature
 * Provide guided prayer prompts or prayer request support
 */
export async function handlePrayerGuide(tenantId: number, phoneNumber: string): Promise<string> {
  const ageGroup = await getCustomerAgeGroup(tenantId, phoneNumber);
  if (!ageGroup) {
    return `📖 Please select your age group first!`;
  }

  const personalization = getAgeGroupPersonalization(ageGroup);

  const prayerTopics = [
    "❤️ Praying for others",
    "😔 Praying through suffering",
    "🙏 Morning prayer",
    "🌙 Evening prayer",
    "🆘 Prayer in crisis",
    "✨ Prayers of thanksgiving",
    "🕊️ Prayer for peace",
    "💪 Prayer for strength",
  ];

  return `🙏 *Prayer Guide*

How would you like to pray today?

${prayerTopics.map((topic, i) => `${i + 1}. ${topic}`).join("\n")}

Or share a prayer request, and I'll help guide you!

${personalization.endingPrompt}`;
}

/**
 * Detect BibleGuide feature intent from user input
 * Returns which feature the user is asking for
 * Handles both keyword matching and digit menu selections
 */
export function detectBibleGuideIntent(input: string): "daily_verse" | "ask_question" | "study" | "quiz" | "prayer" | "change_age_group" | null {
  const lower = input.toLowerCase().trim();
  const digit = parseInt(lower, 10);

  // Check for digit menu selections (1-5, 0)
  if (!isNaN(digit)) {
    if (digit === 1) return "daily_verse";
    if (digit === 2) return "ask_question";
    if (digit === 3) return "study";
    if (digit === 4) return "quiz";
    if (digit === 5) return "prayer";
    if (digit === 0) return "change_age_group";
  }

  // Check for keyword matching
  if (lower.includes("verse") || lower.includes("devotional") || lower.includes("daily")) return "daily_verse";
  if (lower.includes("question") || lower.includes("ask") || lower.includes("how") || lower.includes("what") || lower.includes("why")) return "ask_question";
  if (lower.includes("study") || lower.includes("book") || lower.includes("topic") || lower.includes("parable") || lower.includes("command")) return "study";
  if (lower.includes("quiz") || lower.includes("test") || lower.includes("knowledge")) return "quiz";
  if (lower.includes("pray") || lower.includes("prayer") || lower.includes("pray for")) return "prayer";
  if (lower.includes("change age") || lower.includes("age group") || lower === "0") return "change_age_group";

  return null;
}

/**
 * Main BibleGuide menu template
 */
export const BIBLEGUIDE_MAIN_MENU = `📖 *BibleGuide Menu*
What would you like to do today?

1️⃣ Daily Verse & Devotional
2️⃣ Ask a Bible Question
3️⃣ Guided Study (by book or topic)
4️⃣ Bible Quiz
5️⃣ Prayer Guide
0️⃣ Change Age Group`;

/**
 * Route user input to appropriate BibleGuide feature
 */
export async function handleBibleGuideFeature(
  tenantId: number,
  phoneNumber: string,
  input: string
): Promise<string | null> {
  const intent = detectBibleGuideIntent(input);

  switch (intent) {
    case "daily_verse":
      return await handleDailyVerse(tenantId, phoneNumber);

    case "ask_question":
      return await handleBibleQuestion(tenantId, phoneNumber, input);

    case "study":
      return await handleGuidedStudy(tenantId, phoneNumber, input);

    case "quiz":
      return await handleBibleQuiz(tenantId, phoneNumber);

    case "prayer":
      return await handlePrayerGuide(tenantId, phoneNumber);

    case "change_age_group":
      // Return the age group selection menu
      return `👋 Welcome to *BibleGuide* 📖🙏
I'm here to help you grow in God's Word every day!

Please choose your age group so I can teach in a way that fits you:

1️⃣ 👶 Kids (6–12 years old)
2️⃣ 👨‍🦱 Teens (13–17 years old)
3️⃣ 🎓 Young Adults (18–30 years old)
4️⃣ 👔 Adults (31–59 years old)
5️⃣ 🧓 Seniors (60+ years old)`;

    default:
      return null;
  }
}

/**
 * Check if this is a BibleGuide bot based on business name
 */
export function isBibleGuideBusiness(businessName?: string): boolean {
  return businessName?.toLowerCase().includes("bibleguide") || false;
}

/**
 * Enhance system prompt for BibleGuide bots
 */
export function getBibleGuideEnhancedPrompt(basePrompt: string, ageGroup: AgeGroup): string {
  if (!ageGroup) return basePrompt;

  const personalization = getAgeGroupPersonalization(ageGroup);
  const ageGroupLabel = getAgeGroupLabel(ageGroup);

  return `${basePrompt}

CURRENT AGE GROUP: ${ageGroupLabel}

PERSONALIZATION GUIDELINES FOR THIS AGE GROUP:
- Word Choice: ${personalization.wordChoice}
- Topic Relevance: ${personalization.topicRelevance}
- Response Length: Keep responses ${personalization.responseLength}
- End with: ${personalization.endingPrompt}

Always use age-appropriate language and examples that resonate with this age group.`;
}
