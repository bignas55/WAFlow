import { getInsertId } from "../utils.js";
import { z } from "zod";
import { router, adminProcedure } from "../trpc.js";
import { db } from "../db.js";
import { users, botConfig, conversations, templates, knowledgeBase, customers } from "../../drizzle/schema.js";
import { eq, sql, gte, and, ne, desc, count, avg, isNotNull } from "drizzle-orm";
import { encryptIfNeeded, decrypt } from "../services/encryptionService.js";
import { getAllTenantStates, getStateForTenant, initClientForTenant, destroyClientForTenant } from "../whatsapp/WhatsAppWebManager.js";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

export const adminRouter = router({
  // Get overview of all tenants: user info + WhatsApp state + message stats
  getTenantOverview: adminProcedure.query(async () => {
    // Get all non-admin users
    const tenants = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      isActive: users.isActive,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    }).from(users).where(eq(users.role, "user"));

    // Get message counts per tenant for last 24 hours and 7 days
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const msgCounts = await db.select({
      tenantId: conversations.tenantId,
      count24h: sql<number>`SUM(CASE WHEN ${conversations.createdAt} >= ${since24h} THEN 1 ELSE 0 END)`,
      count7d: sql<number>`SUM(CASE WHEN ${conversations.createdAt} >= ${since7d} THEN 1 ELSE 0 END)`,
      lastMessageAt: sql<Date>`MAX(${conversations.createdAt})`,
    }).from(conversations).groupBy(conversations.tenantId);

    // Get WhatsApp states from manager
    const wwjsStates = getAllTenantStates();

    // Merge data
    return tenants.map(tenant => {
      const counts = msgCounts.find(m => m.tenantId === tenant.id);
      const wwjs = wwjsStates.find(s => s.tenantId === tenant.id);
      return {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        isActive: tenant.isActive,
        createdAt: tenant.createdAt,
        lastLoginAt: tenant.lastLoginAt,
        whatsapp: {
          status: wwjs?.state.status ?? "disconnected",
          phoneNumber: wwjs?.state.phoneNumber ?? null,
          name: wwjs?.state.name ?? null,
          error: wwjs?.state.error ?? null,
          lastActivity: wwjs?.state.lastActivity ?? null,
        },
        stats: {
          messages24h: Number(counts?.count24h ?? 0),
          messages7d: Number(counts?.count7d ?? 0),
          lastMessageAt: counts?.lastMessageAt ?? null,
        },
      };
    });
  }),

  // Force disconnect a tenant's WhatsApp
  disconnectTenant: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ input }) => {
      await destroyClientForTenant(input.tenantId);
      return { success: true };
    }),

  // Force reconnect (reinitialize) a tenant's WhatsApp
  reconnectTenant: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ input }) => {
      await destroyClientForTenant(input.tenantId);
      void initClientForTenant(input.tenantId);
      return { success: true };
    }),

  // Get summary stats for admin dashboard header
  getSummaryStats: adminProcedure.query(async () => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalTenants] = await db.select({ count: sql<number>`COUNT(*)` }).from(users).where(eq(users.role, "user"));
    const [activeTenants] = await db.select({ count: sql<number>`COUNT(*)` }).from(users).where(and(eq(users.role, "user"), eq(users.isActive, true)));
    const [msgs24h] = await db.select({ count: sql<number>`COUNT(*)` }).from(conversations).where(gte(conversations.createdAt, since24h));
    const wwjsStates = getAllTenantStates();
    const connectedCount = wwjsStates.filter(s => s.state.status === "connected").length;
    return {
      totalTenants: Number(totalTenants.count),
      activeTenants: Number(activeTenants.count),
      connectedWhatsApp: connectedCount,
      messages24h: Number(msgs24h.count),
    };
  }),

  // ── Tenant config management ────────────────────────────────────────────────

  // Get any tenant's full bot config
  getTenantConfig: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      const [config] = await db.select().from(botConfig)
        .where(eq(botConfig.tenantId, input.tenantId)).limit(1);
      if (!config) return null;
      // Never send the actual API key to the frontend — return a masked version
      // so the UI can show "●●●●●●●● (configured)" without leaking the real key.
      const rawKey = config.aiApiKey || "";
      const maskedKey = rawKey
        ? (rawKey.startsWith("enc:") ? "••••••••" : rawKey.slice(0, 4) + "••••••••")
        : "";
      return {
        businessName: config.businessName,
        systemPrompt: config.systemPrompt,
        aiApiUrl: config.aiApiUrl,
        aiApiKey: maskedKey,
        aiModel: config.aiModel,
        enableBusinessHours: config.enableBusinessHours,
        businessHoursStart: config.businessHoursStart,
        businessHoursEnd: config.businessHoursEnd,
        businessDays: config.businessDays.split(",").map((d: string) => {
          const m: Record<string, string> = { "1":"monday","2":"tuesday","3":"wednesday","4":"thursday","5":"friday","6":"saturday","0":"sunday" };
          return m[d] || d;
        }),
        timezone: config.timezone,
        afterHoursMessage: config.afterHoursMessage,
        maxTokens: config.maxTokens,
        language: config.language,
        enableMultiLanguage: config.enableMultiLanguage,
      };
    }),

  // Update any tenant's bot config
  updateTenantConfig: adminProcedure
    .input(z.object({
      tenantId: z.number(),
      businessName: z.string().optional(),
      systemPrompt: z.string().optional(),
      aiApiUrl: z.string().optional(),
      aiApiKey: z.string().optional(),
      aiModel: z.string().optional(),
      enableBusinessHours: z.boolean().optional(),
      businessHoursStart: z.string().optional(),
      businessHoursEnd: z.string().optional(),
      businessDays: z.array(z.string()).optional(),
      timezone: z.string().optional(),
      afterHoursMessage: z.string().optional(),
      maxTokens: z.number().optional(),
      language: z.string().optional(),
      enableMultiLanguage: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const dayMap: Record<string, string> = { monday:"1",tuesday:"2",wednesday:"3",thursday:"4",friday:"5",saturday:"6",sunday:"0" };
      const updates: any = { updatedAt: new Date() };
      if (input.businessName !== undefined) updates.businessName = input.businessName;
      if (input.systemPrompt !== undefined) updates.systemPrompt = input.systemPrompt;
      if (input.aiApiUrl !== undefined) updates.aiApiUrl = input.aiApiUrl;
      if (input.aiApiKey !== undefined) updates.aiApiKey = encryptIfNeeded(input.aiApiKey);
      if (input.aiModel !== undefined) updates.aiModel = input.aiModel;
      if (input.enableBusinessHours !== undefined) updates.enableBusinessHours = input.enableBusinessHours;
      if (input.businessHoursStart !== undefined) updates.businessHoursStart = input.businessHoursStart;
      if (input.businessHoursEnd !== undefined) updates.businessHoursEnd = input.businessHoursEnd;
      if (input.businessDays !== undefined) updates.businessDays = input.businessDays.map((d: string) => dayMap[d] || d).join(",");
      if (input.timezone !== undefined) updates.timezone = input.timezone;
      if (input.afterHoursMessage !== undefined) updates.afterHoursMessage = input.afterHoursMessage;
      if (input.maxTokens !== undefined) updates.maxTokens = input.maxTokens;
      if (input.language !== undefined) updates.language = input.language;
      if (input.enableMultiLanguage !== undefined) updates.enableMultiLanguage = input.enableMultiLanguage;

      const [existing] = await db.select({ id: botConfig.id }).from(botConfig)
        .where(eq(botConfig.tenantId, input.tenantId)).limit(1);
      if (existing) {
        await db.update(botConfig).set(updates).where(eq(botConfig.id, existing.id));
      } else {
        // Create if doesn't exist
        await db.insert(botConfig).values({
          tenantId: input.tenantId,
          businessName: input.businessName ?? "My Business",
          systemPrompt: input.systemPrompt ?? "You are a helpful assistant for {businessName}.",
          afterHoursMessage: "Thank you for contacting us! We'll respond during business hours.",
          aiModel: input.aiModel ?? process.env.AI_MODEL ?? null,
          aiApiUrl: input.aiApiUrl ?? process.env.AI_API_URL ?? null,
          aiApiKey: encryptIfNeeded(input.aiApiKey ?? process.env.AI_API_KEY ?? ""),
          maxTokens: input.maxTokens ?? 500,
          ...updates,
        });
      }
      return { success: true };
    }),

  // ── Tenant template management ────────────────────────────────────────────────

  getTenantTemplates: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      const rows = await db.select().from(templates)
        .where(eq(templates.tenantId, input.tenantId))
        .orderBy(desc(templates.createdAt));
      return { templates: rows, total: rows.length };
    }),

  createTenantTemplate: adminProcedure
    .input(z.object({
      tenantId: z.number(),
      name: z.string().min(1),
      keywords: z.array(z.string()).min(1),
      response: z.string().min(1),
      category: z.string().default("general"),
      priority: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      await db.insert(templates).values({
        tenantId: input.tenantId,
        name: input.name,
        keywords: input.keywords,
        response: input.response,
        category: input.category,
        priority: input.priority,
        trigger: input.keywords.join(", "),
      });
      return { success: true };
    }),

  updateTenantTemplate: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      response: z.string().optional(),
      category: z.string().optional(),
      priority: z.number().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const updates: any = { updatedAt: new Date() };
      if (rest.name !== undefined) updates.name = rest.name;
      if (rest.keywords !== undefined) { updates.keywords = rest.keywords; updates.trigger = rest.keywords.join(", "); }
      if (rest.response !== undefined) updates.response = rest.response;
      if (rest.category !== undefined) updates.category = rest.category;
      if (rest.priority !== undefined) updates.priority = rest.priority;
      if (rest.isActive !== undefined) updates.isActive = rest.isActive;
      await db.update(templates).set(updates).where(eq(templates.id, id));
      return { success: true };
    }),

  deleteTenantTemplate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(templates).where(eq(templates.id, input.id));
      return { success: true };
    }),

  // ── Tenant knowledge base management ─────────────────────────────────────────

  getTenantKnowledgeBase: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      const rows = await db.select().from(knowledgeBase)
        .where(eq(knowledgeBase.tenantId, input.tenantId))
        .orderBy(desc(knowledgeBase.createdAt));
      return { articles: rows, total: rows.length };
    }),

  createTenantKBEntry: adminProcedure
    .input(z.object({
      tenantId: z.number(),
      title: z.string().min(1),
      content: z.string().min(1),
      category: z.string().default("general"),
    }))
    .mutation(async ({ input }) => {
      await db.insert(knowledgeBase).values({
        tenantId: input.tenantId,
        title: input.title,
        content: input.content,
        category: input.category,
        type: "text",
        status: "ready",
        isActive: true,
      });
      return { success: true };
    }),

  updateTenantKBEntry: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      content: z.string().optional(),
      category: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await db.update(knowledgeBase).set({ ...rest, updatedAt: new Date() })
        .where(eq(knowledgeBase.id, id));
      return { success: true };
    }),

  addTenantKBUrl: adminProcedure
    .input(z.object({
      tenantId: z.number(),
      url: z.string().url(),
      category: z.string().default("general"),
    }))
    .mutation(async ({ input }) => {
      const { scrapeUrl } = await import("../services/knowledgeScraper.js");
      const [result] = await db.insert(knowledgeBase).values({
        tenantId: input.tenantId,
        title: new URL(input.url).hostname,
        content: "Processing...",
        type: "link",
        status: "processing",
        sourceUrl: input.url,
        category: input.category,
        isActive: false,
      });
      const id = getInsertId(result) as number;
      scrapeUrl(input.url)
        .then(async ({ title, content }) => {
          await db.update(knowledgeBase).set({ title, content, status: "ready", isActive: true, lastSyncAt: new Date(), updatedAt: new Date() })
            .where(eq(knowledgeBase.id, id));
        })
        .catch(async (err: Error) => {
          await db.update(knowledgeBase).set({ status: "error", processingError: err.message, updatedAt: new Date() })
            .where(eq(knowledgeBase.id, id));
        });
      return { success: true, id, message: "URL queued for scraping." };
    }),

  deleteTenantKBEntry: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(knowledgeBase).where(eq(knowledgeBase.id, input.id));
      return { success: true };
    }),

  // ── AI IT Assistant ────────────────────────────────────────────────────────

  // ── AI IT Assistant ────────────────────────────────────────────────────────

  /** Helper: resolve AI config for admin (own config → first tenant config) */

  /**
   * diagnose: Deep real-system health scan → AI analysis → structured issues.
   */
  diagnose: adminProcedure.mutation(async ({ ctx }) => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);

    // ── 1. All tenants ─────────────────────────────────────────────────────
    const tenants = await db.select({
      id: users.id, name: users.name, email: users.email, isActive: users.isActive,
    }).from(users).where(eq(users.role, "user"));

    // ── 2. WhatsApp live states ────────────────────────────────────────────
    const wwjsStates = getAllTenantStates();

    // ── 3. Message stats: counts, escalation, avg response time ───────────
    const msgStats = await db.select({
      tenantId:        conversations.tenantId,
      total7d:         sql<number>`SUM(CASE WHEN ${conversations.createdAt} >= ${since7d}  THEN 1 ELSE 0 END)`,
      total24h:        sql<number>`SUM(CASE WHEN ${conversations.createdAt} >= ${since24h} THEN 1 ELSE 0 END)`,
      escalated7d:     sql<number>`SUM(CASE WHEN ${conversations.createdAt} >= ${since7d}  AND ${conversations.isEscalated} = 1 THEN 1 ELSE 0 END)`,
      avgResponseMs:   sql<number>`AVG(CASE WHEN ${conversations.createdAt} >= ${since7d} AND ${conversations.responseTimeMs} IS NOT NULL THEN ${conversations.responseTimeMs} END)`,
      slowResponses7d: sql<number>`SUM(CASE WHEN ${conversations.createdAt} >= ${since7d} AND ${conversations.responseTimeMs} > 20000 THEN 1 ELSE 0 END)`,
    }).from(conversations).groupBy(conversations.tenantId);

    // ── 4. Bot configs ─────────────────────────────────────────────────────
    const configs = await db.select({
      tenantId:     botConfig.tenantId,
      businessName: botConfig.businessName,
      systemPrompt: botConfig.systemPrompt,
      aiApiUrl:     botConfig.aiApiUrl,
      aiModel:      botConfig.aiModel,
      aiApiKey:     botConfig.aiApiKey,
    }).from(botConfig);

    // ── 5. KB counts ───────────────────────────────────────────────────────
    const kbCounts = await db.select({
      tenantId: knowledgeBase.tenantId,
      total:    sql<number>`COUNT(*)`,
    }).from(knowledgeBase).groupBy(knowledgeBase.tenantId);

    // ── 6. Template counts ─────────────────────────────────────────────────
    const templateCounts = await db.select({
      tenantId: templates.tenantId,
      total:    sql<number>`COUNT(*)`,
    }).from(templates).groupBy(templates.tenantId);

    // ── 7. Customer counts ─────────────────────────────────────────────────
    const custCounts = await db.select({
      tenantId: customers.tenantId,
      total:    sql<number>`COUNT(*)`,
    }).from(customers).groupBy(customers.tenantId);

    // ── 8. Recent escalated conversation samples for high-esc tenants ──────
    const escalSamples = await db.select({
      tenantId:    conversations.tenantId,
      message:     conversations.message,
      response:    conversations.response,
      createdAt:   conversations.createdAt,
    }).from(conversations)
      .where(and(eq(conversations.isEscalated, true), gte(conversations.createdAt, since7d)))
      .orderBy(desc(conversations.createdAt))
      .limit(20);

    // Group escalation samples by tenant (last 3 per tenant)
    const escalByTenant: Record<number, { message: string; response: string | null; createdAt: Date }[]> = {};
    for (const row of escalSamples) {
      if (!escalByTenant[row.tenantId]) escalByTenant[row.tenantId] = [];
      if (escalByTenant[row.tenantId].length < 3) escalByTenant[row.tenantId].push(row);
    }

    // ── 9. WhatsApp session files on disk ──────────────────────────────────
    const sessionRoot = path.join(process.cwd(), ".wwebjs_auth");
    const sessionCheck: Record<number, { exists: boolean; sizeKb: number }> = {};
    for (const t of tenants) {
      const dir = path.join(sessionRoot, `tenant_${t.id}`);
      try {
        const stat = fs.statSync(dir);
        if (stat.isDirectory()) {
          // Rough size estimate from number of entries
          const entries = fs.readdirSync(dir).length;
          sessionCheck[t.id] = { exists: true, sizeKb: entries * 2 }; // rough estimate
        } else {
          sessionCheck[t.id] = { exists: false, sizeKb: 0 };
        }
      } catch {
        sessionCheck[t.id] = { exists: false, sizeKb: 0 };
      }
    }

    // ── 10. Build per-tenant snapshot ──────────────────────────────────────
    const snapshot = tenants.map(t => {
      const wa     = wwjsStates.find(s => s.tenantId === t.id);
      const stats  = msgStats.find(m => m.tenantId === t.id);
      const cfg    = configs.find(c => c.tenantId === t.id);
      const kb     = kbCounts.find(k => k.tenantId === t.id);
      const tmpl   = templateCounts.find(k => k.tenantId === t.id);
      const custs  = custCounts.find(c => c.tenantId === t.id);
      const sess   = sessionCheck[t.id] ?? { exists: false, sizeKb: 0 };
      const samples = escalByTenant[t.id] ?? [];

      const total7d = Number(stats?.total7d ?? 0);
      const escalated7d = Number(stats?.escalated7d ?? 0);
      const escalationRate = total7d > 0 ? Math.round((escalated7d / total7d) * 100) : 0;

      // Config health checks
      const configIssues: string[] = [];
      if (!cfg) configIssues.push("No bot config created yet");
      else {
        if (!cfg.businessName) configIssues.push("Business name not set");
        if (!cfg.systemPrompt || cfg.systemPrompt.length < 50) configIssues.push("System prompt missing or too short (<50 chars)");
        if (!cfg.aiApiUrl)    configIssues.push("AI API URL not configured");
        if (!cfg.aiModel)     configIssues.push("AI model not set");
        if (!cfg.aiApiKey)    configIssues.push("AI API key not set");
        if (cfg.aiApiUrl && !cfg.aiApiUrl.startsWith("http")) configIssues.push("AI API URL format looks invalid");
      }

      return {
        id: t.id,
        name: t.name,
        email: t.email,
        isActive: t.isActive,
        whatsapp: {
          status:        wa?.state.status        ?? "disconnected",
          phoneNumber:   wa?.state.phoneNumber   ?? null,
          error:         wa?.state.error         ?? null,
          lastActivity:  wa?.state.lastActivity  ?? null,
          sessionOnDisk: sess.exists,
        },
        ai: cfg ? {
          configured:      !!(cfg.aiApiUrl && cfg.aiModel && cfg.aiApiKey),
          hasSystemPrompt: !!(cfg.systemPrompt && cfg.systemPrompt.length >= 50),
          systemPromptLen: cfg.systemPrompt?.length ?? 0,
          model:           cfg.aiModel,
          provider:        cfg.aiApiUrl?.includes("groq") ? "Groq"
                         : cfg.aiApiUrl?.includes("openai") ? "OpenAI"
                         : "Ollama/Custom",
          apiKeySet:       !!(cfg.aiApiKey),
        } : { configured: false, hasSystemPrompt: false, systemPromptLen: 0, model: null, provider: null, apiKeySet: false },
        configIssues,
        stats: {
          messages24h:    Number(stats?.total24h      ?? 0),
          messages7d:     total7d,
          escalated7d,
          slowResponses7d:Number(stats?.slowResponses7d ?? 0),
          avgResponseMs:  stats?.avgResponseMs ? Math.round(Number(stats.avgResponseMs)) : null,
          escalationRate,
        },
        kb:        { articles: Number(kb?.total    ?? 0) },
        templates: { count:    Number(tmpl?.total  ?? 0) },
        customers: { total:    Number(custs?.total ?? 0) },
        escalationSamples: samples.map(s => ({
          message:  (s.message  ?? "").substring(0, 120),
          response: (s.response ?? "").substring(0, 120),
        })),
      };
    });

    // ── 11. Resolve AI config for the diagnostic call ──────────────────────
    const [adminCfg] = await db.select({
      aiApiUrl: botConfig.aiApiUrl, aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel,
    }).from(botConfig).where(eq(botConfig.tenantId, ctx.user.userId)).limit(1);

    const [anyCfg] = await db.select({
      aiApiUrl: botConfig.aiApiUrl, aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel,
    }).from(botConfig).where(isNotNull(botConfig.aiApiUrl)).limit(1);

    const aiCfg = (adminCfg?.aiApiUrl ? adminCfg : anyCfg) ?? null;
    if (!aiCfg?.aiApiUrl) {
      return {
        summary: "No AI provider configured. Please set up your AI in Configuration first.",
        issues: [],
        healthScore: 0,
        generatedAt: new Date().toISOString(),
      };
    }

    // ── 12. AI diagnostic prompt ───────────────────────────────────────────
    const diagPrompt = `You are an expert AI IT assistant for WAFlow — a multi-tenant WhatsApp AI receptionist SaaS platform.

Analyse the following REAL platform snapshot and return ONLY a JSON object with this exact shape:
{
  "summary": "2-3 sentence executive summary of overall platform health",
  "healthScore": <integer 0-100>,
  "issues": [
    {
      "severity": "critical" | "warning" | "info",
      "tenant": "<tenant name, or 'Platform' for global issues>",
      "tenantId": <number or null>,
      "issue": "<short issue title, max 8 words>",
      "detail": "<1-2 sentences: what is wrong and why it matters>",
      "recommendation": "<specific, actionable fix the admin should do>",
      "autoFixAction": <"reconnect_whatsapp" | "clear_whatsapp_session" | "fix_missing_system_prompt" | null>
    }
  ]
}

autoFixAction rules (only set one if you are confident it will solve the issue):
- "reconnect_whatsapp"       → WhatsApp status is "error" but session files exist on disk (soft reconnect)
- "clear_whatsapp_session"   → WhatsApp is stuck / auth_failure, session must be wiped and QR rescanned
- "fix_missing_system_prompt"→ configIssues contains "System prompt missing" and tenant is otherwise configured
- null                       → everything else (manual admin action required)

Severity guidelines:
- critical: broken WhatsApp, AI not configured at all, configIssues has 3+ problems
- warning : escalation rate >30%, no KB articles but AI configured, slow responses (avgResponseMs > 15000), inactive tenant with messages last 7d = 0 but supposedly active
- info    : suggestions like "add KB articles", "create templates", low customer count

Order: critical first, then warning, then info. Max 15 issues. Return ONLY the JSON.

REAL PLATFORM SNAPSHOT — ${new Date().toISOString()}:
${JSON.stringify(snapshot, null, 2)}`;

    const openai = new OpenAI({ baseURL: aiCfg.aiApiUrl, apiKey: decrypt(aiCfg.aiApiKey || "") || "ollama" });

    let raw = "{}";
    try {
      const completion = await openai.chat.completions.create({
        model: aiCfg.aiModel,
        messages: [{ role: "user", content: diagPrompt }],
        temperature: 0.15,
        max_tokens: 2000,
      });
      raw = completion.choices[0]?.message?.content ?? "{}";
    } catch (e: any) {
      return {
        summary: `AI diagnostic failed: ${e?.message ?? "unknown error"}`,
        issues: [],
        healthScore: 0,
        generatedAt: new Date().toISOString(),
      };
    }

    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const match   = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) return { summary: "AI returned unparseable response.", issues: [], healthScore: 0, generatedAt: new Date().toISOString() };

    try {
      const parsed = JSON.parse(match[0]);
      return {
        summary:     String(parsed.summary ?? ""),
        issues:      Array.isArray(parsed.issues) ? parsed.issues : [],
        healthScore: Math.min(100, Math.max(0, Number(parsed.healthScore ?? 50))),
        generatedAt: new Date().toISOString(),
      };
    } catch {
      return { summary: "Could not parse AI response.", issues: [], healthScore: 0, generatedAt: new Date().toISOString() };
    }
  }),

  /**
   * getTenantDiagnostic: Deep per-tenant inspection — called from the chat
   * when the admin asks about a specific tenant.
   */
  getTenantDiagnostic: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      const [tenant] = await db.select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive })
        .from(users).where(eq(users.id, input.tenantId)).limit(1);
      if (!tenant) return null;

      const [cfg] = await db.select().from(botConfig).where(eq(botConfig.tenantId, input.tenantId)).limit(1);
      const wa    = getStateForTenant(input.tenantId);

      // Last 10 conversations
      const recentConvs = await db.select({
        message:       conversations.message,
        response:      conversations.response,
        source:        conversations.source,
        isEscalated:   conversations.isEscalated,
        responseTimeMs:conversations.responseTimeMs,
        createdAt:     conversations.createdAt,
      }).from(conversations)
        .where(eq(conversations.tenantId, input.tenantId))
        .orderBy(desc(conversations.createdAt))
        .limit(10);

      // KB articles (titles only)
      const kbArticles = await db.select({
        title:   knowledgeBase.title,
        updatedAt: knowledgeBase.updatedAt,
      }).from(knowledgeBase).where(eq(knowledgeBase.tenantId, input.tenantId));

      // Customer count
      const [{ custTotal }] = await db.select({ custTotal: sql<number>`COUNT(*)` })
        .from(customers).where(eq(customers.tenantId, input.tenantId));

      // Template count
      const [{ tmplTotal }] = await db.select({ tmplTotal: sql<number>`COUNT(*)` })
        .from(templates).where(eq(templates.tenantId, input.tenantId));

      // Session on disk
      const sessDir = path.join(process.cwd(), ".wwebjs_auth", `tenant_${input.tenantId}`);
      const sessionOnDisk = fs.existsSync(sessDir);

      return {
        tenant,
        whatsapp: { ...wa, sessionOnDisk },
        config: cfg ? {
          businessName:     cfg.businessName,
          systemPromptLen:  cfg.systemPrompt?.length ?? 0,
          systemPromptSnip: cfg.systemPrompt?.substring(0, 200) ?? null,
          aiApiUrl:         cfg.aiApiUrl,
          aiModel:          cfg.aiModel,
          apiKeySet:        !!(cfg.aiApiKey),
          enableBusinessHours: (cfg as any).enableBusinessHours ?? false,
        } : null,
        recentConversations: recentConvs.map(c => ({
          message:       c.message?.substring(0, 150),
          response:      c.response?.substring(0, 150),
          source:        c.source,
          isEscalated:   c.isEscalated,
          responseTimeMs:c.responseTimeMs,
          createdAt:     c.createdAt,
        })),
        kb: kbArticles.map(k => k.title),
        stats: {
          customers: Number(custTotal ?? 0),
          templates: Number(tmplTotal ?? 0),
          kbArticles: kbArticles.length,
        },
        sessionOnDisk,
      };
    }),

  /**
   * askAssistant: Conversational follow-up with live tenant context lookup.
   */
  askAssistant: adminProcedure
    .input(z.object({
      message:       z.string().min(1).max(2000),
      systemContext: z.string().max(8000).default(""),
      tenantId:      z.number().optional(), // if set, fetch deep context for this tenant
    }))
    .mutation(async ({ input, ctx }) => {
      const [adminCfg] = await db.select({
        aiApiUrl: botConfig.aiApiUrl, aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel,
      }).from(botConfig).where(eq(botConfig.tenantId, ctx.user.userId)).limit(1);

      const [anyCfg] = await db.select({
        aiApiUrl: botConfig.aiApiUrl, aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel,
      }).from(botConfig).where(isNotNull(botConfig.aiApiUrl)).limit(1);

      const aiCfg = (adminCfg?.aiApiUrl ? adminCfg : anyCfg) ?? null;
      if (!aiCfg?.aiApiUrl) return { response: "No AI provider configured. Please set up AI in Configuration first." };

      // If a tenantId is provided, fetch live deep diagnostic context
      let tenantCtx = "";
      if (input.tenantId) {
        const [tenant] = await db.select({ name: users.name, email: users.email })
          .from(users).where(eq(users.id, input.tenantId)).limit(1);
        const [cfg] = await db.select({
          businessName: botConfig.businessName, systemPrompt: botConfig.systemPrompt,
          aiApiUrl: botConfig.aiApiUrl, aiModel: botConfig.aiModel, aiApiKey: botConfig.aiApiKey,
        }).from(botConfig).where(eq(botConfig.tenantId, input.tenantId)).limit(1);
        const wa = getStateForTenant(input.tenantId);
        const sessDir = path.join(process.cwd(), ".wwebjs_auth", `tenant_${input.tenantId}`);
        const sessOnDisk = fs.existsSync(sessDir);

        // Last 5 conversations
        const convs = await db.select({
          message: conversations.message, response: conversations.response,
          source: conversations.source, isEscalated: conversations.isEscalated,
          responseTimeMs: conversations.responseTimeMs,
        }).from(conversations)
          .where(eq(conversations.tenantId, input.tenantId))
          .orderBy(desc(conversations.createdAt)).limit(5);

        const [{ kbCount }] = await db.select({ kbCount: sql<number>`COUNT(*)` })
          .from(knowledgeBase).where(eq(knowledgeBase.tenantId, input.tenantId));

        tenantCtx = `\n\nLIVE TENANT DATA — ${tenant?.name ?? "unknown"} (id=${input.tenantId}):
WhatsApp: status=${wa.status}, phone=${wa.phoneNumber ?? "none"}, error=${wa.error ?? "none"}, sessionOnDisk=${sessOnDisk}
Config: businessName="${cfg?.businessName ?? "not set"}", aiUrl=${cfg?.aiApiUrl ?? "none"}, model=${cfg?.aiModel ?? "none"}, apiKeySet=${!!(cfg?.aiApiKey)}, systemPromptLen=${cfg?.systemPrompt?.length ?? 0}
KB articles: ${Number(kbCount ?? 0)}
Recent conversations (last 5):
${convs.map((c, i) => `  [${i+1}] source=${c.source} escalated=${c.isEscalated} responseTime=${c.responseTimeMs ?? "?"}ms\n       msg: "${c.message?.substring(0, 100) ?? ""}"\n       reply: "${c.response?.substring(0, 100) ?? ""}"`).join("\n")}`;
      }

      const openai = new OpenAI({ baseURL: aiCfg.aiApiUrl, apiKey: decrypt(aiCfg.aiApiKey || "") || "ollama" });

      const systemMsg = `You are an expert AI IT assistant for WAFlow, a multi-tenant WhatsApp AI receptionist SaaS platform.
Stack: Node.js/Express, tRPC, MySQL, Drizzle ORM, whatsapp-web.js (WWJS), Groq/OpenAI/Ollama AI providers.
You help the admin diagnose and fix platform issues. Be concise, technical, and actionable.
When you suggest a fix, state the exact step (e.g. "reconnect WhatsApp in Monitoring", "update system prompt in Configuration").
${input.systemContext ? `\nLAST DIAGNOSIS CONTEXT:\n${input.systemContext}` : ""}${tenantCtx}`;

      try {
        const completion = await openai.chat.completions.create({
          model: aiCfg.aiModel,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user",   content: input.message },
          ],
          temperature: 0.3,
          max_tokens:  700,
        });
        return { response: completion.choices[0]?.message?.content ?? "No response from AI." };
      } catch (e: any) {
        return { response: `AI call failed: ${e?.message ?? "unknown error"}` };
      }
    }),

  /**
   * executeAIFix: Execute an auto-fix action on behalf of a tenant.
   * Supported actions: reconnect_whatsapp, clear_whatsapp_session,
   *                    fix_missing_system_prompt, test_ai_connection
   */
  executeAIFix: adminProcedure
    .input(z.object({
      action:   z.enum(["reconnect_whatsapp", "clear_whatsapp_session", "fix_missing_system_prompt", "test_ai_connection"]),
      tenantId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const tid = input.tenantId;

      // ── reconnect_whatsapp: soft reconnect (keep session files) ───────────
      if (input.action === "reconnect_whatsapp") {
        if (!tid) return { success: false, message: "tenantId required" };
        await destroyClientForTenant(tid);
        void initClientForTenant(tid);
        return { success: true, message: `WhatsApp soft-reconnect initiated for tenant ${tid}. Check the QR page if it requires rescanning.` };
      }

      // ── clear_whatsapp_session: wipe session files + reinit ───────────────
      if (input.action === "clear_whatsapp_session") {
        if (!tid) return { success: false, message: "tenantId required" };
        await destroyClientForTenant(tid);
        const sessDir = path.join(process.cwd(), ".wwebjs_auth", `tenant_${tid}`);
        if (fs.existsSync(sessDir)) {
          fs.rmSync(sessDir, { recursive: true, force: true });
        }
        void initClientForTenant(tid);
        return { success: true, message: `Session files cleared for tenant ${tid}. WhatsApp will show a fresh QR code — the tenant must rescan.` };
      }

      // ── fix_missing_system_prompt: insert default prompt ──────────────────
      if (input.action === "fix_missing_system_prompt") {
        if (!tid) return { success: false, message: "tenantId required" };
        const [cfg] = await db.select({ systemPrompt: botConfig.systemPrompt, businessName: botConfig.businessName })
          .from(botConfig).where(eq(botConfig.tenantId, tid)).limit(1);
        if (!cfg) return { success: false, message: "No bot config found for this tenant. Create one in Setup first." };
        if (cfg.systemPrompt && cfg.systemPrompt.length >= 50) {
          return { success: false, message: "Tenant already has a system prompt set." };
        }
        const biz = cfg.businessName || "our business";
        const defaultPrompt = `You are a professional AI receptionist for ${biz}. Your role is to assist customers warmly and professionally via WhatsApp.

Greet every customer by name when possible. Answer questions about our services, business hours, and pricing using the knowledge base provided. If you cannot answer a question confidently, offer to connect the customer with a human agent.

Always be helpful, concise, and friendly. Do not make up information. If asked to book an appointment, collect the customer's preferred service, date, and time, then confirm the booking.

Respond in the same language the customer uses.`;
        await db.update(botConfig)
          .set({ systemPrompt: defaultPrompt })
          .where(eq(botConfig.tenantId, tid));
        return { success: true, message: `Default system prompt applied to tenant ${tid}. You should review and customise it in Configuration.` };
      }

      // ── test_ai_connection: live ping of tenant's AI endpoint ─────────────
      if (input.action === "test_ai_connection") {
        if (!tid) return { success: false, message: "tenantId required" };
        const [cfg] = await db.select({
          aiApiUrl: botConfig.aiApiUrl, aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel,
        }).from(botConfig).where(eq(botConfig.tenantId, tid)).limit(1);
        if (!cfg?.aiApiUrl) return { success: false, message: "Tenant has no AI URL configured." };

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const decKey = decrypt(cfg.aiApiKey || "");
        if (decKey && decKey !== "ollama") headers["Authorization"] = `Bearer ${decKey}`;
        try {
          const res = await fetch(`${cfg.aiApiUrl.replace(/\/+$/, "")}/models`, {
            headers,
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) return { success: false, message: `AI endpoint returned HTTP ${res.status}. Check API key and URL.` };
          return { success: true, message: `AI endpoint (${cfg.aiApiUrl}) is reachable and returned HTTP ${res.status}. Model: ${cfg.aiModel}.` };
        } catch (e: any) {
          return { success: false, message: `AI connection failed: ${e?.message ?? "timeout"}` };
        }
      }

      return { success: false, message: "Unknown action" };
    }),

  // List all tenants (for dropdowns)
  listTenants: adminProcedure.query(async () => {
    return db.select({ id: users.id, name: users.name, email: users.email })
      .from(users).where(eq(users.role, "user"));
  }),

  // Get WhatsApp state for a specific tenant (used for QR setup after user creation)
  getTenantWhatsAppState: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(({ input }) => {
      const state = getStateForTenant(input.tenantId);
      return {
        status: state.status,
        qrDataUrl: state.qrDataUrl,
        phoneNumber: state.phoneNumber,
        name: state.name,
        error: state.error,
        loadingPercent: state.loadingPercent,
        loadingMessage: state.loadingMessage,
      };
    }),

  // Start WhatsApp client for a tenant (for new user onboarding)
  initTenantWhatsApp: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .mutation(async ({ input }) => {
      void initClientForTenant(input.tenantId);
      return { success: true };
    }),

  // Scrape a URL and add its content as a KB entry for a tenant
  addKBFromUrl: adminProcedure
    .input(z.object({
      tenantId: z.number(),
      url: z.string().url(),
      category: z.string().default("general"),
    }))
    .mutation(async ({ input }) => {
      // Fetch the URL
      let html: string;
      try {
        const resp = await fetch(input.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; WAFlow/1.0; +https://waflow.ai)",
            "Accept": "text/html,application/xhtml+xml",
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        html = await resp.text();
      } catch (err: any) {
        throw new Error(`Could not fetch URL: ${err.message}`);
      }

      // Parse HTML with cheerio
      const { load } = await import("cheerio");
      const $ = load(html);

      // Extract page title
      const pageTitle = $("title").text().trim() ||
        $("h1").first().text().trim() ||
        new URL(input.url).hostname;

      // Remove noisy elements
      $("script, style, noscript, nav, footer, header, aside, iframe, [role='navigation'], [role='banner'], [role='complementary']").remove();
      $(".nav, .navbar, .footer, .header, .sidebar, .cookie-banner, .ad, .advertisement").remove();

      // Try to grab main content first, fall back to body
      const mainEl = $("main, article, [role='main'], #content, .content, #main, .main").first();
      const rawText = (mainEl.length ? mainEl : $("body")).text();

      const content = rawText
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 100_000);

      if (content.length < 50) {
        throw new Error("Could not extract meaningful content from this URL. The page may require JavaScript or block crawlers.");
      }

      await db.insert(knowledgeBase).values({
        tenantId: input.tenantId,
        title: pageTitle.slice(0, 490),
        content,
        type: "link",
        status: "ready",
        sourceUrl: input.url,
        category: input.category,
        tags: [],
        isActive: true,
      });

      const wordCount = content.split(/\s+/).filter(Boolean).length;
      return { success: true, title: pageTitle, wordCount };
    }),
});
