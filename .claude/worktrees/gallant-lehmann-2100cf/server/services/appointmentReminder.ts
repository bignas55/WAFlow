/**
 * Appointment Scheduler Service
 *
 * Runs every 15 minutes and handles:
 *  1. REMINDERS  — WhatsApp message 24h before and 1h before appointment
 *  2. FOLLOW-UPS — "How was your experience?" 2h after appointment
 *  3. NO-SHOWS   — Mark as no-show if appointment passed 90min ago and still "scheduled"
 *  4. DAILY SUMMARY — WhatsApp message to business owner at 8am with today's appointments
 *  5. WEEKLY REPORT — Email to business owner every Monday at 8am with weekly stats
 */

import { db } from "../db.js";
import { appointments, customers, services, botConfig, users, conversations } from "../../drizzle/schema.js";
import { eq, and, gte, lte, lt, sql, desc, or, isNull } from "drizzle-orm";
import { sendViaWhatsAppWeb, getStateForTenant } from "../whatsapp/WhatsAppWebManager.js";
import { sendWithSmsFallback } from "./smsFallback.js";

// Wrapper: try WhatsApp first, fall back to SMS silently
async function send(tenantId: number, phone: string, msg: string): Promise<boolean> {
  const result = await sendWithSmsFallback(tenantId, phone, msg, sendViaWhatsAppWeb);
  return result.ok;
}
import nodemailer from "nodemailer";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes
let _timer: NodeJS.Timeout | null = null;
let _lastDailySummaryDate = ""; // track which date we last sent the summary
let _lastWeeklyReportDate = ""; // track which Monday we last sent the report

// ── Helpers ────────────────────────────────────────────────────────────────

