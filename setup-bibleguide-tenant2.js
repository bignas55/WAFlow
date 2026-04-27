#!/usr/bin/env node
/**
 * Setup BibleGuide for Tenant 2 directly
 */
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

AGE GROUP PERSONAS:
KIDS (6–12): Simple words, Bible stories, emojis, relatable to school/friends/family. Under 100 words. End with: "Your challenge today: [action]"

TEENS (13–17): Modern language, connect to identity/pressure/social media/friendships. Real, not preachy. Under 150 words. End with: "Think about this: [reflection]"

YOUNG ADULTS (18–30): Deeper content - career, relationships, purpose, faith doubts. Balance theology with life. Under 200 words. End with: "Apply this today: [action]"

ADULTS (31–59): Theological depth, connect to family/marriage/parenting/work/community. Offer wisdom and prayer. Under 250 words. End with: "Reflect & Pray: [prompt]"

SENIORS (60+): Warmth, reverence, dignity. Focus on legacy, gratitude, eternal hope, comfort. Reference hymns. Under 200 words. End with: "A blessing for you: [blessing]"`;

async function setupTenant2() {
  let connection;
  try {
    console.log('🔧 Setting up BibleGuide for Tenant 2...\n');

    // Parse DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ DATABASE_URL not set in .env');
      process.exit(1);
    }

    const url = new URL(dbUrl);
    connection = await mysql.createConnection({
      host: url.hostname,
      port: url.port || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
    });

    console.log('✅ Connected to database\n');

    const TENANT_ID = 2;

    // Step 1: Update bot config
    console.log('📝 Step 1: Updating Tenant 2 bot config...');
    await connection.execute(
      `UPDATE bot_config
       SET enable_menu_mode = 1,
           menu_trigger = 'menu',
           menu_greeting = ?,
           business_name = 'BibleGuide',
           system_prompt = ?,
           updated_at = NOW()
       WHERE tenant_id = ?`,
      [BIBLEGUIDE_GREETING, BIBLEGUIDE_SYSTEM_PROMPT, TENANT_ID]
    );
    console.log('✅ Bot config updated!\n');

    // Step 2: Delete old menu items
    console.log('📝 Step 2: Clearing old menu items...');
    await connection.execute(
      'DELETE FROM bot_menu_options WHERE tenant_id = ?',
      [TENANT_ID]
    );
    console.log('✅ Old items cleared!\n');

    // Step 3: Insert age group menu items
    console.log('📝 Step 3: Creating age group menu items...');
    const menuItems = [
      [TENANT_ID, 1, '👶 Kids', '6–12 years old'],
      [TENANT_ID, 2, '👨‍🦱 Teens', '13–17 years old'],
      [TENANT_ID, 3, '🎓 Young Adults', '18–30 years old'],
      [TENANT_ID, 4, '👔 Adults', '31–59 years old'],
      [TENANT_ID, 5, '🧓 Seniors', '60+ years old'],
    ];

    for (const [tenantId, itemNum, title, desc] of menuItems) {
      await connection.execute(
        `INSERT INTO bot_menu_options
         (tenant_id, item_number, title, description, action_type, response, sort_order, is_active)
         VALUES (?, ?, ?, ?, 'reply', ?, ?, 1)`,
        [tenantId, itemNum, title, desc, `User selected: ${title}`, itemNum]
      );
    }
    console.log('✅ 5 age group menu items created!\n');

    // Verification
    const [config] = await connection.execute(
      'SELECT enable_menu_mode, business_name FROM bot_config WHERE tenant_id = ?',
      [TENANT_ID]
    );
    const [items] = await connection.execute(
      'SELECT item_number, title FROM bot_menu_options WHERE tenant_id = ? ORDER BY item_number',
      [TENANT_ID]
    );

    console.log('📋 VERIFICATION:\n');
    console.log(`✓ Menu Mode: ${config[0]?.enable_menu_mode === 1 ? '✅ ON' : '❌ OFF'}`);
    console.log(`✓ Business Name: ${config[0]?.business_name}\n`);
    console.log(`✓ Menu Items (${items.length}):`);
    items.forEach(item => {
      console.log(`  ${item.item_number}. ${item.title}`);
    });

    console.log('\n✅ SETUP COMPLETE!\n');
    console.log('Next steps:');
    console.log('  1. Stop the bot (Ctrl+C)');
    console.log('  2. Restart: npm run dev');
    console.log('  3. Send "hello" to the WhatsApp bot');
    console.log('  4. You should now see the BibleGuide age group menu!\n');

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}\n`);
    if (connection) await connection.end();
    process.exit(1);
  }
}

setupTenant2();
