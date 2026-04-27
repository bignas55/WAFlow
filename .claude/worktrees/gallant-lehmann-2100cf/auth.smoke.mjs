import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
// Fail fast if no secret is configured — never use a hardcoded fallback
if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === "production") {
        console.error("💥  FATAL: JWT_SECRET env var is not set. Refusing to start.");
        process.exit(1);
    }
    else {
        console.warn("⚠️  JWT_SECRET not set — using insecure dev default. Set it in .env before going to production.");
    }
}
const JWT_SECRET = process.env.JWT_SECRET || "waflow_dev_only_secret_DO_NOT_USE_IN_PROD";
const JWT_EXPIRES = "7d";
/** Timing-safe string comparison — prevents timing attacks on tokens. */
export function timingSafeEqual(a, b) {
    if (a.length !== b.length) {
        // Still run comparison to avoid length-based timing leak
        crypto.timingSafeEqual(Buffer.alloc(1), Buffer.alloc(1));
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}
export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
}
export function hashPassword(password) {
    return bcrypt.hash(password, 10);
}
export function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}
export function extractTokenFromRequest(req) {
    // Cookie first
    const cookieToken = req.cookies?.token;
    if (cookieToken)
        return cookieToken;
    // Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.slice(7);
    }
    return null;
}
export function authMiddleware(req, res, next) {
    const token = extractTokenFromRequest(req);
    if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ error: "Invalid token" });
        return;
    }
    req.user = payload;
    next();
}
