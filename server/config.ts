/**
 * config.ts — Environment variable validation & configuration
 *
 * This module:
 * 1. Validates all required environment variables at startup
 * 2. Provides helpful error messages if variables are missing
 * 3. Warns about development defaults in production
 * 4. Fails fast if critical configuration is missing
 *
 * USAGE:
 *   import { config } from "./config.js";
 *   // Call at server startup (before any other code uses env vars)
 *   config.validate();
 *
 * ENVIRONMENT VARIABLES:
 *   See .env.example for complete documentation
 */

import { version } from "process";

export interface Config {
  // Database
  databaseUrl: string;
  dbConnectionLimit: number;

  // Authentication
  jwtSecret: string;
  jwtExpiresIn: string;

  // Encryption
  encryptionKey: Buffer;

  // AI
  aiApiUrl: string;
  aiApiKey: string;
  aiModel: string;

  // Application
  port: number;
  nodeEnv: "development" | "production";
  appUrl: string;
  viteApiUrl: string;

  // Redis
  redisUrl: string;
  workerConcurrency: number;

  // WhatsApp
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappAccessToken?: string;
  whatsappWebhookToken?: string;
  whatsappAppSecret?: string;

  // Email
  smtpHost?: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  alertEmail?: string;

  // Browser automation
  puppeteerExecutablePath?: string;

  // Health check
  healthCheckIntervalMin: number;
}

/**
 * Get an environment variable, or throw if required and missing
 */
function getEnv(key: string, opts?: { required?: boolean; default?: string }): string {
  const value = process.env[key];

  if (!value) {
    if (opts?.required) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return opts?.default ?? "";
  }

  return value;
}

/**
 * Parse an environment variable as an integer
 */
