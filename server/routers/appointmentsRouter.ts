import { getInsertId } from "../utils.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { appointments, customers, services, botConfig, waitlist } from "../../drizzle/schema.js";
import { eq, and, desc, gte, lte, ne, sql } from "drizzle-orm";
import { exportAppointmentsToExcel } from "../services/appointmentExport.js";
import { sendViaWhatsAppWeb } from "../whatsapp/WhatsAppWebManager.js";
import { WhatsAppBusinessAPI } from "../whatsapp/WhatsAppBusinessAPI.js";
import { fireWebhookEvent } from "../services/webhookService.js";
import { logAction } from "../services/auditService.js";
import { GoogleCalendarService } from "../services/calendarService.js";

const calSvc = new GoogleCalendarService();

async function sendConfirmation(tenantId: number, phone: string, customerName: string | null, serviceName: string, date: string, time: string, businessName: string): Promise<void> {
  const name = customerName ? `, ${customerName}` : "";
  const [y, m, d] = date.split("-").map(Number);
  const apptDate = new Date(y, m - 1, d);
  const friendlyDate = apptDate.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
  const msg = `✅ *Appointment Confirmed*\n\nHi${name}! Your appointment has been booked at *${businessName}*.\n\n📅 *${friendlyDate}* at *${time}*\n💼 *Service:* ${serviceName}\n\nIf you need to reschedule or cancel, just reply to this message.`;
  const ok = await sendViaWhatsAppWeb(tenantId, phone, msg);
  if (!ok) {
    try {
      const api = await WhatsAppBusinessAPI.fromConfig(tenantId);
      await api.sendTextMessage(phone, msg);
    } catch { /* non-fatal */ }
  }
}

