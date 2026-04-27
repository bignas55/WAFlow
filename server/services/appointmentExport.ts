/**
 * appointmentExport.ts
 * Exports all appointments to an Excel file that stays in sync with the DB.
 * File: exports/appointments.xlsx  (created relative to project root)
 */
import path from "path";
import fs from "fs";
import { db } from "../db.js";
import { appointments, customers, services } from "../../drizzle/schema.js";
import { eq, desc } from "drizzle-orm";

const EXPORT_DIR = path.join(process.cwd(), "exports");
const EXCEL_PATH = path.join(EXPORT_DIR, "appointments.xlsx");

export async function exportAppointmentsToExcel(): Promise<string> {
  // Ensure exports folder exists
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

  // Fetch all appointments with joins
  const rows = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      time: appointments.time,
      status: appointments.status,
      notes: appointments.notes,
      createdAt: appointments.createdAt,
      customerName: customers.name,
      customerPhone: customers.phoneNumber,
      customerEmail: customers.email,
      serviceName: services.name,
      serviceDuration: services.duration,
      servicePrice: services.price,
    })
    .from(appointments)
    .leftJoin(customers, eq(appointments.customerId, customers.id))
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .orderBy(desc(appointments.date), appointments.time);

  // Dynamic import xlsx (already in dependencies)
  const XLSX = await import("xlsx");

  // Build worksheet data
  const headers = [
    "ID", "Date", "Time", "Status",
    "Customer Name", "Customer Phone", "Customer Email",
    "Service", "Duration (min)", "Price (R)",
    "Notes", "Booked At",
  ];

  const data = rows.map(r => [
    r.id,
    r.date,
    r.time,
    (r.status || "scheduled").toUpperCase(),
    r.customerName || "Unknown",
    r.customerPhone || "",
    r.customerEmail || "",
    r.serviceName || "Unknown",
    r.serviceDuration || "",
    r.servicePrice ? Number(r.servicePrice).toFixed(2) : "",
    r.notes || "",
    r.createdAt ? new Date(r.createdAt).toLocaleString("en-ZA") : "",
  ]);

  const wb = XLSX.utils.book_new();

  // ── Main sheet: All appointments ─────────────────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

  // Column widths
  ws["!cols"] = [
    { wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
    { wch: 20 }, { wch: 18 }, { wch: 25 },
    { wch: 20 }, { wch: 14 }, { wch: 12 },
    { wch: 30 }, { wch: 20 },
  ];

  // Bold header row
  for (let c = 0; c < headers.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[cellRef]) {
      ws[cellRef].s = { font: { bold: true }, fill: { fgColor: { rgb: "25D366" } } };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "All Appointments");

  // ── Today's sheet ─────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter(r => r.date === today);
  const wsToday = XLSX.utils.aoa_to_sheet([headers, ...todayRows.map(r => [
    r.id, r.date, r.time,
    (r.status || "scheduled").toUpperCase(),
    r.customerName || "Unknown",
    r.customerPhone || "",
    r.customerEmail || "",
    r.serviceName || "Unknown",
    r.serviceDuration || "",
    r.servicePrice ? Number(r.servicePrice).toFixed(2) : "",
    r.notes || "",
    r.createdAt ? new Date(r.createdAt).toLocaleString("en-ZA") : "",
  ])]);
  wsToday["!cols"] = ws["!cols"];
  XLSX.utils.book_append_sheet(wb, wsToday, `Today (${today})`);

  // ── Summary sheet ─────────────────────────────────────────────────────────
  const statusCounts = rows.reduce((acc, r) => {
    acc[r.status || "scheduled"] = (acc[r.status || "scheduled"] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const wsSummary = XLSX.utils.aoa_to_sheet([
    ["WAFlow — Appointment Summary"],
    ["Generated", new Date().toLocaleString("en-ZA")],
    [],
    ["Status", "Count"],
    ["Scheduled", statusCounts["scheduled"] || 0],
    ["Completed", statusCounts["completed"] || 0],
    ["Cancelled", statusCounts["cancelled"] || 0],
    ["No Show",   statusCounts["no_show"]   || 0],
    [],
    ["Total", rows.length],
    ["Today", todayRows.length],
  ]);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // Write file
  XLSX.writeFile(wb, EXCEL_PATH);
  console.log(`📊 Appointments Excel updated: ${EXCEL_PATH} (${rows.length} rows)`);

  return EXCEL_PATH;
}
