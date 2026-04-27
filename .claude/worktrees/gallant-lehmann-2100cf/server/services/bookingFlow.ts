import { getInsertId } from "../utils.js";
/**
 * bookingFlow.ts
 * Stateful multi-turn conversation handler for WhatsApp appointment booking.
 * State is stored in-memory (keyed by tenantId:phone) and expires after 20 minutes.
 * When booking is complete it creates the appointment directly in the DB.
 */

import { db } from "../db.js";
import { appointments, customers, services } from "../../drizzle/schema.js";
import { eq, and } from "drizzle-orm";
import { exportAppointmentsToExcel } from "./appointmentExport.js";
import fs from "fs";
import path from "path";

// ── Types ───────────────────────────────────────────────────────────────────

type BookingStep = "service" | "date" | "time" | "confirm" | "done";

interface BookingState {
  step: BookingStep;
  serviceId?: number;
  serviceName?: string;
  serviceDuration?: number;
  date?: string;         // YYYY-MM-DD
  time?: string;         // HH:MM
  customerName?: string;
  updatedAt: number;     // Date.now()
}

// ── Persistent state store ────────────────────────────────────────────────────
// Booking conversations survive server restarts by writing to a JSON file.
// This prevents mid-flow state from being lost when the dev server reloads.

const EXPIRY_MS = 30 * 60 * 1000; // 30 minutes of inactivity clears the flow
const STATE_FILE = path.join(process.cwd(), ".wwebjs_auth", "booking_sessions.json");

function loadSessions(): Record<string, BookingState> {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    }
  } catch { /* corrupt file — start fresh */ }
  return {};
}

function saveSessions(sessions: Record<string, BookingState>) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(sessions, null, 2), "utf8");
  } catch (e) {
    console.error("⚠️  Could not save booking sessions:", e);
  }
}

function stateKey(tenantId: number, phone: string) {
  return `${tenantId}:${phone}`;
}

function getState(tenantId: number, phone: string): BookingState | null {
  const sessions = loadSessions();
  const key = stateKey(tenantId, phone);
  const s = sessions[key];
  if (!s) return null;
  if (Date.now() - s.updatedAt > EXPIRY_MS) {
    delete sessions[key];
    saveSessions(sessions);
    return null;
  }
  return s;
}

function setState(tenantId: number, phone: string, state: BookingState) {
  const sessions = loadSessions();
  sessions[stateKey(tenantId, phone)] = { ...state, updatedAt: Date.now() };
  saveSessions(sessions);
}

function clearState(tenantId: number, phone: string) {
  const sessions = loadSessions();
  delete sessions[stateKey(tenantId, phone)];
  saveSessions(sessions);
}

// ── Intent detection ─────────────────────────────────────────────────────────

const BOOKING_KEYWORDS = [
  // Explicit booking language
  "appointment", "book", "booking", "schedule", "reserve", "slot",
  "make a booking", "set up", "want to come in", "come in", "visit",
  "available", "when can i", "can i book", "can i make",
  // Natural / casual scheduling phrases
  "pencil me in", "put me down", "i'll come", "i will come",
  "let's do", "let's make it", "make it", "set it",
  "i'd like to", "i would like to", "can we do", "can we set",
  "how about", "what about", "is there a slot", "any availability",
  "fit me in", "squeeze me in", "when are you free", "when are you open",
  "see you", "come by", "come in", "pop in", "drop in",
  "fix a time", "fix a date", "pick a time", "pick a date",
  "get a time", "get an appointment", "need to come", "want to come",
];

// Also detect messages that contain BOTH a time AND a date reference — these are
// almost certainly scheduling requests even without explicit booking words.
const TIME_PATTERN = /\b(\d{1,2})(:\d{2})?\s*(am|pm|o'?clock)?\b/i;
const DATE_PATTERN = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|next\s+\w+|this\s+\w+|\d{1,2}[\/\-]\d{1,2}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*)\b/i;

