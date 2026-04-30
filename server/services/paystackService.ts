/**
 * Paystack Payment Service
 * Handles payment verification and subscription management
 */

import crypto from "crypto";
import axios from "axios";

const PAYSTACK_API_BASE = "https://api.paystack.co";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";

if (!PAYSTACK_SECRET && process.env.NODE_ENV === "production") {
  console.warn("⚠️  PAYSTACK_SECRET_KEY not set — payments will fail");
}

export interface PaystackWebhookData {
  event: string;
  data: {
    reference: string;
    amount: number;
    currency: string;
    status: string;
    customer: {
      email: string;
      first_name?: string;
      last_name?: string;
    };
    metadata?: {
      plan?: string;
      tenantId?: number;
    };
  };
}

/**
 * Verify Paystack webhook signature
 * Paystack sends: x-paystack-signature header with HMAC-SHA512(body, secret)
 */
export function verifyPaystackSignature(
  body: string,
  signature: string
): boolean {
  if (!PAYSTACK_SECRET) {
    console.warn("⚠️  PAYSTACK_SECRET_KEY not configured");
    return false;
  }

  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET)
    .update(body)
    .digest("hex");

  return hash === signature;
}

/**
 * Verify payment with Paystack API
 * Make server-to-server call to confirm payment is legitimate
 */
export async function verifyPaystackPayment(
  reference: string
): Promise<{
  success: boolean;
  data?: PaystackWebhookData["data"];
  error?: string;
}> {
  if (!PAYSTACK_SECRET) {
    return { success: false, error: "Paystack secret not configured" };
  }

  try {
    const response = await axios.get(
      `${PAYSTACK_API_BASE}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
        },
        timeout: 5000,
      }
    );

    if (response.data.status && response.data.data.status === "success") {
      return {
        success: true,
        data: response.data.data,
      };
    }

    return {
      success: false,
      error: `Payment status: ${response.data.data.status}`,
    };
  } catch (error: any) {
    console.error("❌ Paystack verification failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create payment authorization URL for Paystack
 * Used to initiate payment from frontend
 */
export async function createPaymentAuthorization(email: string, amount: number, metadata: any = {}) {
  if (!PAYSTACK_SECRET) {
    throw new Error("Paystack secret not configured");
  }

  try {
    const response = await axios.post(
      `${PAYSTACK_API_BASE}/transaction/initialize`,
      {
        email,
        amount: Math.round(amount * 100), // Convert to kobo (Paystack uses cents)
        metadata,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );

    return {
      success: true,
      authorizationUrl: response.data.data.authorization_url,
      reference: response.data.data.reference,
    };
  } catch (error: any) {
    console.error("❌ Paystack authorization failed:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Map Paystack payment amount to WAFlow plan
 */
export function getPlanFromAmount(amount: number): string {
  // Amount in ZAR (Paystack stores in kobo, divide by 100)
  const amountZAR = amount / 100;

  if (amountZAR >= 699) return "pro";
  if (amountZAR >= 299) return "starter";
  return "free"; // Shouldn't happen for paid plans
}

/**
 * Calculate plan expiration date (30 days from now)
 */
export function getPlanExpirationDate(): Date {
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + 30);
  return expiration;
}