export const appointmentsRouter = router({

  // ── LIST ───────────────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      date: z.string().optional(),       // "YYYY-MM-DD" — filter by day
      month: z.string().optional(),      // "YYYY-MM"    — filter by month
      status: z.enum(["scheduled", "completed", "cancelled", "no_show", "all"]).default("all"),
    }))
    .query(async ({ input, ctx }) => {
      const isAdmin = ctx.user.role === "admin";

      const rows = await db
        .select({
          id: appointments.id,
          date: appointments.date,
          time: appointments.time,
          status: appointments.status,
          notes: appointments.notes,
          reminderSent: appointments.reminderSent,
          createdAt: appointments.createdAt,
          customer: {
            id: customers.id,
            name: customers.name,
            phone: customers.phoneNumber,
            email: customers.email,
            tenantId: customers.tenantId,
          },
          service: {
            id: services.id,
            name: services.name,
            duration: services.duration,
            price: services.price,
          },
        })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        // Admin sees all; tenants see only their own customers' appointments
        .where(isAdmin ? undefined : eq(customers.tenantId, ctx.user.userId))
        .orderBy(appointments.date, appointments.time);

      let filtered = rows;

      if (input.date) {
        filtered = filtered.filter(r => r.date === input.date);
      } else if (input.month) {
        filtered = filtered.filter(r => r.date.startsWith(input.month!));
      }

      if (input.status !== "all") {
        filtered = filtered.filter(r => r.status === input.status);
      }

      return { appointments: filtered, total: filtered.length };
    }),

  // ── CHECK CONFLICT ────────────────────────────────────────────────────────
  checkConflict: protectedProcedure
    .input(z.object({
      date: z.string(),
      time: z.string(),
      serviceId: z.number(),
      excludeId: z.number().optional(), // when editing an existing appointment
    }))
    .query(async ({ input, ctx }) => {
      // Get service duration to calculate end time
      const [service] = await db.select().from(services).where(eq(services.id, input.serviceId)).limit(1);
      const duration = service?.duration || 60;

      // Convert HH:MM to minutes
      const toMins = (t: string) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
      };
      const fromMins = (mins: number) => {
        const h = Math.floor(mins / 60).toString().padStart(2, "0");
        const m = (mins % 60).toString().padStart(2, "0");
        return `${h}:${m}`;
      };

      const newStart = toMins(input.time);
      const newEnd = newStart + duration;

      // Get all scheduled appointments on the same date — scoped to this tenant
      const dayAppts = await db
        .select({
          id: appointments.id,
          time: appointments.time,
          serviceId: appointments.serviceId,
        })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .where(and(
          eq(appointments.date, input.date),
          eq(appointments.status, "scheduled"),
          eq(customers.tenantId, ctx.user.userId),
        ));

      const serviceMap: Record<number, number> = {};

      for (const a of dayAppts) {
        if (input.excludeId && a.id === input.excludeId) continue;

        let dur = serviceMap[a.serviceId];
        if (dur === undefined) {
          const [svc] = await db.select({ duration: services.duration }).from(services).where(eq(services.id, a.serviceId)).limit(1);
          dur = svc?.duration || 60;
          serviceMap[a.serviceId] = dur;
        }

        const existStart = toMins(a.time);
        const existEnd = existStart + dur;

        // Overlap check: new slot starts before existing ends AND new slot ends after existing starts
        if (newStart < existEnd && newEnd > existStart) {
          return {
            conflict: true,
            message: `Time slot ${input.time} conflicts with an existing appointment at ${a.time} (${fromMins(existEnd)} end)`,
          };
        }
      }

      return { conflict: false, message: "Time slot is available" };
    }),

  // ── BOOK ──────────────────────────────────────────────────────────────────
  book: protectedProcedure
    .input(z.object({
      customerPhone: z.string(),
      customerName: z.string().optional(),
      serviceId: z.number(),
      date: z.string(),   // "YYYY-MM-DD"
      time: z.string(),   // "HH:MM"
      notes: z.string().optional(),
      staffId: z.number().optional(),
      isRecurring: z.boolean().optional(),
      recurrencePattern: z.enum(["weekly", "fortnightly", "monthly"]).optional(),
      recurrenceEndDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      // Upsert customer scoped to this tenant
      await db.insert(customers).values({
        tenantId,
        phoneNumber: input.customerPhone,
        name: input.customerName || null,
      }).onDuplicateKeyUpdate({
        set: { name: input.customerName || undefined, updatedAt: new Date() },
      });

      const [customer] = await db.select().from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneNumber, input.customerPhone))).limit(1);

      if (!customer) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not find or create customer",
        });
      }

      // Conflict check inline
      const [service] = await db.select().from(services).where(eq(services.id, input.serviceId)).limit(1);
      const duration = service?.duration || 60;

      const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
      const newStart = toMins(input.time);
      const newEnd = newStart + duration;

      const dayAppts = await db.select({ time: appointments.time, serviceId: appointments.serviceId })
        .from(appointments)
        .where(and(eq(appointments.date, input.date), eq(appointments.status, "scheduled")));

      for (const a of dayAppts) {
        const [svc] = await db.select({ duration: services.duration }).from(services).where(eq(services.id, a.serviceId)).limit(1);
        const dur = svc?.duration || 60;
        const existStart = toMins(a.time);
        const existEnd = existStart + dur;
        if (newStart < existEnd && newEnd > existStart) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Booking conflict: the ${input.time} slot overlaps with an existing appointment at ${a.time}.`,
          });
        }
      }

      // Create appointment
      const [result] = await db.insert(appointments).values({
        customerId: customer.id,
        serviceId: input.serviceId,
        date: input.date,
        time: input.time,
        notes: input.notes,
        status: "scheduled",
        staffId: input.staffId ?? null,
        isRecurring: input.isRecurring ?? false,
        recurrencePattern: input.recurrencePattern ?? null,
        recurrenceEndDate: input.recurrenceEndDate ?? null,
      });

      const apptId = getInsertId(result) as number;

      // Update customer counters
      await db.update(customers)
        .set({ totalAppointments: customer.totalAppointments + 1, updatedAt: new Date() })
        .where(eq(customers.id, customer.id));

      // Appointment confirmation WhatsApp + webhook (fire-and-forget)
      const [cfg] = await db.select({ enableApptConfirmation: botConfig.enableApptConfirmation, businessName: botConfig.businessName, enableGoogleCalendar: botConfig.enableGoogleCalendar })
        .from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      if (cfg?.enableApptConfirmation !== false) {
        sendConfirmation(
          tenantId, input.customerPhone, input.customerName ?? null,
          service?.name ?? "appointment", input.date, input.time,
          cfg?.businessName ?? "us"
        ).catch(() => {});
        // Mark confirmation sent
        if (apptId) {
          await db.update(appointments).set({ confirmationSent: true }).where(eq(appointments.id, apptId));
        }
      }

      fireWebhookEvent(tenantId, "appointment.booked", {
        appointmentId: apptId,
        customerPhone: input.customerPhone,
        customerName: input.customerName,
        service: service?.name,
        date: input.date,
        time: input.time,
      }).catch(() => {});

      logAction(tenantId, ctx.user.userId, "appointment.booked", "appointment", apptId, {
        customerPhone: input.customerPhone, service: service?.name, date: input.date, time: input.time,
      }).catch(() => {});

      // Google Calendar sync (fire-and-forget)
      if (cfg?.enableGoogleCalendar && service) {
        const [y, m, d] = input.date.split("-").map(Number);
        const [hh, mm] = input.time.split(":").map(Number);
        const startDt = new Date(y, m - 1, d, hh, mm, 0);
        const endDt = new Date(startDt.getTime() + service.duration * 60000);
        const pad = (n: number) => String(n).padStart(2, "0");
        const toISO = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
        calSvc.createEvent({
          summary: `${service.name} — ${input.customerName ?? input.customerPhone}`,
          description: input.notes,
          startDateTime: toISO(startDt),
          endDateTime: toISO(endDt),
        }).then(eventId => {
          if (eventId) db.update(appointments).set({ googleCalendarEventId: eventId }).where(eq(appointments.id, apptId)).catch(() => {});
        }).catch(() => {});
      }

      // Notify waitlist customers for this service (fire-and-forget)
      db.select().from(waitlist)
        .where(and(eq(waitlist.tenantId, tenantId), eq(waitlist.serviceId, input.serviceId), sql`${waitlist.notifiedAt} IS NULL`))
        .limit(1)
        .then(async ([first]) => {
          if (first) {
            await db.update(waitlist).set({ notifiedAt: new Date() }).where(eq(waitlist.id, first.id));
          }
        }).catch(() => {});

      // Sync Excel in background
      exportAppointmentsToExcel().catch(e => console.error("Excel export failed:", e.message));

      return { success: true, id: apptId };
    }),

  // ── UPDATE STATUS ─────────────────────────────────────────────────────────
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["scheduled", "completed", "cancelled", "no_show"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      // Verify the appointment belongs to this tenant via the customer record
      const [appt] = await db
        .select({ id: appointments.id, customerId: appointments.customerId, serviceId: appointments.serviceId })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .where(and(eq(appointments.id, input.id), eq(customers.tenantId, tenantId)))
        .limit(1);
      if (!appt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Appointment not found",
        });
      }

      await db.update(appointments).set({ status: input.status, updatedAt: new Date() }).where(eq(appointments.id, input.id));

      // Update customer completed/noshow counters + lifetime value
      const [customer] = await db.select({ tenantId: customers.tenantId })
        .from(customers).where(eq(customers.id, appt.customerId)).limit(1);

      if (input.status === "completed") {
        // Get service price to add to lifetime value
        const [svc] = await db.select({ price: services.price }).from(services).where(eq(services.id, appt.serviceId)).limit(1);
        const price = parseFloat(String(svc?.price ?? "0"));
        await db.update(customers)
          .set({
            completedAppointments: sql`${customers.completedAppointments} + 1`,
            lifetimeValue: price > 0 ? sql`${customers.lifetimeValue} + ${price}` : undefined,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, appt.customerId));
      } else if (input.status === "no_show") {
        await db.update(customers)
          .set({ noShows: sql`${customers.noShows} + 1`, updatedAt: new Date() })
          .where(eq(customers.id, appt.customerId));
      }

      // Webhook
      if (customer?.tenantId) {
        fireWebhookEvent(customer.tenantId, "appointment.status_changed", {
          appointmentId: input.id,
          status: input.status,
        }).catch(() => {});
      }

      // Sync Excel
      exportAppointmentsToExcel().catch(e => console.error("Excel export failed:", e.message));

      return { success: true };
    }),

  // ── CANCEL ────────────────────────────────────────────────────────────────
  cancel: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      // Fetch full appointment before cancelling so we can notify customer + remove calendar event
      const [appt] = await db
        .select({ customerId: appointments.customerId, serviceId: appointments.serviceId, date: appointments.date, time: appointments.time, googleCalendarEventId: appointments.googleCalendarEventId })
        .from(appointments).where(eq(appointments.id, input.id)).limit(1);

      await db.update(appointments)
        .set({ status: "cancelled", notes: input.reason, updatedAt: new Date() })
        .where(eq(appointments.id, input.id));

      if (appt) {
        const [customer] = await db.select({ phoneNumber: customers.phoneNumber, name: customers.name, tenantId: customers.tenantId })
          .from(customers).where(eq(customers.id, appt.customerId)).limit(1);
        const [svc] = await db.select({ name: services.name }).from(services).where(eq(services.id, appt.serviceId)).limit(1);
        const [cfg] = await db.select({ businessName: botConfig.businessName, enableApptConfirmation: botConfig.enableApptConfirmation })
          .from(botConfig).where(eq(botConfig.tenantId, customer?.tenantId ?? ctx.user.userId)).limit(1);

        if (customer?.phoneNumber && cfg?.enableApptConfirmation !== false) {
          const [y, m, d] = appt.date.split("-").map(Number);
          const friendly = new Date(y, m - 1, d).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
          const greeting = customer.name ? `Hi ${customer.name}` : "Hi";
          const reason = input.reason ? `\n\n📝 Reason: ${input.reason}` : "";
          const msg = `❌ *Appointment Cancelled*\n\n${greeting}, your appointment for *${svc?.name ?? "your service"}* on *${friendly}* at *${appt.time}* at *${cfg?.businessName ?? "us"}* has been cancelled.${reason}\n\nPlease reply to rebook at a convenient time.`;
          sendViaWhatsAppWeb(customer.tenantId, customer.phoneNumber, msg).catch(() => {});
        }

        if (customer?.tenantId) {
          fireWebhookEvent(customer.tenantId, "appointment.status_changed", {
            appointmentId: input.id, status: "cancelled", reason: input.reason,
          }).catch(() => {});
        }

        // Remove Google Calendar event
        if (appt.googleCalendarEventId) {
          calSvc.deleteEvent(appt.googleCalendarEventId).catch(() => {});
        }

        // Notify first waitlisted customer for this service
        if (customer?.tenantId && appt.serviceId) {
          db.select().from(waitlist)
            .where(and(eq(waitlist.tenantId, customer.tenantId), eq(waitlist.serviceId, appt.serviceId), sql`${waitlist.notifiedAt} IS NULL`))
            .limit(1)
            .then(async ([first]) => {
              if (first) {
                const notifyMsg = `🎉 A spot opened up for ${svc?.name ?? "your requested service"} on ${appt.date}! Reply to book your appointment.`;
                sendViaWhatsAppWeb(customer.tenantId, first.phoneNumber, notifyMsg).catch(() => {});
                await db.update(waitlist).set({ notifiedAt: new Date() }).where(eq(waitlist.id, first.id));
              }
            }).catch(() => {});
        }
      }

      logAction(ctx.user.userId, ctx.user.userId, "appointment.cancelled", "appointment", input.id, {
        reason: input.reason,
      }).catch(() => {});

      exportAppointmentsToExcel().catch(e => console.error("Excel export failed:", e.message));
      return { success: true };
    }),

  // ── INVOICE DATA ──────────────────────────────────────────────────────────
  invoiceData: protectedProcedure
    .input(z.object({ appointmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const [appt] = await db
        .select({
          id: appointments.id,
          date: appointments.date,
          time: appointments.time,
          status: appointments.status,
          notes: appointments.notes,
          createdAt: appointments.createdAt,
          customer: {
            id: customers.id,
            name: customers.name,
            phone: customers.phoneNumber,
            email: customers.email,
          },
          service: {
            id: services.id,
            name: services.name,
            duration: services.duration,
            price: services.price,
          },
        })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(eq(appointments.id, input.appointmentId))
        .limit(1);

      if (!appt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Appointment not found",
        });
      }

      const [cfg] = await db.select({
        businessName: botConfig.businessName,
        smtpUser: botConfig.smtpUser,
      }).from(botConfig).where(eq(botConfig.tenantId, ctx.user.userId)).limit(1);

      const invoiceNumber = `INV-${String(appt.id).padStart(5, "0")}`;
      const price = parseFloat(String(appt.service?.price ?? "0"));
      const vat = Math.round(price * 0.15 * 100) / 100;

      logAction(ctx.user.userId, ctx.user.userId, "appointment.invoice_generated", "appointment", appt.id, {
        invoiceNumber,
      }).catch(() => {});

      return {
        invoiceNumber,
        businessName: cfg?.businessName ?? "My Business",
        businessEmail: cfg?.smtpUser ?? "",
        appointment: appt,
        lineItem: {
          description: appt.service?.name ?? "Service",
          duration: appt.service?.duration ?? 0,
          unitPrice: price,
        },
        subtotal: price,
        vat,
        total: Math.round((price + vat) * 100) / 100,
        issuedAt: new Date().toISOString(),
      };
    }),

  // ── SERVICES ──────────────────────────────────────────────────────────────
  services: protectedProcedure.query(async () => {
    return db.select().from(services).where(eq(services.isActive, true)).orderBy(services.name);
  }),

  // ── EXPORT EXCEL ──────────────────────────────────────────────────────────
  exportExcel: protectedProcedure.mutation(async () => {
    const filePath = await exportAppointmentsToExcel();
    return { success: true, filePath };
  }),

  // ── SEND INVOICE VIA WHATSAPP ─────────────────────────────────────────────
  sendInvoice: protectedProcedure
    .input(z.object({ appointmentId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const [appt] = await db
        .select({
          id: appointments.id, date: appointments.date, time: appointments.time,
          customerName: customers.name, customerPhone: customers.phoneNumber,
          serviceName: services.name, servicePrice: services.price, serviceDuration: services.duration,
        })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(and(eq(appointments.id, input.appointmentId), eq(customers.tenantId, tenantId)))
        .limit(1);

      if (!appt || !appt.customerPhone) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Appointment not found",
        });
      }

      const [cfg] = await db.select({ businessName: botConfig.businessName })
        .from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      const invoiceNo = `INV-${String(appt.id).padStart(5, "0")}`;
      const price     = parseFloat(String(appt.servicePrice ?? "0"));
      const vat       = Math.round(price * 0.15 * 100) / 100;
      const total     = Math.round((price + vat) * 100) / 100;

      const msg =
        `🧾 *INVOICE ${invoiceNo}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*${cfg?.businessName ?? "Business"}*\n\n` +
        `📅 Date: ${appt.date} at ${appt.time}\n` +
        `👤 Client: ${appt.customerName ?? "Customer"}\n\n` +
        `*Services:*\n` +
        `• ${appt.serviceName ?? "Service"} — R${price.toFixed(2)}\n\n` +
        `Subtotal: R${price.toFixed(2)}\n` +
        `VAT (15%): R${vat.toFixed(2)}\n` +
        `*Total: R${total.toFixed(2)}*\n\n` +
        `Thank you for your business! 🙏`;

      await sendViaWhatsAppWeb(tenantId, appt.customerPhone, msg);

      logAction(tenantId, ctx.user.userId, "appointment.invoice_sent", "appointment", appt.id, { invoiceNo }).catch(() => {});
      return { ok: true, invoiceNo };
    }),

  // ── TODAY'S SUMMARY ───────────────────────────────────────────────────────
  todaySummary: protectedProcedure.query(async ({ ctx }) => {
    const isAdmin = ctx.user.role === "admin";
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db
      .select({
        id: appointments.id,
        time: appointments.time,
        status: appointments.status,
        customerName: customers.name,
        customerPhone: customers.phoneNumber,
        serviceName: services.name,
        serviceDuration: services.duration,
      })
      .from(appointments)
      .leftJoin(customers, eq(appointments.customerId, customers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(
        isAdmin
          ? eq(appointments.date, today)
          : and(eq(appointments.date, today), eq(customers.tenantId, ctx.user.userId))
      )
      .orderBy(appointments.time);

    return {
      date: today,
      total: rows.length,
      scheduled: rows.filter(r => r.status === "scheduled").length,
      completed: rows.filter(r => r.status === "completed").length,
      cancelled: rows.filter(r => r.status === "cancelled").length,
      appointments: rows,
    };
  }),

  // ── BULK ACTIONS ──────────────────────────────────────────────────────────
  bulkUpdateStatus: protectedProcedure
    .input(z.object({
      ids:    z.array(z.number().int()).min(1).max(100),
      status: z.enum(["completed", "cancelled", "scheduled", "no_show"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      let updated = 0;
      for (const id of input.ids) {
        const [appt] = await db.select({ id: appointments.id, customerId: appointments.customerId })
          .from(appointments).where(eq(appointments.id, id)).limit(1);
        if (appt) {
          await db.update(appointments).set({ status: input.status, updatedAt: new Date() }).where(eq(appointments.id, id));
          updated++;
        }
      }
      logAction(tenantId, ctx.user.userId, "appointment.bulk_status_update", "appointment", 0, { ids: input.ids, status: input.status, count: updated }).catch(() => {});
      return { ok: true, updated };
    }),

  bulkSendReminder: protectedProcedure
    .input(z.object({
      ids:     z.array(z.number().int()).min(1).max(50),
      message: z.string().min(1).max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.user.userId;
      const [cfg] = await db.select({ businessName: botConfig.businessName })
        .from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      let sent = 0;
      for (const id of input.ids) {
        const [appt] = await db
          .select({ date: appointments.date, time: appointments.time, customerName: customers.name, customerPhone: customers.phoneNumber, serviceName: services.name })
          .from(appointments)
          .leftJoin(customers, eq(appointments.customerId, customers.id))
          .leftJoin(services, eq(appointments.serviceId, services.id))
          .where(and(eq(appointments.id, id), eq(customers.tenantId, tenantId)))
          .limit(1);
        if (!appt?.customerPhone) continue;
        const msg = input.message
          ? input.message.replace("{name}", appt.customerName ?? "there").replace("{date}", appt.date ?? "").replace("{time}", appt.time ?? "")
          : `📅 *Reminder from ${cfg?.businessName ?? "us"}*\n\nYou have a *${appt.serviceName ?? "appointment"}* on ${appt.date} at ${appt.time}.\n\nReply *Cancel* if you can't make it.`;
        const ok = await sendViaWhatsAppWeb(tenantId, appt.customerPhone, msg);
        if (ok) sent++;
        await new Promise(r => setTimeout(r, 800));
      }
      return { ok: true, sent };
    }),
});
