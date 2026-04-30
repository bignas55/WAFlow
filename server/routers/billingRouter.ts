/**
 * Billing Router — admin-only subscription and plan management.
 *
 * Plans:
 *   free       — 500 messages/month, R0/month
 *   starter    — 2,000 messages/month, R299/month
 *   pro        — 10,000 messages/month, R699/month
 *   enterprise — Unlimited messages, custom price
 */

import { z } from "zod";
import { router, adminProcedure, protectedProcedure, publicProcedure } from "../trpc.js";
import { db } from "../db.js";
import { users, conversations } from "../../drizzle/schema.js";
import { eq, sql, gte, and } from "drizzle-orm";
import { verifyPaystackPayment, verifyPaystackSignature, getPlanFromAmount, getPlanExpirationDate } from "../services/paystackService.js";
import { TRPCError } from "@trpc/server";

export const PLAN_LIMITS: Record<string, { messageLimit: number; label: string; defaultPrice: number }> = {
  free:       { messageLimit: 500,    label: "Free",       defaultPrice: 0   },
  starter:    { messageLimit: 2000,   label: "Starter",    defaultPrice: 299 },
  pro:        { messageLimit: 10000,  label: "Pro",        defaultPrice: 699 },
  enterprise: { messageLimit: 999999, label: "Enterprise", defaultPrice: 0   },
};

