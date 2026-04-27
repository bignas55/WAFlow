#!/usr/bin/env node
/**
 * Quick test script to validate configuration system
 * Usage: npx tsx test-config.ts
 */

import "dotenv/config";
import { loadConfig, validateConfig, configChecklist } from "./server/config.js";

console.log("🧪 WAFlow Configuration Validator Test\n");
console.log("=" .repeat(60));

// Test 1: Try to load configuration
console.log("\n📋 Test 1: Loading configuration...\n");
try {
  const config = loadConfig();
  console.log("✅ Configuration loaded successfully!");
  console.log(`   Environment: ${config.nodeEnv.toUpperCase()}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Database: ${config.databaseUrl.split("@")[1] || config.databaseUrl.substring(0, 30) + "..."}`);
  console.log(`   AI Model: ${config.aiModel}`);
  console.log(`   Redis: ${config.redisUrl.substring(0, 30)}...`);
} catch (err: any) {
  console.log("❌ Configuration loading failed:");
  console.log(`   Error: ${err.message}\n`);
  console.log("💡 Next steps:");
  console.log("   1. Ensure .env file exists: cp .env.example .env");
  console.log("   2. Fill in required values in .env");
  console.log("   3. See SECRETS_MANAGEMENT.md for help\n");
}

// Test 2: Validate configuration (this calls loadConfig internally)
console.log("\n📋 Test 2: Full validation with helpful messages...\n");
try {
  validateConfig();
  console.log("\n✅ All checks passed!\n");
} catch (err: any) {
  console.log(`\n❌ Validation failed: ${err.message}\n`);
}

// Test 3: Show configuration checklist
console.log("=" .repeat(60));
console.log("\n📋 Configuration Checklist Reference:\n");
console.log("🔴 REQUIRED (all environments):");
configChecklist.required.forEach(v => console.log(`   • ${v}`));

console.log("\n🟡 REQUIRED (production only):");
configChecklist.requiredProduction.forEach(v => console.log(`   • ${v}`));

console.log("\n🟢 RECOMMENDED:");
configChecklist.recommended.forEach(v => console.log(`   • ${v}`));

console.log("\n💡 OPTIONAL:");
configChecklist.optional.forEach(v => console.log(`   • ${v}`));

console.log("\n" + "=" .repeat(60));
console.log("\n📚 For more info, see:");
console.log("   • SECRETS_MANAGEMENT.md — Complete secrets guide");
console.log("   • QUICK_REFERENCE.md — One-page reference");
console.log("   • server/config.ts — Configuration validation code\n");
