import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { businessRules } from "../../drizzle/schema.js";
import { TRPCError } from "@trpc/server";
import { getInsertId } from "../utils.js";

const TriggerConfigSchema = z.record(z.string(), z.any());
const ActionConfigSchema = z.record(z.string(), z.any());

const RuleInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  triggerType: z.enum(["keyword", "time", "sentiment", "escalation", "appointment"]),
  triggerConfig: TriggerConfigSchema,
  actionType: z.enum(["send_message", "notify_agent", "book_appointment", "tag_conversation", "escalate"]),
  actionConfig: ActionConfigSchema,
  isActive: z.boolean().default(true),
});

export const businessRulesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(businessRules)
      .where(eq(businessRules.tenantId, ctx.user.userId))
      .orderBy(desc(businessRules.createdAt));
    return rows;
  }),

  create: protectedProcedure
    .input(RuleInputSchema)
    .mutation(async ({ input, ctx }) => {
      const [result] = await db.insert(businessRules).values({
        tenantId: ctx.user.userId,
        name: input.name,
        description: input.description ?? null,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig,
        actionType: input.actionType,
        actionConfig: input.actionConfig,
        isActive: input.isActive,
        executionCount: 0,
      });
      return { success: true, id: getInsertId(result) };
    }),

  update: protectedProcedure
    .input(RuleInputSchema.extend({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select({ id: businessRules.id })
        .from(businessRules)
        .where(and(eq(businessRules.id, input.id), eq(businessRules.tenantId, ctx.user.userId)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Rule not found" });

      await db
        .update(businessRules)
        .set({
          name: input.name,
          description: input.description ?? null,
          triggerType: input.triggerType,
          triggerConfig: input.triggerConfig,
          actionType: input.actionType,
          actionConfig: input.actionConfig,
          isActive: input.isActive,
        })
        .where(eq(businessRules.id, input.id));

      return { success: true };
    }),

  toggleActive: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .update(businessRules)
        .set({ isActive: input.isActive })
        .where(and(eq(businessRules.id, input.id), eq(businessRules.tenantId, ctx.user.userId)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(businessRules)
        .where(and(eq(businessRules.id, input.id), eq(businessRules.tenantId, ctx.user.userId)));
      return { success: true };
    }),
});
