const mysql = require("mysql2/promise");
require("dotenv").config();

async function check() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query(`
    SELECT tenant_id, name, keywords, LEFT(response, 100) as response_preview, is_active
    FROM templates
    ORDER BY tenant_id, priority DESC
  `);
  console.log("\n📋 Templates in database:\n");
  for (const row of rows) {
    console.log(`Tenant ${row.tenant_id} — "${row.name}" [active: ${row.is_active}]`);
    console.log(`  Keywords: ${row.keywords}`);
    console.log(`  Response: ${row.response_preview}...`);
    console.log();
  }
  await conn.end();
}
check().catch(console.error);