export function hasBookingIntent(message: string): boolean {
  const lower = message.toLowerCase();
  if (BOOKING_KEYWORDS.some((kw) => lower.includes(kw))) return true;
  // "tomorrow at 10am" / "Monday at 2pm" — time + date in same message
  if (TIME_PATTERN.test(lower) && DATE_PATTERN.test(lower)) return true;
  return false;
}

// "cancel" during an active booking flow = cancel the flow (not the appointment)
export function isCancelIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return ["cancel", "stop", "nevermind", "never mind", "forget it", "no thanks"].some((kw) => lower.includes(kw));
}

const CANCEL_APPT_KEYWORDS = [
  "cancel my appointment", "cancel the appointment", "cancel our appointment",
  "cancel it", "don't come", "won't be coming", "can't come", "cannot come",
  "need to cancel", "want to cancel", "would like to cancel",
];

export function hasCancelAppointmentIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return CANCEL_APPT_KEYWORDS.some((kw) => lower.includes(kw));
}

const RESCHEDULE_KEYWORDS = [
  "reschedule", "rescheduling", "change my appointment", "change our appointment",
  "change the appointment", "move my appointment", "move the appointment",
  "switch my appointment", "different time", "different date", "different day",
  "change the time", "change the date", "change the day",
  "move it to", "change it to", "shift it to",
  "can we move", "can we change", "can we reschedule", "can we switch",
];

export function hasRescheduleIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return RESCHEDULE_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Find the most recent scheduled appointment for a customer by phone number */
async function findUpcomingAppointment(tenantId: number, phone: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [customer] = await db.select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneNumber, phone)))
    .limit(1);
  if (!customer) return null;

  const [appt] = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      time: appointments.time,
      serviceId: appointments.serviceId,
    })
    .from(appointments)
    .where(and(eq(appointments.customerId, customer.id), eq(appointments.status, "scheduled")))
    .orderBy(appointments.date, appointments.time)
    .limit(1);

  if (!appt || appt.date < today) return null;
  return appt;
}

/** Handle a reschedule request — tries to parse new date/time from the message */
async function handleReschedule(
  tenantId: number,
  phone: string,
  message: string,
): Promise<BookingFlowResult> {
  const appt = await findUpcomingAppointment(tenantId, phone);

  if (!appt) {
    return {
      response: "I couldn't find an upcoming appointment for your number. Would you like to *book a new appointment* instead?",
      handled: true,
    };
  }

  // Try to parse new time and/or date from the message
  const newTime = parseTime(message);
  const newDate = parseDate(message) ?? appt.date; // keep old date if no new date given
  const today = new Date().toISOString().slice(0, 10);

  if (!newTime && !parseDate(message)) {
    // Neither date nor time found — ask what they want to change to
    const [svc] = await db.select({ name: services.name }).from(services).where(eq(services.id, appt.serviceId)).limit(1);
    const friendly = new Date(appt.date + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "long", month: "long", day: "numeric" });
    return {
      response: `Your current appointment is on *${friendly}* at *${appt.time}* (${svc?.name ?? "service"}).\n\nWhat would you like to change it to? Give me a new date and/or time.`,
      handled: true,
    };
  }

  if (newDate < today) {
    return { response: "That date has already passed. Please choose a future date.", handled: true };
  }

  const finalTime = newTime ?? appt.time;
  const friendly = new Date(newDate + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "long", month: "long", day: "numeric" });

  // Update the appointment
  await db.update(appointments)
    .set({ date: newDate, time: finalTime, updatedAt: new Date() })
    .where(eq(appointments.id, appt.id));

  exportAppointmentsToExcel().catch(() => {});

  return {
    response: `✅ *Rescheduled!*\n\nYour appointment has been moved to:\n📅 *${friendly}* at 🕐 *${finalTime}*\n\nSee you then! If you need to change it again, just let us know. 😊`,
    handled: true,
    appointmentId: appt.id,
  };
}

// ── Date parsing ─────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, "0"); }

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS_MAP: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

