import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { templates } from "../../drizzle/schema.js";
import { eq, desc, like, and, or, sql, type SQL } from "drizzle-orm";
import { escapeLike } from "../utils.js";

export const templatesRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), category: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const conditions: (SQL | undefined)[] = [eq(templates.tenantId, ctx.user.userId)];
      if (input.search) conditions.push(
        or(like(templates.name, `%${escapeLike(input.search)}%`), like(templates.trigger, `%${escapeLike(input.search)}%`))
      );
      if (input.category) conditions.push(eq(templates.category, input.category));
      const where = and(...conditions);
      const rows = await db.select().from(templates).where(where).orderBy(desc(templates.createdAt));
      return { templates: rows, total: rows.length };
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      trigger: z.string(),
      response: z.string(),
      category: z.string().default("general"),
      language: z.string().default("en"),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const keywords = input.trigger.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
      await db.insert(templates).values({ ...input, keywords, tenantId: ctx.user.userId });
      return { success: true };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      trigger: z.string().optional(),
      response: z.string().optional(),
      category: z.string().optional(),
      language: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, trigger, ...rest } = input;
      const updates: any = { ...rest, updatedAt: new Date() };
      if (trigger !== undefined) {
        updates.trigger = trigger;
        updates.keywords = trigger.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
      }
      await db.update(templates).set(updates)
        .where(and(eq(templates.tenantId, ctx.user.userId), eq(templates.id, id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(templates)
        .where(and(eq(templates.tenantId, ctx.user.userId), eq(templates.id, input.id)));
      return { success: true };
    }),
});
