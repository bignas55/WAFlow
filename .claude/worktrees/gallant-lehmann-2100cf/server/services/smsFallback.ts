/**
 * SMS Fallback Service
 * When WhatsApp fails to deliver, sends via Twilio SMS as a fallback.
 * Uses Twilio REST API directly (no SDK required — just axios).
 */

import axios from "axios";
import { db } from "../db.js";
import { botConfig } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

interface TwilioConfig {
  accountSid:  string;
  authToken:   string;
  fromNumber:  string;
}

async function getTwilioConfig(tenantId: number): Promise<TwilioConfig | null> {
  const [cfg] = await db.select({
    twilioAccountSid:   botConfig.twilioAccountSid,
    twilioAuthToken:    botConfig.twilioAuthToken,
    twilioPhoneNumber:  botConfig.twilioPhoneNumber,
  }).from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

  if (!cfg?.twilioAccountSid || !cfg?.twilioAuthToken || !cfg?.twilioPhoneNumber) return null;
  return {
    accountSid:  cfg.twilioAccountSid,
    authToken:   cfg.twilioAuthToken,
    fromNumber:  cfg.twilioPhoneNumber,
  };
}

/**
 * Send an SMS via Twilio REST API.
 * `to` should include country code, e.g. "+27821234567"
 */
export async function sendSMS(tenantId: number, to: string, message: string): Promise<boolean> {
  const cfg = await getTwilioConfig(tenantId);
  if (!cfg) return false;

  // Normalise number — ensure it starts with +
  const phone = to.startsWith("+") ? to : `+${to.replace(/\D/g, "")}`;

  try {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
      new URLSearchParams({
        From: cfg.fromNumber,
        To:   phone,
        Body: message,
      }).toString(),
      {
        auth: { username: cfg.accountSid, password: cfg.authToken },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10_000,
      }
    );
    console.log(`📱 [Tenant ${tenantId}] SMS fallback sent to ${phone}`);
    return true;
  } catch (err: any) {
    console.error(`SMS fallback failed for tenant ${tenantId}:`, err?.response?.data ?? err.message);
    return false;
  }
}

/**
 * Send via WhatsApp; if it fails and Twilio is configured, fall back to SMS.
 * Strips WhatsApp markdown (*bold*, _italic_) for the SMS version.
 */
export async function sendWithSmsFallback(
  tenantId: number,
  to: string,
  message: string,
  sendWhatsApp: (tenantId: number, to: string, msg: string) => Promise<boolean>,
): Promise<{ channel: "whatsapp" | "sms" | "failed"; ok: boolean }> {
  const waOk = await sendWhatsApp(tenantId, to, message);
  if (waOk) return { channel: "whatsapp", ok: true };

  // Strip WhatsApp markdown for SMS
  const plainText = message
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~([^~]+)~/g, "$1")
    .replace(/```([^`]+)```/g, "$1");

  const smsOk = await sendSMS(tenantId, to, plainText);
  if (smsOk) return { channel: "sms", ok: true };

  return { channel: "failed", ok: false };
}