function parseApptDate(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function friendlyDateTime(d: Date): { date: string; time: string } {
  return {
    date: d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" }),
    time: d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

// ── Scheduler ──────────────────────────────────────────────────────────────

export function startAppointmentReminderScheduler(): void {
  if (_timer) return;
  console.log("⏰ Appointment scheduler started (checks every 15 min)");
  runAllChecks();
  _timer = setInterval(runAllChecks, CHECK_INTERVAL_MS);
}

export function stopAppointmentReminderScheduler(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

async function runAllChecks(): Promise<void> {
  await Promise.allSettled([
    runReminderCheck(),
    runFollowUpCheck(),
    runNoShowCheck(),
    runDailySummary(),
    runWeeklyReport(),
    runReEngagementCheck(),
    runBirthdayCheck(),
    runConversationAutoClose(),
    runRecurringAppointmentCreation(),
  ]);
}

// ── 1. REMINDERS (24h + 1h, separate flags) ─────────────────────────────

async function runReminderCheck(): Promise<void> {
  try {
    const now = new Date();
    // Find all scheduled appointments with at least one reminder still unsent
    const upcoming = await db
      .select({
        id: appointments.id,
        date: appointments.date,
        time: appointments.time,
        customerId: appointments.customerId,
        serviceId: appointments.serviceId,
        reminderSent: appointments.reminderSent,
        reminder1hSent: appointments.reminder1hSent,
      })
      .from(appointments)
      .where(and(
        eq(appointments.status, "scheduled"),
        sql`(${appointments.reminderSent} = 0 OR ${appointments.reminder1hSent} = 0)`
      ));

    for (const appt of upcoming) {
      try {
        const apptDate = parseApptDate(appt.date, appt.time);
        const hoursUntil = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        // Skip if appointment already passed or is more than 25h away
        if (hoursUntil < 0 || hoursUntil > 25) continue;

        const [customer] = await db.select({ phoneNumber: customers.phoneNumber, name: customers.name, tenantId: customers.tenantId })
          .from(customers).where(eq(customers.id, appt.customerId)).limit(1);
        if (!customer?.phoneNumber) continue;

        const [service] = await db.select({ name: services.name }).from(services).where(eq(services.id, appt.serviceId)).limit(1);
        const [config] = await db.select({ businessName: botConfig.businessName }).from(botConfig).where(eq(botConfig.tenantId, customer.tenantId)).limit(1);

        const businessName = config?.businessName ?? "us";
        const serviceName = service?.name ?? "your appointment";
        const customerName = customer.name ? `, ${customer.name}` : "";
        const { date: friendlyDate, time: friendlyTime } = friendlyDateTime(apptDate);

        // 24-hour reminder: window 23h–25h before
        if (!appt.reminderSent && hoursUntil >= 23 && hoursUntil <= 25) {
          const message = `📅 *Appointment Reminder${customerName}*\n\nJust a reminder that you have a *${serviceName}* appointment with *${businessName}* tomorrow.\n\n🕐 ${friendlyDate} at ${friendlyTime}\n\nReply *Reschedule* to change the time or *Cancel* to cancel.`;
          const sent = await send(customer.tenantId, customer.phoneNumber, message);
          if (sent) {
            await db.update(appointments).set({ reminderSent: true, updatedAt: new Date() }).where(eq(appointments.id, appt.id));
            console.log(`📬 [Tenant ${customer.tenantId}] 24h reminder sent for appt #${appt.id}`);
          }
        }

        // 1-hour reminder: window 0.75h–1.5h before
        if (!appt.reminder1hSent && hoursUntil >= 0.75 && hoursUntil <= 1.5) {
          const message = `⏰ *Reminder${customerName}!*\n\nYour *${serviceName}* appointment with *${businessName}* is in about 1 hour.\n\n📅 ${friendlyDate} at ${friendlyTime}\n\nWe look forward to seeing you! Reply *Cancel* if you need to cancel.`;
          const sent = await send(customer.tenantId, customer.phoneNumber, message);
          if (sent) {
            await db.update(appointments).set({ reminder1hSent: true, updatedAt: new Date() }).where(eq(appointments.id, appt.id));
            console.log(`⏰ [Tenant ${customer.tenantId}] 1h reminder sent for appt #${appt.id}`);
          }
        }
      } catch (e: any) { console.error(`⚠️  Reminder failed for appt #${appt.id}:`, e.message); }
    }
  } catch (e: any) { console.error("⚠️  Reminder check failed:", e.message); }
}

// ── 2. FOLLOW-UPS ──────────────────────────────────────────────────────────

async function runFollowUpCheck(): Promise<void> {
  try {
    const now = new Date();
    // Appointments that ended 1.5–4 hours ago, still "scheduled" or "completed", no follow-up yet
    const followUpCutoffStart = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const followUpCutoffEnd   = new Date(now.getTime() - 90 * 60 * 1000); // 90 min ago

    // Get today's date and yesterday's date string for filtering
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const recent = await db
      .select({ id: appointments.id, date: appointments.date, time: appointments.time, customerId: appointments.customerId, serviceId: appointments.serviceId, status: appointments.status, confirmationSent: appointments.confirmationSent })
      .from(appointments)
      .where(
        and(
          eq(appointments.confirmationSent, false), // reuse confirmationSent as "follow-up sent" flag
          sql`${appointments.status} IN ('scheduled','completed')`,
          sql`${appointments.date} IN (${todayStr}, ${yesterdayStr})`
        )
      );

    for (const appt of recent) {
      try {
        const apptDate = parseApptDate(appt.date, appt.time);
        const msAfter = now.getTime() - apptDate.getTime();
        const hoursAfter = msAfter / (1000 * 60 * 60);
        // Only send follow-up between 1.5h and 4h after the appointment
        if (hoursAfter < 1.5 || hoursAfter > 4) continue;

        const [customer] = await db.select({ phoneNumber: customers.phoneNumber, name: customers.name, tenantId: customers.tenantId })
          .from(customers).where(eq(customers.id, appt.customerId)).limit(1);
        if (!customer?.phoneNumber) continue;

        const [service] = await db.select({ name: services.name }).from(services).where(eq(services.id, appt.serviceId)).limit(1);
        const [config] = await db.select({ businessName: botConfig.businessName }).from(botConfig).where(eq(botConfig.tenantId, customer.tenantId)).limit(1);

        const businessName = config?.businessName ?? "us";
        const serviceName = service?.name ?? "your appointment";
        const customerName = customer.name ? ` ${customer.name}` : "";

        const message =
          `✅ *Thank you${customerName}!*\n\n` +
          `We hope your *${serviceName}* session at *${businessName}* went well.\n\n` +
          `How was your experience? Reply with a rating:\n` +
          `⭐ 1 — Poor\n⭐⭐ 2 — Fair\n⭐⭐⭐ 3 — Good\n⭐⭐⭐⭐ 4 — Great\n⭐⭐⭐⭐⭐ 5 — Excellent\n\n` +
          `Your feedback helps us improve! 🙏`;

        const sent = await send(customer.tenantId, customer.phoneNumber, message);
        if (sent) {
          await db.update(appointments).set({ confirmationSent: true, updatedAt: new Date() }).where(eq(appointments.id, appt.id));
          console.log(`💬 [Tenant ${customer.tenantId}] Follow-up sent for appointment #${appt.id}`);
        }
      } catch (e: any) { console.error(`⚠️  Follow-up failed for appt #${appt.id}:`, e.message); }
    }
  } catch (e: any) { console.error("⚠️  Follow-up check failed:", e.message); }
}

// ── 3. NO-SHOW DETECTION ──────────────────────────────────────────────────

async function runNoShowCheck(): Promise<void> {
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const overdue = await db
      .select({ id: appointments.id, date: appointments.date, time: appointments.time, customerId: appointments.customerId, serviceId: appointments.serviceId })
      .from(appointments)
      .where(
        and(
          eq(appointments.status, "scheduled"),
          sql`${appointments.date} IN (${todayStr}, ${yesterdayStr})`
        )
      );

    for (const appt of overdue) {
      try {
        const apptDate = parseApptDate(appt.date, appt.time);
        const minutesPast = (now.getTime() - apptDate.getTime()) / (1000 * 60);
        // Mark as no-show if 90+ minutes have passed with no completion
        if (minutesPast < 90) continue;

        await db.update(appointments).set({ status: "no_show", updatedAt: new Date() }).where(eq(appointments.id, appt.id));

        // Notify business owner
        const [customer] = await db.select({ tenantId: customers.tenantId, name: customers.name, phoneNumber: customers.phoneNumber })
          .from(customers).where(eq(customers.id, appt.customerId)).limit(1);
        if (!customer) continue;

        const [service] = await db.select({ name: services.name }).from(services).where(eq(services.id, appt.serviceId)).limit(1);
        const ownerPhone = getStateForTenant(customer.tenantId).phoneNumber;
        if (ownerPhone) {
          const msg = `⚠️ *No-show Alert*\n\n${customer.name || customer.phoneNumber} did not show up for their *${service?.name ?? "appointment"}* at ${appt.time}. Appointment marked as no-show.`;
          await sendViaWhatsAppWeb(customer.tenantId, ownerPhone, msg);
        }
        console.log(`🚫 [Tenant ${customer.tenantId}] Appointment #${appt.id} marked as no-show`);
      } catch (e: any) { console.error(`⚠️  No-show check failed for appt #${appt.id}:`, e.message); }
    }
  } catch (e: any) { console.error("⚠️  No-show check failed:", e.message); }
}

// ── 4. DAILY SUMMARY ──────────────────────────────────────────────────────

async function runDailySummary(): Promise<void> {
  try {
    const now = new Date();
    const hour = now.getHours();
    const todayStr = now.toISOString().slice(0, 10);

    // Only run between 8:00 and 8:14 (caught by the 15-min interval)
    if (hour !== 8) return;
    if (_lastDailySummaryDate === todayStr) return;
    _lastDailySummaryDate = todayStr;

    // Get all tenants
    const tenants = await db.select({ id: users.id }).from(users).where(eq(users.role, "user"));

    for (const tenant of tenants) {
      try {
        const ownerPhone = getStateForTenant(tenant.id).phoneNumber;
        if (!ownerPhone) continue; // WhatsApp not connected

        const todayAppts = await db
          .select({ id: appointments.id, time: appointments.time, status: appointments.status, customerId: appointments.customerId, serviceId: appointments.serviceId })
          .from(appointments)
          .where(and(
            sql`${appointments.date} = ${todayStr}`,
            sql`${appointments.status} IN ('scheduled','completed')`
          ))
          .orderBy(appointments.time);

        // Filter to this tenant's customers only
        const tenantAppts = [];
        for (const appt of todayAppts) {
          const [cust] = await db.select({ tenantId: customers.tenantId, name: customers.name, phoneNumber: customers.phoneNumber })
            .from(customers).where(eq(customers.id, appt.customerId)).limit(1);
          if (cust?.tenantId === tenant.id) tenantAppts.push({ ...appt, customer: cust });
        }

        const [config] = await db.select({ businessName: botConfig.businessName }).from(botConfig).where(eq(botConfig.tenantId, tenant.id)).limit(1);
        const businessName = config?.businessName ?? "Your Business";
        const friendlyToday = now.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });

        let message: string;
        if (tenantAppts.length === 0) {
          message = `☀️ *Good morning!*\n\nNo appointments scheduled for today (${friendlyToday}) at *${businessName}*.\n\nHave a great day! 🌟`;
        } else {
          const lines = [];
          for (const appt of tenantAppts) {
            const [svc] = await db.select({ name: services.name }).from(services).where(eq(services.id, appt.serviceId)).limit(1);
            lines.push(`• ${appt.time} — ${appt.customer.name || appt.customer.phoneNumber} (${svc?.name ?? "Appointment"})`);
          }
          message =
            `☀️ *Good morning! Here's your day at ${businessName}*\n\n` +
            `📅 *${friendlyToday}* — ${tenantAppts.length} appointment${tenantAppts.length > 1 ? "s" : ""}:\n\n` +
            lines.join("\n") +
            `\n\nHave a productive day! 💪`;
        }

        await sendViaWhatsAppWeb(tenant.id, ownerPhone, message);
        console.log(`☀️ [Tenant ${tenant.id}] Daily summary sent (${tenantAppts.length} appointments today)`);
      } catch (e: any) { console.error(`⚠️  Daily summary failed for tenant ${tenant.id}:`, e.message); }
    }
  } catch (e: any) { console.error("⚠️  Daily summary check failed:", e.message); }
}

// ── 5. WEEKLY REPORT EMAIL ────────────────────────────────────────────────

async function runWeeklyReport(): Promise<void> {
  try {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 1 = Monday
    const todayStr = now.toISOString().slice(0, 10);

    // Only run Monday between 8:00 and 8:14
    if (dayOfWeek !== 1 || hour !== 8) return;
    if (_lastWeeklyReportDate === todayStr) return;
    _lastWeeklyReportDate = todayStr;

    const smtp = process.env.SMTP_HOST;
    if (!smtp) {
      console.log("📧 Weekly report skipped — no SMTP configured");
      return;
    }

    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const since7dStr = since7d.toISOString().slice(0, 10);

    const tenants = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.role, "user"));

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP__PASS || process.env.SMTP_PASS },
    });

    for (const tenant of tenants) {
      try {
        const [config] = await db.select({ businessName: botConfig.businessName }).from(botConfig).where(eq(botConfig.tenantId, tenant.id)).limit(1);
        const businessName = config?.businessName ?? tenant.name ?? "Your Business";

        // Count messages this week
        const [msgCount] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(conversations)
          .where(and(eq(conversations.tenantId, tenant.id), gte(conversations.createdAt, since7d)));

        // Count appointments this week (by customer tenantId)
        const weekAppts = await db
          .select({ id: appointments.id, status: appointments.status, date: appointments.date, serviceId: appointments.serviceId, customerId: appointments.customerId })
          .from(appointments)
          .where(sql`${appointments.date} >= ${since7dStr} AND ${appointments.date} <= ${todayStr}`);

        // Filter to this tenant
        const tenantAppts = [];
        for (const a of weekAppts) {
          const [c] = await db.select({ tenantId: customers.tenantId }).from(customers).where(eq(customers.id, a.customerId)).limit(1);
          if (c?.tenantId === tenant.id) tenantAppts.push(a);
        }

        const scheduled = tenantAppts.filter(a => a.status === "scheduled").length;
        const completed = tenantAppts.filter(a => a.status === "completed").length;
        const cancelled = tenantAppts.filter(a => a.status === "cancelled").length;
        const noShows   = tenantAppts.filter(a => a.status === "no_show").length;
        const totalMsgs = Number(msgCount?.count ?? 0);

        const weekStart = since7d.toLocaleDateString("en-ZA", { day: "numeric", month: "long" });
        const weekEnd   = now.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });

        const html = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px">
            <h1 style="color:#25D366;margin-bottom:4px">📊 Weekly Report</h1>
            <p style="color:#6b7280;margin-top:0">${businessName} · ${weekStart} – ${weekEnd}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0">
              ${statCard("💬 Messages", totalMsgs)}
              ${statCard("📅 Total Bookings", tenantAppts.length)}
              ${statCard("✅ Completed", completed)}
              ${statCard("❌ Cancelled", cancelled)}
              ${statCard("🚫 No-shows", noShows)}
              ${statCard("📋 Upcoming", scheduled)}
            </div>
            <p style="color:#6b7280;font-size:13px;text-align:center">Sent automatically by WAFlow every Monday</p>
          </div>`;

        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: tenant.email,
          subject: `📊 Weekly Report — ${businessName}`,
          html,
        });
        console.log(`📧 [Tenant ${tenant.id}] Weekly report sent to ${tenant.email}`);
      } catch (e: any) { console.error(`⚠️  Weekly report failed for tenant ${tenant.id}:`, e.message); }
    }
  } catch (e: any) { console.error("⚠️  Weekly report check failed:", e.message); }
}

// ── 6. RE-ENGAGEMENT ───────────────────────────────────────────────────────

async function runReEngagementCheck(): Promise<void> {
  try {
    // Find all tenants with re-engagement enabled
    const configs = await db
      .select({
        tenantId: botConfig.tenantId,
        enableReEngagement: botConfig.enableReEngagement,
        reEngagementDays: botConfig.reEngagementDays,
        reEngagementMessage: botConfig.reEngagementMessage,
        businessName: botConfig.businessName,
      })
      .from(botConfig)
      .where(eq(botConfig.enableReEngagement, true));

    for (const config of configs) {
      try {
        const dayMs = (config.reEngagementDays ?? 30) * 24 * 60 * 60 * 1000;
        const dormantSince = new Date(Date.now() - dayMs);
        const reEngageCooldown = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // don't re-engage same customer more than once/30d

        // Find customers who haven't messaged since dormantSince and haven't been re-engaged recently
        const dormantCustomers = await db
          .select({ id: customers.id, phoneNumber: customers.phoneNumber, name: customers.name, lastReEngagementAt: customers.lastReEngagementAt })
          .from(customers)
          .where(and(
            eq(customers.tenantId, config.tenantId),
            eq(customers.optedOut, false),
            lte(customers.updatedAt, dormantSince),
            or(isNull(customers.lastReEngagementAt), lte(customers.lastReEngagementAt, reEngageCooldown))
          ))
          .limit(20); // batch of 20 per run to avoid flooding

        for (const customer of dormantCustomers) {
          try {
            const greeting = customer.name ? `Hi ${customer.name}!` : "Hi there!";
            const message = config.reEngagementMessage?.replace("{name}", customer.name ?? "")
              || `${greeting} 👋 We miss you at *${config.businessName}*! It's been a while since we last heard from you. Is there anything we can help you with today?`;

            await sendViaWhatsAppWeb(config.tenantId, customer.phoneNumber, message);

            // Update last re-engagement timestamp
            await db.update(customers)
              .set({ lastReEngagementAt: new Date(), updatedAt: new Date() })
              .where(eq(customers.id, customer.id));

            console.log(`💌 Re-engagement sent to ${customer.phoneNumber} (tenant ${config.tenantId})`);

            // Small delay between messages to avoid rate limits
            await new Promise(r => setTimeout(r, 2000));
          } catch { /* non-fatal per customer */ }
        }
      } catch { /* non-fatal per tenant */ }
    }
  } catch (e: any) { console.error("⚠️  Re-engagement check failed:", e.message); }
}

