#!/usr/bin/env node
/**
 * Diagnose why the bot isn't showing BibleGuide greeting
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function diagnose() {
  let connection;
  try {
    console.log('🔍 DIAGNOSTIC CHECK\n');
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

    // Check bot_config
    console.log('📋 CHECKING BOT_CONFIG:\n');
    const [configs] = await connection.execute('SELECT tenant_id, business_name, menu_greeting, enable_menu_mode, system_prompt FROM bot_config LIMIT 5');

    if (configs.length === 0) {
      console.log('❌ No bot configs found!\n');
    } else {
      configs.forEach((config, i) => {
        console.log(`Tenant ID: ${config.tenant_id}`);
        console.log(`Business Name: ${config.business_name}`);
        console.log(`Menu Mode Enabled: ${config.enable_menu_mode}`);
        console.log(`Greeting: "${config.menu_greeting?.substring(0, 60)}..."`);
        console.log(`System Prompt contains "Bible": ${config.system_prompt?.includes('Bible') ? '✅ YES' : '❌ NO'}`);
        console.log('');
      });
    }

    // Check bot_menu_options
    console.log('📋 CHECKING BOT_MENU_OPTIONS:\n');
    const [menuItems] = await connection.execute(
      'SELECT tenant_id, item_number, title, description FROM bot_menu_options ORDER BY tenant_id, item_number LIMIT 20'
    );

    if (menuItems.length === 0) {
      console.log('❌ No menu items found!\n');
    } else {
      const grouped = {};
      menuItems.forEach(item => {
        if (!grouped[item.tenant_id]) grouped[item.tenant_id] = [];
        grouped[item.tenant_id].push(item);
      });

      Object.entries(grouped).forEach(([tenantId, items]) => {
        console.log(`Tenant ${tenantId} - ${items.length} menu items:`);
        items.forEach(item => {
          console.log(`  ${item.item_number}. ${item.title}`);
        });
        console.log('');
      });
    }

    // Check conversations to see what the bot is responding with
    console.log('📋 CHECKING RECENT CONVERSATIONS:\n');
    const [convos] = await connection.execute(`
      SELECT
        tenant_id, phone_number, message, response, source,
        created_at
      FROM conversations
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (convos.length === 0) {
      console.log('❌ No conversations found\n');
    } else {
      console.log(`Latest ${convos.length} messages:\n`);
      convos.forEach((c, i) => {
        console.log(`${i + 1}. Tenant ${c.tenant_id} | ${c.phone_number}`);
        console.log(`   User: "${c.message?.substring(0, 50)}..."`);
        console.log(`   Bot: "${c.response?.substring(0, 60)}..."`);
        console.log(`   Source: ${c.source} | Time: ${c.created_at}`);
        console.log('');
      });
    }

    // Summary
    console.log('='.repeat(60));
    console.log('\n📝 DIAGNOSIS SUMMARY:\n');

    if (configs.length > 0 && configs[0].menu_greeting?.includes('BibleGuide')) {
      console.log('✅ Database HAS been updated with BibleGuide config');
      console.log('   → Problem: Bot might be caching old config or not restarted\n');
      console.log('🔧 FIX: Kill and restart your bot application');
      console.log('   1. Press Ctrl+C to stop npm run dev');
      console.log('   2. Wait 5 seconds');
      console.log('   3. Run: npm run dev');
      console.log('   4. Send "hello" to the bot\n');
    } else if (configs.length > 0) {
      console.log('❌ Database has NOT been updated with BibleGuide config');
      console.log(`   Current greeting: "${configs[0].menu_greeting?.substring(0, 60)}..."\n`);
      console.log('🔧 FIX: Run the fix script again');
      console.log('   node apply-bibleguide-fix-final.js\n');
    }

    if (menuItems.length === 0) {
      console.log('❌ No menu items in database');
      console.log('🔧 FIX: Need to create menu items\n');
    } else if (!menuItems.some(m => m.title?.includes('Kids'))) {
      console.log('❌ Menu items exist but are NOT age groups');
      console.log(`   Found: ${menuItems.map(m => m.title).join(', ')}\n`);
      console.log('🔧 FIX: Run the fix script to update menu items\n');
    } else {
      console.log('✅ Menu items ARE age groups (correct)\n');
    }

    console.log('='.repeat(60) + '\n');

    await connection.end();

  } catch (error) {
    console.error('❌ Diagnostic error:', error.message);
    if (connection) await connection.end();
    process.exit(1);
  }
}

diagnose();
