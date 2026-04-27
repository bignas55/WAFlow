import { getInsertId } from "../utils.js";
/**
 * Public Booking Router — no authentication required.
 * Powers the /book/:slug page accessible by customers.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db.js";
import {
  botConfig, services, appointments, customers, availableSlots, holidays, waitlist,
} from "../../drizzle/schema.js";
import { eq, and, ne, sql } from "drizzle-orm";
import { sendViaWhatsAppWeb } from "../whatsapp/WhatsAppWebManager.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** JS day index (0=Sun) → MySQL day-of-week stored in botConfig as "0,1,2,…" */
function jsDayToConfigDay(jsDay: number): string {
  // botConfig stores: 0=sunday,1=monday…6=saturday — same as JS
  return String(jsDay);
}

// ── Router ──────────────────────────────────────────────────────────────────

export const bookingRouter = router({

  // ── Get tenant config by slug ──────────────────────────────────────────────
  getPageConfig: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const [config] = await db
        .select({
          tenantId: botConfig.tenantId,
          businessName: botConfig.businessName,
          bookingPageTitle: botConfig.bookingPageTitle,
          bookingPageDescription: botConfig.bookingPageDescription,
          depositRequired: botConfig.depositRequired,
          depositAmount: botConfig.depositAmount,
          paymentLinkTemplate: botConfig.paymentLinkTemplate,
        })
        .from(botConfig)
        .where(eq(botConfig.bookingSlug, input.slug))
        .limit(1);

      if (!config) return null;

      const svcList = await db
        .select({ id: services.id, name: services.name, duration: services.duration, price: services.price, description: services.description })
        .from(services)
        .where(and(eq(services.tenantId, config.tenantId), eq(services.isActive, true)));

      return { ...config, services: svcList };
    }),

  // ── Get available dates for next 30 days ──────────────────────────────────
  getAvailableDates: publicProcedure
    .input(z.object({ slug: z.string(), serviceId: z.number() }))
    .query(async ({ input }) => {
      const [config] = await db
        .select({ tenantId: botConfig.tenantId })
        .from(botConfig)
        .where(eq(botConfig.bookingSlug, input.slug))
        .limit(1);
      if (!config) return [];

      const slots = await db.select().from(availableSlots)
        .where(and(eq(availableSlots.tenantId, config.tenantId), eq(availableSlots.isActive, true)));
      const holidaySet = new Set<string>(
        (await db.select({ date: holidays.date }).from(holidays)
          .where(eq(holidays.tenantId, config.tenantId))).map(h => h.date)
      );

      const activeDays = new Set(slots.map(s => s.dayOfWeek));
      const dates: string[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 1; i <= 42; i++) {
        const d = addDays(today, i);
        const jsDay = d.getDay();   // 0=Sun
        const dateStr = toDateStr(d);
        if (!activeDays.has(jsDay)) continue;
        if (holidaySet.has(dateStr)) continue;
        dates.push(dateStr);
        if (dates.length >= 30) break;
      }
      return dates;
    }),

  // ── Get available time slots for a date ───────────────────────────────────
  getAvailableSlots: publicProcedure
    .input(z.object({ slug: z.string(), serviceId: z.number(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD") }))
    .query(async ({ input }) => {
      const [config] = await db
        .select({ tenantId: botConfig.tenantId })
        .from(botConfig)
        .where(eq(botConfig.bookingSlug, input.slug))
        .limit(1);
      if (!config) return [];

      const d = new Date(input.date + "T00:00:00");
      const jsDay = d.getDay();

      const slots = await db.select().from(availableSlots)
        .where(and(eq(availableSlots.tenantId, config.tenantId), eq(availableSlots.dayOfWeek, jsDay), eq(availableSlots.isActive, true)));

      // Get already-booked times for this date
      const booked = await db
        .select({ time: appointments.time })
        .from(appointments)
        .where(and(
          eq(appointments.tenantId, config.tenantId),
          eq(appointments.date, input.date),
          ne(appointments.status, "cancelled"),
        ));
      const bookedTimes = new Set(booked.map(b => b.time));

      // Generate time slots from slot windows
      const times: string[] = [];
      for (const slot of slots) {
        const [sh, sm] = slot.startTime.split(":").map(Number);
        const [eh, em] = slot.endTime.split(":").map(Number);
        let mins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        while (mins + slot.slotDuration <= endMins) {
          const h = String(Math.floor(mins / 60)).padStart(2, "0");
          const m = String(mins % 60).padStart(2, "0");
          const t = `${h}:${m}`;
          if (!bookedTimes.has(t)) times.push(t);
          mins += slot.slotDuration;
        }
      }
      return times;
    }),

  // ── Submit booking ─────────────────────────────────────────────────────────
  submit: publicProcedure
    .input(z.object({
      slug: z.string(),
      serviceId: z.number(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
      time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
      name: z.string().min(1).max(255),
      phone: z.string().min(7).max(50),
      notes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      const [config] = await db
        .select({
          tenantId: botConfig.tenantId,
          businessName: botConfig.businessName,
          depositRequired: botConfig.depositRequired,
          depositAmount: botConfig.depositAmount,
          paymentLinkTemplate: botConfig.paymentLinkTemplate,
          enableApptConfirmation: botConfig.enableApptConfirmation,
        })
        .from(botConfig)
        .where(eq(botConfig.bookingSlug, input.slug))
        .limit(1);

      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Booking page not found" });

      const [svc] = await db.select({ name: services.name, price: services.price })
        .from(services).where(eq(services.id, input.serviceId)).limit(1);
      if (!svc) throw new TRPCError({ code: "NOT_FOUND", message: "Service not found" });

      // Upsert customer
      await db.insert(customers).values({
        tenantId: config.tenantId,
        phoneNumber: input.phone,
        name: input.name,
        totalAppointments: 1,
        lifetimeValue: "0.00",
      }).onDuplicateKeyUpdate({
        set: {
          name: sql`IF(name IS NULL OR name = '', ${input.name}, name)`,
          updatedAt: new Date(),
        },
      });

      const [cust] = await db.select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.tenantId, config.tenantId), eq(customers.phoneNumber, input.phone)))
        .limit(1);

      if (!cust) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create customer record" });

      const [result] = await db.insert(appointments).values({
        tenantId: config.tenantId,
        customerId: cust.id,
        serviceId: input.serviceId,
        date: input.date,
        time: input.time,
        status: "scheduled",
        notes: input.notes,
        confirmationSent: false,
      });
      const apptId = getInsertId(result) as number;

      // Generate payment link if deposit required
      let paymentLink: string | null = null;
      if (config.depositRequired && config.paymentLinkTemplate) {
        paymentLink = config.paymentLinkTemplate
          .replace("{name}", input.name)
          .replace("{phone}", input.phone)
          .replace("{service}", svc.name)
          .replace("{date}", input.date)
          .replace("{time}", input.time)
          .replace("{amount}", String(config.depositAmount))
          .replace("{apptId}", String(apptId));
      }

      // Send confirmation WhatsApp message
      const [y, m, d2] = input.date.split("-").map(Number);
      const friendlyDate = new Date(y, m - 1, d2).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
      let msg = `✅ *Booking Confirmed!*\n\nHi ${input.name}! Your appointment at *${config.businessName}* is confirmed.\n\n📅 *${friendlyDate}* at *${input.time}*\n💼 *Service:* ${svc.name}\n\nIf you need to reschedule or cancel, please reply to this message.`;
      if (paymentLink) {
        msg += `\n\n💳 *Deposit required:* R${config.depositAmount}\n${paymentLink}`;
      }
      sendViaWhatsAppWeb(config.tenantId, input.phone, msg).catch(() => {});

      await db.update(appointments).set({ confirmationSent: true, updatedAt: new Date() })
        .where(eq(appointments.id, apptId));

      return { success: true, appointmentId: apptId, paymentLink };
    }),

  // ── Join waitlist ──────────────────────────────────────────────────────────
  joinWaitlist: publicProcedure
    .input(z.object({
      slug: z.string(),
      serviceId: z.number(),
      phone: z.string().min(7).max(50),
      name: z.string().optional(),
      requestedDate: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [config] = await db
        .select({ tenantId: botConfig.tenantId })
        .from(botConfig)
        .where(eq(botConfig.bookingSlug, input.slug))
        .limit(1);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Booking page not found" });

      await db.insert(waitlist).values({
        tenantId: config.tenantId,
        serviceId: input.serviceId,
        phoneNumber: input.phone,
        name: input.name,
        requestedDate: input.requestedDate,
      });
      return { success: true };
    }),
});
