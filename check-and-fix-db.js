#!/usr/bin/env node
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabase() {
  let connection;
  try {
    console.log('🔄 Checking database tables...\n');

    const dbUrl = process.env.DATABASE_URL || 'mysql://waflow:waflowpassword@localhost:3306/waflow';
    const url = new URL(dbUrl);

    connection = await mysql.createConnection({
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
    });

    console.log('✅ Connected to database\n');

    // Check what tables exist
    const [tables] = await connection.execute('SHOW TABLES');

    console.log(`Found ${tables.length} tables in 'waflow' database:\n`);

    if (tables.length === 0) {
      console.log('❌ No tables found! Database is empty.\n');
      console.log('📝 The migrations have not been run yet.\n');
      console.log('🔧 FIX: Run these commands in order:\n');
      console.log('   pnpm drizzle:generate');
      console.log('   pnpm drizzle:migrate');
      console.log('   pnpm db:seed\n');
      console.log('Then run this script again.\n');
    } else {
      tables.forEach(t => {
        const tableName = Object.values(t)[0];
        console.log(`  📋 ${tableName}`);
      });

      // Check if botConfig exists
      const tableNames = tables.map(t => Object.values(t)[0]);
      if (tableNames.includes('botConfig') || tableNames.includes('bot_config')) {
        console.log('\n✅ botConfig table exists!');
      } else {
        console.log('\n⚠️ botConfig table NOT found');
      }
    }

    await connection.end();

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (connection) await connection.end();
    process.exit(1);
  }
}

checkDatabase();
