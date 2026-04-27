import { db } from "./server/db.js";
import { botMenuOptions } from "./drizzle/schema.js";
import { eq } from "drizzle-orm";

const TENANT_ID = 2; // Change to your BibleGuide tenant ID

const menuItems = [
  {
    itemNumber: 1,
    title: "👶 Kids (6–12 years old)",
    description: "Bible stories and lessons for children",
    actionType: "reply",
    tenantId: TENANT_ID,
    sortOrder: 1,
    isActive: 1,
  },
  {
    itemNumber: 2,
    title: "👨‍🦱 Teens (13–17 years old)",
    description: "Youth-focused biblical teaching",
    actionType: "reply",
    tenantId: TENANT_ID,
    sortOrder: 2,
    isActive: 1,
  },
  {
    itemNumber: 3,
    title: "🎓 Young Adults (18–30 years old)",
    description: "Relevant topics for your life stage",
    actionType: "reply",
    tenantId: TENANT_ID,
    sortOrder: 3,
    isActive: 1,
  },
  {
    itemNumber: 4,
    title: "👔 Adults (31–59 years old)",
    description: "Practical Biblical wisdom",
    actionType: "reply",
    tenantId: TENANT_ID,
    sortOrder: 4,
    isActive: 1,
  },
  {
    itemNumber: 5,
    title: "🧓 Seniors (60+ years old)",
    description: "Faith and spiritual growth",
    actionType: "reply",
    tenantId: TENANT_ID,
    sortOrder: 5,
    isActive: 1,
  },
];

async function setup() {
  try {
    // Check if items already exist
    const existing = await db
      .select()
      .from(botMenuOptions)
      .where(eq(botMenuOptions.tenantId, TENANT_ID));

    if (existing.length > 0) {
      console.log(`⚠️  Found ${existing.length} existing menu items. Keeping them to avoid duplicates.`);
      existing.forEach((item) => console.log(`  ${item.itemNumber}. ${item.title}`));
      process.exit(0);
    }

    // Create menu items
    await db.insert(botMenuOptions).values(menuItems);
    console.log("✅ BibleGuide menu items created successfully!");
    menuItems.forEach((item) => console.log(`  ${item.itemNumber}. ${item.title}`));
    process.exit(0);
  } catch (err) {
    console.error("❌ Setup failed:", err.message);
    process.exit(1);
  }
}

setup();
