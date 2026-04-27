/**
 * easypayService.ts
 *
 * Easypay (South Africa) payment integration.
 *
 * Flow:
 *  1. generatePaymentReference() → creates a pending payment_history row,
 *     returns an Easypay account number the customer pays to.
 *  2. confirmPayment() → called from the Easypay webhook to mark payment as paid
 *     and upgrade the tenant's account.
 *  3. verifyWebhookSignature() → validates the HMAC signature on incoming
 *     Easypay webhook requests.
 *
 * Env vars:
 *   EASYPAY_SERVICE_KEY   — Easypay service key (from your Easypay account)
 *   EASYPAY_ACCOUNT_REF   — your merchant account reference
 *   EASYPAY_API_URL       — Easypay API base URL (default: https://api.easypay.co.za)
 *   EASYPAY_WEBHOOK_SECRET — secret for HMAC webhook signature verification
 */

import crypto from "crypto";
import { db } from "../db.js";
import { paymentHistory, users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { getInsertId } from "../utils.js";

// ── Config ────────────────────────────────────────────────────────────────────
const SERVICE_KEY     = process.env.EASYPAY_SERVICE_KEY     || "";
const ACCOUNT_REF     = process.env.EASYPAY_ACCOUNT_REF     || "";
const API_URL         = process.env.EASYPAY_API_URL         || "https://api.easypay.co.za";
const WEBHOOK_SECRET  = process.env.EASYPAY_WEBHOOK_SECRET  || "";

export const PLAN_PRICING: Record<string, { monthly: number; yearly: number; label: string; features: string[] }> = {
  pro: {
    label:   "Pro",
    monthly: 699,
    yearly:  6990, // ~R582.50/month — 2 months free
    features: [
      "Unlimited WhatsApp messages",
      "AI receptionist + booking",
      "Full CRM & analytics",
      "Knowledge base (unlimited)",
      "Broadcast campaigns",
      "Priority support",
    ],
  },
  enterprise: {
    label:   "Enterprise",
    monthly: 0, // custom
    yearly:  0,
    features: [
      "Everything in Pro",
      "White-label option",
      "Dedicated account manager",
      "Custom AI model",
      "On-premise deployment",
      "SLA guarantee",
    ],
  },
};

// ── Generate internal payment reference ───────────────────────────────────────
function makePaymentRef(tenantId: number): string {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `WAF-${tenantId}-${ts}-${rnd}`;
}

// ── Request Easypay payment number ────────────────────────────────────────────
async function requestEasypayNumber(
  paymentRef: string,
  amountCents: number,
  description: string,
): Promise<{ easypayNumber: string; easypayRef: string } | null> {
  if (!SERVICE_KEY || !ACCOUNT_REF) {
    // Dev/demo mode — return fake numbers
    console.warn("⚠️  EASYPAY_SERVICE_KEY not set — using demo mode");
    return {
      easypayNumber: `9999${Math.floor(Math.random() * 9000000 + 1000000)}`,
      easypayRef:    `DEMO-${paymentRef}`,
    };
  }

  try {
    const res = await fetch(`${API_URL}/v1/payment/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        merchant_ref:  paymentRef,
        account_ref:   ACCOUNT_REF,
        amount:        amountCents, // in cents
        description,
        currency:      "ZAR",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("❌ Easypay API error:", res.status, err);
      return null;
    }

    const data = await res.json() as { easypay_number: string; reference: string };
    return {
      easypayNumber: data.easypay_number,
      easypayRef:    data.reference,
    };
  } catch (e: any) {
    console.error("❌ Easypay request failed:", e.message);
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Creates a pending payment record and requests an Easypay payment number.
 * Returns all info the frontend needs to display a payment instruction.
 */
export async function generatePaymentReference(params: {
  tenantId:     number;
  tenantName:   string;
  tenantEmail:  string;
  plan:         "pro" | "enterprise";
  billingCycle: "monthly" | "yearly";
}): Promise<{
  paymentRef:    string;
  easypayNumber: string;
  easypayRef:    string;
  amountZar:     number;
  plan:          string;
  billingCycle:  string;
  instructions:  string;
}> {
  const pricing   = PLAN_PRICING[params.plan];
  const amountZar = params.billingCycle === "yearly" ? pricing.yearly : pricing.monthly;
  const amountCents = amountZar * 100;

  const paymentRef  = makePaymentRef(params.tenantId);
  const description = `WAFlow ${pricing.label} Plan (${params.billingCycle}) — ${params.tenantName}`;

  const easypay = await requestEasypayNumber(paymentRef, amountCents, description);

  const easypayNumber = easypay?.easypayNumber ?? `DEMO-${paymentRef}`;
  const easypayRef    = easypay?.easypayRef    ?? paymentRef;

  // Persist pending payment record
  await db.insert(paymentHistory).values({
    tenantId:      params.tenantId,
    plan:          params.plan,
    billingCycle:  params.billingCycle,
    amountZar:     String(amountZar),
    currency:      "ZAR",
    paymentRef,
    easypayRef,
    easypayNumber,
    status:        "pending",
    createdAt:     new Date(),
    metadata: {
      tenantEmail: params.tenantEmail,
      tenantName:  params.tenantName,
      description,
    },
  });

  const instructions = [
    `Use your banking app or any major retailer to pay via Easypay.`,
    `Amount: R${amountZar.toFixed(2)}`,
    `Easypay Number: ${easypayNumber}`,
    `Reference: ${paymentRef}`,
    `Payment will be confirmed automatically within minutes of completion.`,
  ].join("\n");

  console.log(`💳 [Easypay] Payment reference created: ${paymentRef} for tenant ${params.tenantId} — R${amountZar}`);

  return { paymentRef, easypayNumber, easypayRef, amountZar, plan: params.plan, billingCycle: params.billingCycle, instructions };
}

/**
 * Called by the Easypay webhook when payment is confirmed.
 * Upgrades the tenant's account to active_paid.
 */
export async function confirmPayment(params: {
  paymentRef: string;
  easypayRef: string;
  amountPaid: number;
}): Promise<{ success: boolean; tenantId?: number; plan?: string }> {
  const [record] = await db
    .select()
    .from(paymentHistory)
    .where(eq(paymentHistory.paymentRef, params.paymentRef))
    .limit(1);

  if (!record) {
    console.error(`❌ [Easypay] Unknown paymentRef: ${params.paymentRef}`);
    return { success: false };
  }

  if (record.status === "paid") {
    console.log(`ℹ️  [Easypay] Already processed: ${params.paymentRef}`);
    return { success: true, tenantId: record.tenantId, plan: record.plan };
  }

  // Mark payment as paid
  await db.update(paymentHistory)
    .set({ status: "paid", paidAt: new Date(), easypayRef: params.easypayRef })
    .where(eq(paymentHistory.paymentRef, params.paymentRef));

  // Calculate new plan expiry
  const now        = new Date();
  const expiresAt  = new Date(now);
  if (record.billingCycle === "yearly") {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  // Upgrade tenant
  const planEnum = record.plan as "pro" | "enterprise" | "starter" | "free";
  await db.update(users)
    .set({
      plan:          planEnum,
      accountStatus: "active_paid",
      planExpiresAt: expiresAt,
      messageLimit:  planEnum === "pro" ? 999999 : 999999,
      updatedAt:     now,
    })
    .where(eq(users.id, record.tenantId));

  console.log(`✅ [Easypay] Payment confirmed: tenant ${record.tenantId} upgraded to ${record.plan}`);
  return { success: true, tenantId: record.tenantId, plan: record.plan };
}

/**
 * Verify HMAC-SHA256 signature on Easypay webhook requests.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn("⚠️  EASYPAY_WEBHOOK_SECRET not set — skipping signature verification");
    return true; // pass in dev mode
  }
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}
