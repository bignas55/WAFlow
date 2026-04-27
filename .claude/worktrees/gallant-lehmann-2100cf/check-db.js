import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const url = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/waflow';
  console.log(`Checking connection to: ${url}`);
  try {
    const connection = await mysql.createConnection(url);
    console.log('✅ Database connected successfully!');
    await connection.end();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
}

check();
