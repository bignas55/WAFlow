import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { conversations, appointments, customers, knowledgeBase, services } from "../../drizzle/schema.js";
import { eq, and, gte, sql, desc } from "drizzle-orm";

export const analyticsRouter = router({
  // Overview stats
  overview: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.userId;
    const now = new Date();
    const since7d  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [total]   = await db.select({ c: sql<number>`COUNT(*)` }).from(conversations).where(eq(conversations.tenantId, tenantId));
    const [last7d]  = await db.select({ c: sql<number>`COUNT(*)` }).from(conversations).where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, since7d)));
    const [last30d] = await db.select({ c: sql<number>`COUNT(*)` }).from(conversations).where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, since30d)));

    const [custCount] = await db.select({ c: sql<number>`COUNT(*)` }).from(customers).where(eq(customers.tenantId, tenantId));

    const [apptCounts] = await db
      .select({
        total:     sql<number>`COUNT(*)`,
        completed: sql<number>`SUM(CASE WHEN ${appointments.status} = 'completed' THEN 1 ELSE 0 END)`,
        cancelled: sql<number>`SUM(CASE WHEN ${appointments.status} = 'cancelled' THEN 1 ELSE 0 END)`,
        noShow:    sql<number>`SUM(CASE WHEN ${appointments.status} = 'no_show' THEN 1 ELSE 0 END)`,
      })
      .from(appointments)
      .where(eq(appointments.tenantId, tenantId));

    const [avgResp] = await db
      .select({ avg: sql<number>`AVG(${conversations.responseTimeMs})` })
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, since30d)));

    return {
      totalMessages: Number(total?.c ?? 0),
      messages7d: Number(last7d?.c ?? 0),
      messages30d: Number(last30d?.c ?? 0),
      totalCustomers: Number(custCount?.c ?? 0),
      totalAppointments: Number(apptCounts?.total ?? 0),
      completedAppointments: Number(apptCounts?.completed ?? 0),
      cancelledAppointments: Number(apptCounts?.cancelled ?? 0),
      noShowAppointments: Number(apptCounts?.noShow ?? 0),
      avgResponseMs: Math.round(Number(avgResp?.avg ?? 0)),
    };
  }),

  // Messages per day for the last N days (for line chart)
  messagesPerDay: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({
          day: sql<string>`DATE(${conversations.createdAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(conversations)
        .where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, since)))
        .groupBy(sql`DATE(${conversations.createdAt})`)
        .orderBy(sql`DATE(${conversations.createdAt})`);
      return rows.map(r => ({ day: r.day, count: Number(r.count) }));
    }),

  // Messages by hour of day (heatmap/bar)
  messagesByHour: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.userId;
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        hour: sql<number>`HOUR(${conversations.createdAt})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, since30d)))
      .groupBy(sql`HOUR(${conversations.createdAt})`)
      .orderBy(sql`HOUR(${conversations.createdAt})`);
    // Fill missing hours with 0
    const map = Object.fromEntries(rows.map(r => [Number(r.hour), Number(r.count)]));
    return Array.from({ length: 24 }, (_, h) => ({ hour: h, count: map[h] ?? 0 }));
  }),

  // Sentiment breakdown (last 30d)
  sentimentBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.userId;
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ sentiment: conversations.sentiment, count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, since30d)))
      .groupBy(conversations.sentiment);
    return rows.map(r => ({ sentiment: r.sentiment ?? "neutral", count: Number(r.count) }));
  }),

  // Appointments per day (last 30d)
  appointmentsPerDay: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const sinceStr = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const rows = await db
        .select({ date: appointments.date, count: sql<number>`COUNT(*)` })
        .from(appointments)
        .where(and(
          eq(appointments.tenantId, tenantId),
          sql`${appointments.date} >= ${sinceStr}`,
        ))
        .groupBy(appointments.date)
        .orderBy(appointments.date);
      return rows.map(r => ({ date: r.date, count: Number(r.count) }));
    }),

  // Top customers by message count
  topCustomers: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(20).default(10) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const rows = await db
        .select({
          phoneNumber: conversations.phoneNumber,
          contactName: conversations.contactName,
          count: sql<number>`COUNT(*)`,
          lastSeen: sql<Date>`MAX(${conversations.createdAt})`,
        })
        .from(conversations)
        .where(eq(conversations.tenantId, tenantId))
        .groupBy(conversations.phoneNumber, conversations.contactName)
        .orderBy(sql`COUNT(*) DESC`)
        .limit(input.limit);
      return rows.map(r => ({ phoneNumber: r.phoneNumber, name: r.contactName, messages: Number(r.count), lastSeen: r.lastSeen }));
    }),

  // Source breakdown: ai vs template vs agent
  sourceBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.userId;
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ source: conversations.source, count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, since30d)))
      .groupBy(conversations.source);
    return rows.map(r => ({ source: r.source, count: Number(r.count) }));
  }),

  // Revenue: total and per-day for completed appointments
  revenue: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const sinceStr = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const rows = await db
        .select({
          date: appointments.date,
          revenue: sql<number>`SUM(${services.price})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(appointments)
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.status, "completed"),
          sql`${appointments.date} >= ${sinceStr}`,
        ))
        .groupBy(appointments.date)
        .orderBy(appointments.date);

      const perDay = rows.map(r => ({ date: r.date, revenue: Number(r.revenue ?? 0), count: Number(r.count) }));
      const total = perDay.reduce((s, r) => s + r.revenue, 0);

      // Lifetime value sum across all customers
      const [ltv] = await db
        .select({ sum: sql<number>`SUM(${customers.lifetimeValue})` })
        .from(customers)
        .where(eq(customers.tenantId, tenantId));

      return { total, perDay, lifetimeValueTotal: Number(ltv?.sum ?? 0) };
    }),

  // Peak booking hours: appointments per day-of-week × hour bucket (last 90d)
  peakHours: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.userId;
    const sinceStr = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Drizzle doesn't expose DAYOFWEEK/HOUR on varchar date+time, so use raw SQL
    const rows = await db.execute(
      sql`SELECT
            DAYOFWEEK(STR_TO_DATE(CONCAT(date, ' ', time), '%Y-%m-%d %H:%i')) AS dow,
            FLOOR(CAST(SUBSTRING(time, 1, 2) AS UNSIGNED) / 2) * 2 AS hour_bucket,
            COUNT(*) AS cnt
          FROM appointments
          WHERE tenant_id = ${tenantId}
            AND date >= ${sinceStr}
          GROUP BY dow, hour_bucket
          ORDER BY dow, hour_bucket`
    ) as any;

    // rows is [{dow, hour_bucket, cnt}] — dow: 1=Sun..7=Sat
    return (Array.isArray(rows) ? rows : rows[0] ?? []).map((r: any) => ({
      dow: Number(r.dow),       // 1=Sun, 2=Mon … 7=Sat
      hour: Number(r.hour_bucket),
      count: Number(r.cnt),
    }));
  }),

  // No-show rate by service (last 90d)
  noShowByService: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.userId;
    const sinceStr = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const rows = await db
      .select({
        service: services.name,
        total:   sql<number>`COUNT(*)`,
        noShows: sql<number>`SUM(CASE WHEN ${appointments.status} = 'no_show' THEN 1 ELSE 0 END)`,
        completed: sql<number>`SUM(CASE WHEN ${appointments.status} = 'completed' THEN 1 ELSE 0 END)`,
      })
      .from(appointments)
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(and(
        eq(appointments.tenantId, tenantId),
        sql`${appointments.date} >= ${sinceStr}`,
      ))
      .groupBy(services.name)
      .orderBy(sql`SUM(CASE WHEN ${appointments.status} = 'no_show' THEN 1 ELSE 0 END) DESC`);

    return rows.map(r => ({
      service:   r.service ?? "Unknown",
      total:     Number(r.total),
      noShows:   Number(r.noShows),
      completed: Number(r.completed),
      noShowRate: Number(r.total) > 0 ? Math.round((Number(r.noShows) / Number(r.total)) * 100) : 0,
    }));
  }),

  // Customer retention: new vs returning per week (last 12 weeks)
  retention: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.userId;
    const since = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);

    // All conversations grouped by phone + week
    const rows = await db
      .select({
        week:  sql<string>`DATE(DATE_SUB(${conversations.createdAt}, INTERVAL WEEKDAY(${conversations.createdAt}) DAY))`,
        phone: conversations.phoneNumber,
        first: sql<Date>`MIN(${conversations.createdAt})`,
      })
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, since)))
      .groupBy(sql`DATE(DATE_SUB(${conversations.createdAt}, INTERVAL WEEKDAY(${conversations.createdAt}) DAY))`, conversations.phoneNumber)
      .orderBy(sql`DATE(DATE_SUB(${conversations.createdAt}, INTERVAL WEEKDAY(${conversations.createdAt}) DAY))`);

    // Determine first-ever week per customer
    const firstWeekByPhone: Record<string, string> = {};
    for (const r of rows) {
      if (!firstWeekByPhone[r.phone]) firstWeekByPhone[r.phone] = r.week;
    }

    // Aggregate by week
    const weekMap: Record<string, { week: string; newCustomers: number; returning: number }> = {};
    for (const r of rows) {
      if (!weekMap[r.week]) weekMap[r.week] = { week: r.week, newCustomers: 0, returning: 0 };
      if (firstWeekByPhone[r.phone] === r.week) weekMap[r.week].newCustomers++;
      else weekMap[r.week].returning++;
    }

    return Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
  }),

  // Average satisfaction score per service (last 90d)
  satisfactionByService: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.userId;
    const sinceStr = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const rows = await db
      .select({
        service: services.name,
        avgScore: sql<number>`AVG(${appointments.satisfactionScore})`,
        responses: sql<number>`COUNT(${appointments.satisfactionScore})`,
      })
      .from(appointments)
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(and(
        eq(appointments.tenantId, tenantId),
        sql`${appointments.date} >= ${sinceStr}`,
        sql`${appointments.satisfactionScore} IS NOT NULL`,
      ))
      .groupBy(services.name)
      .orderBy(sql`AVG(${appointments.satisfactionScore}) DESC`);

    return rows.map(r => ({
      service:   r.service ?? "Unknown",
      avgScore:  Math.round(Number(r.avgScore ?? 0) * 10) / 10,
      responses: Number(r.responses),
    }));
  }),

  // FAQ suggestions: most common customer questions not in KB
  faqSuggestions: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.userId;
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get recent AI-handled conversations
    const recent = await db
      .select({ message: conversations.message })
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, since30d), eq(conversations.source, "ai")))
      .orderBy(desc(conversations.createdAt))
      .limit(200);

    // Simple keyword frequency — group short messages (questions) by similarity
    const questionWords = new Map<string, number>();
    for (const row of recent) {
      if (!row.message) continue;
      const text = row.message.toLowerCase().trim();
      if (text.length < 5 || text.length > 120) continue; // skip very short/long messages
      // Extract first 5 words as a "key"
      const key = text.split(/\s+/).slice(0, 5).join(" ");
      questionWords.set(key, (questionWords.get(key) ?? 0) + 1);
    }

    // Return top 10 repeated questions (asked 2+ times)
    const suggestions = Array.from(questionWords.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([question, count]) => ({ question, count }));

    return suggestions;
  }),

  // ── Sentiment over time (daily, last N days) ───────────────────────────────
  sentimentTrend: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ input, ctx }) => {
      const since = new Date(Date.now() - input.days * 86400000);
      const rows = await db
        .select({
          day: sql<string>`DATE(${conversations.createdAt})`,
          sentiment: conversations.sentiment,
          count: sql<number>`COUNT(*)`,
        })
        .from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), gte(conversations.createdAt, since)))
        .groupBy(sql`DATE(${conversations.createdAt})`, conversations.sentiment)
        .orderBy(sql`DATE(${conversations.createdAt})`);

      const map = new Map<string, { date: string; positive: number; neutral: number; negative: number }>();
      for (const r of rows) {
        const d = r.day;
        if (!map.has(d)) map.set(d, { date: d, positive: 0, neutral: 0, negative: 0 });
        const entry = map.get(d)!;
        const s = r.sentiment ?? "neutral";
        if (s === "positive") entry.positive += Number(r.count);
        else if (s === "negative") entry.negative += Number(r.count);
        else entry.neutral += Number(r.count);
      }
      return Array.from(map.values());
    }),

  // ── 7-day daily conversation + escalation counts ───────────────────────────
  dailyTrend: protectedProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 7 * 86400000);
    const rows = await db
      .select({
        day:       sql<string>`DATE(${conversations.createdAt})`,
        total:     sql<number>`COUNT(*)`,
        escalated: sql<number>`SUM(CASE WHEN ${conversations.isEscalated} = 1 THEN 1 ELSE 0 END)`,
        aiHandled: sql<number>`SUM(CASE WHEN ${conversations.source} = 'ai' THEN 1 ELSE 0 END)`,
      })
      .from(conversations)
      .where(and(eq(conversations.tenantId, ctx.user.userId), gte(conversations.createdAt, since)))
      .groupBy(sql`DATE(${conversations.createdAt})`)
      .orderBy(sql`DATE(${conversations.createdAt})`);

    // Fill in missing days with 0s
    const result: { date: string; total: number; escalated: number; aiHandled: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const row = rows.find((r) => r.day === key);
      result.push({
        date: key,
        total:     row ? Number(row.total) : 0,
        escalated: row ? Number(row.escalated) : 0,
        aiHandled: row ? Number(row.aiHandled) : 0,
      });
    }
    return result;
  }),

  // ── Response time breakdown by hour of day ──────────────────────────────────
  responseTimeByHour: protectedProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 30 * 86400000);
    const rows = await db
      .select({
        hour: sql<number>`HOUR(${conversations.createdAt})`,
        avgMs: sql<number>`AVG(${conversations.responseTimeMs})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(conversations)
      .where(and(
        eq(conversations.tenantId, ctx.user.userId),
        gte(conversations.createdAt, since),
        sql`${conversations.responseTimeMs} IS NOT NULL`,
      ))
      .groupBy(sql`HOUR(${conversations.createdAt})`);
    return rows.map(r => ({ hour: Number(r.hour), avgMs: Math.round(Number(r.avgMs)), count: Number(r.count) }));
  }),
});
