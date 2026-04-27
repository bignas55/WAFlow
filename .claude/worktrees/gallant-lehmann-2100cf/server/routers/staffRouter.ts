import { getInsertId } from "../utils.js";
import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { staff } from "../../drizzle/schema.js";
import { eq, and } from "drizzle-orm";
import { logAction } from "../services/auditService.js";

export const staffRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select().from(staff)
      .where(eq(staff.tenantId, ctx.user.userId));
    return rows;
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      bio: z.string().optional(),
      color: z.string().default("#6366f1"),
    }))
    .mutation(async ({ input, ctx }) => {
      const [result] = await db.insert(staff).values({
        tenantId: ctx.user.userId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        bio: input.bio,
        color: input.color,
        isActive: true,
      });
      const id = getInsertId(result) as number;
      logAction(ctx.user.userId, ctx.user.userId, "staff.created", "staff", id, { name: input.name }).catch(() => {});
      return { success: true, id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      bio: z.string().optional(),
      color: z.string().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const updates: any = { updatedAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.phone !== undefined) updates.phone = input.phone;
      if (input.email !== undefined) updates.email = input.email;
      if (input.bio !== undefined) updates.bio = input.bio;
      if (input.color !== undefined) updates.color = input.color;
      if (input.isActive !== undefined) updates.isActive = input.isActive;
      await db.update(staff).set(updates)
        .where(and(eq(staff.id, input.id), eq(staff.tenantId, ctx.user.userId)));
      logAction(ctx.user.userId, ctx.user.userId, "staff.updated", "staff", input.id, updates).catch(() => {});
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(staff)
        .where(and(eq(staff.id, input.id), eq(staff.tenantId, ctx.user.userId)));
      logAction(ctx.user.userId, ctx.user.userId, "staff.deleted", "staff", input.id, {}).catch(() => {});
      return { success: true };
    }),
});
