import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { conversations, agents, conversationAssignments, templates } from "../../drizzle/schema.js";
import { desc, gte, sql, eq, and } from "drizzle-orm";

const PERIOD_DAYS: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };

export const advancedRouter = router({
  analytics: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "14d", "30d", "90d"]).default("14d") }))
    .query(async ({ input }) => {
      const days = PERIOD_DAYS[input.period] || 14;
      const since = new Date(Date.now() - days * 86400000);

      const [allRows, byHour, byDay, bySentiment, byLanguage, bySource, topTemplateRows, escalationByDay, avgRespByDay] = await Promise.all([
        db.select({ count: sql<number>`COUNT(*)` }).from(conversations).where(gte(conversations.createdAt, since)),
        db.select({ hour: sql<number>`HOUR(created_at)`, count: sql<number>`COUNT(*)` }).from(conversations).where(gte(conversations.createdAt, since)).groupBy(sql`HOUR(created_at)`),
        db.select({ date: sql<string>`DATE(created_at)`, source: conversations.source, count: sql<number>`COUNT(*)` }).from(conversations).where(gte(conversations.createdAt, since)).groupBy(sql`DATE(created_at)`, conversations.source),
        db.select({ sentiment: conversations.sentiment, count: sql<number>`COUNT(*)` }).from(conversations).where(gte(conversations.createdAt, since)).groupBy(conversations.sentiment),
        db.select({ language: conversations.language, count: sql<number>`COUNT(*)` }).from(conversations).where(gte(conversations.createdAt, since)).groupBy(conversations.language),
        db.select({ source: conversations.source, count: sql<number>`COUNT(*)` }).from(conversations).where(gte(conversations.createdAt, since)).groupBy(conversations.source),
        db.select({ id: templates.id, name: templates.name, count: templates.matchCount }).from(templates).orderBy(desc(templates.matchCount)).limit(5),
        // Escalations per day
        db.select({
          date:      sql<string>`DATE(created_at)`,
          total:     sql<number>`COUNT(*)`,
          escalated: sql<number>`SUM(CASE WHEN is_escalated = 1 THEN 1 ELSE 0 END)`,
        }).from(conversations).where(gte(conversations.createdAt, since)).groupBy(sql`DATE(created_at)`),
        // Avg response time per day
        db.select({
          date:    sql<string>`DATE(created_at)`,
          avgMs:   sql<number>`AVG(CASE WHEN response_time_ms IS NOT NULL THEN response_time_ms END)`,
        }).from(conversations).where(gte(conversations.createdAt, since)).groupBy(sql`DATE(created_at)`),
      ]);

      const total = Number(allRows[0]?.count || 0);
      const sourceMap: Record<string, number> = {};
      for (const r of bySource) sourceMap[r.source] = Number(r.count);
      const aiCount = (sourceMap.ai || 0) + (sourceMap.template || 0);

      // Build daily messages array
      const dailyMap: Record<string, { total: number; aiHandled: number }> = {};
      for (const r of byDay) {
        if (!dailyMap[r.date]) dailyMap[r.date] = { total: 0, aiHandled: 0 };
        dailyMap[r.date].total += Number(r.count);
        if (r.source === "ai" || r.source === "template") dailyMap[r.date].aiHandled += Number(r.count);
      }
      const dailyMessages = Object.entries(dailyMap).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));

      // Build hourly
      const hourlyMap: Record<number, number> = {};
      for (const r of byHour) hourlyMap[Number(r.hour)] = Number(r.count);
      const hourlyMessages = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, count: hourlyMap[h] || 0 }));

      // Build AI vs Human per day
      const aiVsHumanMap: Record<string, { ai: number; human: number }> = {};
      for (const r of byDay) {
        if (!aiVsHumanMap[r.date]) aiVsHumanMap[r.date] = { ai: 0, human: 0 };
        if (r.source === "ai" || r.source === "template") aiVsHumanMap[r.date].ai += Number(r.count);
        else aiVsHumanMap[r.date].human += Number(r.count);
      }
      const aiVsHuman = Object.entries(aiVsHumanMap).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));

      // Escalation rate per day
      const escalationTrend = escalationByDay
        .map(r => ({
          date:           r.date,
          total:          Number(r.total),
          escalated:      Number(r.escalated),
          escalationRate: Number(r.total) > 0
            ? Math.round((Number(r.escalated) / Number(r.total)) * 100)
            : 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Avg response time trend (convert ms → seconds)
      const responseTimeTrend = avgRespByDay
        .filter(r => r.avgMs != null)
        .map(r => ({ date: r.date, avgSeconds: Math.round(Number(r.avgMs) / 1000) }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Overall stats
      const totalEscalated = escalationByDay.reduce((s, r) => s + Number(r.escalated), 0);
      const allAvgMs = avgRespByDay.filter(r => r.avgMs != null);
      const overallAvgMs = allAvgMs.length > 0
        ? allAvgMs.reduce((s, r) => s + Number(r.avgMs), 0) / allAvgMs.length
        : 0;

      return {
        hourlyMessages,
        dailyMessages,
        sentimentBreakdown: bySentiment.filter((r) => r.sentiment).map((r) => ({ name: r.sentiment!, value: Number(r.count) })),
        languageBreakdown: byLanguage.filter((r) => r.language).map((r) => ({ language: r.language!, count: Number(r.count) })),
        topTemplates: topTemplateRows.map((t) => ({ id: t.id, name: t.name, count: t.count })),
        aiVsHuman,
        escalationTrend,
        responseTimeTrend,
        summary: {
          totalMessages:    total,
          aiHandledPct:     total > 0 ? Math.round((aiCount / total) * 100) : 0,
          avgResponseTime:  overallAvgMs > 0 ? Math.round(overallAvgMs / 1000) : 0,
          escalationRate:   total > 0 ? Math.round((totalEscalated / total) * 100) : 0,
          satisfaction:     null,
          messagesChange:   0,
          aiChange:         0,
          responseTimeChange: 0,
          satisfactionChange: 0,
        },
      };
    }),

  agents: protectedProcedure.query(async () => {
    const rows = await db.select().from(agents).orderBy(agents.name);
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      status: a.status === "available" ? "online" : a.status === "busy" ? "busy" : "offline",
      activeConversations: 0,
      pendingEscalations: 0,
      totalConversations: a.escalationCount,
      avgResponseTime: a.avgResponseTime,
      resolutionRate: 85,
      messagesToday: 0,
      escalations: a.escalationCount,
      satisfactionScore: null,
    }));
  }),

  agentConversations: protectedProcedure
    .input(z.object({ agentId: z.number() }))
    .query(async ({ input }) => {
      const rows = await db.select().from(conversations)
        .where(eq(conversations.agentId, input.agentId))
        .orderBy(desc(conversations.createdAt))
        .limit(20);
      return rows.map((c) => ({
        id: c.id,
        customerPhone: c.phoneNumber,
        customerName: c.contactName,
        lastMessage: c.message,
        status: c.isEscalated ? "escalated" : "active",
        isEscalated: c.isEscalated,
      }));
    }),
});
