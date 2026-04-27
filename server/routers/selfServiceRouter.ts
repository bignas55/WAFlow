import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { db } from "../db.js";
import { selfServiceTokens, appointments, customers, services, botConfig } from "../../drizzle/schema.js";
import { eq, and, gt } from "drizzle-orm";
import crypto from "crypto";
import { sendViaWhatsAppWeb } from "../whatsapp/WhatsAppWebManager.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ── Router ────────────────────────────────────────────────────────────────────

export const selfServiceRouter = router({

  // Generate + send a self-service link (called after booking) ─────────────────
  sendLink: protectedProcedure
    .input(z.object({
      phoneNumber: z.string(),
      customerId:  z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user!.userId;
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(selfServiceTokens).values({
        tenantId,
        customerId:  input.customerId ?? null,
        phoneNumber: input.phoneNumber,
        token,
        expiresAt,
      });

      const [cfg] = await db.select({ businessName: botConfig.businessName })
        .from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
      const link = `${baseUrl}/manage/${token}`;

      await sendViaWhatsAppWeb(
        tenantId,
        input.phoneNumber,
        `Hi! 👋 You can view and manage your bookings with ${cfg?.businessName ?? "us"} here:\n\n${link}\n\n_This link expires in 7 days._`
      );

      return { ok: true, link };
    }),

  // ── Public endpoints (no auth — token is the secret) ────────────────────────

  // Resolve token → return customer's upcoming appointments
  resolve: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const [tokenRow] = await db.select().from(selfServiceTokens)
        .where(and(
          eq(selfServiceTokens.token, input.token),
          gt(selfServiceTokens.expiresAt, new Date()),
        ))
        .limit(1);

      if (!tokenRow) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired link" });

      const tenantId    = tokenRow.tenantId;
      const phoneNumber = tokenRow.phoneNumber;

      // Upcoming appointments for this phone number — join via customers
      const appts = await db.select({
        id:          appointments.id,
        date:        appointments.date,
        time:        appointments.time,
        status:      appointments.status,
        serviceName: services.name,
        serviceId:   appointments.serviceId,
      })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(and(
          eq(customers.tenantId, tenantId),
          eq(customers.phoneNumber, phoneNumber),
        ))
        .orderBy(appointments.date)
        .limit(20);

      const [cfg] = await db.select({ businessName: botConfig.businessName, businessLogoUrl: botConfig.businessLogoUrl })
        .from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      return {
        phoneNumber,
        businessName: cfg?.businessName ?? "Business",
        businessLogoUrl: cfg?.businessLogoUrl ?? null,
        appointments: appts,
      };
    }),

  // Cancel an appointment via self-service ─────────────────────────────────────
  cancelAppointment: publicProcedure
    .input(z.object({ token: z.string(), appointmentId: z.number().int() }))
    .mutation(async ({ input }) => {
      const [tokenRow] = await db.select().from(selfServiceTokens)
        .where(and(
          eq(selfServiceTokens.token, input.token),
          gt(selfServiceTokens.expiresAt, new Date()),
        ))
        .limit(1);

      if (!tokenRow) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired link" });

      // Verify appointment belongs to this customer (via customers join)
      const [appt] = await db.select({ id: appointments.id, status: appointments.status })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .where(and(
          eq(appointments.id, input.appointmentId),
          eq(customers.tenantId, tokenRow.tenantId),
          eq(customers.phoneNumber, tokenRow.phoneNumber),
        ))
        .limit(1);

      if (!appt) throw new TRPCError({ code: "NOT_FOUND", message: "Appointment not found" });
      if (appt.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "Already cancelled" });

      await db.update(appointments)
        .set({ status: "cancelled" })
        .where(eq(appointments.id, input.appointmentId));

      return { ok: true };
    }),

  // Reschedule — update date + time ────────────────────────────────────────────
  rescheduleAppointment: publicProcedure
    .input(z.object({
      token:         z.string(),
      appointmentId: z.number().int(),
      newDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
      newTime:       z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
    }))
    .mutation(async ({ input }) => {
      const [tokenRow] = await db.select().from(selfServiceTokens)
        .where(and(
          eq(selfServiceTokens.token, input.token),
          gt(selfServiceTokens.expiresAt, new Date()),
        ))
        .limit(1);

      if (!tokenRow) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired link" });

      const [appt] = await db.select({ id: appointments.id, status: appointments.status })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .where(and(
          eq(appointments.id, input.appointmentId),
          eq(customers.tenantId, tokenRow.tenantId),
          eq(customers.phoneNumber, tokenRow.phoneNumber),
        ))
        .limit(1);

      if (!appt) throw new TRPCError({ code: "NOT_FOUND", message: "Appointment not found" });

      await db.update(appointments)
        .set({ date: input.newDate, time: input.newTime, status: "scheduled" })
        .where(eq(appointments.id, input.appointmentId));

      return { ok: true };
    }),
});