export const billingRouter = router({
  // ── Admin: list all tenants with billing info ─────────────────────────────
  listTenantBilling: adminProcedure.query(async () => {
    const tenants = await db.select({
      id:                    users.id,
      name:                  users.name,
      email:                 users.email,
      isActive:              users.isActive,
      plan:                  users.plan,
      planExpiresAt:         users.planExpiresAt,
      messageLimit:          users.messageLimit,
      messagesUsedThisMonth: users.messagesUsedThisMonth,
      billingResetAt:        users.billingResetAt,
      monthlyPrice:          users.monthlyPrice,
      notes:                 users.notes,
      createdAt:             users.createdAt,
    }).from(users).where(eq(users.role, "user"));

    // Compute usage %
    return tenants.map(t => ({
      ...t,
      usagePct: t.messageLimit > 0
        ? Math.min(100, Math.round((t.messagesUsedThisMonth / t.messageLimit) * 100))
        : 0,
      planLabel: PLAN_LIMITS[t.plan]?.label ?? t.plan,
    }));
  }),

  // ── Admin: update a tenant's plan ─────────────────────────────────────────
  updatePlan: adminProcedure
    .input(z.object({
      tenantId:     z.number(),
      plan:         z.enum(["free", "starter", "pro", "enterprise"]),
      monthlyPrice: z.number().min(0).optional(),
      planExpiresAt:z.string().optional(), // ISO date string
      notes:        z.string().max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      const planDef = PLAN_LIMITS[input.plan];
      const price = input.monthlyPrice ?? planDef.defaultPrice;
      const expiresAt = input.planExpiresAt ? new Date(input.planExpiresAt) : null;

      await db.update(users).set({
        plan:          input.plan,
        messageLimit:  planDef.messageLimit,
        monthlyPrice:  String(price),
        planExpiresAt: expiresAt ?? undefined,
        notes:         input.notes,
        updatedAt:     new Date(),
      }).where(eq(users.id, input.tenantId));

      return { success: true };
    }),

  // ── Admin: manually reset a tenant's monthly message counter ─────────────
  resetUsage: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ input }) => {
      const nextReset = new Date();
      nextReset.setMonth(nextReset.getMonth() + 1);
      await db.update(users).set({
        messagesUsedThisMonth: 0,
        billingResetAt:        nextReset,
        updatedAt:             new Date(),
      }).where(eq(users.id, input.tenantId));
      return { success: true };
    }),

  // ── Admin: suspend / unsuspend tenant ─────────────────────────────────────
  setActive: adminProcedure
    .input(z.object({ tenantId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      await db.update(users).set({ isActive: input.isActive, updatedAt: new Date() })
        .where(eq(users.id, input.tenantId));
      return { success: true };
    }),

  // ── Tenant: get own billing status ────────────────────────────────────────
  getMyBilling: protectedProcedure.query(async ({ ctx }) => {
    const [u] = await db.select({
      plan:                  users.plan,
      planExpiresAt:         users.planExpiresAt,
      messageLimit:          users.messageLimit,
      messagesUsedThisMonth: users.messagesUsedThisMonth,
      billingResetAt:        users.billingResetAt,
      monthlyPrice:          users.monthlyPrice,
    }).from(users).where(eq(users.id, ctx.user.userId)).limit(1);

    const usagePct = u?.messageLimit > 0
      ? Math.min(100, Math.round((u.messagesUsedThisMonth / u.messageLimit) * 100))
      : 0;

    const isExpired = u?.planExpiresAt ? new Date(u.planExpiresAt) < new Date() : false;

    return { ...u, usagePct, isExpired, planLabel: PLAN_LIMITS[u?.plan ?? "free"]?.label ?? u?.plan };
  }),

  // ── Admin: platform billing summary ──────────────────────────────────────
  getSummary: adminProcedure.query(async () => {
    const tenants = await db.select({
      plan:          users.plan,
      monthlyPrice:  users.monthlyPrice,
      isActive:      users.isActive,
    }).from(users).where(eq(users.role, "user"));

    const totalMRR = tenants
      .filter(t => t.isActive)
      .reduce((sum, t) => sum + parseFloat(String(t.monthlyPrice ?? 0)), 0);

    const byPlan = Object.fromEntries(
      Object.keys(PLAN_LIMITS).map(p => [p, tenants.filter(t => t.plan === p).length])
    );

    return {
      totalTenants:   tenants.length,
      activeTenants:  tenants.filter(t => t.isActive).length,
      monthlyRevenue: Math.round(totalMRR * 100) / 100,
      byPlan,
    };
  }),

  // ── Paystack Webhook Handler ─────────────────────────────────────────────
  // Called by Paystack after successful payment
  // Upgrades user's plan when payment is verified
  paystackWebhook: publicProcedure
    .input(z.object({
      event: z.string(),
      data: z.object({
        reference: z.string(),
        amount: z.number(),
        status: z.string(),
        customer: z.object({
          email: z.string().email(),
        }),
      }),
    }))
    .mutation(async ({ input }) => {
      // Only process successful charge events
      if (input.event !== "charge.success") {
        return { success: false, reason: "Not a charge.success event" };
      }

      if (input.data.status !== "success") {
        console.warn(`⚠️  Paystack payment not successful: ${input.data.reference}`);
        return { success: false, reason: "Payment not successful" };
      }

      try {
        // Verify payment with Paystack servers (extra security check)
        const verification = await verifyPaystackPayment(input.data.reference);

        if (!verification.success) {
          console.error(`❌ Paystack verification failed for ${input.data.reference}`);
          return { success: false, reason: "Verification failed" };
        }

        // Determine which plan was purchased based on amount
        const plan = getPlanFromAmount(input.data.amount);
        const planExpiration = getPlanExpirationDate();

        // Update user's plan in database
        const result = await db.update(users).set({
          plan,
          planExpiresAt: planExpiration,
          monthlyPrice: String(PLAN_LIMITS[plan]?.defaultPrice ?? 0),
          accountStatus: "active_paid",
          updatedAt: new Date(),
        }).where(eq(users.email, input.data.customer.email));

        console.log(`✅ Payment processed for ${input.data.customer.email}: upgraded to ${plan}`);

        return {
          success: true,
          plan,
          expiresAt: planExpiration.toISOString(),
        };
      } catch (error: any) {
        console.error("❌ Paystack webhook error:", error.message);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process payment",
        });
      }
    }),

  // ── Tenant: Initiate payment (get Paystack authorization URL) ─────────────
  initializePayment: protectedProcedure
    .input(z.object({
      plan: z.enum(["starter", "pro", "enterprise"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const planDef = PLAN_LIMITS[input.plan];

      if (!planDef) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid plan",
        });
      }

      const [user] = await db.select({
        email: users.email,
        name: users.name,
      }).from(users).where(eq(users.id, ctx.user.userId)).limit(1);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // TODO: Implement createPaymentAuthorization from paystackService
      // For now, return the plan details
      return {
        success: true,
        plan: input.plan,
        amount: planDef.defaultPrice,
        email: user.email,
        message: "Payment initialization - integrate with Paystack authorization URL",
      };
    }),
});
