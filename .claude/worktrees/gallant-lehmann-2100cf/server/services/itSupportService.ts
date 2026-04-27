/**
 * itSupportService.ts
 * Core engine for the WAFlow IT Support Assistant.
 *
 * Handles:
 *  - In-memory session management (per user, 1-hour TTL)
 *  - Unique ticket ID generation  (IT-YYYY-XXXXX)
 *  - File-backed ticket storage    (it_tickets.json)
 *  - Priority detection
 *  - AI-powered diagnosis via Groq / Ollama
 *  - Admin escalation report generation
 */

import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { ITCategory, IT_FLOWS, IT_KNOWLEDGE_BASE } from "./itKnowledgeBase.js";

// ── File persistence ───────────────────────────────────────────────────────────

const DATA_DIR  = path.join(process.cwd(), "data");
const TICKET_FILE = path.join(DATA_DIR, "it_tickets.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadTickets(): Record<string, ITTicket> {
  try { return JSON.parse(fs.readFileSync(TICKET_FILE, "utf8")); } catch { return {}; }
}
function saveTickets(data: Record<string, ITTicket>): void {
  try { fs.writeFileSync(TICKET_FILE, JSON.stringify(data, null, 2)); }
  catch (e: any) { console.warn("⚠️  [IT] Failed to save tickets:", e.message); }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ITPriority = "low" | "medium" | "high";
export type ITStatus   = "open" | "diagnosing" | "resolved" | "escalated";

export interface ITSupportSession {
  ticketId:   string;
  tenantId:   number;
  phoneNumber: string;
  userName:   string;
  category:   ITCategory | null;   // null = at main menu
  step:       number;              // which question we're waiting for
  answers:    Record<string, string>;
  diagnosis:  string;
  suggestedFix: string;
  priority:   ITPriority;
  waitingForResolution: boolean;   // asked "is it fixed?"
  expiresAt:  number;
}

export interface ITTicket {
  ticketId:     string;
  tenantId:     number;
  phoneNumber:  string;
  userName:     string;
  category:     string;
  answers:      Record<string, string>;
  diagnosis:    string;
  suggestedFix: string;
  priority:     ITPriority;
  status:       ITStatus;
  createdAt:    string;
  resolvedAt:   string | null;
}

// ── Session store ─────────────────────────────────────────────────────────────

const itSessions = new Map<string, ITSupportSession>();
const IT_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

// Periodic eviction of expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [key, s] of itSessions) if (now > s.expiresAt) itSessions.delete(key);
}, 30 * 60 * 1000);

function sessionKey(tenantId: number, phone: string) { return `${tenantId}:${phone}`; }

export function getITSession(tenantId: number, phone: string): ITSupportSession | undefined {
  const s = itSessions.get(sessionKey(tenantId, phone));
  if (!s) return undefined;
  if (Date.now() > s.expiresAt) { itSessions.delete(sessionKey(tenantId, phone)); return undefined; }
  return s;
}

export function setITSession(tenantId: number, phone: string, s: Omit<ITSupportSession, "expiresAt">): void {
  itSessions.set(sessionKey(tenantId, phone), { ...s, expiresAt: Date.now() + IT_SESSION_TTL_MS });
}

export function clearITSession(tenantId: number, phone: string): void {
  itSessions.delete(sessionKey(tenantId, phone));
}

// ── Ticket management ─────────────────────────────────────────────────────────

