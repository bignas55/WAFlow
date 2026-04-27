/**
 * Unit tests — auth.ts
 * Tests JWT sign/verify, bcrypt hashing, and timing-safe comparison.
 * No DB, no network required.
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  signToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  timingSafeEqual,
  type JWTPayload,
} from "../auth.js";

// ── JWT ───────────────────────────────────────────────────────────────────────
describe("signToken / verifyToken", () => {
  const payload: JWTPayload = {
    userId: 42,
    email: "admin@waflow.io",
    role: "user",
    passwordVersion: 1,
  };

  it("signs and verifies a valid token", () => {
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(42);
    expect(decoded?.email).toBe("admin@waflow.io");
    expect(decoded?.role).toBe("user");
    expect(decoded?.passwordVersion).toBe(1);
  });

  it("returns null for a tampered token", () => {
    const token = signToken(payload);
    const parts = token.split(".");
    parts[1] = Buffer.from(JSON.stringify({ userId: 999, role: "admin" })).toString("base64url");
    const tampered = parts.join(".");
    expect(verifyToken(tampered)).toBeNull();
  });

  it("returns null for a completely invalid string", () => {
    expect(verifyToken("not.a.jwt")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });

  it("returned payload contains all expected fields", () => {
    const adminPayload: JWTPayload = { userId: 1, email: "super@admin.io", role: "admin", passwordVersion: 3 };
    const decoded = verifyToken(signToken(adminPayload));
    expect(decoded?.role).toBe("admin");
    expect(decoded?.passwordVersion).toBe(3);
  });
});

// ── Password hashing ──────────────────────────────────────────────────────────
describe("hashPassword / verifyPassword", () => {
  let hash: string;
  const plaintext = "SuperSecure!123";

  beforeAll(async () => {
    hash = await hashPassword(plaintext);
  });

  it("produces a bcrypt hash starting with $2", () => {
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  it("two hashes of the same password differ (random salt)", async () => {
    const hash2 = await hashPassword(plaintext);
    expect(hash).not.toBe(hash2);
  });

  it("verifyPassword returns true for the correct password", async () => {
    expect(await verifyPassword(plaintext, hash)).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    expect(await verifyPassword("WrongPassword!", hash)).toBe(false);
  });

  it("verifyPassword returns false for empty string", async () => {
    expect(await verifyPassword("", hash)).toBe(false);
  });
});

// ── Timing-safe comparison ────────────────────────────────────────────────────
describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(timingSafeEqual("abc123", "xyz789")).toBe(false);
  });

  it("returns false for strings of different length", () => {
    expect(timingSafeEqual("short", "longerstring")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("", "a")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(timingSafeEqual("Token", "token")).toBe(false);
  });
});
