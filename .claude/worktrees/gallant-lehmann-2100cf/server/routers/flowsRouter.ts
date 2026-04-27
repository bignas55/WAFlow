import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { conversationFlows } from "../../drizzle/schema.js";

// ── Zod schemas (same shape the FlowBuilder frontend already uses) ────────────

const FlowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["message", "condition", "delay", "ai_reply", "escalate", "end"]),
  label: z.string(),
  content: z.string().optional(),
  conditionKey: z.string().optional(),
  conditionValue: z.string().optional(),
  delaySeconds: z.number().optional(),
  trueNext: z.string().optional(),
  falseNext: z.string().optional(),
  next: z.string().optional(),
  x: z.number(),
  y: z.number(),
});

const FlowSchema = z.object({
  id: z.string(),
  name: z.string().max(120),
  trigger: z.string().max(500),
  nodes: z.array(FlowNodeSchema).max(100),
  isActive: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const flowsRouter = router({
  // List all flows for this tenant
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(conversationFlows)
      .where(eq(conversationFlows.tenantId, ctx.user.userId))
      .orderBy(desc(conversationFlows.updatedAt));

    return rows.map((r) => ({
      id: r.flowId,
      name: r.name,
      trigger: r.trigger,
      nodes: (r.nodes as any[]) ?? [],
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }),

  // Save (upsert) a single flow
  save: protectedProcedure
    .input(FlowSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const now = new Date();

      const [existing] = await db
        .select({ id: conversationFlows.id })
        .from(conversationFlows)
        .where(
          and(
            eq(conversationFlows.flowId, input.id),
            eq(conversationFlows.tenantId, tenantId)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(conversationFlows)
          .set({
            name: input.name,
            trigger: input.trigger,
            nodes: input.nodes,
            isActive: input.isActive,
            updatedAt: now,
          })
          .where(eq(conversationFlows.id, existing.id));
      } else {
        await db.insert(conversationFlows).values({
          tenantId,
          flowId: input.id,
          name: input.name,
          trigger: input.trigger,
          nodes: input.nodes,
          isActive: input.isActive,
          createdAt: input.createdAt ? new Date(input.createdAt) : now,
          updatedAt: now,
        });
      }

      return { success: true, id: input.id };
    }),

  // Replace ALL flows for a tenant at once
  saveAll: protectedProcedure
    .input(z.array(FlowSchema))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const now = new Date();

      // Delete existing rows for this tenant then re-insert
      await db
        .delete(conversationFlows)
        .where(eq(conversationFlows.tenantId, tenantId));

      if (input.length > 0) {
        await db.insert(conversationFlows).values(
          input.map((f) => ({
            tenantId,
            flowId: f.id,
            name: f.name,
            trigger: f.trigger,
            nodes: f.nodes,
            isActive: f.isActive,
            createdAt: f.createdAt ? new Date(f.createdAt) : now,
            updatedAt: now,
          }))
        );
      }

      return { success: true, count: input.length };
    }),

  // Delete a single flow
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(conversationFlows)
        .where(
          and(
            eq(conversationFlows.flowId, input.id),
            eq(conversationFlows.tenantId, ctx.user.userId)
          )
        );
      return { success: true };
    }),

  // Toggle active/inactive
  toggleActive: protectedProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .update(conversationFlows)
        .set({ isActive: input.isActive, updatedAt: new Date() })
        .where(
          and(
            eq(conversationFlows.flowId, input.id),
            eq(conversationFlows.tenantId, ctx.user.userId)
          )
        );
      return { success: true };
    }),
});
