import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { loyaltyPoints, botConfig, customers } from "../../drizzle/schema.js";
import { eq, and, sum, desc, sql } from "drizzle-orm";

// ── Tier helpers ──────────────────────────────────────────────────────────────

function getTier(total: number, cfg: { bronze: number; silver: number; gold: number }) {
  if (total >= cfg.gold)   return "Gold";
  if (total >= cfg.silver) return "Silver";
  return "Bronze";
}

export const loyaltyRouter = router({

  // Config ─────────────────────────────────────────────────────────────────────
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const [cfg] = await db.select({
      loyaltyEnabled:       botConfig.loyaltyEnabled,
      loyaltyPointsPerVisit: botConfig.loyaltyPointsPerVisit,
      loyaltyBronzeThreshold: botConfig.loyaltyBronzeThreshold,
      loyaltySilverThreshold: botConfig.loyaltySilverThreshold,
      loyaltyGoldThreshold:   botConfig.loyaltyGoldThreshold,
    }).from(botConfig).where(eq(botConfig.tenantId, ctx.user!.userId)).limit(1);
    return cfg ?? {
      loyaltyEnabled: 0, loyaltyPointsPerVisit: 10,
      loyaltyBronzeThreshold: 0, loyaltySilverThreshold: 50, loyaltyGoldThreshold: 150,
    };
  }),

  updateConfig: protectedProcedure
    .input(z.object({
      loyaltyEnabled:         z.boolean(),
      loyaltyPointsPerVisit:  z.number().int().min(1).max(1000),
      loyaltyBronzeThreshold: z.number().int().min(0),
      loyaltySilverThreshold: z.number().int().min(1),
      loyaltyGoldThreshold:   z.number().int().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.update(botConfig)
        .set({
          loyaltyEnabled:         input.loyaltyEnabled ? 1 : 0,
          loyaltyPointsPerVisit:  input.loyaltyPointsPerVisit,
          loyaltyBronzeThreshold: input.loyaltyBronzeThreshold,
          loyaltySilverThreshold: input.loyaltyBronzeThreshold,
          loyaltyGoldThreshold:   input.loyaltyGoldThreshold,
          updatedAt:              new Date(),
        })
        .where(eq(botConfig.tenantId, ctx.user!.userId));
      return { ok: true };
    }),

  // Leaderboard ────────────────────────────────────────────────────────────────
  leaderboard: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user!.userId;

      const [cfg] = await db.select({
        loyaltySilverThreshold: botConfig.loyaltySilverThreshold,
        loyaltyGoldThreshold:   botConfig.loyaltyGoldThreshold,
        loyaltyBronzeThreshold: botConfig.loyaltyBronzeThreshold,
      }).from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      const tiers = { bronze: cfg?.loyaltyBronzeThreshold ?? 0, silver: cfg?.loyaltySilverThreshold ?? 50, gold: cfg?.loyaltyGoldThreshold ?? 150 };

      const rows = await db
        .select({
          customerId:  loyaltyPoints.customerId,
          phoneNumber: loyaltyPoints.phoneNumber,
          total:       sum(loyaltyPoints.points).mapWith(Number),
        })
        .from(loyaltyPoints)
        .where(eq(loyaltyPoints.tenantId, tenantId))
        .groupBy(loyaltyPoints.customerId, loyaltyPoints.phoneNumber)
        .orderBy(desc(sum(loyaltyPoints.points)))
        .limit(input.limit);

      // Grab names from customers
      const ids = rows.map(r => r.customerId);
      const names: Record<number, string> = {};
      if (ids.length) {
        const cRows = await db.select({ id: customers.id, name: customers.name })
          .from(customers).where(sql`${customers.id} IN (${ids.join(",")})`);
        cRows.forEach(c => { names[c.id] = c.name ?? "Unknown"; });
      }

      return rows.map(r => ({
        ...r,
        name: names[r.customerId] ?? "Unknown",
        tier: getTier(r.total, tiers),
        total: r.total,
      }));
    }),

  // History for a specific customer ────────────────────────────────────────────
  customerHistory: protectedProcedure
    .input(z.object({ customerId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      return db.select().from(loyaltyPoints)
        .where(and(
          eq(loyaltyPoints.tenantId, ctx.user!.userId),
          eq(loyaltyPoints.customerId, input.customerId),
        ))
        .orderBy(desc(loyaltyPoints.createdAt))
        .limit(50);
    }),

  // Manually award points ───────────────────────────────────────────────────────
  awardPoints: protectedProcedure
    .input(z.object({
      customerId:  z.number().int(),
      phoneNumber: z.string(),
      points:      z.number().int().min(1).max(10000),
      reason:      z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(loyaltyPoints).values({
        tenantId:    ctx.user!.userId,
        customerId:  input.customerId,
        phoneNumber: input.phoneNumber,
        points:      input.points,
        reason:      input.reason,
      });
      return { ok: true };
    }),

  // Stats summary ───────────────────────────────────────────────────────────────
  stats: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user!.userId;
    const [cfg] = await db.select({
      loyaltySilverThreshold: botConfig.loyaltySilverThreshold,
      loyaltyGoldThreshold:   botConfig.loyaltyGoldThreshold,
      loyaltyBronzeThreshold: botConfig.loyaltyBronzeThreshold,
    }).from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);
    const tiers = { bronze: cfg?.loyaltyBronzeThreshold ?? 0, silver: cfg?.loyaltySilverThreshold ?? 50, gold: cfg?.loyaltyGoldThreshold ?? 150 };

    const totalsResult = await db
      .select({
        customerId: loyaltyPoints.customerId,
        total:      sum(loyaltyPoints.points).mapWith(Number),
      })
      .from(loyaltyPoints)
      .where(eq(loyaltyPoints.tenantId, tenantId))
      .groupBy(loyaltyPoints.customerId);

    let bronze = 0, silver = 0, gold = 0, totalPts = 0;
    totalsResult.forEach(r => {
      totalPts += r.total;
      const t = getTier(r.total, tiers);
      if (t === "Gold") gold++;
      else if (t === "Silver") silver++;
      else bronze++;
    });

    return { totalMembers: totalsResult.length, bronze, silver, gold, totalPointsIssued: totalPts };
  }),
});
