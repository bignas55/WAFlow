#!/usr/bin/env node
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function runMigrations() {
  let connection;
  try {
    console.log('🔄 Applying database migrations...\n');

    const dbUrl = process.env.DATABASE_URL || 'mysql://waflow:waflowpassword@localhost:3306/waflow';
    const url = new URL(dbUrl);

    connection = await mysql.createConnection({
      host: url.hostname,
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
    });

    console.log('✅ Connected to database\n');

    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'drizzle/migrations/0000_goofy_misty_knight.sql');
    let sql = fs.readFileSync(migrationPath, 'utf8');

    // Split by statement breakpoint
    const statements = sql
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let count = 0;
    for (const statement of statements) {
      try {
        await connection.execute(statement);
        count++;
        const tableName = statement.match(/CREATE TABLE `([^`]+)`/)?.[1] || 'unknown';
        console.log(`  ✅ Created table: ${tableName}`);
      } catch (error) {
        // Table might already exist, that's ok
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          const tableName = statement.match(/CREATE TABLE `([^`]+)`/)?.[1] || 'unknown';
          console.log(`  ℹ️  Table already exists: ${tableName}`);
          count++;
        } else {
          console.error(`  ❌ Error: ${error.message}`);
        }
      }
    }

    console.log(`\n✅ Successfully created/verified ${count} tables!\n`);

    // Verify botConfig exists
    const [tables] = await connection.execute("SHOW TABLES LIKE 'botConfig'");
    if (tables.length > 0) {
      console.log('✅ botConfig table is ready!\n');
    }

    await connection.end();
    return true;

  } catch (error) {
    console.error('❌ Error running migrations:', error.message);
    if (connection) await connection.end();
    return false;
  }
}

async function main() {
  const success = await runMigrations();

  if (success) {
    console.log('📝 Now running the BibleGuide fix...\n');
    console.log('Execute: node apply-bibleguide-fix.js\n');
  } else {
    console.log('⚠️  Migration failed. Check your database connection.');
    process.exit(1);
  }
}

main();
