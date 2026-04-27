/**
 * trialService.ts
 *
 * Handles trial expiry checking and reminder notifications.
 *
 * Runs on a daily schedule (called from server/index.ts at startup).
 * Sends reminder emails at Day 10, 13, and 14 of the trial.
 * Locks accounts where trial_end_date has passed.
 */

import { db } from "../db.js";
import { users } from "../../drizzle/schema.js";
import { eq, and, lte, isNotNull, or } from "drizzle-orm";
import nodemailer from "nodemailer";

const APP_URL = process.env.APP_URL || "http://localhost:5173";

// ── Email sender (reuse SMTP config from alertService pattern) ────────────────
function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port:   parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth:   { user, pass },
  });
}

async function sendTrialEmail(to: string, name: string, subject: string, html: string): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.log(`[Trial Email — no SMTP] To: ${to} | ${subject}`);
    return;
  }
  try {
    await t.sendMail({
      from:    `"WAFlow" <${process.env.SMTP_USER}>`,
      to,
      subject: `[WAFlow] ${subject}`,
      html,
    });
    console.log(`📧 [Trial] Email sent to ${to}: ${subject}`);
  } catch (e: any) {
    console.error(`❌ [Trial] Email failed for ${to}:`, e.message);
  }
}

// ── Email templates ───────────────────────────────────────────────────────────
function reminderEmail(name: string, daysLeft: number): string {
  const urgent = daysLeft <= 1;
  const color  = urgent ? "#dc2626" : daysLeft <= 3 ? "#f59e0b" : "#4f46e5";
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f9fafb;padding:32px 0;margin:0">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:${color};padding:20px 28px">
      <div style="color:white;font-weight:700;font-size:20px">WAFlow</div>
      <div style="color:rgba(255,255,255,.8);font-size:13px">Trial Reminder</div>
    </div>
    <div style="padding:28px;color:#374151;font-size:14px;line-height:1.7">
      <p>Hi <strong>${name}</strong>,</p>
      ${daysLeft <= 0
        ? `<p>Your WAFlow free trial has <strong style="color:${color}">expired</strong>. Your account has been locked.</p>
           <p>Upgrade now to continue using your AI receptionist, bookings, and all features you set up.</p>`
        : `<p>Your WAFlow free trial expires in <strong style="color:${color}">${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>.</p>
           <p>Don't lose access to your AI receptionist, customer conversations, and everything you've configured. Upgrade now and keep the momentum going.</p>`
      }
      <a href="${APP_URL}/pricing"
         style="display:inline-block;margin-top:16px;padding:12px 28px;background:${color};color:white;border-radius:8px;text-decoration:none;font-weight:600">
        ${daysLeft <= 0 ? "Unlock My Account" : "Upgrade Now — From R699/month"}
      </a>
      <p style="margin-top:20px;color:#6b7280;font-size:12px">
        Questions? Reply to this email and we'll help you get sorted.
      </p>
    </div>
  </div>
</body></html>`;
}

function lockedEmail(name: string): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f9fafb;padding:32px 0;margin:0">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#dc2626;padding:20px 28px">
      <div style="color:white;font-weight:700;font-size:20px">WAFlow</div>
      <div style="color:rgba(255,255,255,.8);font-size:13px">Account Locked</div>
    </div>
    <div style="padding:28px;color:#374151;font-size:14px;line-height:1.7">
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your WAFlow free trial has ended and your account has been <strong>locked</strong>.</p>
      <p>Your data is safe — upgrade within 30 days to regain full access.</p>
      <a href="${APP_URL}/pricing"
         style="display:inline-block;margin-top:16px;padding:12px 28px;background:#dc2626;color:white;border-radius:8px;text-decoration:none;font-weight:600">
        Upgrade to Unlock
      </a>
    </div>
  </div>
</body></html>`;
}

// ── Core check function ───────────────────────────────────────────────────────
export async function checkTrials(): Promise<void> {
  const now = new Date();
  console.log("⏱️  [Trial] Running trial check…");

  // Fetch all active trial users
  const trialUsers = await db
    .select({
      id:             users.id,
      email:          users.email,
      name:           users.name,
      accountStatus:  users.accountStatus,
      trialEndDate:   users.trialEndDate,
      trialReminder10Sent: users.trialReminder10Sent,
      trialReminder13Sent: users.trialReminder13Sent,
      trialReminder14Sent: users.trialReminder14Sent,
    })
    .from(users)
    .where(
      and(
        eq(users.role, "user"),
        or(
          eq(users.accountStatus, "trial_active"),
          eq(users.accountStatus, "trial_expired"),
        ),
        isNotNull(users.trialEndDate),
      )
    );

  let expired = 0;
  let reminded = 0;

  for (const u of trialUsers) {
    if (!u.trialEndDate) continue;

    const endDate  = new Date(u.trialEndDate);
    const msLeft   = endDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

    // ── Lock expired accounts ─────────────────────────────────────────────
    if (daysLeft <= 0 && u.accountStatus === "trial_active") {
      await db.update(users)
        .set({ accountStatus: "trial_expired", updatedAt: now })
        .where(eq(users.id, u.id));

      if (!u.trialReminder14Sent) {
        await sendTrialEmail(u.email, u.name, "Your trial has ended — upgrade to continue", lockedEmail(u.name));
        await db.update(users)
          .set({ trialReminder14Sent: true })
          .where(eq(users.id, u.id));
      }
      expired++;
      continue;
    }

    // ── Day 10 reminder ───────────────────────────────────────────────────
    if (daysLeft <= 4 && daysLeft > 1 && !u.trialReminder10Sent) {
      await sendTrialEmail(
        u.email, u.name,
        `Your trial ends in ${daysLeft} days`,
        reminderEmail(u.name, daysLeft),
      );
      await db.update(users).set({ trialReminder10Sent: true }).where(eq(users.id, u.id));
      reminded++;
    }

    // ── Day 13 reminder ───────────────────────────────────────────────────
    if (daysLeft === 1 && !u.trialReminder13Sent) {
      await sendTrialEmail(
        u.email, u.name,
        "Last day of your trial — upgrade now",
        reminderEmail(u.name, 1),
      );
      await db.update(users).set({ trialReminder13Sent: true }).where(eq(users.id, u.id));
      reminded++;
    }
  }

  console.log(`⏱️  [Trial] Check complete — ${expired} expired, ${reminded} reminded.`);
}

// ── Scheduler — runs daily at 08:00 ──────────────────────────────────────────
export function startTrialScheduler(): void {
  const scheduleNext = () => {
    const now    = new Date();
    const next   = new Date();
    next.setHours(8, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    setTimeout(async () => {
      await checkTrials().catch((e) => console.error("❌ [Trial] Scheduler error:", e.message));
      scheduleNext(); // reschedule for next day
    }, delay);
    console.log(`⏱️  [Trial] Next check scheduled at ${next.toLocaleTimeString()}`);
  };

  // Also run immediately on startup (catches any overnight expirations)
  checkTrials().catch((e) => console.error("❌ [Trial] Startup check error:", e.message));
  scheduleNext();
}
