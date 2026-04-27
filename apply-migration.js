import mysql from 'mysql2/promise.js';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'waflow',
  password: 'waflowpassword',
  database: 'waflow',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function applyMigration() {
  const connection = await pool.getConnection();
  try {
    console.log('Applying migration...');

    // Check if columns exist before adding
    const result = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'conversations'
      AND COLUMN_NAME IN ('model_used', 'used_fallback')
    `);

    const existingColumns = result[0].map(row => row.COLUMN_NAME);

    if (!existingColumns.includes('model_used')) {
      await connection.execute(
        `ALTER TABLE conversations ADD COLUMN model_used varchar(50) DEFAULT 'groq'`
      );
      console.log('✓ Added model_used column');
    } else {
      console.log('✓ model_used column already exists');
    }

    if (!existingColumns.includes('used_fallback')) {
      await connection.execute(
        `ALTER TABLE conversations ADD COLUMN used_fallback boolean DEFAULT false NOT NULL`
      );
      console.log('✓ Added used_fallback column');
    } else {
      console.log('✓ used_fallback column already exists');
    }

    console.log('\n✅ Migration applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.release();
    await pool.end();
  }
}

applyMigration();