/** Generate a unique ticket ID in the format IT-YYYY-XXXXX */
export function generateTicketId(): string {
  const year    = new Date().getFullYear();
  const tickets = loadTickets();
  // Find the highest sequence number this year
  const prefix  = `IT-${year}-`;
  const existing = Object.keys(tickets)
    .filter(k => k.startsWith(prefix))
    .map(k => parseInt(k.replace(prefix, "")) || 0);
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

export function saveTicket(ticket: ITTicket): void {
  const all = loadTickets();
  all[ticket.ticketId] = ticket;
  saveTickets(all);
}

export function updateTicketStatus(ticketId: string, status: ITStatus): void {
  const all = loadTickets();
  if (all[ticketId]) {
    all[ticketId].status = status;
    if (status === "resolved") all[ticketId].resolvedAt = new Date().toISOString();
    saveTickets(all);
  }
}

export function getTicket(ticketId: string): ITTicket | undefined {
  return loadTickets()[ticketId];
}

// ── Priority detection ────────────────────────────────────────────────────────

/**
 * Automatically classify issue urgency based on collected answers.
 * High   = business critical (completely down, won't turn on, all devices locked)
 * Medium = degraded but functional (slow, intermittent, one device)
 * Low    = general query, minor issue
 */
export function detectPriority(category: ITCategory, answers: Record<string, string>): ITPriority {
  const a = (v: string) => v?.toLowerCase() ?? "";

  if (category === "internet") {
    if (a(answers.internet_state).includes("completely") || a(answers.router_lights) === "c") return "high";
    if (a(answers.other_devices) === "yes" && a(answers.internet_state).includes("down")) return "high";
    if (a(answers.internet_state).includes("slow") || a(answers.internet_state).includes("drop")) return "medium";
    return "medium";
  }

  if (category === "device") {
    if (answers.issue_type === "A") return "high"; // won't turn on
    if (answers.recent_changes === "C") return "high"; // dropped/wet
    if (answers.issue_type === "C") return "medium"; // crashing
    if (answers.issue_type === "B") return "medium"; // slow
    return "low";
  }

  if (category === "login") {
    if (answers.all_devices === "All devices") return "high"; // all devices locked out
    if (answers.error_type === "B") return "high"; // account locked
    if (answers.error_type === "C") return "medium"; // no OTP
    return "low";
  }

  if (category === "other") {
    if (a(answers.work_impact) === "yes") return "high";
    if (a(answers.duration) === "d") return "medium"; // week or more
    return "low";
  }

  return "medium";
}

// ── AI diagnosis ──────────────────────────────────────────────────────────────

/**
 * Uses the AI to generate a clear diagnosis and step-by-step fix
 * based on the category, collected answers, and knowledge base context.
 */
export async function generateITDiagnosis(
  category: ITCategory,
  answers: Record<string, string>,
  userName: string,
  apiUrl: string,
  apiKey: string,
  aiModel: string,
): Promise<{ diagnosis: string; suggestedFix: string }> {

  // Find the best matching knowledge base entry to seed the AI
  const kbEntries = IT_KNOWLEDGE_BASE[category] ?? [];
  const matchedEntry = kbEntries.find(e => e.condition(answers));

  const kbContext = matchedEntry
    ? `Known causes: ${matchedEntry.causes.join(", ")}.\nKnown fix steps: ${matchedEntry.fixSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "No specific knowledge base match — perform general diagnosis.";

  const answersText = Object.entries(answers)
    .map(([k, v]) => `• ${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");

  const client = new OpenAI({ baseURL: apiUrl, apiKey });

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await client.chat.completions.create({
        model: aiModel,
        messages: [
          {
            role: "system",
            content:
              `You are a professional IT support technician communicating via WhatsApp. ` +
              `Your job is to diagnose an IT issue and provide a clear, simple fix.\n\n` +
              `Rules:\n` +
              `- Write for a NON-TECHNICAL user — no jargon\n` +
              `- Keep diagnosis to 2-3 short sentences\n` +
              `- Provide numbered fix steps (max 5 steps), each under 1 sentence\n` +
              `- Be warm, professional, and reassuring\n` +
              `- Format for WhatsApp: use *bold* for important words\n\n` +
              `Knowledge base context:\n${kbContext}`,
          },
          {
            role: "user",
            content:
              `User: ${userName}\n` +
              `Issue category: ${category}\n` +
              `Collected answers:\n${answersText}\n\n` +
              `Provide:\n` +
              `1. DIAGNOSIS: (2-3 sentences explaining what is likely wrong and why)\n` +
              `2. FIX STEPS: (numbered steps the user should try right now)`,
          },
        ],
        max_tokens: 400,
        temperature: 0.4,
      });

      const raw = result.choices[0]?.message?.content?.trim() ?? "";

      // Parse diagnosis and fix steps from AI response
      const diagMatch  = /DIAGNOSIS[:\s]+(.+?)(?=FIX STEPS|$)/is.exec(raw);
      const fixMatch   = /FIX STEPS[:\s]+(.+)/is.exec(raw);

      const diagnosis    = diagMatch?.[1]?.trim()  ?? raw.slice(0, 200);
      const suggestedFix = fixMatch?.[1]?.trim()   ?? "Please restart the device/connection and try again.";

      return { diagnosis, suggestedFix };
    } catch (err: any) {
      if (err?.status === 429 && attempt < 3) await new Promise(r => setTimeout(r, attempt * 8000));
      else if (attempt === 3) break;
    }
  }

  // Fallback: use knowledge base directly
  const fb = matchedEntry ?? { causes: ["Unknown cause"], fixSteps: ["Please contact IT support for further assistance."] };
  return {
    diagnosis: `Based on your responses, the likely cause is: ${fb.causes.join(", ")}.`,
    suggestedFix: fb.fixSteps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
  };
}

