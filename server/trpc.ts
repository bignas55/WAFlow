import { initTRPC, TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import superjson from "superjson";
import { verifyToken, extractTokenFromRequest } from "./auth.js";
import { db } from "./db.js";
import { users } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";

export interface Context {
  req: Request;
  res: Response;
  user: {
    userId: number;
    email: string;
    role: string;
  } | null;
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  const token = extractTokenFromRequest(req);
  if (!token) return { req, res, user: null };

  const payload = verifyToken(token);
  if (!payload) return { req, res, user: null };

  // Validate passwordVersion — if the password changed since this token was issued,
  // the token is stale and we treat the user as unauthenticated.
  const [row] = await db
    .select({ passwordVersion: users.passwordVersion })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (!row || row.passwordVersion !== payload.passwordVersion) {
    // Clear the stale cookie silently
    res.clearCookie("token", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
    return { req, res, user: null };
  }

  return { req, res, user: payload };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // In production, strip stack traces from unexpected errors to prevent info leakage.
    // TRPCErrors (with explicit codes) are passed through as-is; they contain
    // only the message the developer intentionally wrote.
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction && error.code === "INTERNAL_SERVER_ERROR") {
      return {
        ...shape,
        message: "An internal error occurred",
        data: { ...shape.data, stack: undefined },
      };
    }
    return { ...shape, data: { ...shape.data, stack: undefined } };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx });
});

/**
 * billedProcedure — requires active trial OR paid subscription.
 * Use this for all core feature procedures (AI, bookings, broadcast, etc.).
 * Throws FORBIDDEN with code "SUBSCRIPTION_REQUIRED" when account is locked.
 * Admin accounts always pass through.
 */
export const billedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role === "admin") return next({ ctx });

  const { db }    = await import("./db.js");
  const { users } = await import("../drizzle/schema.js");
  const { eq }    = await import("drizzle-orm");

  const [user] = await db
    .select({ accountStatus: users.accountStatus, trialEndDate: users.trialEndDate })
    .from(users)
    .where(eq(users.id, ctx.user.userId))
    .limit(1);

  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });

  const now      = new Date();
  const endDate  = user.trialEndDate ? new Date(user.trialEndDate) : null;
  const trialOk  = user.accountStatus === "trial_active" && endDate && endDate > now;
  const paidOk   = user.accountStatus === "active_paid";

  if (!trialOk && !paidOk) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "SUBSCRIPTION_REQUIRED",
    });
  }

  return next({ ctx });
});
