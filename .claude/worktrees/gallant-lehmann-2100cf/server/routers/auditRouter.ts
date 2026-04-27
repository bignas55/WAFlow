import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { auditLogs, users } from "../../drizzle/schema.js";
import { eq, desc, and, gte, like, sql } from "drizzle-orm";
import { escapeLike } from "../utils.js";

export const auditRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(10).max(200).default(50),
      offset: z.number().default(0),
      action: z.string().optional(),
      days: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const where = and(
        eq(auditLogs.tenantId, tenantId),
        gte(auditLogs.createdAt, since),
        input.action ? like(auditLogs.action, `%${escapeLike(input.action)}%`) : undefined
      );

      const [rows, [{ total }]] = await Promise.all([
        db.select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          details: auditLogs.details,
          createdAt: auditLogs.createdAt,
          userId: auditLogs.userId,
        })
          .from(auditLogs)
          .where(where)
          .orderBy(desc(auditLogs.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ total: sql<number>`COUNT(*)` }).from(auditLogs).where(where),
      ]);

      // Resolve user names
      const userIds = [...new Set(rows.map(r => r.userId).filter(Boolean))] as number[];
      const userMap: Record<number, string> = {};
      if (userIds.length) {
        const names = await db.select({ id: users.id, name: users.name }).from(users)
          .where(sql`${users.id} IN (${userIds.join(",")})`);
        for (const u of names) userMap[u.id] = u.name;
      }

      return {
        logs: rows.map(r => ({
          ...r,
          userName: r.userId ? (userMap[r.userId] ?? "System") : "System",
        })),
        total: Number(total),
      };
    }),
});
