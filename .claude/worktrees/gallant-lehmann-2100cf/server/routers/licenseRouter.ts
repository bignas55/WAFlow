import { getInsertId } from "../utils.js";
import { z } from "zod";
import { eq, desc, and, isNull, isNotNull } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../trpc.js";
import { db } from "../db.js";
import { licenses, users, botConfig } from "../../drizzle/schema.js";
import { hashPassword } from "../auth.js";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { sendAlert } from "../services/alertService.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateLicenseKey(): string {
  // Format: WAFL-XXXX-XXXX-XXXX-XXXX  (20 random hex chars grouped)
  const hex = crypto.randomBytes(10).toString("hex").toUpperCase();
  return `WAFL-${hex.slice(0,4)}-${hex.slice(4,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}`;
}

function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

async function sendInviteEmail(
  clientEmail: string,
  clientName: string,
  inviteToken: string,
  licenseKey: string,
  plan: string
): Promise<void> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:5173";
  const inviteUrl = `${baseUrl}/accept-invite?token=${inviteToken}`;

  await sendAlert(
    `You've been invited to WAFlow — ${clientName}`,
    `
    <p>Hi ${clientName},</p>
    <p>Your WAFlow account has been set up and is ready to use. Click the button below to accept your invitation and set your password.</p>

    <div style="margin:24px 0">
      <p><strong>Your License Key:</strong> <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px;font-family:monospace">${licenseKey}</code></p>
      <p><strong>Plan:</strong> ${plan.charAt(0).toUpperCase() + plan.slice(1)}</p>
    </div>

    <a href="${inviteUrl}"
       style="display:inline-block;padding:12px 28px;background:#25D366;color:white;font-weight:bold;border-radius:8px;text-decoration:none;font-size:15px">
      Accept Invitation &amp; Set Password
    </a>

    <p style="color:#9ca3af;margin-top:24px;font-size:13px">
      This invitation link expires in 72 hours. If you weren't expecting this email, you can safely ignore it.
    </p>
    `,
    undefined // don't dedup invites
  ).catch(err => {
    // Don't throw — client may not have SMTP configured yet
    console.warn("⚠️  Could not send invite email:", err?.message ?? err);
  });
}

// ── WAFlow version string (used in heartbeat responses) ───────────────────────
const WAFLOW_VERSION = "1.0.0";

// ── Router ────────────────────────────────────────────────────────────────────