export function parseDate(text: string): string | null {
  const lower = text.toLowerCase().trim();
  const now = new Date();

  if (lower === "today") return toDateStr(now);
  if (lower === "tomorrow") {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    return toDateStr(d);
  }

  // "next Monday" / "this Friday"
  const nextDay = lower.match(/(?:next\s+|this\s+)?([a-z]+day)/i);
  if (nextDay) {
    const dayName = nextDay[1].toLowerCase();
    const targetDay = WEEKDAYS[dayName];
    if (targetDay !== undefined) {
      const d = new Date(now);
      const diff = (targetDay - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return toDateStr(d);
    }
  }

  // "25 March" / "March 25"
  for (const [mName, mNum] of Object.entries(MONTHS_MAP)) {
    const m1 = lower.match(new RegExp(`(\\d{1,2})\\s+${mName}`, "i"));
    const m2 = lower.match(new RegExp(`${mName}\\s+(\\d{1,2})`, "i"));
    const dayMatch = m1 || m2;
    if (dayMatch) {
      const day = parseInt(dayMatch[1]);
      let year = now.getFullYear();
      const candidate = new Date(year, mNum - 1, day);
      if (candidate < now) year++; // past month → next year
      return `${year}-${pad(mNum)}-${pad(day)}`;
    }
  }

  // ISO / DD/MM/YYYY / MM-DD
  const iso = lower.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = lower.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dmy) {
    const d = parseInt(dmy[1]), m = parseInt(dmy[2]);
    let y = dmy[3] ? parseInt(dmy[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  return null;
}

// ── Time parsing ─────────────────────────────────────────────────────────────

export function parseTime(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // "9am", "9:30am", "2pm", "14:00", "9:00 AM"
  const m = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;

  let h = parseInt(m[1]);
  const mins = m[2] ? parseInt(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();

  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;

  if (h < 0 || h > 23 || mins < 0 || mins > 59) return null;

  // Validate business hours 07:00 – 18:00
  if (h < 7 || h >= 18) return null;

  return `${pad(h)}:${pad(mins)}`;
}

// ── Service matching ──────────────────────────────────────────────────────────

async function matchService(text: string, tenantId?: number): Promise<{ id: number; name: string; duration: number } | null> {
  const allServices = await db.select({ id: services.id, name: services.name, duration: services.duration })
    .from(services).where(eq(services.isActive, true));

  if (allServices.length === 0) return null;

  // If only one service, auto-select
  if (allServices.length === 1) return allServices[0];

  const lower = text.toLowerCase();
  // Try to match by number (e.g., "1", "option 1")
  const numMatch = lower.match(/\b(\d+)\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]) - 1;
    if (idx >= 0 && idx < allServices.length) return allServices[idx];
  }

  // Fuzzy name match
  for (const svc of allServices) {
    if (lower.includes(svc.name.toLowerCase())) return svc;
    // Match first word of service name
    const firstWord = svc.name.split(" ")[0].toLowerCase();
    if (lower.includes(firstWord) && firstWord.length > 3) return svc;
  }

  return null;
}

// ── Core booking function ────────────────────────────────────────────────────

async function createAppointment(
  tenantId: number,
  phone: string,
  state: BookingState
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    // Upsert customer
    await db.insert(customers).values({
      tenantId,
      phoneNumber: phone,
      name: state.customerName || null,
    }).onDuplicateKeyUpdate({
      set: { updatedAt: new Date() },
    });

    const [customer] = await db.select().from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneNumber, phone))).limit(1);

    if (!customer) return { success: false, error: "Customer not found" };

    // Quick conflict check
    const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const newStart = toMins(state.time!);
    const newEnd = newStart + (state.serviceDuration ?? 60);

    const dayAppts = await db.select({ time: appointments.time, serviceId: appointments.serviceId })
      .from(appointments).where(and(eq(appointments.date, state.date!), eq(appointments.status, "scheduled")));

    for (const a of dayAppts) {
      const [svc] = await db.select({ duration: services.duration }).from(services)
        .where(eq(services.id, a.serviceId)).limit(1);
      const dur = svc?.duration ?? 60;
      const existStart = toMins(a.time);
      if (newStart < existStart + dur && newEnd > existStart) {
        return { success: false, error: `That time slot is already taken. Please choose a different time.` };
      }
    }

    const [result] = await db.insert(appointments).values({
      customerId: customer.id,
      serviceId: state.serviceId!,
      date: state.date!,
      time: state.time!,
      status: "scheduled",
    });

    const apptId = getInsertId(result) as number;

    await db.update(customers)
      .set({ totalAppointments: customer.totalAppointments + 1, updatedAt: new Date() })
      .where(eq(customers.id, customer.id));

    exportAppointmentsToExcel().catch(() => {});

    return { success: true, id: apptId };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Booking failed" };
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export interface BookingFlowResult {
  response: string;
  handled: boolean;       // true = don't pass to AI
  appointmentId?: number; // set when a booking was just confirmed
  // Extra detail for email notifications — only present when appointmentId is set
  bookingDetails?: {
    serviceName: string;
    date: string;   // YYYY-MM-DD
    time: string;   // HH:MM
  };
}

