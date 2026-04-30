import { getInsertId } from "../utils.js";
import { encryptIfNeeded } from "../services/encryptionService.js";
import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc.js";
import { db } from "../db.js";
import { users, botConfig } from "../../drizzle/schema.js";
import { eq, and, isNotNull } from "drizzle-orm";
import { signToken, verifyPassword, hashPassword, timingSafeEqual } from "../auth.js";
import { checkTwoFaRateLimit, resetTwoFaRateLimit, recordFailedLogin, resetFailedLogins, getFailedLoginCount } from "../middleware/rateLimiter.js";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { sendAlert } from "../services/alertService.js";
import { issueVerificationCode, checkVerificationCode } from "../services/emailVerificationService.js";
import { issueApprovalCode, approveSignup, declineSignup } from "../services/adminApprovalService.js";
import {
  generateTotpSecret,
  buildOtpAuthUri,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from "../services/totpService.js";
import QRCode from "qrcode";

export const authRouter = router({
  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
      totpToken: z.string().optional(),     // 6-digit TOTP code (required when 2FA enabled)
    }))
    .mutation(async ({ input, ctx }) => {
      const ip = (ctx.req.headers["x-forwarded-for"] as string || ctx.req.socket?.remoteAddress || "unknown").split(",")[0].trim();

      // Block IPs that have too many consecutive failures (brute force protection)
      const failCount = getFailedLoginCount(ip);
      if (failCount >= 15) {
        // Log alert for tenant admin visibility — too many failures from this IP
        console.warn(`🔐 [Security] Login blocked — too many failures from IP: ${ip} (${failCount} attempts)`);
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many failed attempts. Please try again later." });
      }

      const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

      if (!user) {
        const count = recordFailedLogin(ip);
        if (count === 5 || count === 10) {
          console.warn(`⚠️  [Security] ${count} failed login attempts from IP: ${ip}`);
        }
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      const valid = await verifyPassword(input.password, user.password);
      if (!valid) {
        const count = recordFailedLogin(ip);
        if (count === 5 || count === 10) {
          console.warn(`⚠️  [Security] ${count} failed login attempts from IP: ${ip} for email: ${input.email}`);
        }
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      }

      if (!user.isActive) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled" });
      }

      // Block login if email not yet verified (admin accounts are pre-verified)
      if (user.role !== "admin" && !user.emailVerified) {
        // Check if they're pending admin approval (have a verification code)
        const hasPendingApproval = user.emailVerificationCode !== null && user.emailVerificationCode !== undefined;
        throw new TRPCError({
          code: "FORBIDDEN",
          message: hasPendingApproval ? "PENDING_ADMIN_APPROVAL" : "EMAIL_NOT_VERIFIED",
        });
      }

      // 2FA check — if enabled, require valid TOTP or backup code
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        if (!input.totpToken) {
          // Signal to the client that 2FA is required
          throw new TRPCError({ code: "UNAUTHORIZED", message: "2FA_REQUIRED" });
        }

        // Rate limit 2FA attempts per IP (ip already extracted above)
        const rl = checkTwoFaRateLimit(ip);
        if (!rl.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Too many 2FA attempts. Try again in ${Math.ceil(rl.retryAfterSeconds / 60)} minutes.` });
        }

        const clean = input.totpToken.replace(/\s/g, "");
        const totpOk = verifyTotp(user.twoFactorSecret, clean);
        // Check backup codes (stored as bcrypt hashes — never plaintext)
        let backupOk = false;
        if (!totpOk && user.twoFactorBackupCodes) {
          const codes = user.twoFactorBackupCodes as string[];
          let matchIdx = -1;
          for (let i = 0; i < codes.length; i++) {
            const ok = await verifyBackupCode(clean, codes[i]);
            if (ok) { matchIdx = i; break; }
          }
          if (matchIdx >= 0) {
            backupOk = true;
            // Consume the used backup code
            const updated = [...codes];
            updated.splice(matchIdx, 1);
            await db.update(users).set({ twoFactorBackupCodes: updated }).where(eq(users.id, user.id));
          }
        }
        if (!totpOk && !backupOk) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid two-factor code" });
        }
        // On success, clear the rate-limit counter for this IP
        resetTwoFaRateLimit(ip);
      }

      // Successful login — clear brute-force counter for this IP
      resetFailedLogins(ip);

      const token = signToken({ userId: user.id, email: user.email, role: user.role, passwordVersion: user.passwordVersion ?? 1 });

      ctx.res.cookie("token", token, {
        httpOnly: true,                                      // not accessible via JS
        secure: process.env.NODE_ENV === "production",       // HTTPS only in prod
        sameSite: "strict",                                  // strict: no cross-site sends
        maxAge: 7 * 24 * 60 * 60 * 1000,                    // 7 days
        path: "/",
      });

      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

      return { id: user.id, email: user.email, name: user.name, role: user.role };
    }),

  me: protectedProcedure
    .query(async ({ ctx }) => {
      const [user] = await db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        subRole: users.subRole,
        twoFactorEnabled: users.twoFactorEnabled,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, ctx.user.userId)).limit(1);

      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      return user;
    }),

  logout: protectedProcedure
    .mutation(({ ctx }) => {
      ctx.res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });
      return { success: true };
    }),

  // ── Token refresh — sliding-window session renewal ────────────────────────
  // Called periodically by the client (e.g. on app focus or every 60 min).
  // Issues a fresh 7-day cookie so active users are never logged out.
  refresh: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Re-fetch the user to pick up any role / plan changes made since login
      const [user] = await db
        .select({ id: users.id, email: users.email, role: users.role, passwordVersion: users.passwordVersion, isActive: users.isActive })
        .from(users)
        .where(eq(users.id, ctx.user.userId))
        .limit(1);

      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      if (!user.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled" });

      const token = signToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        passwordVersion: user.passwordVersion ?? 1,
      });

      const isProduction = process.env.NODE_ENV === "production";
      ctx.res.cookie("token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "strict" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.userId)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const valid = await verifyPassword(input.currentPassword, user.password);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect current password" });

      const hashed = await hashPassword(input.newPassword);
      await db.update(users).set({
        password: hashed,
        passwordVersion: (user.passwordVersion ?? 1) + 1, // invalidates all existing sessions
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));

      return { success: true };
    }),

  // ── Forgot password — sends reset email ────────────────────────────────────
  forgotPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      // Always return success to prevent email enumeration attacks
      const [user] = await db.select({ id: users.id, name: users.name, isActive: users.isActive })
        .from(users).where(eq(users.email, input.email)).limit(1);

      if (user && user.isActive) {
        const token   = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await db.update(users).set({
          resetToken:        token,
          resetTokenExpires: expires,
        }).where(eq(users.id, user.id));

        const baseUrl  = process.env.APP_URL ?? "http://localhost:5173";
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        await sendAlert(
          "Reset your WAFlow password",
          `
          <p>Hi ${user.name},</p>
          <p>We received a request to reset your WAFlow password. Click the button below to set a new one.</p>
          <a href="${resetUrl}"
             style="display:inline-block;margin-top:16px;padding:12px 28px;background:#25D366;color:white;font-weight:bold;border-radius:8px;text-decoration:none;font-size:15px">
            Reset Password
          </a>
          <p style="color:#9ca3af;margin-top:24px;font-size:13px">
            This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
          </p>
          `,
        ).catch(err => console.warn("⚠️  Could not send password reset email:", err?.message));
      }

      return { success: true }; // always succeed — don't leak whether email exists
    }),

  // ── Validate reset token (called by reset-password page on load) ──────────
  validateResetToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const [user] = await db.select({
        id: users.id, email: users.email, resetTokenExpires: users.resetTokenExpires,
      }).from(users).where(eq(users.resetToken, input.token)).limit(1);

      if (!user) return { valid: false, reason: "invalid_token" as const };
      if (!user.resetTokenExpires || new Date() > user.resetTokenExpires) {
        return { valid: false, reason: "expired" as const };
      }
      return { valid: true, email: user.email };
    }),

  // ── Reset password using token ────────────────────────────────────────────
  resetPassword: publicProcedure
    .input(z.object({
      token:    z.string(),
      password: z.string().min(8, "Password must be at least 8 characters"),
    }))
    .mutation(async ({ input }) => {
      // Fetch user by token using DB lookup, then verify with timing-safe compare
      const [user] = await db.select().from(users)
        .where(eq(users.resetToken, input.token)).limit(1);

      // Use timing-safe comparison to prevent timing oracle on token value
      if (!user || !user.resetToken || !timingSafeEqual(user.resetToken, input.token)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired reset link" });
      }
      if (!user.resetTokenExpires || new Date() > user.resetTokenExpires) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reset link has expired. Please request a new one." });
      }

      const hashed = await hashPassword(input.password);
      await db.update(users).set({
        password:          hashed,
        passwordVersion:   (user.passwordVersion ?? 1) + 1, // invalidates all existing sessions
        resetToken:        null,
        resetTokenExpires: null,
        updatedAt:         new Date(),
      }).where(eq(users.id, user.id));

      return { success: true };
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255).optional(),
      email: z.string().email().optional(),
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.userId)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      // Update name if provided
      if (input.name) {
        updates.name = input.name;
      }

      // Update email if provided and different
      if (input.email && input.email !== user.email) {
        // Check email not already in use by another user
        const [existing] = await db.select({ id: users.id }).from(users)
          .where(eq(users.email, input.email)).limit(1);
        if (existing && existing.id !== user.id) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already in use by another account" });
        }
        updates.email = input.email;
      }

      // Update password if provided
      if (input.newPassword) {
        if (!input.currentPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Current password required to set a new password" });
        }
        const valid = await verifyPassword(input.currentPassword, user.password);
        if (!valid) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect current password" });
        }
        updates.password = await hashPassword(input.newPassword);
        updates.passwordVersion = (user.passwordVersion ?? 1) + 1; // invalidates all existing sessions
      }

      await db.update(users).set(updates as any).where(eq(users.id, user.id));

      // Return updated user info
      const [updated] = await db.select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      }).from(users).where(eq(users.id, user.id)).limit(1);

      return { success: true, user: updated };
    }),

  // ── 2FA: Begin setup — generate secret + QR ───────────────────────────────
  setup2FA: protectedProcedure.mutation(async ({ ctx }) => {
    const [user] = await db.select({ email: users.email }).from(users)
      .where(eq(users.id, ctx.user.userId)).limit(1);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    const secret = generateTotpSecret();
    // Store secret (unconfirmed) so the user can scan it
    await db.update(users).set({ twoFactorSecret: secret }).where(eq(users.id, ctx.user.userId));

    const uri = buildOtpAuthUri(secret, user.email);
    const qrDataUrl = await QRCode.toDataURL(uri);
    return { secret, qrDataUrl };
  }),

  // ── 2FA: Confirm setup — verify first TOTP code and enable ────────────────
  confirm2FA: protectedProcedure
    .input(z.object({ token: z.string().min(6).max(6) }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db.select({ twoFactorSecret: users.twoFactorSecret })
        .from(users).where(eq(users.id, ctx.user.userId)).limit(1);
      if (!user?.twoFactorSecret) throw new TRPCError({ code: "BAD_REQUEST", message: "2FA not initiated" });

      if (!verifyTotp(user.twoFactorSecret, input.token)) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid code — check your authenticator and try again" });
      }

      const backupCodes = generateBackupCodes(); // plaintext — shown to user once only
      const hashedCodes = await Promise.all(backupCodes.map(hashBackupCode));
      await db.update(users).set({
        twoFactorEnabled: true,
        twoFactorBackupCodes: hashedCodes, // store hashes only, never plaintext
        updatedAt: new Date(),
      }).where(eq(users.id, ctx.user.userId));

      return { success: true, backupCodes }; // return plaintext codes once for user to save
    }),

  // ── 2FA: Disable ──────────────────────────────────────────────────────────
  disable2FA: protectedProcedure
    .input(z.object({ password: z.string(), token: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.userId)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const valid = await verifyPassword(input.password, user.password);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password" });

      if (user.twoFactorEnabled && user.twoFactorSecret && input.token) {
        if (!verifyTotp(user.twoFactorSecret, input.token)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid two-factor code" });
        }
      }

      await db.update(users).set({
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
        updatedAt: new Date(),
      }).where(eq(users.id, ctx.user.userId));

      return { success: true };
    }),

  // ── Self-registration (public signup) ─────────────────────────────────────
  // Creates the account in an UNVERIFIED state, sends a 6-digit OTP, and
  // returns { requiresVerification: true } instead of issuing a session cookie.
  // The trial clock only starts after successful OTP verification.
  selfRegister: publicProcedure
    .input(z.object({
      businessName: z.string().min(2).max(100),
      name:         z.string().min(2).max(100),
      email:        z.string().email(),
      password:     z.string().min(8, "Password must be at least 8 characters"),
      phone:        z.string().optional(),
      timezone:     z.string().default("Africa/Johannesburg"),
      businessHoursEnabled: z.boolean().default(false),
      businessHoursStart: z.string().default("09:00"),
      businessHoursEnd: z.string().default("17:00"),
      afterHoursMessage: z.string().default(""),
    }))
    .mutation(async ({ input }) => {
      // Check email not taken
      const [existing] = await db.select({ id: users.id, emailVerified: users.emailVerified })
        .from(users).where(eq(users.email, input.email)).limit(1);

      if (existing) {
        if (!existing.emailVerified) {
          // Account exists but never verified — reissue approval code to admin
          try {
            await issueApprovalCode(existing.id, input.email, input.name, input.businessName);
          } catch (err) {
            console.error("Error reissuing approval code:", err);
            // Continue anyway
          }
          return {
            requiresVerification: true as const,
            email: input.email,
            pendingAdminApproval: true as const,
          };
        }
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
      }

      const hashed = await hashPassword(input.password);

      const result = await db.insert(users).values({
        email:                 input.email,
        password:              hashed,
        name:                  input.name,
        role:                  "user",
        isActive:              true,
        plan:                  "free",
        messageLimit:          999999,
        messagesUsedThisMonth: 0,
        billingResetAt:        new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
        monthlyPrice:          "0.00",
        inviteAccepted:        true,
        // ⚠️  Account status is 'trial_active' but trial dates are NULL until verified.
        // The trial scheduler and billedProcedure only act once trialStartDate is set.
        accountStatus:         "trial_active",
        emailVerified:         false,
      });

      const tenantId = getInsertId(result);

      // Create default bot config immediately so onboarding works post-verification
      // ⚠️ IMPORTANT: Ensure AI config has proper defaults, not undefined values
      const aiApiUrl = process.env.AI_API_URL || "https://api.groq.com/openai/v1";  // Groq as fallback
      const aiApiKey = process.env.AI_API_KEY ? encryptIfNeeded(process.env.AI_API_KEY) : "";
      const aiModel = process.env.AI_MODEL || "gemma4:latest";

      await db.insert(botConfig).values({
        tenantId,
        businessName:       input.businessName,
        systemPrompt:       `You are a professional AI receptionist for ${input.businessName}. Be helpful, friendly, and concise.`,
        timezone:           input.timezone,
        enableBusinessHours: input.businessHoursEnabled,
        businessHoursStart: input.businessHoursStart,
        businessHoursEnd:   input.businessHoursEnd,
        afterHoursMessage:  input.afterHoursMessage || `Hi! We're currently outside business hours. We'll get back to you soon. 🙏`,
        aiApiUrl,          // ✅ Always has a value (env or Groq fallback)
        aiApiKey,          // ✅ Always has a value (encrypted env or empty string)
        aiModel,           // ✅ Always has a value (env or gemma4:latest)
        updatedAt:         new Date(),
      });

      // Generate approval code for admin review
      try {
        await issueApprovalCode(tenantId, input.email, input.name, input.businessName);
      } catch (err) {
        console.error("Error issuing approval code:", err);
        // Continue anyway - user still gets the approval flow
      }

      // No cookie yet — user must be approved by admin first
      return {
        requiresVerification: true as const,
        email: input.email,
        pendingAdminApproval: true as const,
      };
    }),

  // ── Verify email OTP ───────────────────────────────────────────────────────
  // Called from the VerifyEmail page after the user enters their 6-digit code.
  // On success: sets trial dates, issues session cookie, redirects to onboarding.
  verifyEmail: publicProcedure
    .input(z.object({
      email: z.string().email(),
      code:  z.string().length(6, "Code must be exactly 6 digits"),
    }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db
        .select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive, passwordVersion: users.passwordVersion })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
      if (!user.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "Account disabled." });

      const result = await checkVerificationCode(user.id, input.code);

      if (!result.success) {
        switch (result.reason) {
          case "ALREADY_VERIFIED":
            // Let them through — maybe they're hitting the page twice
            break;
          case "EXPIRED":
            throw new TRPCError({ code: "BAD_REQUEST", message: "EXPIRED" });
          case "LOCKED":
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "LOCKED" });
          case "INVALID":
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `INVALID:${result.attemptsLeft ?? 0}`,
            });
        }
      }

      // ✅ Email confirmed — start the 14-day trial clock NOW
      const trialStart = new Date();
      const trialEnd   = new Date(trialStart);
      trialEnd.setDate(trialEnd.getDate() + 14);

      await db.update(users).set({
        trialStartDate: trialStart,
        trialEndDate:   trialEnd,
        accountStatus:  "trial_active",
        updatedAt:      new Date(),
      }).where(eq(users.id, user.id));

      // Auto-login: issue session cookie so they land straight in the app
      const token = signToken({
        userId: user.id,
        email:  input.email,
        role:   user.role,
        passwordVersion: user.passwordVersion ?? 1,
      });
      const isProduction = process.env.NODE_ENV === "production";
      ctx.res.cookie("token", token, {
        httpOnly: true,
        secure:   isProduction,
        sameSite: isProduction ? "strict" : "lax",
        maxAge:   7 * 24 * 60 * 60 * 1000,
        path:     "/",
      });

      console.log(`✅ Email verified for user ${user.id} (${input.email}) — trial started`);
      return { success: true };
    }),

  // ── Resend verification OTP ────────────────────────────────────────────────
  // Rate-limited: max 3 resends per rolling 60-minute window.
  resendVerificationCode: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      // Intentionally vague response to prevent email enumeration
      const [user] = await db
        .select({ id: users.id, name: users.name, emailVerified: users.emailVerified, isActive: users.isActive })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!user || !user.isActive || user.emailVerified) {
        // Return success silently — don't reveal whether the email exists
        return { success: true };
      }

      try {
        await issueVerificationCode(user.id, input.email, user.name, true);
      } catch (err: any) {
        if (err.message?.startsWith("RESEND_LIMIT_EXCEEDED:")) {
          const minutesLeft = err.message.split(":")[1];
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `RESEND_LIMIT:${minutesLeft}`,
          });
        }
        throw err;
      }

      return { success: true };
    }),

  // ── List pending signups (admin only) ──────────────────────────────────────
  // Shows all users awaiting admin approval
  pendingSignups: adminProcedure.query(async () => {
    const pending = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        // Match: emailVerified = false AND emailVerificationCode is not null (code was issued)
        and(
          eq(users.emailVerified, false),
          isNotNull(users.emailVerificationCode)
        )
      )
      .orderBy(users.createdAt);

    return pending;
  }),

  // ── Admin approval for new signups ─────────────────────────────────────────
  // Called by admin clicking "Approve" in the admin receptionist dashboard
  // Marks the user's email as verified and starts their trial
  approveSignup: adminProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const result = await approveSignup(input.userId);
      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.reason || "Failed to approve signup",
        });
      }
      return { success: true, message: "User account approved and trial started" };
    }),

  // ── Admin decline for new signups ──────────────────────────────────────────
  // Called by admin clicking "Decline" in the admin receptionist dashboard
  // Deletes the user account entirely
  declineSignup: adminProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const result = await declineSignup(input.userId);
      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.reason || "Failed to decline signup",
        });
      }
      return { success: true, message: "Signup declined and account deleted" };
    }),
});
