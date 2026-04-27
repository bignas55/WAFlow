/**
 * Email Verification Service
 *
 * Handles the full OTP email-verification lifecycle:
 *   - Generates a cryptographically secure 6-digit OTP
 *   - Hashes it with bcrypt before storing (never store plaintext codes)
 *   - Sends a branded HTML email to the user
 *   - Verifies submitted codes with brute-force protection
 *   - Rate-limits resend requests (3 per hour per user)
 *
 * Future extension points:
 *   - Magic-link: swap generateOtp() for a signed JWT token sent as a URL
 *   - SMS: call a Twilio / Africa's Talking adapter instead of sendVerificationEmail()
 *   - Social login: skip this flow entirely for OAuth-verified identities
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { db } from "../db.js";
import { users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

// ── Config ────────────────────────────────────────────────────────────────────

const SMTP_HOST  = process.env.SMTP_HOST  || "";
const SMTP_PORT  = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER  = process.env.SMTP_USER  || "";
const SMTP_PASS  = process.env.SMTP_PASS  || "";
const FROM_EMAIL = process.env.SMTP_FROM  || process.env.SMTP_USER || "noreply@waflow.co.za";
const APP_URL    = process.env.APP_URL    || "http://localhost:5173";

const OTP_EXPIRY_MINUTES   = 10;
const MAX_VERIFY_ATTEMPTS  = 5;   // wrong guesses before forcing a new code
const RESEND_MAX_PER_HOUR  = 3;   // resend limit per rolling 60-minute window
const BCRYPT_ROUNDS        = 10;  // fast enough for OTPs (not password login)

// ── Transporter (lazy-init) ───────────────────────────────────────────────────

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host:   SMTP_HOST,
      port:   SMTP_PORT,
      secure: SMTP_SECURE,
      auth:   { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return _transporter;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a cryptographically secure 6-digit numeric OTP. */
export function generateOtp(): string {
  // Use crypto to get an unbiased random number in 100000–999999
  const buf = crypto.randomBytes(4);
  const num = buf.readUInt32BE(0);
  return String(100000 + (num % 900000)).padStart(6, "0");
}

/** Bcrypt-hash an OTP before storing in the DB. */
export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, BCRYPT_ROUNDS);
}

