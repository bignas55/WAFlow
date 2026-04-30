/**
 * Admin Approval Service
 * Handles admin approval/rejection of new user signups via the receptionist dashboard
 * Sends approval/denial emails to notify users of status changes
 */

import { db } from "../db.js";
import { users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { emailService } from "./emailService.js";

const CODE_EXPIRY_MINUTES = 24 * 60; // 24 hours for approval window

/**
 * Generate a tracking code for reference (not sent anywhere, just stored)
 */
export function generateApprovalCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Issue an approval code for a new signup (stores in DB for reference only)
 */
export async function issueApprovalCode(
  userId: number,
  userEmail: string,
  userName: string,
  businessName: string
): Promise<string> {
  const code = generateApprovalCode();
  const expires = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  await db.update(users).set({
    emailVerificationCode: code,
    emailVerificationExpires: expires,
    emailVerificationAttempts: 0,
  }).where(eq(users.id, userId));

  return code;
}

/**
 * Approve a signup — marks user as verified and activates their account
 * Called when admin clicks "Approve" button in the dashboard
 * Sends approval notification email to the user
 */
export async function approveSignup(userId: number): Promise<{ success: boolean; reason?: string }> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { success: false, reason: "User not found" };
  }

  if (user.emailVerified) {
    return { success: false, reason: "Account already verified" };
  }

  // ✅ Approve — mark as verified and set trial dates
  const trialStart = new Date();
  const trialEnd = new Date(trialStart);
  trialEnd.setDate(trialEnd.getDate() + 14);

  await db.update(users).set({
    emailVerified: true,
    emailVerificationCode: null,
    emailVerificationExpires: null,
    emailVerificationAttempts: 0,
    trialStartDate: trialStart,
    trialEndDate: trialEnd,
    accountStatus: "trial_active",
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  // Send approval notification email
  try {
    await emailService.sendApprovalNotification(user.email, user.name);
  } catch (err) {
    console.warn("⚠️  Could not send approval email to", user.email, ":", (err as Error).message);
    // Don't fail the approval if email fails to send
  }

  return { success: true };
}

/**
 * Decline a signup — deletes the user account and all associated data
 * Called when admin clicks "Decline" button in the dashboard
 */
export async function declineSignup(userId: number): Promise<{ success: boolean; reason?: string }> {
  const [user] = await db
    .select({
      id: users.id,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { success: false, reason: "User not found" };
  }

  if (user.emailVerified) {
    return { success: false, reason: "Cannot decline an already-verified account" };
  }

  // Delete the user account (cascade will handle related records)
  await db.delete(users).where(eq(users.id, userId));

  return { success: true };
}

/**
 * Get pending signups awaiting admin approval
 * Returns all unverified users so admin can see them in the dashboard
 */
export async function getPendingSignups(): Promise<
  Array<{
    id: number;
    email: string;
    name: string;
    createdAt: Date | null;
  }>
> {
  const pending = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where((col) => {
      // emailVerified = false
      return col(users.emailVerified).eq(false);
    });

  return pending;
}
