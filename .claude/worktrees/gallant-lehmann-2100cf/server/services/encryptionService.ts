/**
 * encryptionService.ts
 *
 * AES-256-GCM encryption for sensitive database fields (API keys, access tokens).
 *
 * How it works
 * ────────────
 * Every encrypted value is stored as a single colon-delimited string:
 *   enc:<hex-iv>:<hex-authTag>:<hex-ciphertext>
 *
 * This format is self-describing so we can:
 *   - detect at runtime whether a value is plaintext or encrypted
 *   - safely decrypt values without needing a separate IV column
 *
 * Key management
 * ──────────────
 * Set ENCRYPTION_KEY to a 32-byte hex string (64 hex chars) in your .env.
 * Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * ⚠️  Never change the key once encrypted data exists — you will lose all values.
 * ⚠️  Back up the key separately from the database.
 */

import crypto from "crypto";

const ALGORITHM   = "aes-256-gcm" as const;
const IV_BYTES    = 16;
const TAG_BYTES   = 16;
const ENC_PREFIX  = "enc:";

/** Resolve the encryption key from the environment, lazily. */
function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    if (process.env.NODE_ENV === "production") {
      // Hard failure in production — we never want plaintext secrets in prod DB
      throw new Error(
        "ENCRYPTION_KEY must be set to a 64-char hex string (32 bytes) in production. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    // Dev mode: use a deterministic but clearly non-production key (no real secrets in dev).
    // This is a valid 64-char hex string (32 bytes for AES-256).
    console.warn(
      "⚠️  ENCRYPTION_KEY not set — using insecure dev default. Set it in .env before going to production."
    );
    return Buffer.from("776166c0ded3f360000000000000000000000000000000000000000000000000", "hex");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext string.
 * Returns a string in the format: `enc:<hex-iv>:<hex-authTag>:<hex-ciphertext>`
 *
 * If the value is already encrypted (starts with `enc:`), it is returned unchanged.
 * If the value is empty or null, it is returned unchanged.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext || isEncrypted(plaintext)) return plaintext;

  const key = getKey();
  const iv  = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt a value previously encrypted by `encrypt()`.
 * If the value is plaintext (doesn't start with `enc:`), it is returned unchanged
 * so legacy plaintext values in the DB keep working.
 */
export function decrypt(value: string): string {
  if (!value || !isEncrypted(value)) return value;  // legacy plaintext passthrough

  const parts = value.slice(ENC_PREFIX.length).split(":");
  if (parts.length !== 3) {
    console.error("❌  encryptionService: malformed encrypted value");
    return "";
  }

  try {
    const key        = getKey();
    const iv         = Buffer.from(parts[0], "hex");
    const authTag    = Buffer.from(parts[1], "hex");
    const ciphertext = Buffer.from(parts[2], "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (e: any) {
    console.error("❌  encryptionService: decryption failed —", e.message);
    return "";
  }
}

/**
 * Returns true if the value looks like it was encrypted by this service.
 */
export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/**
 * Encrypt a value only if it is not already encrypted.
 * Safe to call multiple times on the same value.
 */
export function encryptIfNeeded(value: string): string {
  if (!value || isEncrypted(value)) return value;
  return encrypt(value);
}
