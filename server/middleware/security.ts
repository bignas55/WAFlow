import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

/**
 * Security Middleware Suite
 * Hardening against common web vulnerabilities
 */

/**
 * Request size limits to prevent DoS
 */
export const requestSizeLimits = {
  json: "10mb",      // JSON payload limit
  urlencoded: "10mb", // URL-encoded form limit
  fileUpload: "50mb", // File upload limit
};

/**
 * Validate and sanitize request headers
 */
export function validateRequestHeaders(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Remove potentially dangerous headers
  delete req.headers["x-powered-by"];
  delete req.headers["x-aspnet-version"];
  delete req.headers["x-runtime-version"];

  // Validate Content-Type for POST/PUT/PATCH requests
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentType = req.get("content-type");
    if (
      contentType &&
      !contentType.includes("application/json") &&
      !contentType.includes("multipart/form-data") &&
      !contentType.includes("application/x-www-form-urlencoded")
    ) {
      return res.status(400).json({ error: "Invalid Content-Type" });
    }
  }

  next();
}

/**
 * Prevent parameter pollution
 */
export function preventParameterPollution(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // If multiple values for same param, use last one
  const sanitizeParams = (obj: any): any => {
    if (!obj) return obj;

    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        // Take the last value if array
        result[key] = value[value.length - 1];
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  req.query = sanitizeParams(req.query);
  req.params = sanitizeParams(req.params);

  next();
}

/**
 * Validate JWT structure without verifying signature
 * Used as early defense against malformed tokens
 */
export function validateJWTStructure(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    // Validate each part is valid base64url
    const base64UrlRegex = /^[A-Za-z0-9_-]*$/;
    for (const part of parts) {
      if (!base64UrlRegex.test(part)) return false;
    }

    // Try to parse header and payload
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    // Basic validation
    if (!header.alg || !header.typ) return false;
    if (!payload.userId) return false;

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Prevent CSRF attacks by validating token format
 */
export function validateCSRFToken(token: string | undefined): boolean {
  if (!token) return false;

  // Token should be 32+ characters of hex or base64url
  const validTokenRegex = /^[A-Za-z0-9_-]{32,}$/;
  return validTokenRegex.test(token);
}

/**
 * Timing-safe string comparison for sensitive operations
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    // Convert to buffers if needed
    const bufA = Buffer.isBuffer(a) ? a : Buffer.from(a);
    const bufB = Buffer.isBuffer(b) ? b : Buffer.from(b);

    // Lengths must match for timingSafeEqual
    if (bufA.length !== bufB.length) {
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  } catch (e) {
    // If comparison fails, return false
    return false;
  }
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  // RFC 5322 simplified
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate URL format to prevent open redirects
 */
export function isValidRedirectUrl(url: string, allowedDomains: string[]): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url, "http://localhost");

    // Block javascript: and data: URLs
    if (parsed.protocol === "javascript:" || parsed.protocol === "data:") {
      return false;
    }

    // If it's a relative URL (no host in parsed), allow it
    if (url.startsWith("/")) {
      return true;
    }

    // Check if domain is in allowlist
    for (const domain of allowedDomains) {
      if (parsed.hostname === domain || parsed.hostname?.endsWith(`.${domain}`)) {
        return true;
      }
    }

    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Sanitize filename for file uploads
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and special characters
  return filename
    .replace(/\.\./g, "") // Remove ..
    .replace(/[\/\\]/g, "") // Remove path separators
    .replace(/[<>:"|?*\x00-\x1f]/g, "") // Remove invalid chars
    .replace(/\s+/g, "_") // Replace spaces
    .slice(0, 255); // Limit length
}

/**
 * Rate limit key generator for IP + userId
 */
export function getRateLimitKey(req: Request, userId?: number): string {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  return userId ? `${ip}:${userId}` : ip;
}

/**
 * Validate pagination parameters
 */
export function validatePagination(
  page: any,
  limit: any,
  maxLimit: number = 100
): { page: number; limit: number } | null {
  try {
    const p = parseInt(page);
    const l = parseInt(limit);

    if (isNaN(p) || isNaN(l) || p < 1 || l < 1 || l > maxLimit) {
      return null;
    }

    return { page: p, limit: l };
  } catch (e) {
    return null;
  }
}

/**
 * Validate JSON Web Token expiration time
 */
export function validateTokenExpiration(expiresAt: Date): boolean {
  return expiresAt > new Date();
}

/**
 * Hash sensitive data for logging (don't log actual values)
 */
export function hashForLogging(value: string): string {
  const hash = require("crypto").createHash("sha256").update(value).digest("hex");
  return hash.slice(0, 8);
}

/**
 * Detect potential prompt injection attempts
 */
export function detectPromptInjection(text: string): boolean {
  const injectionPatterns = [
    /ignore\s+previous\s+instructions/i,
    /forget\s+everything\s+before/i,
    /system\s+prompt/i,
    /admin\s+mode/i,
    /\[INST\]/i,
    /\{\{.*\}\}/,
    /<%.*%>/,
    /\${.*}/,
    /`.*`/,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate phone number format (basic)
 */
export function isValidPhoneNumber(phone: string): boolean {
  // Allow E.164 format and common variations
  const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
  return phoneRegex.test(phone.replace(/\s/g, ""));
}

/**
 * Middleware to set security headers
 */
export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Enable XSS protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  next();
}
