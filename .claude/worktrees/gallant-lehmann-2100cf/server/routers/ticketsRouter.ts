import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { itSupportTickets } from "../../drizzle/schema.js";

// SLA hours by priority
const SLA_HOURS: Record<string, number> = { high: 4, medium: 24, low: 72 };

function slaDeadline(createdAt: Date, priority: string): Date {
  return new Date(createdAt.getTime() + (SLA_HOURS[priority] ?? 24) * 3_600_000);
}

function isSlaBreached(ticket: {
  status: string;
  createdAt: Date;
  priority: string;
  slaDeadlineAt: Date | null;
}): boolean {
  if (ticket.status === "resolved") return false;
  const deadline = ticket.slaDeadlineAt ?? slaDeadline(ticket.createdAt, ticket.priority);
  return new Date() > deadline;
}

export const ticketsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["all", "open", "resolved", "escalated"]).default("all"),
        priority: z.enum(["all", "high", "medium", "low"]).default("all"),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const conditions: any[] = [eq(itSupportTickets.tenantId, tenantId)];
      if (input.status !== "all")
        conditions.push(eq(itSupportTickets.status, input.status as any));
      if (input.priority !== "all")
        conditions.push(eq(itSupportTickets.priority, input.priority as any));

      const rows = await db
        .select()
        .from(itSupportTickets)
        .where(and(...conditions))
        .orderBy(desc(itSupportTickets.createdAt));

      return rows.map((t) => {
        const deadline = t.slaDeadlineAt ?? slaDeadline(t.createdAt, t.priority);
        return {
          id: t.ticketId,
          tenantId: t.tenantId,
          phoneNumber: t.phoneNumber,
          contactName: t.contactName ?? undefined,
          category: t.category,
          priority: t.priority,
          status: t.status,
          description: t.description,
          answers: (t.answers as Record<string, string>) ?? {},
          diagnosis: t.diagnosis ?? undefined,
          createdAt: t.createdAt.toISOString(),
          resolvedAt: t.resolvedAt?.toISOString(),
          slaDeadlineAt: deadline.toISOString(),
          slaBreached: isSlaBreached({ ...t, slaDeadlineAt: t.slaDeadlineAt }),
        };
      });
    }),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.user.userId;
    const rows = await db
      .select()
      .from(itSupportTickets)
      .where(eq(itSupportTickets.tenantId, tenantId));

    const open = rows.filter((t) => t.status === "open").length;
    const resolved = rows.filter((t) => t.status === "resolved").length;
    const escalated = rows.filter((t) => t.status === "escalated").length;
    const breached = rows.filter((t) => isSlaBreached(t)).length;
    const highPriority = rows.filter(
      (t) => t.priority === "high" && t.status !== "resolved"
    ).length;

    return { total: rows.length, open, resolved, escalated, breached, highPriority };
  }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["open", "resolved", "escalated"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db
        .update(itSupportTickets)
        .set({
          status: input.status,
          resolvedAt: input.status === "resolved" ? new Date() : undefined,
        })
        .where(
          and(
            eq(itSupportTickets.ticketId, input.id),
            eq(itSupportTickets.tenantId, ctx.user.userId)
          )
        );
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(itSupportTickets)
        .where(
          and(
            eq(itSupportTickets.ticketId, input.id),
            eq(itSupportTickets.tenantId, ctx.user.userId)
          )
        );
      return { success: true };
    }),
});