function getEnvInt(key: string, opts?: { required?: boolean; default?: number }): number {
  const value = getEnv(key, { required: opts?.required });
  if (!value) return opts?.default ?? 0;
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${key} must be a valid integer, got: ${value}`);
  }
  return num;
}

/**
 * Validate and load all configuration from environment variables
 */
export function loadConfig(): Config {
  const nodeEnv = (getEnv("NODE_ENV", { default: "development" }) as "development" | "production");
  const isProduction = nodeEnv === "production";

  // ─── Critical Secrets ────────────────────────────────────────────────────────

  const jwtSecret = getEnv("JWT_SECRET", { required: isProduction });
  if (jwtSecret && jwtSecret.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters (64-char hex = 32 bytes recommended). " +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  const encryptionKeyHex = getEnv("ENCRYPTION_KEY", { required: isProduction });
  let encryptionKey: Buffer;
  if (encryptionKeyHex) {
    if (encryptionKeyHex.length !== 64) {
      throw new Error(
        "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    try {
      encryptionKey = Buffer.from(encryptionKeyHex, "hex");
    } catch (err) {
      throw new Error(`ENCRYPTION_KEY must be valid hex string. Error: ${err}`);
    }
  } else {
    // Dev mode: use insecure default (clearly not for production)
    if (isProduction) {
      throw new Error(
        "ENCRYPTION_KEY is required in production. " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    console.warn(
      "⚠️  ENCRYPTION_KEY not set — using insecure dev default. " +
      "This is ONLY safe for development. DO NOT USE IN PRODUCTION."
    );
    encryptionKey = Buffer.from("776166c0ded3f360000000000000000000000000000000000000000000000000", "hex");
  }

  // ─── Database ───────────────────────────────────────────────────────────────

  const databaseUrl = getEnv("DATABASE_URL", { required: true });
  if (!databaseUrl.includes("mysql://")) {
    throw new Error("DATABASE_URL must be a valid MySQL connection string (e.g., mysql://user:pass@host:3306/db)");
  }

  // ─── Redis ──────────────────────────────────────────────────────────────────

  const redisUrl = getEnv("REDIS_URL", { default: "redis://127.0.0.1:6379" });
  if (!redisUrl.includes("redis://")) {
    throw new Error("REDIS_URL must be a valid Redis connection string (e.g., redis://host:6379)");
  }

  // ─── AI Provider ────────────────────────────────────────────────────────────

  const aiApiUrl = getEnv("AI_API_URL", { required: true });
  const aiApiKey = getEnv("AI_API_KEY", { required: true });
  const aiModel = getEnv("AI_MODEL", { required: true });

  // ─── Application ────────────────────────────────────────────────────────────

  const port = getEnvInt("PORT", { default: 3000 });
  const appUrl = getEnv("APP_URL", { required: isProduction });
  const viteApiUrl = getEnv("VITE_API_URL", { required: isProduction });

  // ─── Optional: WhatsApp (production-only warning) ───────────────────────────

  const whatsappPhoneNumberId = getEnv("WHATSAPP_PHONE_NUMBER_ID");
  const whatsappBusinessAccountId = getEnv("WHATSAPP_BUSINESS_ACCOUNT_ID");
  const whatsappAccessToken = getEnv("WHATSAPP_ACCESS_TOKEN");
  const whatsappWebhookToken = getEnv("WHATSAPP_WEBHOOK_TOKEN");
  const whatsappAppSecret = getEnv("WHATSAPP_APP_SECRET");

  if (isProduction && whatsappPhoneNumberId && !whatsappAppSecret) {
    console.warn(
      "⚠️  WhatsApp is configured but WHATSAPP_APP_SECRET is missing. " +
      "Webhook signature verification will be skipped — this is a SECURITY RISK in production."
    );
  }

  // ─── Optional: Email ────────────────────────────────────────────────────────

  const smtpHost = getEnv("SMTP_HOST");
  const smtpPort = getEnvInt("SMTP_PORT", { default: 587 });
  const smtpUser = getEnv("SMTP_USER");
  const smtpPass = getEnv("SMTP_PASS");
  const alertEmail = getEnv("ALERT_EMAIL");

  if (smtpHost && (!smtpUser || !smtpPass)) {
    console.warn(
      "⚠️  SMTP_HOST is configured but SMTP_USER or SMTP_PASS is missing. " +
      "Email alerts will not work."
    );
  }

  return {
    // Database
    databaseUrl,
    dbConnectionLimit: getEnvInt("DB_CONNECTION_LIMIT", { default: 100 }),

    // Authentication
    jwtSecret: jwtSecret || "dev_insecure_default_do_not_use_in_production",
    jwtExpiresIn: getEnv("JWT_EXPIRES_IN", { default: "7d" }),

    // Encryption
    encryptionKey,

    // AI
    aiApiUrl,
    aiApiKey,
    aiModel,

    // Application
    port,
    nodeEnv,
    appUrl: appUrl || "http://localhost:5173",
    viteApiUrl: viteApiUrl || "http://localhost:3000",

    // Redis
    redisUrl,
    workerConcurrency: getEnvInt("WORKER_CONCURRENCY", { default: 50 }),

    // WhatsApp (optional)
    whatsappPhoneNumberId: whatsappPhoneNumberId || undefined,
    whatsappBusinessAccountId: whatsappBusinessAccountId || undefined,
    whatsappAccessToken: whatsappAccessToken || undefined,
    whatsappWebhookToken: whatsappWebhookToken || undefined,
    whatsappAppSecret: whatsappAppSecret || undefined,

    // Email (optional)
    smtpHost: smtpHost || undefined,
    smtpPort,
    smtpUser: smtpUser || undefined,
    smtpPass: smtpPass || undefined,
    alertEmail: alertEmail || undefined,

    // Browser automation (optional)
    puppeteerExecutablePath: getEnv("PUPPETEER_EXECUTABLE_PATH"),

    // Health check
    healthCheckIntervalMin: getEnvInt("HEALTH_CHECK_INTERVAL_MIN", { default: 30 }),
  };
}

/**
 * Global config instance — loaded once at startup
 */
let _config: Config | null = null;

/**
 * Get the global config (lazy-loaded on first access)
 */
export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Validate configuration (call at server startup)
 * Throws if any required variables are missing
 */
export function validateConfig(): void {
  try {
    const cfg = loadConfig();
    const isProduction = cfg.nodeEnv === "production";

    console.log("✅ Configuration loaded successfully");
    console.log(`   Environment: ${cfg.nodeEnv.toUpperCase()}`);
    console.log(`   Database: ${cfg.databaseUrl.split("@")[1] || "configured"}`);
    console.log(`   AI Model: ${cfg.aiModel}`);
    console.log(`   Port: ${cfg.port}`);

    if (isProduction) {
      console.log(`   WhatsApp: ${cfg.whatsappPhoneNumberId ? "configured" : "not configured"}`);
      console.log(`   Email: ${cfg.smtpHost ? "configured" : "not configured"}`);
    }
  } catch (err: any) {
    console.error("❌ Configuration error:", err.message);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Environment Variable Checklist
 *
 * REQUIRED (all environments):
 * ✓ DATABASE_URL — MySQL connection string
 * ✓ JWT_SECRET — 64-char hex string for signing tokens
 * ✓ ENCRYPTION_KEY — 64-char hex string for encrypting secrets
 * ✓ AI_API_URL — LLM endpoint (Ollama, OpenAI, Groq, etc.)
 * ✓ AI_API_KEY — API key for LLM
 * ✓ AI_MODEL — Model name (e.g., gemma4:latest, gpt-4o-mini)
 *
 * REQUIRED (production only):
 * ✓ APP_URL — Frontend URL (http://yourfrontend.com)
 * ✓ VITE_API_URL — Backend URL (http://yourapi.com)
 *
 * RECOMMENDED (production):
 * ✓ WHATSAPP_APP_SECRET — Meta app secret (for webhook signature verification)
 * ✓ REDIS_URL — Redis connection (for message queue)
 * ✓ SMTP_HOST — Email server (for alerts)
 *
 * OPTIONAL:
 * • WHATSAPP_PHONE_NUMBER_ID — Meta WhatsApp integration
 * • WHATSAPP_BUSINESS_ACCOUNT_ID — Meta WhatsApp integration
 * • WHATSAPP_ACCESS_TOKEN — Meta WhatsApp integration
 * • TWILIO_ACCOUNT_SID — SMS fallback
 * • TWILIO_AUTH_TOKEN — SMS fallback
 * • TWILIO_PHONE_NUMBER — SMS fallback
 * • GOOGLE_CLIENT_ID — Google Calendar integration
 * • PUPPETEER_EXECUTABLE_PATH — Path to browser binary
 */

export const configChecklist = {
  required: [
    "DATABASE_URL",
    "JWT_SECRET",
    "ENCRYPTION_KEY",
    "AI_API_URL",
    "AI_API_KEY",
    "AI_MODEL",
  ],
  requiredProduction: [
    "APP_URL",
    "VITE_API_URL",
  ],
  recommended: [
    "WHATSAPP_APP_SECRET",
    "REDIS_URL",
    "SMTP_HOST",
  ],
  optional: [
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "WHATSAPP_ACCESS_TOKEN",
    "TWILIO_ACCOUNT_SID",
    "GOOGLE_CLIENT_ID",
    "PUPPETEER_EXECUTABLE_PATH",
  ],
};