// ── WhatsApp message formatters ───────────────────────────────────────────────

/** Format the IT support main menu */
export function formatITMenu(): string {
  return (
    `🔧 *IT Support Assistant*\n\n` +
    `Welcome! I'm here to help you resolve your IT issue step by step.\n\n` +
    `Please select your issue type:\n\n` +
    `1️⃣  🌐 *Internet / Network Issues*\n` +
    `2️⃣  💻 *Device / Hardware Issues*\n` +
    `3️⃣  🔐 *Login / Account Issues*\n` +
    `4️⃣  ❓ *Other IT Issue*\n` +
    `5️⃣  🤝 *Talk to a Human (Escalate Now)*\n\n` +
    `_Reply with a number to get started._`
  );
}

/** Format the diagnosis response for WhatsApp */
export function formatDiagnosisMessage(diagnosis: string, fix: string, ticketId: string): string {
  return (
    `🔍 *Diagnosis*\n\n${diagnosis}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🛠️ *Suggested Fix*\n\n${fix}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🎫 *Ticket ID:* \`${ticketId}\`\n\n` +
    `Please follow the steps above and reply:\n` +
    `✅ *Yes* — Issue is resolved\n` +
    `❌ *No* — Still having the problem`
  );
}

/** Format the admin escalation alert (WhatsApp format) */
export function formatAdminAlert(ticket: ITTicket): string {
  const priorityEmoji = { high: "🔴", medium: "🟡", low: "🟢" }[ticket.priority];
  const categoryLabel = { internet: "Internet / Network", device: "Device / Hardware", login: "Login / Account", other: "Other" }[ticket.category] ?? ticket.category;

  const symptoms = Object.entries(ticket.answers)
    .map(([k, v]) => `• ${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");

  return (
    `🔧 *IT SUPPORT ALERT*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *User:* ${ticket.userName}\n` +
    `📞 *Contact:* ${ticket.phoneNumber}\n` +
    `📋 *Issue Type:* ${categoryLabel}\n` +
    `🎫 *Ticket ID:* ${ticket.ticketId}\n` +
    `${priorityEmoji} *Priority:* ${ticket.priority.toUpperCase()}\n\n` +
    `📝 *Symptoms Collected:*\n${symptoms}\n\n` +
    `🔍 *AI Diagnosis:*\n${ticket.diagnosis}\n\n` +
    `🛠️ *Suggested Fix (already given to user):*\n${ticket.suggestedFix}\n\n` +
    `⚠️ _User confirmed issue is NOT resolved. Immediate follow-up required._`
  );
}

/** Short confirmation message sent to user after escalation */
export function formatEscalationConfirmation(ticketId: string, priority: ITPriority): string {
  const eta = priority === "high" ? "within the next hour" : priority === "medium" ? "within 2–4 hours" : "within 24 hours";
  return (
    `✅ *Ticket Escalated Successfully*\n\n` +
    `Your issue has been logged and an IT technician has been notified.\n\n` +
    `🎫 *Your Ticket ID:* \`${ticketId}\`\n` +
    `⏱️ *Expected Response:* ${eta}\n\n` +
    `_Please keep this ticket ID for reference. Someone will be in touch shortly. 🙏_`
  );
}
