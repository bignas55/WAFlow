/**
 * Alert Service — sends email notifications for critical platform events.
 *
 * Configure via environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
 *   ALERT_EMAIL   — where alerts are sent (admin email)
 *   ALERT_FROM    — sender address (defaults to SMTP_USER)
 *   ALERTS_ENABLED — set to "false" to disable (logs to console instead)
 */

import nodemailer from "nodemailer";

// ── Config ───────────────────────────────────────────────────────────────────

const ENABLED = process.env.ALERTS_ENABLED !== "false";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const ALERT_EMAIL = process.env.ALERT_EMAIL || SMTP_USER;
const ALERT_FROM = process.env.ALERT_FROM || SMTP_USER;

// Rate-limiting: track recent alerts to avoid spam
// Key: `${event}:${tenantId}`, value: last sent timestamp
const recentAlerts = new Map<string, number>();
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes per event per tenant

// ── Transporter (lazy init) ───────────────────────────────────────────────────

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return _transporter;
}

// ── Core send function ────────────────────────────────────────────────────────

export async function sendAlert(
  subject: string,
  htmlBody: string,
  dedupeKey?: string,
  options?: { accentColor?: string; emoji?: string; subtitle?: string }
): Promise<void> {
  if (!ENABLED) {
    // Silently skip — alerts disabled via ALERTS_ENABLED=false
    return;
  }

  // Deduplicate
  if (dedupeKey) {
    const last = recentAlerts.get(dedupeKey) ?? 0;
    if (Date.now() - last < ALERT_COOLDOWN_MS) {
      console.log(`[ALERT suppressed — cooldown active] ${subject}`);
      return;
    }
    recentAlerts.set(dedupeKey, Date.now());
  }

  const transporter = getTransporter();
  if (!transporter) {
    // No SMTP configured — log to console as fallback
    console.warn(`[ALERT — no SMTP configured] ${subject}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"WAFlow Platform" <${ALERT_FROM}>`,
      to: ALERT_EMAIL,
      subject: `[WAFlow] ${subject}`,
      html: wrapHtml(subject, htmlBody, options?.accentColor, options?.emoji, options?.subtitle),
    });
    console.log(`📧 Alert sent: ${subject}`);
  } catch (e: any) {
    console.error(`[ALERT send failed] ${subject}:`, e.message);
  }
}

// ── Typed alert helpers ───────────────────────────────────────────────────────

export async function alertWhatsAppDisconnected(
  tenantName: string,
  tenantId: number,
  reason: string
): Promise<void> {
  await sendAlert(
    `WhatsApp Disconnected — ${tenantName}`,
    `
    <p>The WhatsApp connection for tenant <strong>${tenantName}</strong> (ID: ${tenantId}) has disconnected.</p>
    <p><strong>Reason:</strong> ${reason}</p>
    <p>The system will attempt to auto-reconnect. If the issue persists, please check the Monitoring page.</p>
    <a href="${process.env.APP_URL ?? "http://localhost:5173"}/monitoring"
       style="display:inline-block;margin-top:12px;padding:10px 20px;background:#4f46e5;color:white;border-radius:8px;text-decoration:none">
      Open Monitoring
    </a>
    `,
    `whatsapp_disconnect:${tenantId}`
  );
}

export async function alertWhatsAppAuthFailure(
  tenantName: string,
  tenantId: number,
  error: string
): Promise<void> {
  await sendAlert(
    `WhatsApp Auth Failure — ${tenantName}`,
    `
    <p>WhatsApp authentication failed for tenant <strong>${tenantName}</strong> (ID: ${tenantId}).</p>
    <p><strong>Error:</strong> ${error}</p>
    <p>The session needs to be cleared and the QR code rescanned. You can do this from the Monitoring page using the <em>Clear Session &amp; Rescan</em> fix.</p>
    <a href="${process.env.APP_URL ?? "http://localhost:5173"}/monitoring"
       style="display:inline-block;margin-top:12px;padding:10px 20px;background:#dc2626;color:white;border-radius:8px;text-decoration:none">
      Fix Now
    </a>
    `,
    `whatsapp_auth_fail:${tenantId}`
  );
}

