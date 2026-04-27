/**
 * Unit tests — rateLimiter.ts
 * Tests in-memory sliding-window counters (no DB, no network).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkPhoneMessageLimit,
  checkTwoFaRateLimit,
  resetTwoFaRateLimit,
  recordFailedLogin,
  resetFailedLogins,
  getFailedLoginCount,
} from "../middleware/rateLimiter.js";

// ── Phone message rate limiter ────────────────────────────────────────────────
describe("checkPhoneMessageLimit", () => {
  it("allows first message", () => {
    const result = checkPhoneMessageLimit(1, "+27820000001", 60_000, 5);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("allows up to max messages", () => {
    const phone = "+27820000002";
    for (let i = 0; i < 5; i++) {
      const r = checkPhoneMessageLimit(1, phone, 60_000, 5);
      expect(r.allowed).toBe(true);
    }
  });

  it("blocks when limit exceeded", () => {
    const phone = "+27820000003";
    for (let i = 0; i < 5; i++) checkPhoneMessageLimit(1, phone, 60_000, 5);
    const r = checkPhoneMessageLimit(1, phone, 60_000, 5);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("namespaces limits per tenant", () => {
    const phone = "+27820000004";
    // Exhaust tenant 10's limit
    for (let i = 0; i < 5; i++) checkPhoneMessageLimit(10, phone, 60_000, 5);
    checkPhoneMessageLimit(10, phone, 60_000, 5); // 6th — blocked

    // Tenant 11 should still be fresh
    const r = checkPhoneMessageLimit(11, phone, 60_000, 5);
    expect(r.allowed).toBe(true);
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();
    const phone = "+27820000005";
    for (let i = 0; i < 6; i++) checkPhoneMessageLimit(1, phone, 1_000, 5);
    expect(checkPhoneMessageLimit(1, phone, 1_000, 5).allowed).toBe(false);

    vi.advanceTimersByTime(2_000); // skip past window

    const r = checkPhoneMessageLimit(1, phone, 1_000, 5);
    expect(r.allowed).toBe(true);
    vi.useRealTimers();
  });
});

// ── 2FA rate limiter ──────────────────────────────────────────────────────────
describe("checkTwoFaRateLimit", () => {
  const ip = "192.0.2.1";

  beforeEach(() => {
    resetTwoFaRateLimit(ip);
  });

  it("allows first 5 attempts", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkTwoFaRateLimit(ip).allowed).toBe(true);
    }
  });

  it("blocks on 6th attempt", () => {
    for (let i = 0; i < 5; i++) checkTwoFaRateLimit(ip);
    const r = checkTwoFaRateLimit(ip);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets counter after reset call", () => {
    for (let i = 0; i < 6; i++) checkTwoFaRateLimit(ip);
    resetTwoFaRateLimit(ip);
    expect(checkTwoFaRateLimit(ip).allowed).toBe(true);
  });
});

// ── Failed login brute-force tracker ─────────────────────────────────────────
describe("recordFailedLogin / resetFailedLogins", () => {
  const ip = "10.0.0.42";

  afterEach(() => {
    resetFailedLogins(ip);
  });

  it("starts at 0", () => {
    expect(getFailedLoginCount(ip)).toBe(0);
  });

  it("increments count on each failure", () => {
    expect(recordFailedLogin(ip)).toBe(1);
    expect(recordFailedLogin(ip)).toBe(2);
    expect(recordFailedLogin(ip)).toBe(3);
    expect(getFailedLoginCount(ip)).toBe(3);
  });

  it("resets to 0 after successful login", () => {
    recordFailedLogin(ip);
    recordFailedLogin(ip);
    resetFailedLogins(ip);
    expect(getFailedLoginCount(ip)).toBe(0);
  });
});
