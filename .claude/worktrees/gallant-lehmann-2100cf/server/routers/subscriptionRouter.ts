/**
 * subscriptionRouter.ts
 *
 * Handles all subscription, trial, and billing operations.
 *
 * Procedures:
 *   subscription.status        — current plan + trial state + days left
 *   subscription.getPlans      — pricing info for all plans
 *   subscription.initPayment   — generate Easypay reference for upgrade
 *   subscription.getHistory    — payment history for tenant
 *   subscription.cancelPlan    — request cancellation (admin review)
 *   subscription.adminList     — admin: all tenants with billing status
 *   subscription.adminOverride — admin: manually set account status/plan
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";
import { db } from "../db.js";
import { users, paymentHistory } from "../../drizzle/schema.js";
import { eq, desc } from "drizzle-orm";
import { generatePaymentReference, PLAN_PRICING } from "../services/easypayService.js";
import { TRPCError } from "@trpc/server";

export const subscriptionRouter = router({

  // ── Current subscription status ───────────────────────────────────────────
  status: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db
      .select({
        plan:           users.plan,
        accountStatus:  users.accountStatus,
        trialStartDate: users.trialStartDate,
        trialEndDate:   users.trialEndDate,
        planExpiresAt:  users.planExpiresAt,
        messageLimit:   users.messageLimit,
        messagesUsedThisMonth: users.messagesUsedThisMonth,
      })
      .from(users)
      .where(eq(users.id, ctx.user.userId))
      .limit(1);

    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

    const now      = new Date();
    const endDate  = user.trialEndDate ? new Date(user.trialEndDate) : null;
    const daysLeft = endDate
      ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : null;

    const isTrialActive  = user.accountStatus === "trial_active" && (daysLeft ?? 0) > 0;
    const isTrialExpired = user.accountStatus === "trial_expired" || (user.accountStatus === "trial_active" && (daysLeft ?? 0) <= 0);
    const isPaid         = user.accountStatus === "active_paid";
    const isSuspended    = user.accountStatus === "suspended";

    return {
      plan:          user.plan,
      accountStatus: user.accountStatus,
      isTrialActive,
      isTrialExpired,
      isPaid,
      isSuspended,
      hasAccess:     isTrialActive || isPaid,
      daysLeft,
      trialEndDate:  user.trialEndDate,
      planExpiresAt: user.planExpiresAt,
      messageLimit:  user.messageLimit,
      messagesUsedThisMonth: user.messagesUsedThisMonth,
      usagePct: user.messageLimit > 0
        ? Math.min(100, Math.round((user.messagesUsedThisMonth / user.messageLimit) * 100))
        : 0,
    };
  }),

  // ── Pricing plans ─────────────────────────────────────────────────────────
  getPlans: protectedProcedure.query(() => {
    return [
      {
        id:           "trial",
        label:        "Free Trial",
        monthlyPrice: 0,
        yearlyPrice:  0,
        description:  "14 days free — no card required",
        features: [
          "500 messages/month",
          "1 WhatsApp number",
          "AI receptionist",
          "Appointment booking",
          "Basic CRM",
          "Knowledge base (5 articles)",
        ],
        cta:          "Current Plan",
        highlighted:  false,
      },
      {
        id:           "pro",
        label:        "Pro",
        monthlyPrice: PLAN_PRICING.pro.monthly,
        yearlyPrice:  PLAN_PRICING.pro.yearly,
        description:  "Everything you need to scale",
        features:     PLAN_PRICING.pro.features,
        cta:          "Upgrade to Pro",
        highlighted:  true,
        badge:        "Most Popular",
      },
      {
        id:           "enterprise",
        label:        "Enterprise",
        monthlyPrice: null,
        yearlyPrice:  null,
        description:  "Custom pricing for large teams",
        features:     PLAN_PRICING.enterprise.features,
        cta:          "Contact Sales",
        highlighted:  false,
      },
    ];
  }),

  // ── Initiate payment (generate Easypay reference) ─────────────────────────
  initPayment: protectedProcedure
    .input(z.object({
      plan:         z.enum(["pro", "enterprise"]),
      billingCycle: z.enum(["monthly", "yearly"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db
        .select({ name: users.name, email: users.email, accountStatus: users.accountStatus })
        .from(users)
        .where(eq(users.id, ctx.user.userId))
        .limit(1);

      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      if (input.plan === "enterprise") {
        // Enterprise is contact-based — no payment reference
        return {
          isEnterprise: true,
          message: "Our team will contact you within 24 hours to discuss custom pricing.",
          contactEmail: process.env.SALES_EMAIL || "sales@waflow.co.za",
        };
      }

      const result = await generatePaymentReference({
        tenantId:     ctx.user.userId,
        tenantName:   user.name,
        tenantEmail:  user.email,
        plan:         input.plan,
        billingCycle: input.billingCycle,
      });

      return { isEnterprise: false, ...result };
    }),

  // ── Payment history ───────────────────────────────────────────────────────
  getHistory: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(paymentHistory)
      .where(eq(paymentHistory.tenantId, ctx.user.userId))
      .orderBy(desc(paymentHistory.createdAt))
      .limit(50);
  }),

  // ── Admin: list all tenants with billing status ───────────────────────────
  adminList: adminProcedure.query(async () => {
    const tenants = await db.select({
      id:            users.id,
      name:          users.name,
      email:         users.email,
      plan:          users.plan,
      accountStatus: users.accountStatus,
      trialEndDate:  users.trialEndDate,
      planExpiresAt: users.planExpiresAt,
      createdAt:     users.createdAt,
      isActive:      users.isActive,
    }).from(users).where(eq(users.role, "user"));

    const now = new Date();
    return tenants.map((t) => {
      const end      = t.trialEndDate ? new Date(t.trialEndDate) : null;
      const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000)) : null;
      return { ...t, daysLeft };
    });
  }),

  // ── Admin: override account status ────────────────────────────────────────
  adminOverride: adminProcedure
    .input(z.object({
      tenantId:      z.number(),
      accountStatus: z.enum(["trial_active", "trial_expired", "active_paid", "suspended"]),
      plan:          z.enum(["free", "starter", "pro", "enterprise"]).optional(),
      extendTrialDays: z.number().min(1).max(90).optional(),
    }))
    .mutation(async ({ input }) => {
      const updates: Record<string, unknown> = {
        accountStatus: input.accountStatus,
        updatedAt:     new Date(),
      };
      if (input.plan) updates.plan = input.plan;
      if (input.extendTrialDays) {
        const newEnd = new Date();
        newEnd.setDate(newEnd.getDate() + input.extendTrialDays);
        updates.trialEndDate   = newEnd;
        updates.accountStatus  = "trial_active";
      }
      await db.update(users).set(updates as any).where(eq(users.id, input.tenantId));
      return { success: true };
    }),
});
