/**
 * BibleGuide Service - Comprehensive Bible Teaching AI
 * Integrates complete Bible Knowledge Base with age-appropriate personalization
 */

import { db } from "../db.js";
import { customers } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

export type AgeGroup = "kids" | "teens" | "young_adults" | "adults" | "seniors" | null;

interface BibleGuideSession {
  ageGroup: AgeGroup;
  topic?: string;
  mode?: "menu" | "study" | "qa" | "verse" | "quiz" | "prayer";
}

// ── Bible Knowledge Base ───────────────────────────────────────────────────
export const BIBLE_KNOWLEDGE_BASE = {
  books: {
    old_testament: 39,
    new_testament: 27,
    total: 66,
  },
  topics: {
    salvation: [
      { ref: "John 3:16", text: "For God so loved the world that He gave His one and only Son, that whoever believes in Him shall not perish but have eternal life." },
      { ref: "Romans 10:9", text: "If you declare with your mouth, 'Jesus is Lord,' and believe in your heart that God raised Him from the dead, you will be saved." },
      { ref: "Ephesians 2:8-9", text: "For it is by grace you have been saved, through faith — and this is not from yourselves, it is the gift of God — not by works, so that no one can boast." },
      { ref: "Acts 4:12", text: "Salvation is found in no one else, for there is no other name under heaven given to mankind by which we must be saved." },
    ],
    faith: [
      { ref: "Hebrews 11:1", text: "Now faith is confidence in what we hope for and assurance about what we do not see." },
      { ref: "Romans 10:17", text: "Consequently, faith comes from hearing the message, and the message is heard through the word about Christ." },
      { ref: "James 2:17", text: "In the same way, faith by itself, if it is not accompanied by action, is dead." },
      { ref: "Matthew 17:20", text: "If you have faith as small as a mustard seed, you can say to this mountain, 'Move from here to there,' and it will move." },
    ],
    prayer: [
      { ref: "Matthew 6:9-13", text: "Our Father in heaven, hallowed be Your name, Your kingdom come, Your will be done, on earth as it is in heaven..." },
      { ref: "Philippians 4:6-7", text: "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God." },
      { ref: "1 Thessalonians 5:17", text: "Pray continually." },
      { ref: "Matthew 7:7", text: "Ask and it will be given to you; seek and you will find; knock and the door will be opened to you." },
    ],
    love: [
      { ref: "1 Corinthians 13:4-7", text: "Love is patient, love is kind. It does not envy, it does not boast, it is not proud..." },
      { ref: "John 13:34-35", text: "A new command I give you: Love one another. As I have loved you, so you must love one another." },
      { ref: "1 John 4:8", text: "Whoever does not love does not know God, because God is love." },
      { ref: "Romans 8:38-39", text: "I am convinced that neither death nor life... will be able to separate us from the love of God that is in Christ Jesus our Lord." },
    ],
    strength: [
      { ref: "Philippians 4:13", text: "I can do all this through Him who gives me strength." },
      { ref: "Isaiah 40:31", text: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles..." },
      { ref: "Joshua 1:9", text: "Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged..." },
      { ref: "2 Timothy 1:7", text: "For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline." },
    ],
    anxiety: [
      { ref: "Philippians 4:6-7", text: "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God." },
      { ref: "Matthew 6:34", text: "Therefore do not worry about tomorrow, for tomorrow will worry about itself. Each day has enough trouble of its own." },
      { ref: "John 14:27", text: "Peace I leave with you; my peace I give you. I do not give to you as the world gives." },
      { ref: "Psalm 23:4", text: "Even though I walk through the darkest valley, I will fear no evil, for You are with me..." },
    ],
    forgiveness: [
      { ref: "1 John 1:9", text: "If we confess our sins, He is faithful and just and will forgive us our sins and purify us from all unrighteousness." },
      { ref: "Psalm 103:12", text: "As far as the east is from the west, so far has He removed our transgressions from us." },
      { ref: "Colossians 3:13", text: "Bear with each other and forgive one another if any of you has a grievance against someone. Forgive as the Lord forgave you." },
      { ref: "Matthew 6:14", text: "For if you forgive other people when they sin against you, your heavenly Father will also forgive you." },
    ],
    hope: [
      { ref: "Jeremiah 29:11", text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future." },
      { ref: "Romans 15:13", text: "May the God of hope fill you with all joy and peace as you trust in Him, so that you may overflow with hope by the power of the Holy Spirit." },
      { ref: "Romans 8:28", text: "And we know that in all things God works for the good of those who love Him, who have been called according to His purpose." },
      { ref: "Lamentations 3:22-23", text: "Because of the Lord's great love we are not consumed, for His compassions never fail. They are new every morning..." },
    ],
  },
  doctrines: {
    trinity: "God exists as one Being in three co-equal, co-eternal Persons: God the Father, God the Son (Jesus Christ), and God the Holy Spirit.",
    christ: "Jesus is fully God and fully human. He is the eternal Word made flesh, born of a virgin, sinless, crucified for sin, and resurrected bodily on the third day.",
    salvation: "Salvation is a free gift from God received through faith in Jesus Christ alone — not by works or human merit. Justification means God declares sinners righteous based on Christ's righteousness.",
    resurrection: "Jesus Christ bodily rose from the dead on the third day. His resurrection is the cornerstone of the Christian faith — confirming His identity and guaranteeing believers' future resurrection.",
    spirit: "The Holy Spirit is the third Person of the Trinity who convicts the world of sin, regenerates believers, indwells them permanently, produces the fruit of the Spirit, and gives spiritual gifts.",
  },
  parables: {
    prodigal_son: "A son demands his inheritance, wastes it, returns broken to his father who runs to embrace him. Lesson: God's unconditional love and joy over repentant sinners.",
    good_samaritan: "A man is beaten on the road; a priest and Levite pass by, but a despised Samaritan cares for him. Lesson: Our 'neighbour' is anyone in need — love crosses boundaries.",
    sower: "A farmer sows seed on four soils: path, rocky, thorny, and good ground. Lesson: The condition of the heart determines how God's Word is received and bears fruit.",
    lost_sheep: "A shepherd leaves 99 sheep to find 1 that is lost. Lesson: God actively seeks the lost; there is great joy in heaven over one sinner who repents.",
    talents: "A master gives servants talents; two invest and multiply, one buries his. Lesson: God expects us to faithfully invest the gifts and opportunities He gives us.",
  },
  commandments: [
    "You shall have no other gods before Me.",
    "You shall not make for yourself an image to worship.",
    "You shall not misuse the name of the LORD your God.",
    "Remember the Sabbath day by keeping it holy.",
    "Honour your father and your mother.",
    "You shall not murder.",
    "You shall not commit adultery.",
    "You shall not steal.",
    "You shall not give false testimony against your neighbour.",
    "You shall not covet.",
  ],
};

// ── Format Knowledge Base Verses with Citations ─────────────────────────────
export function formatVerseWithCitation(verse: { ref: string; text: string }): string {
  return `📖 *${verse.ref}* (NIV)\n"${verse.text}"`;
}

export function formatMultipleVerses(verses: Array<{ ref: string; text: string }>): string {
  if (!verses || verses.length === 0) return "";
  return verses
    .map(verse => formatVerseWithCitation(verse))
    .join("\n\n");
}

// ── Search Knowledge Base by Topic ──────────────────────────────────────────
export function searchKnowledgeBaseByTopic(topic: string): { ref: string; text: string }[] {
  const lowerTopic = topic.toLowerCase();

  // Search in topics
  if (BIBLE_KNOWLEDGE_BASE.topics[lowerTopic]) {
    return BIBLE_KNOWLEDGE_BASE.topics[lowerTopic] || [];
  }

  // Fuzzy search in all topics
  const results: { ref: string; text: string }[] = [];
  for (const [key, verses] of Object.entries(BIBLE_KNOWLEDGE_BASE.topics)) {
    if (key.includes(lowerTopic) || lowerTopic.includes(key)) {
      results.push(...verses);
    }
  }

  return results;
}

// ── Age Group Storage & Retrieval ──────────────────────────────────────────
export async function storeUserAgeGroup(tenantId: number, phoneNumber: string, ageGroup: AgeGroup): Promise<void> {
  await db
    .update(customers)
    .set({
      metadata: JSON.stringify({
        bibleguideAgeGroup: ageGroup,
        bibleguideSelectedAt: new Date().toISOString()
      }),
    })
    .where(eq(customers.phoneNumber, phoneNumber));
}

export async function getUserAgeGroup(phoneNumber: string): Promise<AgeGroup> {
  const [customer] = await db.select().from(customers).where(eq(customers.phoneNumber, phoneNumber));
  if (!customer) return null;

  try {
    const metadata = JSON.parse(customer.metadata || "{}");
    return metadata.bibleguideAgeGroup || null;
  } catch {
    return null;
  }
}

// ── Age Group Detection ────────────────────────────────────────────────────
export function detectAgeGroup(input: string): AgeGroup | null {
  const num = parseInt(input.trim(), 10);
  const groupMap: Record<number, AgeGroup> = {
    1: "kids",
    2: "teens",
    3: "young_adults",
    4: "adults",
    5: "seniors",
  };
  return groupMap[num] || null;
}

// ── Age Group Labels ───────────────────────────────────────────────────────
export function getAgeGroupLabel(ageGroup: AgeGroup): string {
  const labels: Record<AgeGroup, string> = {
    kids: "👶 Kids (6–12)",
    teens: "👨‍🦱 Teens (13–17)",
    young_adults: "🎓 Young Adults (18–30)",
    adults: "👔 Adults (31–59)",
    seniors: "👴 Seniors (60+)",
  };
  return labels[ageGroup] || "Unknown";
}

// ── Age Group Personalization ──────────────────────────────────────────────
export function getAgeGroupPersonalization(ageGroup: AgeGroup): {
  wordChoice: string;
  topicRelevance: string;
  responseLength: "short" | "medium" | "long";
  endingPrompt: string;
} {
  const personalization: Record<AgeGroup, any> = {
    kids: {
      wordChoice: "Very simple words, short sentences, lots of emojis",
      topicRelevance: "Relate to school, friends, family, and animals",
      responseLength: "short",
      endingPrompt: "Your challenge today: [simple action]",
    },
    teens: {
      wordChoice: "Modern, relatable language (not slang), honest tone",
      topicRelevance: "Connect to identity, pressure, social media, friendships",
      responseLength: "medium",
      endingPrompt: "Think about this: [reflection question]",
    },
    young_adults: {
      wordChoice: "Mature, thoughtful language",
      topicRelevance: "Career, relationships, purpose, faith doubts, life decisions",
      responseLength: "medium",
      endingPrompt: "Apply this today: [action step]",
    },
    adults: {
      wordChoice: "Theological depth and wisdom",
      topicRelevance: "Family, marriage, parenting, work, community, legacy",
      responseLength: "long",
      endingPrompt: "Reflect & Pray: [prayer prompt]",
    },
    seniors: {
      wordChoice: "Warm, reverent, dignified language",
      topicRelevance: "Legacy, gratitude, eternal hope, comfort, wisdom",
      responseLength: "medium",
      endingPrompt: "A blessing for you: [blessing]",
    },
  };
  return personalization[ageGroup] || personalization.adults;
}

// ── Welcome Message ────────────────────────────────────────────────────────
export function getWelcomeMessage(): string {
  return `👋 Welcome to *BibleGuide* 📖🙏
I'm here to help you grow in God's Word every day!

Please choose your age group so I can teach in a way that fits you:

1️⃣ 👶 Kids — 6–12 years old
2️⃣ 👨‍🦱 Teens — 13–17 years old
3️⃣ 🎓 Young Adults — 18–30 years old
4️⃣ 👔 Adults — 31–59 years old
5️⃣ 👴 Seniors — 60+ years old`;
}

// ── Main Menu ──────────────────────────────────────────────────────────────
export function getMainMenu(): string {
  return `📖 *BibleGuide Menu*
What would you like to do today?

1️⃣ 🌅 Daily Verse & Devotional
2️⃣ ❓ Ask a Bible Question
3️⃣ 📚 Guided Study (by book or topic)
4️⃣ 🎯 Bible Quiz
5️⃣ 🙏 Prayer Guide
0️⃣ 🔄 Change Age Group

Reply with a number or type what you need!`;
}

// ── System Prompt for Age Group ────────────────────────────────────────────
export function getSystemPromptForAgeGroup(ageGroup: AgeGroup): string {
  const basePrompt = `You are BibleGuide, a warm and knowledgeable WhatsApp Bible teaching assistant. Your mission is to help people grow in their knowledge of the Bible through daily verses, study, Q&A, devotionals, and quizzes.

**YOUR KNOWLEDGE SOURCES:**
You have access to a comprehensive Bible Knowledge Base containing:
- All 66 books of the Bible (summaries and key themes)
- Key verses organized by life topic (salvation, faith, prayer, love, strength, anxiety, forgiveness, hope, wisdom, purpose, suffering, eternal life)
- Major Christian doctrines (Trinity, Christ, Salvation, Resurrection, Holy Spirit)
- Parables, miracles, and Bible characters
- The Sermon on the Mount & The Ten Commandments
- Bible glossary and theological terms

**CRITICAL INSTRUCTIONS (FOLLOW STRICTLY):**
1. ALWAYS search the Knowledge Base FIRST for relevant verses and teachings
2. ALWAYS cite Bible verses with FULL references (e.g., "John 3:16 NIV")
3. Include verse TEXT, not just the reference
4. If a website/URL is provided, search it for additional context
5. Provide MULTIPLE relevant verses when applicable
6. Explain WHY each verse is relevant to the question

**RESPONSE QUALITY:**
- Be warm, encouraging, and non-judgmental
- Never preach — guide people gently to Scripture
- Use clear, accessible language for the age group
- Make connections between Scripture and real life
- End responses with reflection questions or action steps`;

  const ageGroupInstructions: Record<AgeGroup, string> = {
    kids: `
AGE GROUP: KIDS (6–12 years old)
- Use VERY simple words and short sentences
- Tell Bible stories in a fun, exciting way
- Add lots of emojis 🦁✨🙌
- Relate to school, friends, family, animals
- Keep responses UNDER 100 words
- End with: "Your challenge today: [simple action]"
- Be encouraging and make learning FUN!`,

    teens: `
AGE GROUP: TEENS (13–17 years old)
- Use modern, relatable language (NOT slang)
- Connect scripture to real struggles: identity, pressure, social media, friendships
- Be REAL and honest — NOT preachy
- Keep responses UNDER 150 words
- End with: "Think about this: [reflection question]"
- Acknowledge their world while pointing to Scripture`,

    young_adults: `
AGE GROUP: YOUNG ADULTS (18–30 years old)
- Go DEEPER — career, relationships, purpose, faith doubts
- Balance theology with EVERYDAY LIFE
- Acknowledge life's complexity and doubts
- Keep responses UNDER 200 words
- End with: "Apply this today: [action step]"
- Be honest about real struggles while offering biblical hope`,

    adults: `
AGE GROUP: ADULTS (31–59 years old)
- Provide THEOLOGICAL CONTEXT and depth
- Connect to family, marriage, parenting, work, community
- Offer wisdom and prayer prompts
- Keep responses UNDER 250 words
- End with: "Reflect & Pray: [prayer prompt]"
- Address the complexities of adult life with Scripture`,

    seniors: `
AGE GROUP: SENIORS (60+ years old)
- Speak with warmth, reverence, and DIGNITY
- Focus on legacy, gratitude, eternal hope, COMFORT
- Reference classic hymns and timeless truths
- Keep responses UNDER 200 words
- End with: "A blessing for you: [blessing]"
- Honour their lifetime of faith and wisdom`,
  };

  return basePrompt + (ageGroupInstructions[ageGroup] || ageGroupInstructions.adults);
}

// ── Acknowledgment Message ─────────────────────────────────────────────────
export function getAgeGroupAcknowledgment(ageGroup: AgeGroup): string {
  const label = getAgeGroupLabel(ageGroup);
  return `✅ Perfect! You selected: *${label}*

Now you can ask me anything about the Bible! Try these:

• *Daily Verse* — Get today's verse & devotional
• *Quiz* — Test your Bible knowledge
• *Question* — Ask any Bible question
• *Prayer* — Let's pray together
• *Study* — Deep dive into a Bible book or topic

Or just type what you need! 😊`;
}

// ── Daily Verse Feature ────────────────────────────────────────────────────
export function getDailyVerse(ageGroup: AgeGroup): string {
  const verses = [
    { ref: "John 3:16", text: "For God so loved the world that He gave His one and only Son, that whoever believes in Him shall not perish but have eternal life.", topic: "God's Love" },
    { ref: "Philippians 4:13", text: "I can do all this through Him who gives me strength.", topic: "Strength" },
    { ref: "Proverbs 3:5-6", text: "Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to Him, and He will make your paths straight.", topic: "Trust" },
    { ref: "Matthew 6:34", text: "Therefore do not worry about tomorrow, for tomorrow will worry about itself. Each day has enough trouble of its own.", topic: "Anxiety" },
    { ref: "Romans 8:28", text: "And we know that in all things God works for the good of those who love Him, who have been called according to His purpose.", topic: "Purpose" },
  ];

  const verse = verses[Math.floor(Math.random() * verses.length)];
  const personalization = getAgeGroupPersonalization(ageGroup);

  return `📖 *Today's Verse* — ${verse.topic}

"${verse.text}"
— ${verse.ref}

${personalization.endingPrompt.replace("[simple action]", "meditate on this verse").replace("[reflection question]", "What does this mean for you?").replace("[action step]", "Take one action based on this verse").replace("[prayer prompt]", "Pray about what this verse means").replace("[blessing]", "God blesses those who trust in Him")}`;
}

// ── Get Bible Verse by Topic ───────────────────────────────────────────────
export function getBibleVerseByTopic(topic: string, ageGroup: AgeGroup): string {
  const topicLower = topic.toLowerCase();
  const verses = BIBLE_KNOWLEDGE_BASE.topics[topicLower as keyof typeof BIBLE_KNOWLEDGE_BASE.topics];

  if (!verses || verses.length === 0) {
    return `I don't have verses specifically on "${topic}", but I can help with: salvation, faith, prayer, love, strength, anxiety, forgiveness, hope, and more. Which would you like to explore?`;
  }

  const verse = verses[Math.floor(Math.random() * verses.length)];
  const personalization = getAgeGroupPersonalization(ageGroup);

  return `📖 *Bible Verse on ${topic}*

"${verse.text}"
— ${verse.ref}

${personalization.endingPrompt}`;
}

// ── Get Parable ────────────────────────────────────────────────────────────
export function getParable(name: string, ageGroup: AgeGroup): string {
  const parables = BIBLE_KNOWLEDGE_BASE.parables;
  const parableLower = name.toLowerCase().replace(/\s/g, "_");
  const parable = parables[parableLower as keyof typeof parables];

  if (!parable) {
    return `I can share parables about: The Prodigal Son, The Good Samaritan, The Sower, The Lost Sheep, The Talents, and more. Which interests you?`;
  }

  const personalization = getAgeGroupPersonalization(ageGroup);

  return `🎓 *Parable: ${name}*

${parable}

${personalization.endingPrompt}`;
}
