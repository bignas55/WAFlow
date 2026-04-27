#!/usr/bin/env node
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

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

async function fixTenant2() {
  let connection;
  try {
    console.log('🔧 Fixing TENANT 2 - The Active Bot\n');
    console.log('='.repeat(60) + '\n');

    const dbUrl = process.env.DATABASE_URL || 'mysql://waflow:waflowpassword@localhost:3306/waflow';
    const url = new URL(dbUrl);

    connection = await mysql.createConnection({
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
    });

    console.log('✅ Connected to database\n');

    const TENANT_ID = 2;

    // Step 1: Update bot config for Tenant 2
    console.log('📝 Step 1: Updating Tenant 2 bot configuration...');
    const updateQuery = `
      UPDATE bot_config
      SET
        enable_menu_mode = 1,
        menu_trigger = 'menu',
        menu_greeting = ?,
        business_name = 'BibleGuide',
        system_prompt = ?,
        updated_at = NOW()
      WHERE tenant_id = ?
    `;

    await connection.execute(updateQuery, [BIBLEGUIDE_GREETING, BIBLEGUIDE_SYSTEM_PROMPT, TENANT_ID]);
    console.log('✅ Tenant 2 bot config updated!\n');

    // Step 2: Clear old menu items for Tenant 2
    console.log('📝 Step 2: Clearing old menu items for Tenant 2...');
    await connection.execute('DELETE FROM bot_menu_options WHERE tenant_id = ?', [TENANT_ID]);
    console.log('✅ Old menu items cleared!\n');

    // Step 3: Insert age group menu items for Tenant 2
    console.log('📝 Step 3: Creating age group menu items for Tenant 2...');

    const menuItems = [
      [TENANT_ID, 1, '👶 Kids', '6–12 years old', 'reply', 'The user selected the Kids age group (6-12).', 1, 1],
      [TENANT_ID, 2, '👨‍🦱 Teens', '13–17 years old', 'reply', 'The user selected the Teens age group (13-17).', 2, 1],
      [TENANT_ID, 3, '🎓 Young Adults', '18–30 years old', 'reply', 'The user selected the Young Adults age group (18-30).', 3, 1],
      [TENANT_ID, 4, '👔 Adults', '31–59 years old', 'reply', 'The user selected the Adults age group (31-59).', 4, 1],
      [TENANT_ID, 5, '🧓 Seniors', '60+ years old', 'reply', 'The user selected the Seniors age group (60+).', 5, 1],
    ];

    const insertQuery = `
      INSERT INTO bot_menu_options
      (tenant_id, item_number, title, description, action_type, response, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const item of menuItems) {
      await connection.execute(insertQuery, item);
    }

    console.log(`✅ ${menuItems.length} age group menu items created!\n`);

    // Verification
    console.log('📋 VERIFICATION:\n');
    const [config] = await connection.execute(
      'SELECT enable_menu_mode, menu_greeting, business_name FROM bot_config WHERE tenant_id = ?',
      [TENANT_ID]
    );
    const [items] = await connection.execute(
      'SELECT item_number, title, description FROM bot_menu_options WHERE tenant_id = ? ORDER BY sort_order',
      [TENANT_ID]
    );

    console.log(`✓ Tenant 2 Bot Config:`);
    console.log(`  - Menu Mode Enabled: ${config[0]?.enable_menu_mode === 1 ? '✅ YES' : '❌ NO'}`);
    console.log(`  - Business Name: ${config[0]?.business_name}`);
    console.log(`  - Greeting: "${config[0]?.menu_greeting?.substring(0, 50)}..."\n`);

    console.log(`✓ Tenant 2 Menu Items (${items.length}):`);
    items.forEach(item => {
      console.log(`  ${item.item_number}. ${item.title} (${item.description})`);
    });

    console.log(`\n${'='.repeat(60)}`);
    console.log(`\n🎉 TENANT 2 IS NOW CONFIGURED WITH BIBLEGUIDE!\n`);
    console.log(`📝 FINAL STEPS:`);
    console.log(`  1. ⏹️  STOP your bot: Press Ctrl+C`);
    console.log(`  2. ⏳ Wait 5 seconds`);
    console.log(`  3. ▶️  Restart: npm run dev`);
    console.log(`  4. 📱 Send "hello" to the bot on WhatsApp`);
    console.log(`  5. ✅ You should NOW see the BibleGuide greeting!\n`);
    console.log(`${'='.repeat(60)}\n`);

    await connection.end();
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}\n`);
    if (connection) await connection.end();
    process.exit(1);
  }
}

fixTenant2();
