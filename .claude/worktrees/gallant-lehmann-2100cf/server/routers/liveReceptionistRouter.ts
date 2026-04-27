/**
 * liveReceptionistRouter.ts
 *
 * Public-facing AI receptionist chat endpoint.
 * No authentication required — used by the pre-signup widget on all pages.
 *
 * Features:
 *  - In-memory session store with conversation history per visitor
 *  - Lead capture (name + email saved to receptionist_leads table)
 *  - Demo booking nudge
 *  - Uses platform AI config (admin tenant 1) with env fallback
 *  - Rate limited at Express level via receptionistLimiter
 */

import { z } from "zod";
import { router, publicProcedure } from "../trpc.js";
import { db } from "../db.js";
import { botConfig, receptionistLeads } from "../../drizzle/schema.js";
import { eq, desc } from "drizzle-orm";
import { decrypt } from "../services/encryptionService.js";
import OpenAI from "openai";
import { getInsertId } from "../utils.js";

// ── In-memory session store ────────────────────────────────────────────────────
interface Message  { role: "user" | "assistant"; content: string }
interface Session  { messages: Message[]; leadId: number | null; name: string | null; email: string | null; createdAt: number }

const sessions = new Map<string, Session>();

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of sessions.entries()) {
    if (s.createdAt < cutoff) sessions.delete(id);
  }
}, 30 * 60 * 1000);

function getSession(sessionId: string): Session {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { messages: [], leadId: null, name: null, email: null, createdAt: Date.now() });
  }
  return sessions.get(sessionId)!;
}

// ── Platform system prompt ─────────────────────────────────────────────────────
const SYSTEM = `You are the AI receptionist for WAFlow — a WhatsApp automation SaaS platform. You help website visitors understand the product and guide them toward signing up.

WHAT WAFLOW DOES:
- AI-powered WhatsApp receptionist that handles customer messages 24/7 automatically
- Appointment booking through WhatsApp conversations
- CRM with customer profiles, tags, and full conversation history
- Broadcast messaging to send bulk WhatsApp campaigns
- Knowledge base so the AI can answer business-specific questions
- Analytics dashboard — messages, bookings, AI performance
- Works with Ollama (private/local AI), Groq, and OpenAI — business's choice
- Multi-language support, voice transcription, conversation flows

PLANS:
- Free: 500 messages/month — great for testing
- Starter: 2,000 messages/month + priority support
- Pro: Unlimited messages + all features
- Enterprise: Custom limits, white-label, on-premise

SETUP TIME: Under 5 minutes — scan a QR code to connect WhatsApp, configure AI, done.

YOUR RULES:
1. Keep responses SHORT — 2–3 sentences max unless explaining a specific feature in detail
2. Be warm and genuinely helpful, not salesy
3. Use the visitor's name once you know it
4. After 2–3 exchanges naturally guide them to try it: "Want to set up a free account? It takes 5 minutes at /register"
5. For demo requests: "Sign up free and our team will reach out, or book a demo call at /book/waflow-demo"
6. When you have BOTH name AND email, append this JSON on a new line at the end (only once): {"__lead__":{"name":"THEIR_NAME","email":"THEIR_EMAIL"}}
7. If unsure about something, say "I'll connect you with the team" — never make up features`;

// ── Router ─────────────────────────────────────────────────────────────────────
export const liveReceptionistRouter = router({

  chat: publicProcedure
    .input(z.object({
      sessionId: z.string().min(1).max(128),
      message:   z.string().min(1).max(2000),
    }))
    .mutation(async ({ input }) => {
      const session = getSession(input.sessionId);
      if (session.messages.length > 20) session.messages = session.messages.slice(-18);

      session.messages.push({ role: "user", content: input.message });

      // AI config — try admin tenant first, fall back to env
      let apiUrl = process.env.AI_API_URL || "http://localhost:11434/v1";
      let apiKey  = process.env.AI_API_KEY  || "ollama";
      let model   = process.env.AI_MODEL    || "gemma4:latest";

      try {
        const [cfg] = await db
          .select({ aiApiUrl: botConfig.aiApiUrl, aiApiKey: botConfig.aiApiKey, aiModel: botConfig.aiModel })
          .from(botConfig).where(eq(botConfig.tenantId, 1)).limit(1);
        if (cfg?.aiApiUrl) apiUrl = cfg.aiApiUrl;
        if (cfg?.aiApiKey) apiKey  = decrypt(cfg.aiApiKey) || apiKey;
        if (cfg?.aiModel)  model   = cfg.aiModel;
      } catch { /* use env fallback */ }

      const openai = new OpenAI({ baseURL: apiUrl, apiKey });
      const completion = await openai.chat.completions.create({
        model,
        messages: [{ role: "system", content: SYSTEM }, ...session.messages],
        temperature: 0.7,
        max_tokens: 300,
      });

      let reply = completion.choices[0]?.message?.content?.trim() || "Sorry, I'm having trouble right now. Please try again in a moment.";

      // Extract lead JSON if AI included it
      let leadCaptured = false;
      const m = reply.match(/\{"__lead__":\{"name":"([^"]{1,255})","email":"([^"]{1,255})"\}\}/);
      if (m && !session.leadId) {
        const [, name, email] = m;
        session.name = name;
        session.email = email;
        reply = reply.replace(/\n?\{"__lead__":\{"name":"[^"]+","email":"[^"]+"\}\}/, "").trim();
        try {
          const res = await db.insert(receptionistLeads).values({ name, email, sessionId: input.sessionId, createdAt: new Date() });
          session.leadId = getInsertId(res);
          leadCaptured = true;
          console.log(`📋 [Receptionist] Lead captured: ${name} <${email}>`);
        } catch (e: any) {
          console.error("❌ [Receptionist] Lead save error:", e.message);
        }
      }

      session.messages.push({ role: "assistant", content: reply });
      return { reply, leadCaptured };
    }),

  saveLead: publicProcedure
    .input(z.object({
      sessionId: z.string().min(1).max(128),
      name:      z.string().min(1).max(255),
      email:     z.string().email(),
      phone:     z.string().max(30).optional(),
      notes:     z.string().max(1000).optional(),
    }))
    .mutation(async ({ input }) => {
      const session = getSession(input.sessionId);
      if (session.leadId) return { success: true };
      try {
        const res = await db.insert(receptionistLeads).values({
          name: input.name, email: input.email, phone: input.phone,
          notes: input.notes, sessionId: input.sessionId, createdAt: new Date(),
        });
        session.leadId = getInsertId(res);
        session.name = input.name;
        session.email = input.email;
        console.log(`📋 [Receptionist] Manual lead: ${input.name} <${input.email}>`);
        return { success: true };
      } catch (e: any) {
        console.error("❌ [Receptionist] saveLead error:", e.message);
        return { success: false };
      }
    }),

  getLeads: publicProcedure.query(async () => {
    return db.select().from(receptionistLeads).orderBy(desc(receptionistLeads.createdAt)).limit(200);
  }),
});
