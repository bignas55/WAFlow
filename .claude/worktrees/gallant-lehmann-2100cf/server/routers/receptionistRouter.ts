import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { agents, escalationRules, callQueue, agentMetrics, conversationAssignments } from "../../drizzle/schema.js";
import { eq, desc, gte, sql } from "drizzle-orm";

export const receptionistRouter = router({
  agents: {
    list: protectedProcedure.query(async () => {
      return db.select().from(agents).where(eq(agents.isActive, true)).orderBy(agents.name);
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string(), email: z.string().email(), phone: z.string().optional(), role: z.string().default("receptionist") }))
      .mutation(async ({ input }) => {
        await db.insert(agents).values({ ...input, status: "offline" });
        return { success: true };
      }),

    updateStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["available", "busy", "offline"]) }))
      .mutation(async ({ input }) => {
        await db.update(agents).set({ status: input.status, lastActiveAt: new Date() }).where(eq(agents.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.update(agents).set({ isActive: false }).where(eq(agents.id, input.id));
        return { success: true };
      }),
  },

  escalation: {
    rules: {
      list: protectedProcedure.query(async () => {
        return db.select().from(escalationRules).where(eq(escalationRules.isActive, true)).orderBy(escalationRules.createdAt);
      }),
    },

    escalateConversation: protectedProcedure
      .input(z.object({ conversationId: z.number(), agentId: z.number().optional() }))
      .mutation(async ({ input }) => {
        await db.insert(conversationAssignments).values({
          conversationId: input.conversationId,
          agentId: input.agentId || 1,
          status: "active",
        });
        return { success: true };
      }),
  },

  queue: {
    getQueue: protectedProcedure.query(async () => {
      return db.select().from(callQueue)
        .where(eq(callQueue.status, "waiting"))
        .orderBy(desc(callQueue.priority), callQueue.createdAt);
    }),
  },

  metrics: {
    getAgentMetrics: protectedProcedure
      .input(z.object({ days: z.number().default(30) }))
      .query(async () => {
        const agentList = await db.select().from(agents).where(eq(agents.isActive, true));
        return agentList.map(a => ({
          id: a.id,
          name: a.name,
          totalHandled: a.escalationCount,
          totalEscalations: a.escalationCount,
          avgResponseTime: a.avgResponseTime,
          avgSatisfaction: null,
        }));
      }),
  },
});
