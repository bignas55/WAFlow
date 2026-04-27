import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { outboundWebhooks, outboundWebhookLogs } from "../../drizzle/schema.js";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";

const WEBHOOK_EVENTS = [
  "appointment.booked",
  "appointment.completed",
  "appointment.cancelled",
  "appointment.no_show",
  "message.received",
  "customer.new",
  "broadcast.sent",
  "review.received",
  "*", // all events
] as const;

export const outboundWebhooksRouter = router({

  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(outboundWebhooks)
      .where(eq(outboundWebhooks.tenantId, ctx.user!.userId))
      .orderBy(desc(outboundWebhooks.createdAt));
  }),

  create: protectedProcedure
    .input(z.object({
      name:   z.string().min(1).max(255),
      url:    z.string().url().max(1000),
      events: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const secret = crypto.randomBytes(20).toString("hex");
      await db.insert(outboundWebhooks).values({
        tenantId: ctx.user!.userId,
        name:     input.name,
        url:      input.url,
        events:   input.events,
        secret,
        isActive: 1,
      });
      return { ok: true, secret };
    }),

  update: protectedProcedure
    .input(z.object({
      id:       z.number().int(),
      name:     z.string().min(1).max(255).optional(),
      url:      z.string().url().max(1000).optional(),
      events:   z.array(z.string()).min(1).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      await db.update(outboundWebhooks)
        .set({
          ...(fields.name     !== undefined ? { name:     fields.name }     : {}),
          ...(fields.url      !== undefined ? { url:      fields.url }      : {}),
          ...(fields.events   !== undefined ? { events:   fields.events }   : {}),
          ...(fields.isActive !== undefined ? { isActive: fields.isActive ? 1 : 0 } : {}),
        })
        .where(and(eq(outboundWebhooks.id, id), eq(outboundWebhooks.tenantId, ctx.user!.userId)));
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(outboundWebhooks)
        .where(and(eq(outboundWebhooks.id, input.id), eq(outboundWebhooks.tenantId, ctx.user!.userId)));
      return { ok: true };
    }),

  regenerateSecret: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const secret = crypto.randomBytes(20).toString("hex");
      await db.update(outboundWebhooks)
        .set({ secret })
        .where(and(eq(outboundWebhooks.id, input.id), eq(outboundWebhooks.tenantId, ctx.user!.userId)));
      return { secret };
    }),

  recentLogs: protectedProcedure
    .input(z.object({ webhookId: z.number().int(), limit: z.number().int().default(20) }))
    .query(async ({ ctx, input }) => {
      return db.select().from(outboundWebhookLogs)
        .where(and(
          eq(outboundWebhookLogs.webhookId, input.webhookId),
          eq(outboundWebhookLogs.tenantId, ctx.user!.userId),
        ))
        .orderBy(desc(outboundWebhookLogs.createdAt))
        .limit(input.limit);
    }),

  // Send a test event to verify the endpoint works
  test: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [hook] = await db.select().from(outboundWebhooks)
        .where(and(eq(outboundWebhooks.id, input.id), eq(outboundWebhooks.tenantId, ctx.user!.userId)))
        .limit(1);
      if (!hook) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Webhook not found",
        });
      }

      const { dispatchWebhook } = await import("../services/webhookDispatch.js");
      await dispatchWebhook(ctx.user!.userId, "appointment.booked", {
        test: true,
        message: "This is a test event from WAFlow",
        timestamp: new Date().toISOString(),
      });
      return { ok: true };
    }),

  availableEvents: protectedProcedure.query(() => WEBHOOK_EVENTS),
});
