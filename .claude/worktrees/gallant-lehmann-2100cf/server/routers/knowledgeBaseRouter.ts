import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { knowledgeBase, botConfig } from "../../drizzle/schema.js";
import { eq, desc, like, and, or } from "drizzle-orm";
import { decrypt } from "../services/encryptionService.js";
import { escapeLike, getInsertId } from "../utils.js";
import { scrapeUrl } from "../services/knowledgeScraper.js";
import { getRelevantContext } from "../services/knowledgeRetrieval.js";
import OpenAI from "openai";

export const knowledgeBaseRouter = router({
  // ── LIST ───────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), category: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const conditions: any[] = [eq(knowledgeBase.tenantId, ctx.user.userId)];
      if (input.search) conditions.push(
        or(like(knowledgeBase.title, `%${escapeLike(input.search)}%`), like(knowledgeBase.content, `%${escapeLike(input.search)}%`))
      );
      if (input.category) conditions.push(eq(knowledgeBase.category, input.category));
      const where = and(...conditions);
      const rows = await db.select().from(knowledgeBase).where(where).orderBy(desc(knowledgeBase.createdAt));
      return { articles: rows, total: rows.length };
    }),

  // ── CREATE (manual text) ───────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      category: z.string().default("general"),
      tags: z.array(z.string()).default([]),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const [result] = await db.insert(knowledgeBase).values({
        ...input,
        tenantId: ctx.user.userId,
        type: "text",
        status: "ready",
      });
      return { success: true, id: getInsertId(result) };
    }),

  // ── ADD URL (scrape a website) ─────────────────────────────────────────────
  addUrl: protectedProcedure
    .input(z.object({
      url: z.string().url("Please enter a valid URL (e.g. https://example.com)"),
      category: z.string().default("general"),
      tags: z.array(z.string()).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      // Insert a "processing" placeholder immediately
      const [result] = await db.insert(knowledgeBase).values({
        tenantId: ctx.user.userId,
        title: new URL(input.url).hostname,
        content: "Processing...",
        type: "link",
        status: "processing",
        sourceUrl: input.url,
        category: input.category,
        tags: input.tags,
        isActive: false,
      });
      const id = getInsertId(result) as number;

      // Scrape in background (don't await so we return fast)
      scrapeUrl(input.url)
        .then(async ({ title, content }) => {
          await db.update(knowledgeBase).set({
            title,
            content,
            status: "ready",
            isActive: true,
            lastSyncAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(knowledgeBase.id, id));
          console.log(`✅ KB scraped: ${title} (${content.length} chars)`);
        })
        .catch(async (err: Error) => {
          await db.update(knowledgeBase).set({
            status: "error",
            processingError: err.message,
            content: "Failed to scrape content.",
            updatedAt: new Date(),
          }).where(eq(knowledgeBase.id, id));
          console.error(`❌ KB scrape failed [${input.url}]:`, err.message);
        });

      return { success: true, id, message: "URL queued for scraping. Refresh in a few seconds." };
    }),

  // ── RESYNC a URL ───────────────────────────────────────────────────────────
  resync: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const [article] = await db.select().from(knowledgeBase)
        .where(and(eq(knowledgeBase.tenantId, ctx.user.userId), eq(knowledgeBase.id, input.id)))
        .limit(1);
      if (!article) throw new Error("Article not found");
      if (article.type !== "link" || !article.sourceUrl) throw new Error("Only URL articles can be resynced");

      await db.update(knowledgeBase).set({ status: "processing", updatedAt: new Date() })
        .where(eq(knowledgeBase.id, input.id));

      scrapeUrl(article.sourceUrl)
        .then(async ({ title, content }) => {
          await db.update(knowledgeBase).set({
            title, content,
            status: "ready",
            isActive: true,
            lastSyncAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(knowledgeBase.id, input.id));
        })
        .catch(async (err: Error) => {
          await db.update(knowledgeBase).set({
            status: "error",
            processingError: err.message,
            updatedAt: new Date(),
          }).where(eq(knowledgeBase.id, input.id));
        });

      return { success: true, message: "Resync started. Refresh in a few seconds." };
    }),

  // ── GET ONE (for polling processing status) ────────────────────────────────
  getOne: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const [article] = await db.select().from(knowledgeBase)
        .where(and(eq(knowledgeBase.tenantId, ctx.user.userId), eq(knowledgeBase.id, input.id)))
        .limit(1);
      return article ?? null;
    }),

  // ── UPDATE ─────────────────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      content: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...rest } = input;
      await db.update(knowledgeBase).set({ ...rest, updatedAt: new Date() })
        .where(and(eq(knowledgeBase.tenantId, ctx.user.userId), eq(knowledgeBase.id, id)));
      return { success: true };
    }),

  // ── DELETE ─────────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(knowledgeBase)
        .where(and(eq(knowledgeBase.tenantId, ctx.user.userId), eq(knowledgeBase.id, input.id)));
      return { success: true };
    }),

  // ── TEST AI QUERY ──────────────────────────────────────────────────────────
  // Ask the AI a question using only this tenant's knowledge base.
  testQuery: protectedProcedure
    .input(z.object({ question: z.string().min(1).max(500) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;

      const [config] = await db.select({
        aiApiUrl: botConfig.aiApiUrl,
        aiApiKey: botConfig.aiApiKey,
        aiModel: botConfig.aiModel,
        businessName: botConfig.businessName,
        systemPrompt: botConfig.systemPrompt,
      }).from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      if (!config) return { answer: "No AI configuration found.", sources: [] };

      // Retrieve relevant knowledge context
      const context = await getRelevantContext(input.question, tenantId, 5);

      // Also get article titles for citation display
      const articles = await db
        .select({ id: knowledgeBase.id, title: knowledgeBase.title })
        .from(knowledgeBase)
        .where(and(eq(knowledgeBase.tenantId, tenantId), eq(knowledgeBase.isActive, true)))
        .limit(10);

      const client = new OpenAI({ baseURL: config.aiApiUrl, apiKey: decrypt(config.aiApiKey || "") || "ollama" });
      const systemMsg = config.systemPrompt ||
        `You are a helpful assistant for ${config.businessName}. Answer questions using only the provided knowledge base context. If you don't know, say so.`;

      const response = await client.chat.completions.create({
        model: config.aiModel,
        messages: [
          { role: "system", content: systemMsg },
          ...(context ? [{ role: "user" as const, content: `Context:\n${context}` }] : []),
          { role: "user", content: input.question },
        ],
        max_tokens: 400,
        temperature: 0.3,
      });

      const answer = response.choices[0]?.message?.content ?? "No response from AI.";
      return { answer, sources: articles };
    }),
});