/** Timing-safe bcrypt comparison of a submitted OTP against the stored hash. */
export async function verifyOtpHash(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

// ── Email ─────────────────────────────────────────────────────────────────────

/**
 * Send the verification OTP email.
 * Falls back to console.log when SMTP is not configured (useful in dev).
 */
export async function sendVerificationEmail(
  toEmail: string,
  toName:  string,
  otp:     string,
): Promise<void> {
  const transporter = getTransporter();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your WAFlow account</title>
</head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d1a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#131320;border-radius:16px;border:1px solid rgba(255,255,255,0.07);overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0d1d12,#0a1a25);padding:32px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="display:inline-table;">
                <tr>
                  <td style="background:#25D366;border-radius:12px;padding:10px 14px;vertical-align:middle;">
                    <span style="font-size:22px;">💬</span>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">WAFlow</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="color:#9ca3af;font-size:15px;margin:0 0 8px;">Hi ${toName},</p>
              <h1 style="color:#ffffff;font-size:24px;font-weight:800;margin:0 0 16px;line-height:1.3;">
                Verify your email address
              </h1>
              <p style="color:#9ca3af;font-size:15px;line-height:1.6;margin:0 0 32px;">
                Enter the code below to activate your account and start your 14-day free trial.
                This code expires in <strong style="color:#ffffff;">${OTP_EXPIRY_MINUTES} minutes</strong>.
              </p>

              <!-- OTP Block -->
              <div style="background:#1a1a2e;border:2px solid #25D366;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px;">
                <p style="color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">Your verification code</p>
                <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#25D366;font-family:'Courier New',Courier,monospace;">
                  ${otp}
                </div>
              </div>

              <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 8px;">
                ⚡ This code can only be used once and expires at
                <strong style="color:#9ca3af;">${new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" })} SAST</strong>.
              </p>
              <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
                🔒 If you didn't create a WAFlow account, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0d0d1a;padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="color:#4b5563;font-size:12px;margin:0;text-align:center;">
                WAFlow · AI-Powered WhatsApp Receptionist ·
                <a href="${APP_URL}" style="color:#25D366;text-decoration:none;">waflow.co.za</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  if (!transporter) {
    // Dev fallback — log the OTP clearly to terminal
    console.log("\n┌─────────────────────────────────────────────┐");
    console.log(`│  📧 EMAIL VERIFICATION (no SMTP configured)   │`);
    console.log(`│  To:   ${toEmail.padEnd(37)}│`);
    console.log(`│  OTP:  ${otp.padEnd(37)}│`);
    console.log(`│  Exp:  ${OTP_EXPIRY_MINUTES} minutes${" ".repeat(29)}│`);
    console.log("└─────────────────────────────────────────────┘\n");
    return;
  }

  await transporter.sendMail({
    from:    `"WAFlow" <${FROM_EMAIL}>`,
    to:      `"${toName}" <${toEmail}>`,
    subject: "Verify your WAFlow account",
    html,
    text:    `Your WAFlow verification code is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you didn't sign up, ignore this email.`,
  });
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Issue a fresh OTP for the given user: generate → hash → store → send email.
 * Called both on signup and on resend requests.
 *
 * Throws if resend rate-limit is exceeded (3 per hour).
 */
export async function issueVerificationCode(
  userId: number,
  email:  string,
  name:   string,
  isResend = false,
): Promise<void> {
  if (isResend) {
    // Check resend rate limit: max 3 per 60-minute rolling window
    const [user] = await db
      .select({
        resendCount:    users.emailVerificationResendCount,
        resendWindowAt: users.emailVerificationResendWindowAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const now        = Date.now();
    const windowStart = user?.resendWindowAt ? new Date(user.resendWindowAt).getTime() : 0;
    const windowAge   = now - windowStart;
    const inWindow    = windowAge < 60 * 60 * 1000; // within 1 hour

    const currentCount = inWindow ? (user?.resendCount ?? 0) : 0;

    if (currentCount >= RESEND_MAX_PER_HOUR) {
      const resetIn = Math.ceil((60 * 60 * 1000 - windowAge) / 60_000);
      throw new Error(`RESEND_LIMIT_EXCEEDED:${resetIn}`);
    }

    await db.update(users).set({
      emailVerificationResendCount:    currentCount + 1,
      emailVerificationResendWindowAt: inWindow ? undefined : new Date(),
    }).where(eq(users.id, userId));
  }

  const otp     = generateOtp();
  const hash    = await hashOtp(otp);
  const expires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db.update(users).set({
    emailVerificationCode:     hash,
    emailVerificationExpires:  expires,
    emailVerificationAttempts: 0, // reset attempts on new code
  }).where(eq(users.id, userId));

  await sendVerificationEmail(email, name, otp);
}

/**
 * Verify a submitted OTP code.
 *
 * Returns:
 *   { success: true }                           — code valid
 *   { success: false, reason, attemptsLeft }    — invalid / expired / locked
 */
export async function checkVerificationCode(
  userId:      number,
  submittedOtp: string,
): Promise<
  | { success: true }
  | { success: false; reason: "EXPIRED" | "INVALID" | "LOCKED" | "ALREADY_VERIFIED"; attemptsLeft?: number }
> {
  const [user] = await db
    .select({
      emailVerified:             users.emailVerified,
      emailVerificationCode:     users.emailVerificationCode,
      emailVerificationExpires:  users.emailVerificationExpires,
      emailVerificationAttempts: users.emailVerificationAttempts,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return { success: false, reason: "INVALID" };
  if (user.emailVerified) return { success: false, reason: "ALREADY_VERIFIED" };

  // Brute-force lock
  if ((user.emailVerificationAttempts ?? 0) >= MAX_VERIFY_ATTEMPTS) {
    return { success: false, reason: "LOCKED", attemptsLeft: 0 };
  }

  // Code expiry
  if (!user.emailVerificationExpires || new Date() > new Date(user.emailVerificationExpires)) {
    return { success: false, reason: "EXPIRED" };
  }

  // Increment attempt counter BEFORE comparison (prevents race-condition bypass)
  const newAttempts = (user.emailVerificationAttempts ?? 0) + 1;
  await db.update(users)
    .set({ emailVerificationAttempts: newAttempts })
    .where(eq(users.id, userId));

  if (!user.emailVerificationCode) return { success: false, reason: "EXPIRED" };

  const match = await verifyOtpHash(submittedOtp, user.emailVerificationCode);

  if (!match) {
    const attemptsLeft = MAX_VERIFY_ATTEMPTS - newAttempts;
    return { success: false, reason: "INVALID", attemptsLeft };
  }

  // ✅ Valid — clear the code so it can't be reused
  await db.update(users).set({
    emailVerified:             true,
    emailVerificationCode:     null,
    emailVerificationExpires:  null,
    emailVerificationAttempts: 0,
  }).where(eq(users.id, userId));

  return { success: true };
}
