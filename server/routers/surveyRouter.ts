import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { surveys, botConfig, conversations } from "../../drizzle/schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { sendViaWhatsAppWeb } from "../whatsapp/WhatsAppWebManager.js";

export const surveyRouter = router({

  // Overview stats ─────────────────────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({
      from: z.string().optional(),
      to:   z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user!.userId;
      const conditions = [eq(conversations.tenantId, tenantId)];

      if (input.from) conditions.push(gte(surveys.sentAt, new Date(input.from)));
      if (input.to) conditions.push(lte(surveys.sentAt, new Date(input.to)));

      const tenantSurveys = await db.select({
        id: surveys.id,
        phoneNumber: surveys.phoneNumber,
        score: surveys.score,
        feedback: surveys.feedback,
        sentAt: surveys.sentAt,
        respondedAt: surveys.respondedAt,
        status: surveys.status,
      }).from(surveys)
        .innerJoin(conversations, eq(conversations.id, surveys.conversationId))
        .where(and(...conditions))
        .orderBy(desc(surveys.respondedAt))
        .limit(1000);

      // Calculate NPS
      const responded = tenantSurveys.filter(s => s.status === "responded");
      const scored = responded.filter(s => s.score !== null);
      const promoters  = scored.filter(s => (s.score ?? 0) >= 9).length;
      const detractors = scored.filter(s => (s.score ?? 0) <= 6).length;
      const nps = scored.length ? Math.round(((promoters - detractors) / scored.length) * 100) : 0;

      const avgScore = scored.length
        ? Math.round((scored.reduce((a, b) => a + (b.score ?? 0), 0) / scored.length) * 10) / 10
        : 0;

      // Score distribution
      const dist: Record<number, number> = {};
      for (let i = 1; i <= 10; i++) dist[i] = 0;
      scored.forEach(s => { if (s.score) dist[s.score] = (dist[s.score] || 0) + 1; });

      // Recent feedback
      const recent = responded
        .filter(s => s.feedback)
        .slice(0, 20)
        .map(s => ({ phone: s.phoneNumber, score: s.score, feedback: s.feedback, date: s.respondedAt }));

      const totalSent = tenantSurveys.length;
      const totalResponded = responded.length;
      const responseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;

      return {
        totalSent,
        totalResponded,
        responseRate,
        nps,
        avgScore,
        promoters,
        passives: scored.filter(s => (s.score ?? 0) >= 7 && (s.score ?? 0) <= 8).length,
        detractors,
        distribution: dist,
        recent,
      };
    }),

  // Recent survey list with filters ────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      status: z.enum(["all", "responded", "sent", "expired"]).default("all"),
      limit:  z.number().int().default(50),
      offset: z.number().int().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const conditions = [eq(conversations.tenantId, ctx.user!.userId)];
      if (input.status !== "all") conditions.push(eq(surveys.status, input.status));

      const rows = await db.select({
        id: surveys.id,
        conversationId: surveys.conversationId,
        phoneNumber: surveys.phoneNumber,
        score: surveys.score,
        feedback: surveys.feedback,
        sentAt: surveys.sentAt,
        respondedAt: surveys.respondedAt,
        status: surveys.status,
      }).from(surveys)
        .innerJoin(conversations, eq(conversations.id, surveys.conversationId))
        .where(and(...conditions))
        .orderBy(desc(surveys.sentAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  // Request a review / send NPS survey ─────────────────────────────────────────
  requestReview: protectedProcedure
    .input(z.object({
      phoneNumber:   z.string(),
      reviewLink:    z.string().url().optional(),
      customMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.userId;
      const [cfg] = await db.select({ businessName: botConfig.businessName })
        .from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      const biz = cfg?.businessName ?? "our business";
      const link = input.reviewLink ?? "";
      const msg = input.customMessage ||
        `Hi! 😊 Thank you for visiting ${biz}. We'd love to hear about your experience!\n\n` +
        `⭐ Please take 30 seconds to leave us a review:\n${link}\n\n` +
        `Your feedback means the world to us! 🙏`;

      await sendViaWhatsAppWeb(tenantId, input.phoneNumber, msg);
      return { ok: true };
    }),
});