export async function alertAIConnectionFailed(
  tenantName: string,
  tenantId: number,
  error: string
): Promise<void> {
  await sendAlert(
    `AI Connection Failed — ${tenantName}`,
    `
    <p>The AI provider for tenant <strong>${tenantName}</strong> (ID: ${tenantId}) is not responding.</p>
    <p><strong>Error:</strong> ${error}</p>
    <p>Messages to this tenant cannot be processed by AI until the connection is restored.</p>
    `,
    `ai_fail:${tenantId}`
  );
}

export async function alertCriticalIssues(
  issueCount: number,
  summaryText: string,
  healthScore: number
): Promise<void> {
  await sendAlert(
    `Platform Health Alert — ${issueCount} critical issue${issueCount !== 1 ? "s" : ""}`,
    `
    <p>The scheduled health check found <strong>${issueCount} critical issue${issueCount !== 1 ? "s" : ""}</strong> on your WAFlow platform.</p>
    <p><strong>Health Score:</strong> ${healthScore}/100</p>
    <p><strong>Summary:</strong> ${summaryText}</p>
    <a href="${process.env.APP_URL ?? "http://localhost:5173"}/monitoring"
       style="display:inline-block;margin-top:12px;padding:10px 20px;background:#4f46e5;color:white;border-radius:8px;text-decoration:none">
      View & Fix Issues
    </a>
    `,
    `critical_issues:platform`
  );
}

export async function alertNewBooking(
  businessName: string,
  tenantId: number,
  customerName: string,
  customerPhone: string,
  serviceName: string,
  date: string,         // YYYY-MM-DD
  time: string,         // HH:MM
  appointmentId: number
): Promise<void> {
  const friendlyDate = new Date(date + "T12:00:00").toLocaleDateString("en-ZA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const appUrl = process.env.APP_URL ?? "http://localhost:5173";

  await sendAlert(
    `New Booking — ${businessName}`,
    `
    <p>A new appointment has been booked via WhatsApp for <strong>${businessName}</strong>.</p>
    <table style="margin:16px 0;border-collapse:collapse;width:100%">
      <tr><td style="padding:6px 0;color:#6b7280;width:120px">Customer</td><td style="padding:6px 0;font-weight:600">${customerName || customerPhone}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Phone</td><td style="padding:6px 0">${customerPhone}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Service</td><td style="padding:6px 0">${serviceName}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Date</td><td style="padding:6px 0">${friendlyDate}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Time</td><td style="padding:6px 0">${time}</td></tr>
    </table>
    <a href="${appUrl}/appointments"
       style="display:inline-block;margin-top:12px;padding:10px 20px;background:#16a34a;color:white;border-radius:8px;text-decoration:none">
      View Appointments
    </a>
    `,
    undefined, // no deduplication — every booking is a unique event
    { accentColor: "#16a34a", emoji: "📅", subtitle: "New Booking" }
  );
}

export async function alertNewEscalation(
  tenantName: string,
  tenantId: number,
  customerName: string,
  message: string
): Promise<void> {
  await sendAlert(
    `Escalation Required — ${tenantName}`,
    `
    <p>A customer conversation has been escalated and requires human attention for tenant <strong>${tenantName}</strong>.</p>
    <p><strong>Customer:</strong> ${customerName}</p>
    <p><strong>Last message:</strong> "${message.substring(0, 200)}"</p>
    <a href="${process.env.APP_URL ?? "http://localhost:5173"}/inbox"
       style="display:inline-block;margin-top:12px;padding:10px 20px;background:#f59e0b;color:white;border-radius:8px;text-decoration:none">
      Open Inbox
    </a>
    `,
    `escalation:${tenantId}:${Date.now()}` // unique per event, no dedup for escalations
  );
}

// ── HTML wrapper ──────────────────────────────────────────────────────────────

function wrapHtml(title: string, body: string, accentColor = "#4f46e5", emoji = "🤖", subtitle = "System Alert"): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;padding:32px 0;margin:0">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:${accentColor};padding:20px 28px;display:flex;align-items:center;gap:12px">
      <span style="font-size:24px">${emoji}</span>
      <div>
        <div style="color:white;font-weight:700;font-size:18px">WAFlow Platform</div>
        <div style="color:rgba(255,255,255,0.8);font-size:13px">${subtitle}</div>
      </div>
    </div>
    <div style="padding:24px 28px;color:#374151;font-size:14px;line-height:1.6">
      ${body}
    </div>
    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">
      This alert was sent automatically by WAFlow. Time: ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>`;
}
