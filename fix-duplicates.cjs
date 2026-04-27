/**
 * fix-duplicates.cjs
 * Removes duplicate bot_config rows, keeping the most recently updated
 * row per tenant. Also fixes any bad model values.
 * Run with: node fix-duplicates.cjs
 */

const mysql = require("mysql2/promise");
require("dotenv").config();

async function fix() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Show duplicates first
  const [dupes] = await conn.query(`
    SELECT tenant_id, COUNT(*) as count
    FROM bot_config
    GROUP BY tenant_id
    HAVING count > 1
  `);

  if (dupes.length === 0) {
    console.log("✅ No duplicates found.");
    await conn.end();
    return;
  }

  console.log(`\n🔍 Found duplicate bot_config rows for ${dupes.length} tenant(s):\n`);

  for (const { tenant_id, count } of dupes) {
    console.log(`  Tenant ${tenant_id}: ${count} rows — keeping most recent, deleting ${count - 1}`);

    // Get the ID of the best row (most recently updated, longest prompt)
    const [rows] = await conn.query(`
      SELECT id, business_name, LENGTH(system_prompt) as prompt_len, updated_at
      FROM bot_config
      WHERE tenant_id = ?
      ORDER BY updated_at DESC, LENGTH(system_prompt) DESC
      LIMIT 1
    `, [tenant_id]);

    const keepId = rows[0].id;
    console.log(`    → Keeping ID ${keepId} (${rows[0].business_name}, ${rows[0].prompt_len} chars, updated ${rows[0].updated_at})`);

    // Delete all other rows for this tenant
    const [result] = await conn.query(`
      DELETE FROM bot_config
      WHERE tenant_id = ? AND id != ?
    `, [tenant_id, keepId]);

    console.log(`    → Deleted ${result.affectedRows} duplicate row(s)`);
  }

  // Fix bad model values (label text saved instead of model ID)
  await conn.query(`
    UPDATE bot_config
    SET ai_model = 'llama-3.1-8b-instant'
    WHERE ai_model LIKE '%instant%' AND ai_model != 'llama-3.1-8b-instant'
  `);

  // Fix tenants with empty prompts
  await conn.query(`
    UPDATE bot_config
    SET system_prompt = CONCAT('You are a professional AI receptionist for ', business_name, '. Be helpful, friendly, and concise.')
    WHERE system_prompt IS NULL OR system_prompt = '' OR system_prompt = 'Processing...'
  `);

  console.log("\n✅ Duplicates cleaned up. Database is now consistent.\n");
  await conn.end();
}

fix().catch(console.error);
