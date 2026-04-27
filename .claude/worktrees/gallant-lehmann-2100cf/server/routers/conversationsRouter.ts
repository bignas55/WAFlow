import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { conversations, botConfig, customers, templates, surveys } from "../../drizzle/schema.js";
import { eq, desc, gte, sql, and, like, or } from "drizzle-orm";
import { escapeLike } from "../utils.js";
import OpenAI from "openai";
import { decrypt } from "../services/encryptionService.js";

export const conversationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      limit: z.number().default(50),
      status: z.enum(["all", "active", "escalated", "ai", "closed"]).optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [eq(conversations.tenantId, ctx.user.userId)];
      // By default exclude auto-closed/resolved conversations; show them only when explicitly requested
      if (input.status === "closed") {
        conditions.push(eq(conversations.isResolved, true));
      } else {
        conditions.push(eq(conversations.isResolved, false));
        if (input.status === "escalated") conditions.push(eq(conversations.isEscalated, true));
        if (input.status === "ai") conditions.push(
          or(eq(conversations.source, "ai"), eq(conversations.source, "template"))
        );
      }
      if (input.search) conditions.push(
        or(like(conversations.phoneNumber, `%${escapeLike(input.search)}%`), like(conversations.contactName, `%${escapeLike(input.search)}%`))
      );
      const where = and(...conditions);
      const [items, [{ count }]] = await Promise.all([
        db.select().from(conversations).where(where).orderBy(desc(conversations.createdAt)).limit(input.limit).offset(offset),
        db.select({ count: sql<number>`COUNT(*)` }).from(conversations).where(where),
      ]);
      const seen = new Set<string>();
      const threads = items.filter((c) => { if (seen.has(c.phoneNumber)) return false; seen.add(c.phoneNumber); return true; });
      return {
        conversations: threads.map((c) => ({
          id: c.id,
          customerPhone: c.phoneNumber,
          customerName: c.contactName,
          lastMessage: c.message || c.response || "",
          lastMessageAt: c.createdAt,
          status: c.isEscalated ? "escalated" : "active",
          isEscalated: c.isEscalated,
          aiHandled: c.source === "ai" || c.source === "template",
          language: c.language,
          sentiment: c.sentiment,
        })),
        total: Number(count),
        page: input.page,
      };
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [todayRows, escalatedRows, aiRows, allRows, recentPhones, avgRtRows, resolvedRows] = await Promise.all([
      // Messages sent today
      db.select({ count: sql<number>`COUNT(*)` }).from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), gte(conversations.createdAt, today))),
      // Currently escalated (isEscalated = true)
      db.select({ count: sql<number>`COUNT(*)` }).from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), eq(conversations.isEscalated, true))),
      // AI-handled messages
      db.select({ count: sql<number>`COUNT(*)` }).from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), or(eq(conversations.source, "ai"), eq(conversations.source, "template")))),
      // All messages ever
      db.select({ count: sql<number>`COUNT(*)` }).from(conversations)
        .where(eq(conversations.tenantId, ctx.user.userId)),
      // Unique phones active in last 24h (active conversations)
      db.select({ phone: conversations.phoneNumber }).from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), gte(conversations.createdAt, new Date(Date.now() - 86400000))))
        .groupBy(conversations.phoneNumber),
      // Average response time in seconds (for rows that have a measured responseTimeMs)
      db.select({ avg: sql<number>`AVG(response_time_ms) / 1000.0` }).from(conversations)
        .where(and(
          eq(conversations.tenantId, ctx.user.userId),
          sql`response_time_ms IS NOT NULL`,
          sql`response_time_ms > 0`,
        )),
      // Resolved today = threads that were escalated but are no longer (source = agent, isEscalated = false, today)
      db.select({ count: sql<number>`COUNT(DISTINCT phone_number)` }).from(conversations)
        .where(and(
          eq(conversations.tenantId, ctx.user.userId),
          eq(conversations.source, "agent"),
          eq(conversations.isEscalated, false),
          gte(conversations.createdAt, today),
        )),
    ]);

    const total = Number(allRows[0].count);
    const aiCount = Number(aiRows[0].count);
    const avgRtRaw = Number(avgRtRows[0]?.avg ?? 0);

    // New customers today = phones that first appear today
    const [todayPhones, surveyRows] = await Promise.all([
      db.select({ phone: conversations.phoneNumber, firstSeen: sql<string>`MIN(created_at)` })
        .from(conversations)
        .where(eq(conversations.tenantId, ctx.user.userId))
        .groupBy(conversations.phoneNumber)
        .having(sql`MIN(created_at) >= ${today}`),
      db.select({ score: surveys.score, status: surveys.status })
        .from(surveys)
        .innerJoin(conversations, eq(surveys.conversationId, conversations.id))
        .where(eq(conversations.tenantId, ctx.user.userId))
        .limit(500),
    ]);

    return {
      totalToday: Number(todayRows[0].count),
      activeConversations: recentPhones.length,
      aiHandled: total > 0 ? Math.round((aiCount / total) * 100) : 0,
      escalated: Number(escalatedRows[0].count),
      avgResponseTime: avgRtRaw > 0 ? Math.round(avgRtRaw * 10) / 10 : 0,
      satisfactionScore: (() => {
        const responded = surveyRows.filter(s => s.status === "responded" && s.score !== null);
        if (!responded.length) return null;
        const promoters  = responded.filter(s => (s.score ?? 0) >= 9).length;
        const detractors = responded.filter(s => (s.score ?? 0) <= 6).length;
        return Math.round(((promoters - detractors) / responded.length) * 100);
      })(),
      newCustomers: todayPhones.length,
      resolved: Number(resolvedRows[0].count),
    };
  }),

  messages: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input, ctx }) => {
      const [conv] = await db.select({ phoneNumber: conversations.phoneNumber }).from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), eq(conversations.id, input.conversationId)))
        .limit(1);
      if (!conv) return [];
      const rows = await db.select().from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), eq(conversations.phoneNumber, conv.phoneNumber)))
        .orderBy(conversations.createdAt);
      const messages: any[] = [];
      for (const row of rows) {
        messages.push({ id: `${row.id}-in`, direction: "inbound", content: row.message, isAiGenerated: false, createdAt: row.createdAt });
        if (row.response) messages.push({ id: `${row.id}-out`, direction: "outbound", content: row.response, isAiGenerated: row.source === "ai", createdAt: new Date(row.createdAt.getTime() + 1000) });
      }
      return messages;
    }),

  escalate: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const [conv] = await db.select({ phoneNumber: conversations.phoneNumber }).from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), eq(conversations.id, input.conversationId)))
        .limit(1);
      if (!conv) throw new Error("Not found");
      await db.update(conversations).set({ isEscalated: true })
        .where(and(eq(conversations.tenantId, ctx.user.userId), eq(conversations.phoneNumber, conv.phoneNumber)));
      return { success: true };
    }),

  close: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const [conv] = await db.select({ phoneNumber: conversations.phoneNumber }).from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), eq(conversations.id, input.conversationId)))
        .limit(1);
      if (!conv) throw new Error("Not found");
      await db.update(conversations).set({ isEscalated: false })
        .where(and(eq(conversations.tenantId, ctx.user.userId), eq(conversations.phoneNumber, conv.phoneNumber)));
      return { success: true };
    }),

  // Full thread for a phone number — used by Inbox chat view
  getThread: protectedProcedure
    .input(z.object({ phoneNumber: z.string() }))
    .query(async ({ input, ctx }) => {
      const rows = await db.select().from(conversations)
        .where(and(
          eq(conversations.tenantId, ctx.user.userId),
          eq(conversations.phoneNumber, input.phoneNumber)
        ))
        .orderBy(conversations.createdAt);

      const messages: {
        id: string; direction: "inbound" | "outbound";
        content: string; source: string; createdAt: Date;
        mediaUrl?: string | null; mediaType?: string | null; mediaCaption?: string | null;
      }[] = [];

      for (const row of rows) {
        if (row.message) {
          messages.push({
            id: `${row.id}-in`, direction: "inbound",
            content: row.message, source: row.source, createdAt: row.createdAt,
            mediaUrl: row.mediaUrl, mediaType: row.mediaType, mediaCaption: row.mediaCaption,
          });
        }
        if (row.response) {
          messages.push({
            id: `${row.id}-out`, direction: "outbound",
            content: row.response, source: row.source, createdAt: new Date(row.createdAt.getTime() + 500),
            // outbound media only when the agent explicitly sent it
            mediaUrl: (!row.message && row.mediaUrl) ? row.mediaUrl : null,
            mediaType: (!row.message && row.mediaType) ? row.mediaType : null,
            mediaCaption: (!row.message && row.mediaCaption) ? row.mediaCaption : null,
          });
        }
      }
      return messages;
    }),

  // Count escalated threads awaiting human response
  getEscalatedCount: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db.select({
      count: sql<number>`COUNT(DISTINCT ${conversations.phoneNumber})`,
    }).from(conversations).where(and(
      eq(conversations.tenantId, ctx.user.userId),
      eq(conversations.isEscalated, true)
    ));
    return Number(row?.count ?? 0);
  }),

  // Mark an entire phone thread as escalated or not
  setEscalated: protectedProcedure
    .input(z.object({ phoneNumber: z.string(), escalated: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await db.update(conversations)
        .set({ isEscalated: input.escalated })
        .where(and(
          eq(conversations.tenantId, ctx.user.userId),
          eq(conversations.phoneNumber, input.phoneNumber)
        ));
      return { success: true };
    }),

  // Send a manual message as the human agent
  sendMessage: protectedProcedure
    .input(z.object({ phoneNumber: z.string(), text: z.string().min(1).max(4096) }))
    .mutation(async ({ input, ctx }) => {
      const { sendViaWhatsAppWeb } = await import("../whatsapp/WhatsAppWebManager.js");

      // Look up existing contact name
      const [existing] = await db
        .select({ contactName: conversations.contactName })
        .from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), eq(conversations.phoneNumber, input.phoneNumber)))
        .limit(1);

      const ok = await sendViaWhatsAppWeb(ctx.user.userId, input.phoneNumber, input.text);
      if (!ok) throw new Error("WhatsApp is not connected — cannot send message");

      // Check if thread is currently escalated so we preserve the flag correctly
      const [currentThread] = await db
        .select({ isEscalated: conversations.isEscalated })
        .from(conversations)
        .where(and(eq(conversations.tenantId, ctx.user.userId), eq(conversations.phoneNumber, input.phoneNumber)))
        .orderBy(desc(conversations.createdAt))
        .limit(1);

      // Save the outbound agent message — preserve the thread's current escalation state
      await db.insert(conversations).values({
        tenantId: ctx.user.userId,
        phoneNumber: input.phoneNumber,
        contactName: existing?.contactName ?? null,
        message: "",          // no inbound trigger
        response: input.text,
        source: "agent",
        isEscalated: currentThread?.isEscalated ?? false,
      });

      return { success: true };
    }),

  // ── Send a media message (image / document / video) via WhatsApp Web ────────
  sendMediaMessage: protectedProcedure
    .input(
      z.object({
        phoneNumber: z.string(),
        mediaUrl: z.string().url(),
        mediaType: z.enum(["image", "video", "audio", "document"]),
        caption: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const { sendImageViaWhatsAppWeb } = await import("../whatsapp/WhatsAppWebManager.js");

      // Fetch the remote URL and convert to a Buffer for whatsapp-web.js
      const fetchRes = await fetch(input.mediaUrl);
      if (!fetchRes.ok) throw new Error(`Failed to fetch media URL: ${fetchRes.status}`);
      const arrayBuf = await fetchRes.arrayBuffer();
      const mediaBuffer = Buffer.from(arrayBuf);

      const ok = await sendImageViaWhatsAppWeb(tenantId, input.phoneNumber, mediaBuffer, input.caption);
      if (!ok) throw new Error("WhatsApp is not connected or media send failed");

      const [existing] = await db
        .select({ contactName: conversations.contactName, isEscalated: conversations.isEscalated })
        .from(conversations)
        .where(and(eq(conversations.tenantId, tenantId), eq(conversations.phoneNumber, input.phoneNumber)))
        .orderBy(desc(conversations.createdAt))
        .limit(1);

      await db.insert(conversations).values({
        tenantId,
        phoneNumber: input.phoneNumber,
        contactName: existing?.contactName ?? null,
        message: "",
        response: input.caption ?? `[${input.mediaType}]`,
        source: "agent",
        isEscalated: existing?.isEscalated ?? false,
        mediaUrl: input.mediaUrl,
        mediaType: input.mediaType,
        mediaCaption: input.caption ?? null,
      });

      return { success: true };
    }),

  // ── Summarise a conversation thread using AI ───────────────────────────────
  summarize: protectedProcedure
    .input(z.object({ phoneNumber: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const rows = await db
        .select({ message: conversations.message, response: conversations.response, source: conversations.source, createdAt: conversations.createdAt })
        .from(conversations)
        .where(and(eq(conversations.tenantId, tenantId), eq(conversations.phoneNumber, input.phoneNumber)))
        .orderBy(desc(conversations.createdAt))
        .limit(30);

      if (!rows.length) return { summary: "No conversation found." };

      const [config] = await db
        .select({ aiApiUrl: botConfig.aiApiUrl, aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel })
        .from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      if (!config) return { summary: "AI not configured." };

      const transcript = rows
        .reverse()
        .map(r => r.message ? `Customer: ${r.message}` : `Bot: ${r.response}`)
        .join("\n");

      const client = new OpenAI({ baseURL: config.aiApiUrl, apiKey: decrypt(config.aiApiKey || "") || "ollama" });
      const resp = await client.chat.completions.create({
        model: config.aiModel,
        messages: [
          { role: "system", content: "You are a concise assistant. Summarise the following WhatsApp conversation in 2-3 sentences, focusing on the customer's intent and outcome." },
          { role: "user", content: transcript },
        ],
        max_tokens: 150,
        temperature: 0.2,
      });
      return { summary: resp.choices[0]?.message?.content ?? "Could not summarise." };
    }),

  // ── Export conversations to CSV ───────────────────────────────────────────
  exportCsv: protectedProcedure
    .input(z.object({
      status: z.enum(["all", "active", "escalated", "ai", "closed"]).optional(),
      days: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ input, ctx }) => {
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const conditions: any[] = [
        eq(conversations.tenantId, ctx.user.userId),
        gte(conversations.createdAt, since),
      ];
      if (input.status === "closed") {
        conditions.push(eq(conversations.isResolved, true));
      } else if (input.status === "escalated") {
        conditions.push(eq(conversations.isEscalated, true));
      } else if (input.status === "ai") {
        conditions.push(or(eq(conversations.source, "ai"), eq(conversations.source, "template")));
      }

      const rows = await db.select({
        id: conversations.id,
        phoneNumber: conversations.phoneNumber,
        contactName: conversations.contactName,
        message: conversations.message,
        response: conversations.response,
        source: conversations.source,
        isEscalated: conversations.isEscalated,
        isResolved: conversations.isResolved,
        sentiment: conversations.sentiment,
        language: conversations.language,
        createdAt: conversations.createdAt,
      }).from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.createdAt))
        .limit(10000);

      // Build CSV string
      const headers = ["ID", "Phone", "Contact Name", "Message", "Response", "Source", "Escalated", "Resolved", "Sentiment", "Language", "Date"];
      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return `"${s.replace(/"/g, '""').replace(/\n/g, " ")}"`;
      };
      const lines = [
        headers.join(","),
        ...rows.map(r => [
          r.id, escape(r.phoneNumber), escape(r.contactName),
          escape(r.message), escape(r.response), r.source,
          r.isEscalated ? "Yes" : "No", r.isResolved ? "Yes" : "No",
          r.sentiment ?? "", r.language ?? "",
          r.createdAt?.toISOString() ?? "",
        ].join(",")),
      ];
      return { csv: lines.join("\n"), count: rows.length };
    }),

  // ── Contact Notes ──────────────────────────────────────────────────────────
  getContactNote: protectedProcedure
    .input(z.object({ phoneNumber: z.string() }))
    .query(async ({ input, ctx }) => {
      const [c] = await db.select({ notes: customers.notes, tags: customers.tags, name: customers.name })
        .from(customers)
        .where(and(eq(customers.tenantId, ctx.user.userId), eq(customers.phoneNumber, input.phoneNumber)))
        .limit(1);
      return { notes: c?.notes ?? "", tags: (c?.tags ?? []) as string[], name: c?.name ?? "" };
    }),

  updateContactNote: protectedProcedure
    .input(z.object({ phoneNumber: z.string(), notes: z.string().max(5000) }))
    .mutation(async ({ input, ctx }) => {
      await db.update(customers)
        .set({ notes: input.notes, updatedAt: new Date() })
        .where(and(eq(customers.tenantId, ctx.user.userId), eq(customers.phoneNumber, input.phoneNumber)));
      return { success: true };
    }),

  // ── Recent activity feed (for notification bell) ───────────────────────────
  recentActivity: protectedProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 24 * 3600000); // last 24h
    const rows = await db.select({
      id:        conversations.id,
      phone:     conversations.phoneNumber,
      name:      conversations.contactName,
      lastMsg:   conversations.message,
      escalated: conversations.isEscalated,
      source:    conversations.source,
      createdAt: conversations.createdAt,
    })
      .from(conversations)
      .where(and(eq(conversations.tenantId, ctx.user.userId), gte(conversations.createdAt, since)))
      .orderBy(desc(conversations.createdAt))
      .limit(20);

    return rows.map((r) => ({
      id:          r.id,
      phone:       r.phone,
      name:        r.name,
      lastMsg:     r.lastMsg,
      isEscalated: r.escalated,
      source:      r.source,
      updatedAt:   r.createdAt,
      type: r.escalated ? ("escalation" as const) : r.source === "ai" ? ("ai_reply" as const) : ("new_message" as const),
    }));
  }),

  // ── Global search ─────────────────────────────────────────────────────────
  globalSearch: protectedProcedure
    .input(z.object({ q: z.string().min(1).max(200) }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const q = `%${escapeLike(input.q)}%`;

      const [convRows, custRows, tplRows] = await Promise.all([
        db.select({
          id: conversations.id,
          name: conversations.contactName,
          phone: conversations.phoneNumber,
          lastMessage: conversations.message,
          updatedAt: conversations.createdAt,
        })
          .from(conversations)
          .where(and(
            eq(conversations.tenantId, tenantId),
            or(like(conversations.contactName, q), like(conversations.phoneNumber, q), like(conversations.message, q)),
          ))
          .orderBy(desc(conversations.createdAt))
          .limit(5),

        db.select({ id: customers.id, name: customers.name, phone: customers.phoneNumber, email: customers.email })
          .from(customers)
          .where(and(
            eq(customers.tenantId, tenantId),
            or(like(customers.name, q), like(customers.phoneNumber, q), like(customers.email, q)),
          ))
          .limit(5),

        db.select({ id: templates.id, name: templates.name, category: templates.category })
          .from(templates)
          .where(and(eq(templates.tenantId, tenantId), like(templates.name, q)))
          .limit(5),
      ]);

      return {
        conversations: convRows.map((r) => ({ ...r, type: "conversation" as const })),
        customers:     custRows.map((r) => ({ ...r, type: "customer" as const })),
        templates:     tplRows.map((r)  => ({ ...r, type: "template" as const })),
      };
    }),

  // ── Contact Labels / Tags ───────────────────────────────────────────────────
  updateContactLabels: protectedProcedure
    .input(z.object({ phoneNumber: z.string(), tags: z.array(z.string().max(50)).max(20) }))
    .mutation(async ({ input, ctx }) => {
      await db.update(customers)
        .set({ tags: input.tags, updatedAt: new Date() })
        .where(and(eq(customers.tenantId, ctx.user.userId), eq(customers.phoneNumber, input.phoneNumber)));
      return { success: true };
    }),

  // ── Templates for quick-reply picker ──────────────────────────────────────
  listTemplates: protectedProcedure.query(async ({ ctx }) => {
    return db.select({ id: templates.id, name: templates.name, content: templates.response, category: templates.category })
      .from(templates)
      .where(and(eq(templates.tenantId, ctx.user.userId), eq(templates.isActive, true)))
      .orderBy(templates.name)
      .limit(100);
  }),

  // ── Export conversations as CSV (inline — browser downloads it directly) ──
  exportCsv: protectedProcedure
    .input(z.object({
      status: z.enum(["all", "escalated", "closed", "ai"]).default("all"),
      days:   z.number().min(1).max(365).default(90),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const since = new Date(Date.now() - input.days * 86400000);
      const conditions: any[] = [
        eq(conversations.tenantId, tenantId),
        gte(conversations.createdAt, since),
      ];
      if (input.status === "escalated") conditions.push(eq(conversations.isEscalated, true));
      if (input.status === "closed")    conditions.push(eq(conversations.isResolved, true));
      if (input.status === "ai")        conditions.push(
        or(eq(conversations.source, "ai"), eq(conversations.source, "template"))
      );

      const rows = await db
        .select({
          id: conversations.id,
          phone: conversations.phoneNumber,
          name: conversations.contactName,
          message: conversations.message,
          response: conversations.response,
          source: conversations.source,
          sentiment: conversations.sentiment,
          escalated: conversations.isEscalated,
          resolved: conversations.isResolved,
          language: conversations.language,
          createdAt: conversations.createdAt,
        })
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.createdAt))
        .limit(10_000);

      const escape = (v: unknown) => {
        const s = String(v ?? "").replace(/"/g, '""');
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
      };
      const header = ["ID","Phone","Name","Message","Response","Source","Sentiment","Escalated","Resolved","Language","Date"];
      const lines = [
        header.join(","),
        ...rows.map(r => [
          r.id, r.phone, r.name ?? "", r.message, r.response ?? "",
          r.source, r.sentiment ?? "", r.escalated ? "Yes" : "No",
          r.resolved ? "Yes" : "No", r.language ?? "en",
          r.createdAt ? new Date(r.createdAt).toISOString() : "",
        ].map(escape).join(",")),
      ];
      return { csv: lines.join("\n"), count: rows.length };
    }),
});
