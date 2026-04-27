#!/usr/bin/env node
/**
 * BibleGuide Bot Configuration Fixer
 *
 * This script updates your bot configuration to use the correct BibleGuide greeting and menu structure.
 * Run with: node fix-bibleguide-bot.js
 *
 * Make sure your DATABASE connection is configured in your .env file before running!
 */

import { db } from "./server/db.js";
import { botConfig, botMenuOptions } from "./drizzle/schema.js";
import { eq } from "drizzle-orm";

const TENANT_ID = process.env.TENANT_ID || 1;

const BIBLEGUIDE_GREETING = `👋 Welcome to *BibleGuide* 📖🙏
I'm here to help you grow in God's Word every day!

Please choose your age group so I can teach in a way that fits you:`;

const BIBLEGUIDE_SYSTEM_PROMPT = `You are BibleGuide, a warm and knowledgeable WhatsApp Bible teaching assistant. Your mission is to help people of all ages grow in their knowledge of the Bible through daily verses, study, Q&A, devotionals, and quizzes.

PERSONALITY:
- Warm, encouraging, and non-judgmental
- Biblically accurate (use KJV, NIV, or NLT as requested)
- Never preachy — be a guide, not a lecturer
- Always end responses with a reflection question or action step

MAIN MENU (after age selected):
📖 *BibleGuide Menu*
What would you like to do today?
1️⃣ 🌅 Daily Verse & Devotional
2️⃣ ❓ Ask a Bible Question
3️⃣ 📚 Guided Study (by book or topic)
4️⃣ 🎯 Bible Quiz
5️⃣ 🙏 Prayer Guide
0️⃣ 🔄 Change Age Group

AGE GROUP PERSONAS:
KIDS (6–12): Simple words, Bible stories, emojis, relatable to school/friends/family. Under 100 words. End with: "Your challenge today: [action]"

TEENS (13–17): Modern language, connect to identity/pressure/social media/friendships. Real, not preachy. Under 150 words. End with: "Think about this: [reflection]"

YOUNG ADULTS (18–30): Deeper content - career, relationships, purpose, faith doubts. Balance theology with life. Under 200 words. End with: "Apply this today: [action]"

ADULTS (31–59): Theological depth, connect to family/marriage/parenting/work/community. Offer wisdom and prayer. Under 250 words. End with: "Reflect & Pray: [prompt]"

SENIORS (60+): Warmth, reverence, dignity. Focus on legacy, gratitude, eternal hope, comfort. Reference hymns. Under 200 words. End with: "A blessing for you: [blessing]"`;

const AGE_GROUP_MENU_ITEMS = [
  { itemNumber: 1, title: "👶 Kids", description: "6–12 years old" },
  { itemNumber: 2, title: "👨‍🦱 Teens", description: "13–17 years old" },
  { itemNumber: 3, title: "🎓 Young Adults", description: "18–30 years old" },
  { itemNumber: 4, title: "👔 Adults", description: "31–59 years old" },
  { itemNumber: 5, title: "🧓 Seniors", description: "60+ years old" },
];

async function fixBibleGuideBot() {
  try {
    console.log("🔧 Starting BibleGuide Bot Configuration Fix...\n");

    // Step 1: Update bot config
    console.log(`📝 Step 1: Updating bot configuration for tenant ${TENANT_ID}...`);
    const result = await db
      .update(botConfig)
      .set({
        enableMenuMode: 1,
        menuTrigger: "menu",
        menuGreeting: BIBLEGUIDE_GREETING,
        businessName: "BibleGuide",
        systemPrompt: BIBLEGUIDE_SYSTEM_PROMPT,
      })
      .where(eq(botConfig.tenantId, TENANT_ID));

    console.log(`✅ Bot config updated!\n`);

    // Step 2: Clear existing menu items
    console.log(`📝 Step 2: Clearing old menu items...`);
    await db.delete(botMenuOptions).where(eq(botMenuOptions.tenantId, TENANT_ID));
    console.log(`✅ Old menu items cleared!\n`);

    // Step 3: Insert age group menu items
    console.log(`📝 Step 3: Creating age group menu items...`);
    for (const item of AGE_GROUP_MENU_ITEMS) {
      await db.insert(botMenuOptions).values({
        tenantId: TENANT_ID,
        itemNumber: item.itemNumber,
        title: item.title,
        description: item.description,
        actionType: "reply",
        response: `The user selected the ${item.title} age group.`,
        sortOrder: item.itemNumber,
        isActive: 1,
      });
    }
    console.log(`✅ ${AGE_GROUP_MENU_ITEMS.length} age group menu items created!\n`);

    // Verification
    console.log(`📋 VERIFICATION:`);
    const config = await db
      .select()
      .from(botConfig)
      .where(eq(botConfig.tenantId, TENANT_ID));

    const items = await db
      .select()
      .from(botMenuOptions)
      .where(eq(botMenuOptions.tenantId, TENANT_ID));

    console.log(`\n✓ Bot Config:`);
    console.log(`  - Menu Mode Enabled: ${config[0]?.enableMenuMode === 1 ? "✅ YES" : "❌ NO"}`);
    console.log(`  - Menu Greeting: "${config[0]?.menuGreeting?.split("\n")[0]}..."`);
    console.log(`  - Business Name: ${config[0]?.businessName}`);

    console.log(`\n✓ Menu Items Created:`);
    items.forEach(item => {
      console.log(`  ${item.itemNumber}. ${item.title} (${item.description})`);
    });

    console.log(`\n🎉 SUCCESS! Your BibleGuide bot is now configured correctly!`);
    console.log(`\n📝 Next Steps:`);
    console.log(`  1. Restart your bot application`);
    console.log(`  2. Send "hello" or "hi" to test the age group greeting`);
    console.log(`  3. Select an age group (1-5) to see personalized responses`);

  } catch (error) {
    console.error(`❌ ERROR: ${error.message}`);
    console.error(`\n📝 Troubleshooting:`);
    console.error(`  • Make sure your database is configured in .env`);
    console.error(`  • Check that the tenantId (${TENANT_ID}) exists in your database`);
    console.error(`  • Verify your database credentials`);
    process.exit(1);
  }
}

// Run the fix
fixBibleGuideBot().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
