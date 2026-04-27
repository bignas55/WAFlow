import { getInsertId } from "../utils.js";
import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { waitlist, services } from "../../drizzle/schema.js";
import { eq, and, desc, type SQL } from "drizzle-orm";

export const waitlistRouter = router({
  list: protectedProcedure
    .input(z.object({ serviceId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const conditions: (SQL | undefined)[] = [eq(waitlist.tenantId, ctx.user.userId)];
      if (input.serviceId) conditions.push(eq(waitlist.serviceId, input.serviceId));
      const rows = await db
        .select({
          id: waitlist.id,
          phoneNumber: waitlist.phoneNumber,
          name: waitlist.name,
          requestedDate: waitlist.requestedDate,
          notifiedAt: waitlist.notifiedAt,
          createdAt: waitlist.createdAt,
          service: { id: services.id, name: services.name },
        })
        .from(waitlist)
        .leftJoin(services, eq(waitlist.serviceId, services.id))
        .where(and(...conditions))
        .orderBy(desc(waitlist.createdAt));
      return rows;
    }),

  add: protectedProcedure
    .input(z.object({
      serviceId: z.number(),
      phoneNumber: z.string().min(1),
      name: z.string().optional(),
      requestedDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [result] = await db.insert(waitlist).values({
        tenantId: ctx.user.userId,
        serviceId: input.serviceId,
        phoneNumber: input.phoneNumber,
        name: input.name,
        requestedDate: input.requestedDate,
      });
      return { success: true, id: getInsertId(result) };
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(waitlist)
        .where(and(eq(waitlist.id, input.id), eq(waitlist.tenantId, ctx.user.userId)));
      return { success: true };
    }),
});
