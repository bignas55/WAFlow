/**
 * Unit tests — totpService.ts
 * Validates TOTP code generation, verification, backup codes, and base32.
 * No DB, no network required.
 */
import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  generateTotp,
  verifyTotp,
  base32Encode,
  buildOtpAuthUri,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from "../services/totpService.js";

// ── base32 encoding ───────────────────────────────────────────────────────────
describe("base32Encode", () => {
  it("encodes a buffer to uppercase base32 characters", () => {
    const buf = Buffer.from([0x00, 0xff, 0x0f]);
    const encoded = base32Encode(buf);
    expect(encoded).toMatch(/^[A-Z2-7]+$/);
  });

  it("encodes an empty buffer to an empty string", () => {
    expect(base32Encode(Buffer.alloc(0))).toBe("");
  });
});

// ── Secret generation ─────────────────────────────────────────────────────────
describe("generateTotpSecret", () => {
  it("returns a non-empty base32 string", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThan(0);
  });

  it("returns unique secrets on each call", () => {
    const s1 = generateTotpSecret();
    const s2 = generateTotpSecret();
    expect(s1).not.toBe(s2);
  });
});

// ── TOTP code generation & verification ──────────────────────────────────────
describe("generateTotp / verifyTotp", () => {
  it("generates a 6-digit numeric string", () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("verifies the current window code", () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret, 0); // current window
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("verifies the previous window (clock drift -30s)", () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret, -1);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("verifies the next window (clock drift +30s)", () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret, 1);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("rejects a code from 2 windows ago", () => {
    const secret = generateTotpSecret();
    const oldCode = generateTotp(secret, -2);
    expect(verifyTotp(secret, oldCode)).toBe(false);
  });

  it("rejects an invalid code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "000000")).toBe(false);
  });

  it("strips whitespace from token before verifying", () => {
    const secret = generateTotpSecret();
    const code = generateTotp(secret);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`)).toBe(true);
  });
});

// ── otpauth URI ───────────────────────────────────────────────────────────────
describe("buildOtpAuthUri", () => {
  it("returns a valid otpauth URI", () => {
    const uri = buildOtpAuthUri("JBSWY3DPEHPK3PXP", "user@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=WAFlow");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});

// ── Backup codes ──────────────────────────────────────────────────────────────
describe("generateBackupCodes / hashBackupCode / verifyBackupCode", () => {
  it("generates exactly 8 backup codes", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
  });

  it("all backup codes are 8-character hex strings", () => {
    const codes = generateBackupCodes();
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{8}$/);
    }
  });

  it("backup codes are unique", () => {
    const codes = generateBackupCodes();
    expect(new Set(codes).size).toBe(8);
  });

  it("hashes and verifies a backup code correctly", async () => {
    const [code] = generateBackupCodes();
    const hash = await hashBackupCode(code);
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyBackupCode(code, hash)).toBe(true);
  });

  it("verifyBackupCode is case-insensitive", async () => {
    const code = "ABCD1234";
    const hash = await hashBackupCode(code);
    expect(await verifyBackupCode("abcd1234", hash)).toBe(true);
    expect(await verifyBackupCode("ABCD1234", hash)).toBe(true);
  });

  it("rejects a wrong backup code", async () => {
    const hash = await hashBackupCode("AAAAAAAA");
    expect(await verifyBackupCode("BBBBBBBB", hash)).toBe(false);
  });
});
