/**
 * TOTP (RFC 6238) implementation using Node.js built-in crypto only.
 * Generates 6-digit codes compatible with Google Authenticator / Authy.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf) {
    let result = "";
    let bits = 0;
    let value = 0;
    for (let i = 0; i < buf.length; i++) {
        value = (value << 8) | buf[i];
        bits += 8;
        while (bits >= 5) {
            result += BASE32_CHARS[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0)
        result += BASE32_CHARS[(value << (5 - bits)) & 31];
    return result;
}
function base32Decode(str) {
    const s = str.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
    const bytes = [];
    let bits = 0;
    let value = 0;
    for (const char of s) {
        const idx = BASE32_CHARS.indexOf(char);
        if (idx < 0)
            continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}
/** Generate a new random 20-byte TOTP secret (base32 encoded). */
export function generateTotpSecret() {
    return base32Encode(crypto.randomBytes(20));
}
/** Generate the 6-digit TOTP code for a given secret and time window offset. */
export function generateTotp(secret, windowOffset = 0) {
    const key = base32Decode(secret);
    const counter = Math.floor(Date.now() / 1000 / 30) + windowOffset;
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buf.writeUInt32BE(counter >>> 0, 4);
    const hmac = crypto.createHmac("sha1", key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, "0");
}
/** Verify a TOTP token, allowing ±1 window for clock drift. */
export function verifyTotp(secret, token) {
    const clean = token.replace(/\s/g, "");
    return [-1, 0, 1].some(w => generateTotp(secret, w) === clean);
}
/** Build the otpauth URI used to generate a QR code. */
export function buildOtpAuthUri(secret, email, issuer = "WAFlow") {
    const label = encodeURIComponent(`${issuer}:${email}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
/** Generate 8 random one-time backup codes (plaintext — shown to user once). */
export function generateBackupCodes() {
    return Array.from({ length: 8 }, () => crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 8));
}
/**
 * Hash a backup code for safe storage (bcrypt, same as password hashing).
 * Stored in DB as a hashed value — never store plaintext.
 */
export async function hashBackupCode(code) {
    return bcrypt.hash(code, 10);
}
/**
 * Verify a user-supplied backup code against a stored bcrypt hash.
 * Uses bcrypt.compare which is timing-safe.
 */
export async function verifyBackupCode(code, hash) {
    return bcrypt.compare(code.toUpperCase(), hash);
}
