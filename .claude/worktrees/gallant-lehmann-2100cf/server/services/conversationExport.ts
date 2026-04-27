/**
 * conversationExport.ts
 * Exports a tenant's conversations to XLSX or CSV for download.
 */
import { db } from "../db.js";
import { conversations, customers } from "../../drizzle/schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import path from "path";
import fs from "fs";
import os from "os";

export interface ConversationExportOptions {
  tenantId: number;
  from?: string;   // "YYYY-MM-DD"
  to?: string;     // "YYYY-MM-DD"
  format: "xlsx" | "csv";
}

export async function exportConversations(opts: ConversationExportOptions): Promise<string> {
  const { tenantId, format } = opts;

  const conditions: any[] = [eq(conversations.tenantId, tenantId)];
  if (opts.from) conditions.push(gte(conversations.createdAt, new Date(opts.from)));
  if (opts.to) {
    const toDate = new Date(opts.to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(conversations.createdAt, toDate));
  }

  const rows = await db
    .select({
      id: conversations.id,
      phone: conversations.phoneNumber,
      name: conversations.contactName,
      message: conversations.message,
      response: conversations.response,
      source: conversations.source,
      sentiment: conversations.sentiment,
      isEscalated: conversations.isEscalated,
      isResolved: conversations.isResolved,
      language: conversations.language,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.createdAt))
    .limit(10_000);

  const headers = ["ID", "Phone", "Name", "Message", "Response", "Source", "Sentiment", "Escalated", "Resolved", "Language", "Date"];
  const data = rows.map(r => [
    r.id,
    r.phone,
    r.name ?? "",
    r.message,
    r.response ?? "",
    r.source,
    r.sentiment ?? "",
    r.isEscalated ? "Yes" : "No",
    r.isResolved ? "Yes" : "No",
    r.language ?? "en",
    r.createdAt ? new Date(r.createdAt).toLocaleString("en-ZA") : "",
  ]);

  const tmpDir = os.tmpdir();
  const fileName = `conversations_${tenantId}_${Date.now()}`;

  if (format === "xlsx") {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    // Set column widths
    ws["!cols"] = [8, 18, 20, 50, 50, 12, 12, 10, 10, 10, 20].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Conversations");
    const filePath = path.join(tmpDir, `${fileName}.xlsx`);
    XLSX.writeFile(wb, filePath);
    return filePath;
  } else {
    // CSV
    const csvLines = [headers, ...data].map(row =>
      row.map(cell => {
        const s = String(cell ?? "").replace(/"/g, '""');
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
      }).join(",")
    );
    const filePath = path.join(tmpDir, `${fileName}.csv`);
    fs.writeFileSync(filePath, csvLines.join("\n"), "utf-8");
    return filePath;
  }
}
