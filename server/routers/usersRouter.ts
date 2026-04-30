import { getInsertId } from "../utils.js";
import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { users, botConfig } from "../../drizzle/schema.js";
import { eq, ne, desc } from "drizzle-orm";
import { hashPassword } from "../auth.js";
import { TRPCError } from "@trpc/server";
import { encryptIfNeeded } from "../services/encryptionService.js";

// Helper: only admins can manage users
function requireAdmin(role: string) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

export const usersRouter = router({
  // List all users (admin only)
  list: protectedProcedure
    .query(async ({ ctx }) => {
      requireAdmin(ctx.user.role);
      return db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        emailVerified: users.emailVerified,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      }).from(users).orderBy(desc(users.createdAt));
    }),

  // Create a new user (admin only)
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(["admin", "user"]).default("user"),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);

      // Check email not already taken
      const [existing] = await db.select({ id: users.id }).from(users)
        .where(eq(users.email, input.email)).limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "A user with that email already exists" });
      }

      const hashed = await hashPassword(input.password);
      const [result] = await db.insert(users).values({
        name: input.name,
        email: input.email,
        password: hashed,
        role: input.role,
        isActive: true,
      });

      const newUserId = getInsertId(result);

      // Get admin's botConfig to inherit AI settings
      const [adminConfig] = await db.select().from(botConfig)
        .where(eq(botConfig.tenantId, ctx.user.userId)).limit(1);

      // Create default botConfig for this tenant, inheriting from admin's config
      await db.insert(botConfig).values({
        tenantId: newUserId,
        businessName: input.name + "'s Business",
        systemPrompt: adminConfig?.systemPrompt ?? "You are a helpful customer service assistant for {businessName}. Be friendly, professional, and concise.",
        afterHoursMessage: adminConfig?.afterHoursMessage ?? "Thank you for contacting {businessName}! Our team will respond during business hours.",
        aiModel: adminConfig?.aiModel ?? (process.env.AI_MODEL || "gemma4:latest"),
        aiApiUrl: adminConfig?.aiApiUrl ?? (process.env.AI_API_URL || "http://localhost:11434/v1"),
        // aiApiKey is read back via decrypt() in the pipeline — must be stored encrypted
        aiApiKey: adminConfig?.aiApiKey ?? encryptIfNeeded(process.env.AI_API_KEY || "ollama"),
        maxTokens: adminConfig?.maxTokens ?? 500,
      });

      return { success: true, id: newUserId };
    }),

  // Update a user's name, email, role (admin only)
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      email: z.string().email().optional(),
      role: z.enum(["admin", "user"]).optional(),
      newPassword: z.string().min(8).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);

      const [user] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (input.name) updates.name = input.name;
      if (input.role) updates.role = input.role;

      if (input.email && input.email !== user.email) {
        const [conflict] = await db.select({ id: users.id }).from(users)
          .where(eq(users.email, input.email)).limit(1);
        if (conflict && conflict.id !== user.id) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already in use" });
        }
        updates.email = input.email;
      }

      if (input.newPassword) {
        updates.password = await hashPassword(input.newPassword);
        updates.passwordVersion = (user.passwordVersion ?? 1) + 1;
      }

      await db.update(users).set(updates as any).where(eq(users.id, input.id));
      return { success: true };
    }),

  // Toggle active/inactive (admin only — cannot deactivate yourself)
  toggleActive: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);

      if (input.id === ctx.user.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate your own account" });
      }

      const [user] = await db.select({ isActive: users.isActive }).from(users)
        .where(eq(users.id, input.id)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(users)
        .set({ isActive: !user.isActive, updatedAt: new Date() })
        .where(eq(users.id, input.id));

      return { success: true, isActive: !user.isActive };
    }),

  // Delete a user (admin only — cannot delete yourself)
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.user.role);

      if (input.id === ctx.user.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account" });
      }

      await db.delete(users).where(eq(users.id, input.id));
      return { success: true };
    }),
});
