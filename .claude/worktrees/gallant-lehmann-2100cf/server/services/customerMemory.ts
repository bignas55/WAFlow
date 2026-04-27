/**
 * customerMemory.ts
 *
 * Persistent per-customer AI memory.
 *
 * After every AI response the pipeline calls updateCustomerMemory() in the
 * background (non-blocking). It feeds the last few messages to the AI and
 * asks it to extract / merge key facts into a structured profile stored in
 * customers.notes as JSON.
 *
 * On the next message the profile is loaded and injected into the system
 * prompt so the receptionist always "remembers" who it's talking to.
 *
 * This creates a learning loop:
 *   message → AI reply → extract facts → save to profile
 *   next message → load profile → AI already knows the customer
 */

import { db } from "../db.js";
import { customers } from "../../drizzle/schema.js";
import { eq, and } from "drizzle-orm";
import OpenAI from "openai";

// ── Profile shape ────────────────────────────────────────────────────────────

export interface CustomerProfile {
  // Identity
  name?: string;
  location?: string;
  // Business context (optional — only if the customer is a business owner / lead)
  businessName?: string;
  businessType?: string;
  ownerName?: string;
  servicesOffered?: string[];
  operatingHours?: string;
  // Preferences & behaviour
  preferences?: string[];         // e.g. ["prefers morning slots", "lactose intolerant"]
  lastTopics?: string[];          // up to 3 recent conversation topics
  hesitations?: string[];         // concerns or objections raised
  // Appointments
  appointmentBooked?: boolean;
  appointmentTime?: string;
  // Legacy sales fields (kept for backward compat)
  wantsToAutomate?: string[];
  preferredCallType?: string;
  // Goals & unresolved (NEW — for better learning)
  currentGoal?: string;           // what is the customer currently trying to accomplish?
  unresolvedQuestions?: string[]; // questions the customer asked that haven't been fully answered yet
  informedAbout?: string[];       // things we've already explained to this customer (no need to repeat)
  corrections?: string[];         // times the customer corrected or clarified a misunderstanding
  communicationStyle?: string;    // e.g. "formal", "casual", "brief", "detailed"
  // Summary
  summary?: string;               // one-sentence running summary
  updatedAt?: string;
}

// ── Load & format for prompt injection ──────────────────────────────────────

export async function getCustomerContext(
  tenantId: number,
  phone: string
): Promise<string> {
  try {
    const [customer] = await db
      .select({ notes: customers.notes, name: customers.name })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneNumber, phone)))
      .limit(1);

    // Only inject the name if the AI memory explicitly extracted it from the conversation.
    // The customers.name field may come from WhatsApp metadata (the business's contact book),
    // which means the customer never actually introduced themselves — so we don't use it.
    if (!customer?.notes) return "";

    const profile: CustomerProfile = JSON.parse(customer.notes);

    const lines: string[] = [];
    // Use only the name the customer explicitly told us (extracted by memory AI)
    if (profile.name)                         lines.push(`Name: ${profile.name}`);
    if (profile.location)                     lines.push(`Location: ${profile.location}`);
    if (profile.businessName)                 lines.push(`Business: ${profile.businessName}`);
    if (profile.businessType)                 lines.push(`Business type: ${profile.businessType}`);
    if (profile.ownerName)                    lines.push(`Owner: ${profile.ownerName}`);
    if (profile.servicesOffered?.length)      lines.push(`Their services: ${profile.servicesOffered.join(", ")}`);
    if (profile.operatingHours)               lines.push(`Their hours: ${profile.operatingHours}`);
    if (profile.preferences?.length)          lines.push(`Preferences: ${profile.preferences.join(", ")}`);
    if (profile.hesitations?.length)          lines.push(`Past concerns: ${profile.hesitations.join(", ")}`);
    if (profile.wantsToAutomate?.length)      lines.push(`Wants to automate: ${profile.wantsToAutomate.join(", ")}`);
    if (profile.appointmentBooked)            lines.push(`Has a booked appointment${profile.appointmentTime ? ` at ${profile.appointmentTime}` : ""}`);
    if (profile.lastTopics?.length)           lines.push(`Recently discussed: ${profile.lastTopics.join(", ")}`);
    if (profile.summary)                      lines.push(`Summary: ${profile.summary}`);
    // New learning fields
    if (profile.currentGoal)                  lines.push(`Current goal: ${profile.currentGoal}`);
    if (profile.unresolvedQuestions?.length)  lines.push(`Unresolved questions (answer these if relevant): ${profile.unresolvedQuestions.join("; ")}`);
    if (profile.informedAbout?.length)        lines.push(`Already explained to them (DO NOT repeat): ${profile.informedAbout.join(", ")}`);
    if (profile.corrections?.length)          lines.push(`Past misunderstandings to avoid: ${profile.corrections.join("; ")}`);
    if (profile.communicationStyle)           lines.push(`Communication style: ${profile.communicationStyle}`);

    if (lines.length === 0) return "";

    return (
      "\n\n---\nCUSTOMER MEMORY (you already know this person — use this to personalise your reply and avoid repeating yourself):\n" +
      lines.join("\n") +
      "\n---"
    );
  } catch {
    return "";
  }
}

