/**
 * Audit Log Service
 * Records key platform actions for transparency and troubleshooting.
 */

import { db } from "../db.js";
import { auditLogs } from "../../drizzle/schema.js";

export type AuditAction =
  | "appointment.booked"
  | "appointment.cancelled"
  | "appointment.status_changed"
  | "appointment.invoice_generated"
  | "broadcast.sent"
  | "kb.trained"
  | "kb.entry_added"
  | "kb.entry_deleted"
  | "customer.imported"
  | "customer.merged"
  | "customer.opted_out"
  | "settings.updated"
  | "whatsapp.connected"
  | "whatsapp.disconnected"
  | "staff.created"
  | "staff.updated"
  | "staff.deleted"
  | "appointment.invoice_sent"
  | "appointment.bulk_status_update";

export async function logAction(
  tenantId: number,
  userId: number | null,
  action: AuditAction,
  entityType?: string,
  entityId?: number,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(auditLogs).values({ tenantId, userId, action, entityType, entityId, details });
  } catch {
    // Never throw — audit failures must not affect main flows
  }
}
