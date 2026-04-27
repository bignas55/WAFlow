/**
 * fix-tenant-ai.cjs
 * Copies AI config from the first working tenant to all unconfigured tenants.
 * Run from your project root: node fix-tenant-ai.cjs
 */
require("dotenv").config();
const mysql = require("mysql2/promise");

async function main() {
  const pool = await mysql.createPool(process.env.DATABASE_URL);

  const ai_api_url = process.env.AI_API_URL;
  const ai_api_key = process.env.AI_API_KEY;
  const ai_model   = process.env.AI_MODEL;

  if (!ai_api_url || !ai_api_key || !ai_model) {
    console.error("❌  AI_API_URL, AI_API_KEY, or AI_MODEL not set in .env");
    await pool.end();
    process.exit(1);
  }

  console.log(`\n📋 Applying Groq config to all tenants: ${ai_model} @ ${ai_api_url}`);

  // Update all tenants that have null, empty, Ollama AI URL, or wrong model name
  const [result] = await pool.query(
    `UPDATE bot_config
     SET ai_api_url = ?, ai_api_key = ?, ai_model = ?
     WHERE ai_api_url IS NULL
        OR ai_api_url = ''
        OR ai_api_url LIKE '%localhost:11434%'
        OR ai_api_key IS NULL
        OR ai_api_key = 'ollama'
        OR ai_model IS NULL
        OR ai_model = 'llama3.2'`,
    [ai_api_url, ai_api_key, ai_model]
  );

  console.log(`✅  Updated ${result.affectedRows} tenant(s)\n`);

  // Print final state
  const [all] = await pool.query(
    "SELECT tenant_id, business_name, ai_api_url, ai_model FROM bot_config ORDER BY tenant_id"
  );
  all.forEach(r =>
    console.log(`   Tenant ${r.tenant_id}  ${r.business_name}  →  ${r.ai_api_url} / ${r.ai_model}`)
  );

  await pool.end();
  console.log("\n🎉 Done — no server restart needed.\n");
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