// ── Extract facts from conversation & merge into profile ─────────────────────

export async function updateCustomerMemory(
  tenantId: number,
  phone: string,
  apiUrl: string,
  apiKey: string,
  model: string,
  recentMessages: Array<{ message: string; response: string | null }>
): Promise<void> {
  // Fire-and-forget — never block the response
  _doUpdate(tenantId, phone, apiUrl, apiKey, model, recentMessages).catch((e) =>
    console.log(`📝 Memory update skipped (${phone}): ${String(e?.message ?? e).slice(0, 80)}`)
  );
}

async function _doUpdate(
  tenantId: number,
  phone: string,
  apiUrl: string,
  apiKey: string,
  model: string,
  recentMessages: Array<{ message: string; response: string | null }>
): Promise<void> {
  const [customer] = await db
    .select({ id: customers.id, notes: customers.notes, name: customers.name })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.phoneNumber, phone)))
    .limit(1);

  if (!customer) return;

  // Process the last 8 message pairs (matches the 12-turn history window)
  const slice = recentMessages.slice(-8);
  if (slice.length === 0) return;

  let existing: CustomerProfile = {};
  try { existing = JSON.parse(customer.notes || "{}"); } catch {}

  const conversationText = slice
    .map((m) => `Customer: ${m.message}\nReceptionist: ${m.response ?? "(no reply)"}`)
    .join("\n\n");

  const extractPrompt = `You are a customer memory assistant for a business AI receptionist.
Your job: extract and update facts about this customer from the recent conversation.
Merge intelligently with their existing profile — never erase good existing data.
Return ONLY a valid JSON object. No markdown, no explanation, nothing else.

EXISTING PROFILE:
${JSON.stringify(existing)}

RECENT CONVERSATION:
${conversationText}

Rules:
- Only set a field if clearly stated in the conversation. Omit fields not mentioned.
- For ARRAYS: merge new items with existing ones (deduplicate). Do not erase existing items.
- For informedAbout: list factual topics the receptionist clearly explained (so we don't repeat them next time).
- For unresolvedQuestions: list specific questions the customer asked but did NOT get a complete answer to.
- For corrections: note if the customer corrected a misunderstanding (e.g. "No, I meant X not Y").
- For communicationStyle: observe how they write — "formal", "casual", "brief", "emoji-heavy", "detailed", etc.
- For currentGoal: what is the customer CURRENTLY trying to accomplish in this interaction?
- Keep "summary" under 20 words. Update it only if something significant changed.

Return this exact structure (omit any field you have no data for):
{
  "name": "customer's name if they said it",
  "location": "city or area they mentioned",
  "preferences": ["preference 1", "preference 2"],
  "businessName": "their business name if mentioned",
  "businessType": "e.g. salon, clinic, restaurant",
  "servicesOffered": ["services their business offers"],
  "hesitations": ["concern 1", "concern 2"],
  "appointmentBooked": true,
  "appointmentTime": "date/time of appointment",
  "lastTopics": ["topic 1", "topic 2", "topic 3"],
  "currentGoal": "what they are trying to accomplish right now",
  "unresolvedQuestions": ["question they asked that wasn't fully answered"],
  "informedAbout": ["pricing", "opening hours", "how to book"],
  "corrections": ["they said 'I meant Saturday not Sunday'"],
  "communicationStyle": "casual and brief",
  "summary": "returning customer interested in haircut bookings"
}`;

  const openai = new OpenAI({ baseURL: apiUrl, apiKey });

  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: extractPrompt }],
    temperature: 0.1,
    max_tokens: 700,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  // Strip markdown fences if model wrapped JSON in ```
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  const extracted: CustomerProfile = JSON.parse(jsonMatch[0]);

  // Deep merge: don't overwrite existing good data with empty values.
  // Arrays are deduplicated-merged (union), not overwritten.
  const ARRAY_FIELDS = new Set<keyof CustomerProfile>([
    "preferences", "servicesOffered", "hesitations", "wantsToAutomate",
    "lastTopics", "unresolvedQuestions", "informedAbout", "corrections",
  ]);
  const merged: CustomerProfile = { ...existing };
  for (const [k, v] of Object.entries(extracted)) {
    const key = k as keyof CustomerProfile;
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (ARRAY_FIELDS.has(key) && Array.isArray(v)) {
      // Merge arrays: keep existing items, add new ones (deduplicate, cap at 5)
      const existing_arr: string[] = (merged as any)[key] ?? [];
      const merged_arr = [...new Set([...existing_arr, ...v as string[]])].slice(0, 5);
      (merged as any)[key] = merged_arr;
    } else {
      (merged as any)[key] = v;
    }
  }
  merged.updatedAt = new Date().toISOString();

  await db
    .update(customers)
    .set({ notes: JSON.stringify(merged), updatedAt: new Date() })
    .where(eq(customers.id, customer.id));

  console.log(`🧠 Memory updated for ${phone}: ${merged.summary?.slice(0, 60) ?? "profile saved"}`);
}
