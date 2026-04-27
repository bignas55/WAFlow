/**
 * check-config.cjs
 * Shows what's saved in the database for each tenant's bot config.
 * Run with: node check-config.cjs
 */

const mysql = require("mysql2/promise");
require("dotenv").config();

async function check() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const [rows] = await conn.query(`
    SELECT
      bc.tenant_id,
      u.email,
      bc.business_name,
      LENGTH(bc.system_prompt) as prompt_length,
      LEFT(bc.system_prompt, 120) as prompt_preview,
      bc.ai_model,
      bc.updated_at
    FROM bot_config bc
    LEFT JOIN users u ON u.id = bc.tenant_id
    ORDER BY bc.tenant_id
  `);

  console.log("\n📋 Bot Config in Database:\n");
  for (const row of rows) {
    console.log(`Tenant ${row.tenant_id} (${row.email})`);
    console.log(`  Business:  ${row.business_name}`);
    console.log(`  Prompt:    ${row.prompt_length} chars — "${row.prompt_preview}..."`);
    console.log(`  Model:     ${row.ai_model}`);
    console.log(`  Updated:   ${row.updated_at}`);
    console.log();
  }

  await conn.end();
}

check().catch(console.error);