export async function handleBookingFlow(
  tenantId: number,
  phone: string,
  customerName: string | null,
  message: string
): Promise<BookingFlowResult> {
  const inFlow = !!getState(tenantId, phone);

  // Reschedule or cancel appointment — check BEFORE the normal flow so these
  // take priority when there's no active in-progress booking conversation.
  if (!inFlow && hasRescheduleIntent(message)) {
    return handleReschedule(tenantId, phone, message);
  }

  if (!inFlow && hasCancelAppointmentIntent(message)) {
    const appt = await findUpcomingAppointment(tenantId, phone);
    if (!appt) {
      return { response: "I couldn't find an upcoming appointment for your number. If you need help, feel free to ask!", handled: true };
    }
    await db.update(appointments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(appointments.id, appt.id));
    exportAppointmentsToExcel().catch(() => {});
    const friendly = new Date(appt.date + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "long", month: "long", day: "numeric" });
    return {
      response: `Your appointment on *${friendly}* at *${appt.time}* has been cancelled. We hope to see you again soon! 😊`,
      handled: true,
    };
  }

  // Cancel intent always clears state
  if (isCancelIntent(message)) {
    const had = getState(tenantId, phone);
    clearState(tenantId, phone);
    if (had) {
      return { response: "No problem, I've cancelled the booking process. Is there anything else I can help you with?", handled: true };
    }
    return { response: "", handled: false };
  }

  let state = getState(tenantId, phone);

  // Not in a booking flow — check for intent
  if (!state) {
    if (!hasBookingIntent(message)) {
      return { response: "", handled: false };
    }

    // Start booking flow — but first extract whatever info the customer
    // already gave us so we can skip redundant questions.
    const allServices = await db.select({ id: services.id, name: services.name, duration: services.duration, price: services.price })
      .from(services).where(eq(services.isActive, true));

    if (allServices.length === 0) {
      return {
        response: "I'd love to book an appointment for you, but we don't have any services set up yet. Please contact us directly.",
        handled: true,
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const preDate = parseDate(message);
    const preTime = parseTime(message);
    const validDate = preDate && preDate >= today ? preDate : null;

    // Try to match a service from the trigger message itself
    const preService = await matchService(message, tenantId);
    const svc = preService ?? (allServices.length === 1 ? allServices[0] : null);

    // ── If we have service + date + time → jump straight to confirm ──────────
    if (svc && validDate && preTime) {
      const friendlyDate = new Date(validDate + "T12:00:00").toLocaleDateString("en-ZA", {
        weekday: "long", month: "long", day: "numeric",
      });
      setState(tenantId, phone, {
        step: "confirm",
        serviceId: svc.id,
        serviceName: svc.name,
        serviceDuration: svc.duration,
        date: validDate,
        time: preTime,
        customerName: customerName || undefined,
        updatedAt: Date.now(),
      });
      return {
        response: `Here's your booking summary:\n\n📋 *Service:* ${svc.name}\n📅 *Date:* ${friendlyDate}\n🕐 *Time:* ${preTime}\n\nShall I confirm this appointment? Reply *Yes* to confirm or *No* to cancel.`,
        handled: true,
      };
    }

    // ── Service + date but no time ────────────────────────────────────────────
    if (svc && validDate) {
      const friendlyDate = new Date(validDate + "T12:00:00").toLocaleDateString("en-ZA", {
        weekday: "long", month: "long", day: "numeric",
      });
      setState(tenantId, phone, {
        step: "time",
        serviceId: svc.id,
        serviceName: svc.name,
        serviceDuration: svc.duration,
        date: validDate,
        customerName: customerName || undefined,
        updatedAt: Date.now(),
      });
      return {
        response: `Got it — *${svc.name}* on *${friendlyDate}*. ✅\n\nWhat time would you like? Our slots are available from 07:00 to 18:00.\nExamples: *9am*, *10:30am*, *14:00*`,
        handled: true,
      };
    }

    // ── Service only (no date/time) ───────────────────────────────────────────
    if (svc) {
      setState(tenantId, phone, {
        step: "date",
        serviceId: svc.id,
        serviceName: svc.name,
        serviceDuration: svc.duration,
        customerName: customerName || undefined,
        updatedAt: Date.now(),
      });
      return {
        response: `Sure! I'll book you in for *${svc.name}* (${svc.duration} min).\n\nWhat date would you like? You can say *tomorrow*, *next Monday*, or a specific date like *25 March*.`,
        handled: true,
      };
    }

    // ── Multiple services, possibly with pre-filled date/time ─────────────────
    const list = allServices.map((s, i) =>
      `${i + 1}. *${s.name}* — ${s.duration} min (R${Number(s.price).toFixed(2)})`
    ).join("\n");

    setState(tenantId, phone, {
      step: "service",
      date: validDate || undefined,
      time: preTime || undefined,
      customerName: customerName || undefined,
      updatedAt: Date.now(),
    });

    return {
      response: `I'd be happy to book an appointment for you! 📅\n\nWhich service would you like?\n\n${list}\n\nJust reply with the number or name of the service.`,
      handled: true,
    };
  }

  // ── We're in a flow — handle current step ──────────────────────────────────

  if (state.step === "service") {
    const matched = await matchService(message, tenantId);
    if (!matched) {
      const allServices = await db.select({ id: services.id, name: services.name, duration: services.duration, price: services.price })
        .from(services).where(eq(services.isActive, true));
      const list = allServices.map((s, i) => `${i + 1}. *${s.name}*`).join("\n");
      return {
        response: `I didn't quite catch that. Please reply with the number or name of the service:\n\n${list}`,
        handled: true,
      };
    }

    // If the trigger message already had a date + time, jump straight to confirm
    if (state.date && state.time) {
      const friendlyDate = new Date(state.date + "T12:00:00").toLocaleDateString("en-ZA", {
        weekday: "long", month: "long", day: "numeric",
      });
      setState(tenantId, phone, {
        ...state,
        step: "confirm",
        serviceId: matched.id,
        serviceName: matched.name,
        serviceDuration: matched.duration,
      });
      return {
        response: `Here's your booking summary:\n\n📋 *Service:* ${matched.name}\n📅 *Date:* ${friendlyDate}\n🕐 *Time:* ${state.time}\n\nShall I confirm this appointment? Reply *Yes* to confirm or *No* to cancel.`,
        handled: true,
      };
    }

    // If only date is pre-filled, skip date question
    if (state.date) {
      const friendlyDate = new Date(state.date + "T12:00:00").toLocaleDateString("en-ZA", {
        weekday: "long", month: "long", day: "numeric",
      });
      setState(tenantId, phone, {
        ...state,
        step: "time",
        serviceId: matched.id,
        serviceName: matched.name,
        serviceDuration: matched.duration,
      });
      return {
        response: `Great — *${matched.name}* on *${friendlyDate}*! 👍\n\nWhat time would you like? (07:00–18:00)\nExamples: *9am*, *10:30am*, *14:00*`,
        handled: true,
      };
    }

    setState(tenantId, phone, {
      ...state,
      step: "date",
      serviceId: matched.id,
      serviceName: matched.name,
      serviceDuration: matched.duration,
    });

    return {
      response: `Great choice — *${matched.name}* (${matched.duration} min)! 👍\n\nWhat date works for you? You can say *tomorrow*, *next Monday*, or a specific date like *25 March*.`,
      handled: true,
    };
  }

  if (state.step === "date") {
    const parsed = parseDate(message);
    if (!parsed) {
      return {
        response: `I couldn't understand that date. Could you try something like:\n• *Tomorrow*\n• *Next Monday*\n• *25 March*\n• *2026-04-01*`,
        handled: true,
      };
    }

    // Make sure it's not in the past
    const today = new Date().toISOString().slice(0, 10);
    if (parsed < today) {
      return {
        response: `That date has already passed! Please choose a future date.`,
        handled: true,
      };
    }

    setState(tenantId, phone, { ...state, step: "time", date: parsed });

    const friendlyDate = new Date(parsed + "T12:00:00").toLocaleDateString("en-ZA", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    return {
      response: `*${friendlyDate}* — perfect! ✅\n\nWhat time would you like? Our slots are available from 07:00 to 18:00.\n\nExamples: *9am*, *10:30am*, *14:00*`,
      handled: true,
    };
  }

  if (state.step === "time") {
    const parsed = parseTime(message);
    if (!parsed) {
      return {
        response: `I couldn't understand that time. Please use a format like *9am*, *10:30*, or *14:00* (business hours: 07:00–18:00).`,
        handled: true,
      };
    }

    setState(tenantId, phone, { ...state, step: "confirm", time: parsed });

    const friendlyDate = new Date(state.date! + "T12:00:00").toLocaleDateString("en-ZA", {
      weekday: "long", month: "long", day: "numeric",
    });

    return {
      response: `Here's your booking summary:\n\n📋 *Service:* ${state.serviceName}\n📅 *Date:* ${friendlyDate}\n🕐 *Time:* ${parsed}\n\nShall I confirm this appointment? Reply *Yes* to confirm or *No* to cancel.`,
      handled: true,
    };
  }

  if (state.step === "confirm") {
    const lower = message.toLowerCase().trim();
    const isYes = ["yes", "yeah", "yep", "confirm", "ok", "okay", "sure", "please", "correct", "y"].some(w => lower.includes(w));
    const isNo = ["no", "nope", "cancel", "don't", "dont"].some(w => lower.includes(w));

    if (isNo) {
      clearState(tenantId, phone);
      return {
        response: "No problem! I've cancelled the booking. Feel free to ask again anytime if you'd like to reschedule. 😊",
        handled: true,
      };
    }

    if (!isYes) {
      return {
        response: `Please reply *Yes* to confirm your appointment or *No* to cancel.`,
        handled: true,
      };
    }

    // Create the appointment
    const result = await createAppointment(tenantId, phone, state);
    clearState(tenantId, phone);

    if (!result.success) {
      return {
        response: `Sorry, I couldn't complete your booking: ${result.error}\n\nWould you like to try a different time?`,
        handled: true,
      };
    }

    const friendlyDate = new Date(state.date! + "T12:00:00").toLocaleDateString("en-ZA", {
      weekday: "long", month: "long", day: "numeric",
    });

    return {
      response: `✅ *Booking Confirmed!*\n\n📋 *Service:* ${state.serviceName}\n📅 *Date:* ${friendlyDate}\n🕐 *Time:* ${state.time}\n\nWe look forward to seeing you! If you need to cancel or reschedule, just let us know. 😊`,
      handled: true,
      appointmentId: result.id,  // lets the pipeline emit a real-time dashboard update
      bookingDetails: {
        serviceName: state.serviceName!,
        date: state.date!,
        time: state.time!,
      },
    };
  }

  // Shouldn't reach here
  clearState(tenantId, phone);
  return { response: "", handled: false };
}