// ── 7. BIRTHDAY MESSAGES ──────────────────────────────────────────────────

async function runBirthdayCheck(): Promise<void> {
  try {
    const now = new Date();
    const todayMonth = now.getMonth() + 1; // 1-12
    const todayDay   = now.getDate();

    // Only run once per day (around 9am)
    const hour = now.getHours();
    if (hour !== 9) return;

    const configs = await db
      .select({ tenantId: botConfig.tenantId, enableBirthdayMessages: botConfig.enableBirthdayMessages, birthdayMessage: botConfig.birthdayMessage, businessName: botConfig.businessName })
      .from(botConfig)
      .where(eq(botConfig.enableBirthdayMessages, true));

    for (const config of configs) {
      try {
        // Find customers with birthday today (match month + day, ignore year)
        const birthdayCustomers = await db
          .select({ id: customers.id, phoneNumber: customers.phoneNumber, name: customers.name, dateOfBirth: customers.dateOfBirth })
          .from(customers)
          .where(and(
            eq(customers.tenantId, config.tenantId),
            eq(customers.optedOut, false),
            sql`MONTH(${customers.dateOfBirth}) = ${todayMonth} AND DAY(${customers.dateOfBirth}) = ${todayDay}`
          ));

        for (const customer of birthdayCustomers) {
          try {
            const greeting = customer.name ? `Happy Birthday, ${customer.name}!` : "Happy Birthday!";
            const message = config.birthdayMessage?.replace("{name}", customer.name ?? "")
              || `🎂 *${greeting}*\n\nWishing you a wonderful birthday from all of us at *${config.businessName}*! 🎉\n\nWe hope your day is filled with joy. Treat yourself today! 🎁`;

            await sendViaWhatsAppWeb(config.tenantId, customer.phoneNumber, message);
            console.log(`🎂 [Tenant ${config.tenantId}] Birthday message sent to ${customer.phoneNumber}`);
            await new Promise(r => setTimeout(r, 1500));
          } catch { /* non-fatal per customer */ }
        }
      } catch { /* non-fatal per tenant */ }
    }
  } catch (e: any) { console.error("⚠️  Birthday check failed:", e.message); }
}

