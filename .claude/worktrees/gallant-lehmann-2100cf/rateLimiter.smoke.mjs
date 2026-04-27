/**
 * Simple in-memory rate limiter middleware.
 * No external dependencies — uses a sliding-window counter per IP.
 *
 * Usage:
 *   app.use('/trpc/auth', authLimiter);
 *   app.use('/trpc', apiLimiter);
 */
function createRateLimiter(options) {
    const store = new Map();
    // Clean up stale entries every 5 minutes
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of store.entries()) {
            if (now - entry.windowStart > options.windowMs * 2)
                store.delete(key);
        }
    }, 5 * 60 * 1000);
    return (req, res, next) => {
        // Skip specified paths
        if (options.skipPaths?.some(p => req.path.startsWith(p))) {
            next();
            return;
        }
        const ip = (req.headers["x-forwarded-for"] ||
            req.socket?.remoteAddress ||
            "unknown").split(",")[0].trim();
        const now = Date.now();
        const key = `${ip}:${req.path}`;
        const entry = store.get(key);
        if (!entry || now - entry.windowStart > options.windowMs) {
            store.set(key, { count: 1, windowStart: now });
            next();
            return;
        }
        entry.count += 1;
        if (entry.count > options.max) {
            const retryAfter = Math.ceil((options.windowMs - (now - entry.windowStart)) / 1000);
            res.setHeader("Retry-After", String(retryAfter));
            res.status(429).json({ error: "Too many requests", message: options.message, retryAfter });
            return;
        }
        next();
    };
}
// ── Exported limiters ─────────────────────────────────────────────────────────
/** Strict limiter for auth endpoints: 10 requests / 15 min */
export const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many login attempts. Please try again in 15 minutes.",
});
/** General API limiter: 300 requests / 1 min */
export const apiLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 300,
    message: "Request limit exceeded. Please slow down.",
    skipPaths: ["/health", "/webhook"],
});
/** WhatsApp webhook limiter: 100 requests / min (from Meta) */
export const webhookLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 100,
    message: "Webhook rate limit exceeded.",
});
/**
 * In-memory 2FA attempt tracker (tRPC-level, not Express middleware).
 * Limits 2FA verify / login-with-TOTP to 5 attempts per 15 min per IP.
 */
const twoFaAttempts = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of twoFaAttempts.entries()) {
        if (now - entry.windowStart > 15 * 60 * 1000 * 2)
            twoFaAttempts.delete(key);
    }
}, 5 * 60 * 1000);
export function checkTwoFaRateLimit(ip) {
    const windowMs = 15 * 60 * 1000;
    const max = 5;
    const now = Date.now();
    const entry = twoFaAttempts.get(ip);
    if (!entry || now - entry.windowStart > windowMs) {
        twoFaAttempts.set(ip, { count: 1, windowStart: now });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    if (entry.count > max) {
        const retryAfterSeconds = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
        return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
}
export function resetTwoFaRateLimit(ip) {
    twoFaAttempts.delete(ip);
}
// ── Per-phone WhatsApp message rate limiter ───────────────────────────────────
// Prevents a single customer from flooding the AI pipeline.
// Default: max 20 inbound messages per 60 s per (tenantId + phone).
const phoneMsgStore = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of phoneMsgStore.entries()) {
        if (now - entry.windowStart > 120_000)
            phoneMsgStore.delete(key);
    }
}, 60_000);
/**
 * Check whether a specific phone number is within the allowed message rate
 * for a given tenant.  Call this inside the message pipeline before processing.
 *
 * @param tenantId  Tenant identifier (namespace the limit per tenant)
 * @param phone     Customer phone number (E.164 format)
 * @param windowMs  Sliding window duration in ms  (default: 60 000)
 * @param max       Max messages allowed per window (default: 20)
 */
export function checkPhoneMessageLimit(tenantId, phone, windowMs = 60_000, max = 20) {
    const key = `phone:${tenantId}:${phone}`;
    const now = Date.now();
    const entry = phoneMsgStore.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
        phoneMsgStore.set(key, { count: 1, windowStart: now });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    if (entry.count > max) {
        const retryAfterSeconds = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
        return { allowed: false, retryAfterSeconds };
    }
    return { allowed: true, retryAfterSeconds: 0 };
}
// ── Failed-login brute-force tracker ─────────────────────────────────────────
// Tracks consecutive failures per IP so we can log / alert on brute-force.
const failedLogins = new Map();
setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000; // purge entries older than 1 hour
    for (const [key, entry] of failedLogins.entries()) {
        if (entry.lastSeen < cutoff)
            failedLogins.delete(key);
    }
}, 10 * 60 * 1000);
export function recordFailedLogin(ip) {
    const now = Date.now();
    const entry = failedLogins.get(ip);
    if (!entry) {
        failedLogins.set(ip, { count: 1, firstSeen: now, lastSeen: now });
        return 1;
    }
    entry.count += 1;
    entry.lastSeen = now;
    return entry.count;
}
export function resetFailedLogins(ip) {
    failedLogins.delete(ip);
}
export function getFailedLoginCount(ip) {
    return failedLogins.get(ip)?.count ?? 0;
}
