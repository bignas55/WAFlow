import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { customers, conversations, botConfig, broadcastSchedules } from "../../drizzle/schema.js";
import { eq, and, sql, inArray, like, or, desc } from "drizzle-orm";
import { escapeLike } from "../utils.js";
import { sendViaWhatsAppWeb, getStateForTenant } from "../whatsapp/WhatsAppWebManager.js";

export const broadcastRouter = router({
  // Get business profile for the Advert Creator
  getAdConfig: protectedProcedure.query(async ({ ctx }) => {
    const [cfg] = await db
      .select({
        businessName:           botConfig.businessName,
        businessWhatsappNumber: botConfig.businessWhatsappNumber,
        businessWebsite:        botConfig.businessWebsite,
        businessTagline:        botConfig.businessTagline,
        businessLogoUrl:        botConfig.businessLogoUrl,
      })
      .from(botConfig)
      .where(eq(botConfig.tenantId, ctx.user.userId))
      .limit(1);
    return cfg ?? null;
  }),

  // Search customers for manual selection
  searchCustomers: protectedProcedure
    .input(z.object({
      search: z.string().default(""),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const rows = await db
        .select({ id: customers.id, phoneNumber: customers.phoneNumber, name: customers.name })
        .from(customers)
        .where(
          input.search.trim()
            ? and(
                eq(customers.tenantId, tenantId),
                or(
                  like(customers.name, `%${escapeLike(input.search)}%`),
                  like(customers.phoneNumber, `%${escapeLike(input.search)}%`)
                )
              )
            : eq(customers.tenantId, tenantId)
        )
        .orderBy(customers.name)
        .limit(input.limit);
      return rows;
    }),

  // Preview: count of customers who would receive the broadcast
  getAudience: protectedProcedure
    .input(z.object({
      filter: z.enum(["all", "active_7d", "active_30d", "appointments_only"]).default("all"),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const allCustomers = await db
        .select({ id: customers.id, phoneNumber: customers.phoneNumber, name: customers.name })
        .from(customers)
        .where(eq(customers.tenantId, tenantId));

      if (input.filter === "all") return { count: allCustomers.length, customers: allCustomers };

      const now = new Date();
      const cutoff = new Date(now.getTime() - (input.filter === "active_7d" ? 7 : 30) * 24 * 60 * 60 * 1000);

      const filtered = [];
      for (const c of allCustomers) {
        const [lastMsg] = await db
          .select({ createdAt: conversations.createdAt })
          .from(conversations)
          .where(and(eq(conversations.tenantId, tenantId), eq(conversations.phoneNumber, c.phoneNumber)))
          .orderBy(sql`${conversations.createdAt} DESC`)
          .limit(1);
        if (lastMsg && lastMsg.createdAt >= cutoff) filtered.push(c);
      }
      return { count: filtered.length, customers: filtered };
    }),

  // Send broadcast message to all matching customers OR a specific list of phone numbers
  send: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(1000),
      filter: z.enum(["all", "active_7d", "active_30d"]).default("all"),
      phoneNumbers: z.array(z.string()).optional(), // if set, overrides filter — sends only to these numbers
      delayMs: z.number().min(500).max(5000).default(1500),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const state = getStateForTenant(tenantId);
      if (state.status !== "connected") {
        throw new Error("WhatsApp is not connected. Please connect first.");
      }

      let targetCustomers: { id: number; phoneNumber: string; name: string | null }[];

      // Manual selection mode — explicit phone numbers list
      if (input.phoneNumbers && input.phoneNumbers.length > 0) {
        targetCustomers = await db
          .select({ id: customers.id, phoneNumber: customers.phoneNumber, name: customers.name })
          .from(customers)
          .where(and(
            eq(customers.tenantId, tenantId),
            inArray(customers.phoneNumber, input.phoneNumbers)
          ));
      } else {
        // Filter mode
        const allCustomers = await db
          .select({ id: customers.id, phoneNumber: customers.phoneNumber, name: customers.name })
          .from(customers)
          .where(eq(customers.tenantId, tenantId));

        targetCustomers = allCustomers;
        if (input.filter !== "all") {
          const now = new Date();
          const cutoff = new Date(now.getTime() - (input.filter === "active_7d" ? 7 : 30) * 24 * 60 * 60 * 1000);
          targetCustomers = [];
          for (const c of allCustomers) {
            const [lastMsg] = await db
              .select({ createdAt: conversations.createdAt })
              .from(conversations)
              .where(and(eq(conversations.tenantId, tenantId), eq(conversations.phoneNumber, c.phoneNumber)))
              .orderBy(sql`${conversations.createdAt} DESC`)
              .limit(1);
            if (lastMsg && lastMsg.createdAt >= cutoff) targetCustomers.push(c);
          }
        }
      }

      // Fire and forget — send in background with delay between each
      let sent = 0;
      let failed = 0;
      (async () => {
        for (const customer of targetCustomers) {
          try {
            // Personalise message with customer name if available
            const personalised = input.message.replace("{name}", customer.name || "there");
            const ok = await sendViaWhatsAppWeb(tenantId, customer.phoneNumber, personalised);
            if (ok) sent++; else failed++;
          } catch { failed++; }
          await new Promise(r => setTimeout(r, input.delayMs));
        }
        console.log(`📢 [Tenant ${tenantId}] Broadcast complete: ${sent} sent, ${failed} failed`);
      })();

      return { success: true, total: targetCustomers.length, message: `Broadcast started — sending to ${targetCustomers.length} customers.` };
    }),

  // Get broadcast history (stored as conversations with source="template")
  getHistory: protectedProcedure.query(async ({ ctx }) => {
    const recent = await db
      .select({
        phoneNumber: conversations.phoneNumber,
        contactName: conversations.contactName,
        response: conversations.response,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .where(and(eq(conversations.tenantId, ctx.user.userId), sql`${conversations.source} = 'template'`))
      .orderBy(sql`${conversations.createdAt} DESC`)
      .limit(50);
    return recent;
  }),

  // ── Scheduled broadcasts ──────────────────────────────────────────────────

  scheduleBroadcast: protectedProcedure
    .input(z.object({
      name:         z.string().min(1).max(255),
      message:      z.string().min(1).max(1000),
      filter:       z.enum(["all", "active_7d", "active_30d"]).optional(),
      phoneNumbers: z.array(z.string()).optional(),
      scheduledAt:  z.string(), // ISO datetime string
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const scheduledAt = new Date(input.scheduledAt);
      if (scheduledAt <= new Date()) throw new Error("Scheduled time must be in the future");

      await db.insert(broadcastSchedules).values({
        tenantId,
        name:         input.name,
        message:      input.message,
        filter:       input.filter ?? null,
        phoneNumbers: input.phoneNumbers ?? null,
        scheduledAt,
        status:       "pending",
      });
      return { ok: true };
    }),

  listScheduled: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(broadcastSchedules)
      .where(eq(broadcastSchedules.tenantId, ctx.user.userId))
      .orderBy(desc(broadcastSchedules.scheduledAt))
      .limit(50);
  }),

  cancelScheduled: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(broadcastSchedules)
        .set({ status: "cancelled" })
        .where(and(
          eq(broadcastSchedules.id, input.id),
          eq(broadcastSchedules.tenantId, ctx.user.userId),
          eq(broadcastSchedules.status, "pending"),
        ));
      return { ok: true };
    }),
});

// NOTE: sendInteractiveButtons is intentionally exported from the router
// so the frontend can use it for template-based interactive messages.