// ── 8. CONVERSATION AUTO-CLOSE ────────────────────────────────────────────

async function runConversationAutoClose(): Promise<void> {
  try {
    const configs = await db
      .select({ tenantId: botConfig.tenantId, enableConversationAutoClose: botConfig.enableConversationAutoClose, autoCloseDays: botConfig.autoCloseDays })
      .from(botConfig)
      .where(eq(botConfig.enableConversationAutoClose, true));

    for (const config of configs) {
      try {
        const cutoff = new Date(Date.now() - (config.autoCloseDays ?? 7) * 24 * 60 * 60 * 1000);

        // Find non-escalated conversations not updated since cutoff
        const stale = await db
          .select({ id: conversations.id, phoneNumber: conversations.phoneNumber })
          .from(conversations)
          .where(and(
            eq(conversations.tenantId, config.tenantId),
            eq(conversations.isEscalated, false),
            lte(conversations.createdAt, cutoff)
          ))
          .limit(100); // batch limit

        if (stale.length === 0) continue;

        // Mark all stale conversations as resolved
        const ids = stale.map(c => c.id);
        await db.update(conversations)
          .set({ isResolved: true, resolvedAt: new Date() })
          .where(sql`${conversations.id} IN (${ids.join(",")})`);

        console.log(`🧹 [Tenant ${config.tenantId}] Auto-close: resolved ${stale.length} stale conversation(s) (older than ${config.autoCloseDays}d)`);
      } catch { /* non-fatal per tenant */ }
    }
  } catch (e: any) { console.error("⚠️  Auto-close check failed:", e.message); }
}