export const licenseRouter = router({

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN: create a new client license + optional cloud tenant account
  // ─────────────────────────────────────────────────────────────────────────
  createClient: adminProcedure
    .input(z.object({
      clientName:  z.string().min(1),
      clientEmail: z.string().email(),
      plan:        z.enum(["free", "starter", "pro", "enterprise"]).default("starter"),
      selfHosted:  z.boolean().default(false),
      notes:       z.string().optional(),
      expiresAt:   z.string().optional(), // ISO date string
    }))
    .mutation(async ({ input }) => {
      // Check email not already used
      const [existing] = await db.select({ id: licenses.id })
        .from(licenses).where(eq(licenses.clientEmail, input.clientEmail)).limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "A license for this email already exists" });
      }

      const licenseKey  = generateLicenseKey();
      const inviteToken = generateToken();
      const inviteExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

      const PLAN_LIMITS: Record<string, number> = {
        free: 500, starter: 2000, pro: 10000, enterprise: 0,
      };

      let tenantId: number | null = null;

      // For cloud-hosted clients: create a user account they can log into
      if (!input.selfHosted) {
        const [existingUser] = await db.select({ id: users.id })
          .from(users).where(eq(users.email, input.clientEmail)).limit(1);

        if (existingUser) {
          tenantId = existingUser.id;
        } else {
          // Create user with a temporary password (they'll set their own via invite)
          const tempPassword = await hashPassword(generateToken(16));
          const inserted = await db.insert(users).values({
            email:               input.clientEmail,
            password:            tempPassword,
            name:                input.clientName,
            role:                "user",
            isActive:            true,
            plan:                input.plan,
            messageLimit:        PLAN_LIMITS[input.plan] ?? 500,
            messagesUsedThisMonth: 0,
            // Set first billing reset to the first day of next month
            billingResetAt:      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
            monthlyPrice:        "0.00",
            inviteToken,
            inviteExpiresAt:     inviteExpiry,
            inviteAccepted:      false,
          });
          tenantId = Number(getInsertId(inserted));

          // Create default bot config — inherit platform AI settings from env
          await db.insert(botConfig).values({
            tenantId: tenantId!,
            businessName:     input.clientName,
            systemPrompt:     `You are a professional AI receptionist for ${input.clientName}. Be helpful, friendly, and concise.`,
            afterHoursMessage: `Hi! We're currently outside business hours. We'll get back to you soon. 🙏`,
            aiApiUrl:         process.env.AI_API_URL ?? undefined,
            aiApiKey:         process.env.AI_API_KEY ?? undefined,
            aiModel:          process.env.AI_MODEL ?? undefined,
            updatedAt:        new Date(),
          });
        }
      }

      // Insert license record
      await db.insert(licenses).values({
        licenseKey,
        tenantId,
        clientName:   input.clientName,
        clientEmail:  input.clientEmail,
        plan:         input.plan,
        expiresAt:    input.expiresAt ? new Date(input.expiresAt) : null,
        isActive:     true,
        selfHosted:   input.selfHosted,
        inviteToken,
        inviteExpiresAt: inviteExpiry,
        notes:        input.notes,
      });

      // Send invite email
      await sendInviteEmail(input.clientEmail, input.clientName, inviteToken, licenseKey, input.plan);

      return { success: true, licenseKey, inviteToken };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN: list all licenses/instances
  // ─────────────────────────────────────────────────────────────────────────
  listClients: adminProcedure.query(async () => {
    const rows = await db.select().from(licenses).orderBy(desc(licenses.createdAt));
    return rows.map(r => ({
      id:               r.id,
      licenseKey:       r.licenseKey,
      tenantId:         r.tenantId,
      clientName:       r.clientName,
      clientEmail:      r.clientEmail,
      plan:             r.plan,
      expiresAt:        r.expiresAt,
      isActive:         r.isActive,
      selfHosted:       r.selfHosted,
      instanceUrl:      r.instanceUrl,
      instanceVersion:  r.instanceVersion,
      lastHeartbeatAt:  r.lastHeartbeatAt,
      lastHeartbeatData: r.lastHeartbeatData as Record<string, unknown> | null,
      inviteAcceptedAt: r.inviteAcceptedAt,
      notes:            r.notes,
      createdAt:        r.createdAt,
      // Heartbeat freshness
      online: r.selfHosted
        ? r.lastHeartbeatAt
            ? (Date.now() - new Date(r.lastHeartbeatAt).getTime()) < 10 * 60 * 1000 // < 10 min
            : false
        : null, // null = not applicable for cloud-hosted
    }));
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN: update a license (suspend, change plan, extend expiry)
  // ─────────────────────────────────────────────────────────────────────────
  updateClient: adminProcedure
    .input(z.object({
      id:        z.number(),
      isActive:  z.boolean().optional(),
      plan:      z.enum(["free", "starter", "pro", "enterprise"]).optional(),
      expiresAt: z.string().nullable().optional(),
      notes:     z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.isActive  !== undefined) updates.isActive  = input.isActive;
      if (input.plan      !== undefined) updates.plan      = input.plan;
      if (input.notes     !== undefined) updates.notes     = input.notes;
      if (input.expiresAt !== undefined) {
        updates.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      }
      await db.update(licenses).set(updates).where(eq(licenses.id, input.id));
      return { success: true };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN: resend invite email
  // ─────────────────────────────────────────────────────────────────────────
  resendInvite: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [license] = await db.select().from(licenses).where(eq(licenses.id, input.id)).limit(1);
      if (!license) throw new TRPCError({ code: "NOT_FOUND" });

      const inviteToken  = generateToken();
      const inviteExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000);

      await db.update(licenses).set({
        inviteToken,
        inviteExpiresAt: inviteExpiry,
        updatedAt:       new Date(),
      }).where(eq(licenses.id, input.id));

      if (license.tenantId) {
        await db.update(users).set({
          inviteToken,
          inviteExpiresAt: inviteExpiry,
          inviteAccepted:  false,
        }).where(eq(users.id, license.tenantId));
      }

      await sendInviteEmail(
        license.clientEmail, license.clientName,
        inviteToken, license.licenseKey, license.plan
      );
      return { success: true };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: validate invite token + set password (accept invite page)
  // ─────────────────────────────────────────────────────────────────────────
  validateInviteToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const [user] = await db.select({
        id:             users.id,
        email:          users.email,
        name:           users.name,
        inviteExpiresAt: users.inviteExpiresAt,
        inviteAccepted: users.inviteAccepted,
      }).from(users).where(eq(users.inviteToken, input.token)).limit(1);

      if (!user) return { valid: false, reason: "invalid_token" as const };
      if (user.inviteAccepted) return { valid: false, reason: "already_accepted" as const };
      if (user.inviteExpiresAt && new Date() > user.inviteExpiresAt) {
        return { valid: false, reason: "expired" as const };
      }
      return { valid: true, email: user.email, name: user.name };
    }),

  acceptInvite: publicProcedure
    .input(z.object({
      token:    z.string(),
      password: z.string().min(8, "Password must be at least 8 characters"),
    }))
    .mutation(async ({ input }) => {
      const [user] = await db.select().from(users)
        .where(eq(users.inviteToken, input.token)).limit(1);

      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired invite link" });
      if (user.inviteAccepted) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already accepted" });
      if (user.inviteExpiresAt && new Date() > user.inviteExpiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite link has expired — please ask your admin to resend it" });
      }

      const hashed = await hashPassword(input.password);
      await db.update(users).set({
        password:       hashed,
        inviteToken:    null,
        inviteExpiresAt: null,
        inviteAccepted: true,
        isActive:       true,
      }).where(eq(users.id, user.id));

      // Mark license invite as accepted
      await db.update(licenses).set({
        inviteAcceptedAt: new Date(),
        updatedAt:        new Date(),
      }).where(eq(licenses.tenantId, user.id));

      return { success: true, email: user.email };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: self-hosted instance registers itself (called once on first boot)
  // ─────────────────────────────────────────────────────────────────────────
  registerInstance: publicProcedure
    .input(z.object({
      licenseKey:  z.string(),
      instanceUrl: z.string().url(),
      version:     z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [license] = await db.select().from(licenses)
        .where(eq(licenses.licenseKey, input.licenseKey)).limit(1);

      if (!license) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid license key" });
      if (!license.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "License is inactive" });
      if (!license.selfHosted) throw new TRPCError({ code: "BAD_REQUEST", message: "This license is for cloud hosting" });
      if (license.expiresAt && new Date() > license.expiresAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "License has expired" });
      }

      await db.update(licenses).set({
        instanceUrl:      input.instanceUrl,
        instanceVersion:  input.version ?? null,
        lastHeartbeatAt:  new Date(),
        updatedAt:        new Date(),
      }).where(eq(licenses.id, license.id));

      return {
        success:      true,
        clientName:   license.clientName,
        plan:         license.plan,
        expiresAt:    license.expiresAt,
        serverVersion: WAFLOW_VERSION,
      };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: self-hosted instance heartbeat (called every 5 minutes)
  // ─────────────────────────────────────────────────────────────────────────
  heartbeat: publicProcedure
    .input(z.object({
      licenseKey: z.string(),
      data: z.object({
        version:           z.string().optional(),
        tenantCount:       z.number().optional(),
        waConnected:       z.boolean().optional(),
        messagesLast24h:   z.number().optional(),
        uptime:            z.number().optional(),  // seconds
        memoryMB:          z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const [license] = await db.select({ id: licenses.id, isActive: licenses.isActive, expiresAt: licenses.expiresAt })
        .from(licenses).where(eq(licenses.licenseKey, input.licenseKey)).limit(1);

      if (!license || !license.isActive) {
        return { ok: false, reason: "inactive_license" };
      }
      if (license.expiresAt && new Date() > license.expiresAt) {
        return { ok: false, reason: "expired_license" };
      }

      await db.update(licenses).set({
        lastHeartbeatAt:   new Date(),
        lastHeartbeatData: (input.data ?? null) as any,
        instanceVersion:   input.data?.version ?? undefined,
        updatedAt:         new Date(),
      }).where(eq(licenses.id, license.id));

      return { ok: true, serverVersion: WAFLOW_VERSION };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: check if license key is valid (used by self-hosted WAFlow on boot)
  // ─────────────────────────────────────────────────────────────────────────
  checkLicense: publicProcedure
    .input(z.object({ licenseKey: z.string() }))
    .query(async ({ input }) => {
      const [license] = await db.select({
        isActive: licenses.isActive, expiresAt: licenses.expiresAt, plan: licenses.plan,
      }).from(licenses).where(eq(licenses.licenseKey, input.licenseKey)).limit(1);

      if (!license) return { valid: false };
      if (!license.isActive) return { valid: false, reason: "inactive" };
      if (license.expiresAt && new Date() > license.expiresAt) return { valid: false, reason: "expired" };
      return { valid: true, plan: license.plan };
    }),
});
