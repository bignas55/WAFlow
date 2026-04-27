/**
 * Abandoned Booking Recovery Service
 *
 * Tracks when someone visits the booking page but doesn't complete.
 * Sends a WhatsApp follow-up 30 minutes after abandonment.
 */

import { db } from "../db.js";
import { bookingAttempts, botConfig, services } from "../../drizzle/schema.js";
import { eq, and, lte, sql } from "drizzle-orm";
import { sendViaWhatsAppWeb } from "../whatsapp/WhatsAppWebManager.js";

// ── Track an attempt (called from booking public endpoint) ───────────────────

export async function trackBookingAttempt(opts: {
  tenantId:     number;
  phoneNumber:  string;
  name?:        string;
  serviceId?:   number;
  attemptedDate?: string;
  slug?:        string;
}) {
  await db.insert(bookingAttempts).values({
    tenantId:     opts.tenantId,
    phoneNumber:  opts.phoneNumber,
    name:         opts.name ?? null,
    serviceId:    opts.serviceId ?? null,
    attemptedDate: opts.attemptedDate ?? null,
    slug:         opts.slug ?? null,
    abandonedAt:  new Date(),
    followUpSent: 0,
    converted:    0,
  });
}

// ── Mark an attempt as converted (called when booking is completed) ──────────

export async function markAttemptConverted(tenantId: number, phoneNumber: string) {
  await db.update(bookingAttempts)
    .set({ converted: 1 })
    .where(and(
      eq(bookingAttempts.tenantId, tenantId),
      eq(bookingAttempts.phoneNumber, phoneNumber),
      eq(bookingAttempts.followUpSent, 0),
    ));
}

// ── Background job: send follow-ups for stale attempts ───────────────────────

async function sendAbandonedFollowUps() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  const stale = await db.select().from(bookingAttempts)
    .where(and(
      eq(bookingAttempts.followUpSent, 0),
      eq(bookingAttempts.converted, 0),
      lte(bookingAttempts.abandonedAt, thirtyMinutesAgo),
    ))
    .limit(50);

  for (const attempt of stale) {
    try {
      const [cfg] = await db.select({
        businessName: botConfig.businessName,
        bookingSlug:  botConfig.bookingSlug,
      }).from(botConfig).where(eq(botConfig.tenantId, attempt.tenantId)).limit(1);

      let serviceName = "";
      if (attempt.serviceId) {
        const [svc] = await db.select({ name: services.name })
          .from(services).where(eq(services.id, attempt.serviceId)).limit(1);
        serviceName = svc?.name ?? "";
      }

      const baseUrl  = process.env.APP_URL ?? "http://localhost:3000";
      const bookLink = `${baseUrl}/book/${cfg?.bookingSlug ?? attempt.slug ?? ""}`;
      const name     = attempt.name ?? "there";
      const biz      = cfg?.businessName ?? "us";

      const msg =
        `Hi ${name}! 👋 We noticed you were checking out our booking page.\n\n` +
        `${serviceName ? `Interested in *${serviceName}*? ` : ""}We'd love to see you!\n\n` +
        `📅 Complete your booking here:\n${bookLink}\n\n` +
        `_Reply to this message if you have any questions._`;

      await sendViaWhatsAppWeb(attempt.tenantId, attempt.phoneNumber, msg);

      await db.update(bookingAttempts)
        .set({ followUpSent: 1, followUpSentAt: new Date() })
        .where(eq(bookingAttempts.id, attempt.id));

      console.log(`📩 Abandoned booking follow-up sent to ${attempt.phoneNumber}`);
    } catch (err) {
      console.error(`Failed to send abandoned booking follow-up for attempt ${attempt.id}:`, err);
    }
  }
}

export function startAbandonedBookingScheduler() {
  console.log("📩 Abandoned booking recovery scheduler started");
  // Run every 5 minutes
  setInterval(() => sendAbandonedFollowUps().catch(console.error), 5 * 60 * 1000);
}