function statCard(label: string, value: number): string {
  return `<div style="background:#fff;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <p style="font-size:24px;font-weight:bold;color:#111827;margin:0">${value}</p>
    <p style="color:#6b7280;font-size:13px;margin:4px 0 0">${label}</p>
  </div>`;
}

// ── 9. RECURRING APPOINTMENT CREATION ────────────────────────────────────

async function runRecurringAppointmentCreation(): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    // Find completed/scheduled recurring appointments whose next occurrence hasn't been created
    const recurringAppts = await db
      .select({
        id: appointments.id,
        customerId: appointments.customerId,
        serviceId: appointments.serviceId,
        date: appointments.date,
        time: appointments.time,
        notes: appointments.notes,
        staffId: appointments.staffId,
        recurrencePattern: appointments.recurrencePattern,
        recurrenceEndDate: appointments.recurrenceEndDate,
        confirmationSent: appointments.confirmationSent,
      })
      .from(appointments)
      .where(and(
        eq(appointments.isRecurring, true),
        sql`${appointments.status} IN ('scheduled','completed')`,
        sql`${appointments.recurrenceEndDate} IS NULL OR ${appointments.recurrenceEndDate} >= ${todayStr}`,
        // Only look at appointments in the near past (within 2 days after their date)
        sql`DATEDIFF(CURDATE(), ${appointments.date}) BETWEEN 0 AND 2`
      ))
      .limit(100);

    for (const appt of recurringAppts) {
      try {
        const [y, m, d] = appt.date.split("-").map(Number);
        const apptDate = new Date(y, m - 1, d);

        // Calculate next occurrence date
        let nextDate: Date;
        if (appt.recurrencePattern === "weekly") {
          nextDate = new Date(apptDate); nextDate.setDate(nextDate.getDate() + 7);
        } else if (appt.recurrencePattern === "fortnightly") {
          nextDate = new Date(apptDate); nextDate.setDate(nextDate.getDate() + 14);
        } else if (appt.recurrencePattern === "monthly") {
          nextDate = new Date(apptDate); nextDate.setMonth(nextDate.getMonth() + 1);
        } else continue;

        const nextDateStr = nextDate.toISOString().slice(0, 10);

        // Check end date not exceeded
        if (appt.recurrenceEndDate && nextDateStr > appt.recurrenceEndDate) continue;

        // Check if next occurrence already exists (same customer, service, date, time)
        const [existing] = await db
          .select({ id: appointments.id })
          .from(appointments)
          .where(and(
            eq(appointments.customerId, appt.customerId),
            eq(appointments.serviceId, appt.serviceId),
            eq(appointments.date, nextDateStr),
            eq(appointments.time, appt.time),
          ))
          .limit(1);

        if (existing) continue; // already created

        // Create next occurrence
        await db.insert(appointments).values({
          customerId: appt.customerId,
          serviceId: appt.serviceId,
          date: nextDateStr,
          time: appt.time,
          notes: appt.notes,
          status: "scheduled",
          staffId: appt.staffId ?? null,
          isRecurring: true,
          recurrencePattern: appt.recurrencePattern ?? null,
          recurrenceEndDate: appt.recurrenceEndDate ?? null,
          parentAppointmentId: appt.id,
          confirmationSent: false,
        });

        console.log(`🔄 Recurring appointment created for customer #${appt.customerId} on ${nextDateStr}`);
      } catch { /* per-appt non-fatal */ }
    }
  } catch (e: any) { console.error("⚠️  Recurring appointment check failed:", e.message); }
}
