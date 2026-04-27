/**
 * WhatsApp Web Manager — multi-tenant
 * Manages one WhatsApp Web client per tenant (user).
 * Session data stored in .wwebjs_auth/tenant_{id}/
 *
 * Features:
 *  - Auto-reconnect on unexpected disconnect (up to MAX_RECONNECT_ATTEMPTS)
 *  - Email alerts via alertService on disconnect / auth failure
 */

import { alertWhatsAppDisconnected, alertWhatsAppAuthFailure } from "../services/alertService.js";
import fs from "fs";
import path from "path";

export type WWJSStatus = "disconnected" | "qr_ready" | "connecting" | "connected";

export interface TenantWWJSState {
  status: WWJSStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  name: string | null;
  error: string | null;
  lastActivity: Date | null;
  messageCount24h: number;
  loadingPercent: number | null;
  loadingMessage: string | null;
}

// module-level maps
const tenantStates = new Map<number, TenantWWJSState>();
const tenantClients = new Map<number, any>();

// Auto-reconnect tracking
const reconnectAttempts = new Map<number, number>();
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 30_000; // 30 seconds

// Track which tenants were fully authenticated this session.
// If a client never authenticated (only showed QR), we should NOT
// auto-reconnect on disconnect — the user must scan manually.
const everAuthenticated = new Map<number, boolean>();

// Tenant name cache for alerts (populated from DB on first use)
const tenantNameCache = new Map<number, string>();

// ── Chat-ID cache ─────────────────────────────────────────────────────────────
// WhatsApp's newer @lid format means getChatById("number@c.us") fails for some
// users. We cache the real chatId (e.g. "150852404793537@lid") every time an
// inbound message arrives so we can use it for dashboard/manual outbound sends.
const chatIdCache = new Map<string, string>(); // key: "tenantId:phoneNumber"
const qrLoggedOnce = new Map<number, boolean>(); // suppress repeated QR-ready log spam

export function storeChatId(tenantId: number, phoneNumber: string, chatId: string): void {
  chatIdCache.set(`${tenantId}:${phoneNumber}`, chatId);
}

export function getCachedChatId(tenantId: number, phoneNumber: string): string | undefined {
  return chatIdCache.get(`${tenantId}:${phoneNumber}`);
}

async function getTenantName(tenantId: number): Promise<string> {
  if (tenantNameCache.has(tenantId)) return tenantNameCache.get(tenantId)!;
  try {
    const { db } = await import("../db.js");
    const { users } = await import("../../drizzle/schema.js");
    const { eq } = await import("drizzle-orm");
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, tenantId)).limit(1);
    const name = u?.name ?? `Tenant ${tenantId}`;
    tenantNameCache.set(tenantId, name);
    return name;
  } catch {
    return `Tenant ${tenantId}`;
  }
}

function scheduleReconnect(tenantId: number): void {
  const attempts = reconnectAttempts.get(tenantId) ?? 0;
  if (attempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log(`⚠️  Max reconnect attempts reached for tenant ${tenantId}. Giving up.`);
    reconnectAttempts.delete(tenantId);
    return;
  }
  reconnectAttempts.set(tenantId, attempts + 1);
  const delay = RECONNECT_DELAY_MS * (attempts + 1); // backoff: 30s, 60s, 90s
  console.log(`🔄 Scheduling reconnect for tenant ${tenantId} in ${delay / 1000}s (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
  setTimeout(async () => {
    // Only reconnect if still disconnected and no client running
    const current = getStateForTenant(tenantId);
    if (current.status !== "disconnected" && current.status !== "qr_ready") {
      reconnectAttempts.delete(tenantId);
      return;
    }
    if (tenantClients.has(tenantId)) return;
    console.log(`🔄 Auto-reconnecting tenant ${tenantId}...`);
    try {
      await initClientForTenant(tenantId);
    } catch (e: any) {
      console.error(`❌ Auto-reconnect failed for tenant ${tenantId}:`, e.message);
    }
  }, delay);
}

function defaultState(): TenantWWJSState {
  return { status: "disconnected", qrDataUrl: null, phoneNumber: null, name: null, error: null, lastActivity: null, messageCount24h: 0, loadingPercent: null, loadingMessage: null };
}

export function getStateForTenant(tenantId: number): TenantWWJSState {
  return tenantStates.get(tenantId) ?? defaultState();
}

export function getAllTenantStates(): { tenantId: number; state: TenantWWJSState }[] {
  return Array.from(tenantStates.entries()).map(([tenantId, state]) => ({ tenantId, state }));
}

export async function initClientForTenant(tenantId: number): Promise<void> {
  if (tenantClients.has(tenantId)) {
    console.log(`⚡ WWJS client already running for tenant ${tenantId}`);
    return;
  }

  // Remove stale Chromium SingletonLock files left over from a previous crash
  // or unclean shutdown — otherwise Puppeteer refuses to start.
  const authDataPath = path.join(process.cwd(), ".wwebjs_auth", `session-tenant_${tenantId}`);
  for (const lockFile of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    const lockPath = path.join(authDataPath, lockFile);
    if (fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); console.log(`🔓 Removed stale ${lockFile} for tenant ${tenantId}`); }
      catch { /* non-fatal */ }
    }
  }

  tenantStates.set(tenantId, { ...defaultState(), status: "connecting" });

  try {
    const wwjs = await import("whatsapp-web.js");
    const mod = (wwjs as any).default ?? wwjs;
    const Client = mod.Client ?? (wwjs as any).Client;
    const LocalAuth = mod.LocalAuth ?? (wwjs as any).LocalAuth;
    const QRCode = await import("qrcode");

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `tenant_${tenantId}`, dataPath: ".wwebjs_auth" }),
      puppeteer: {
        headless: true,
        // Use system Chrome if PUPPETEER_EXECUTABLE_PATH is set (avoids bundled Chromium download)
        ...(process.env.PUPPETEER_EXECUTABLE_PATH
          ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
          : {}),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--disable-gpu",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-sync",
          "--metrics-recording-only",
          "--mute-audio",
          "--no-default-browser-check",
          "--safebrowsing-disable-auto-update",
          "--disable-features=TranslateUI,VizDisplayCompositor",
        ],
      },
    });

    client.on("qr", async (qr: string) => {
      if (!qrLoggedOnce.get(tenantId)) {
        console.log(`📱 QR ready for tenant ${tenantId}`);
        qrLoggedOnce.set(tenantId, true);
      }
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        tenantStates.set(tenantId, { ...getStateForTenant(tenantId), status: "qr_ready", qrDataUrl, error: null });
      } catch {
        tenantStates.set(tenantId, { ...getStateForTenant(tenantId), status: "qr_ready", qrDataUrl: qr, error: null });
      }
    });

    client.on("authenticated", () => {
      console.log(`🔑 WWJS authenticated for tenant ${tenantId}`);
      qrLoggedOnce.delete(tenantId); // reset so next QR cycle logs once again
      everAuthenticated.set(tenantId, true);
      tenantStates.set(tenantId, { ...getStateForTenant(tenantId), status: "connecting", qrDataUrl: null, loadingPercent: 0, loadingMessage: "Authenticated…" });
    });

    client.on("loading_screen", (percent: number, message: string) => {
      console.log(`⏳ WWJS loading for tenant ${tenantId}: ${percent}% — ${message}`);
      tenantStates.set(tenantId, { ...getStateForTenant(tenantId), status: "connecting", loadingPercent: percent, loadingMessage: message });
    });

    client.on("ready", async () => {
      try {
        const info = client.info;
        console.log(`🟢 WWJS connected for tenant ${tenantId}: ${info?.pushname} (${info?.wid?.user})`);
        tenantStates.set(tenantId, {
          ...getStateForTenant(tenantId),
          status: "connected",
          qrDataUrl: null,
          phoneNumber: info?.wid?.user ?? null,
          name: info?.pushname ?? null,
          error: null,
          lastActivity: new Date(),
          loadingPercent: null,
          loadingMessage: null,
        });
        // Clear reconnect counter — successful connection
        reconnectAttempts.delete(tenantId);
      } catch {
        tenantStates.set(tenantId, { ...getStateForTenant(tenantId), status: "connected", qrDataUrl: null, loadingPercent: null, loadingMessage: null });
      }
    });

    client.on("disconnected", async (reason: string) => {
      console.log(`🔴 WWJS disconnected for tenant ${tenantId}:`, reason);
      tenantStates.set(tenantId, { ...defaultState(), error: reason });
      tenantClients.delete(tenantId);

      const isIntentional = reason === "LOGOUT" || reason === "NAVIGATION";
      // Only auto-reconnect if this tenant was truly authenticated at some point.
      // If the session was already expired (only QR was shown, never authenticated),
      // do NOT reconnect — that just causes an infinite QR loop. The user must scan.
      const wasAuthenticated = everAuthenticated.get(tenantId) === true;
      everAuthenticated.delete(tenantId);

      if (!isIntentional && wasAuthenticated) {
        // Genuine unexpected disconnect from a live session — alert and retry
        getTenantName(tenantId).then(name => alertWhatsAppDisconnected(name, tenantId, reason));
        scheduleReconnect(tenantId);
      } else {
        reconnectAttempts.delete(tenantId);
        if (!isIntentional && !wasAuthenticated) {
          console.log(`ℹ️  [Tenant ${tenantId}] Session expired without authentication — QR scan required to reconnect`);
        }
      }
    });

    client.on("auth_failure", async (msg: string) => {
      console.error(`❌ WWJS auth failure for tenant ${tenantId}:`, msg);
      tenantStates.set(tenantId, { ...defaultState(), error: `Auth failed: ${msg}` });
      tenantClients.delete(tenantId);
      reconnectAttempts.delete(tenantId); // don't auto-reconnect on auth failure — need QR rescan
      getTenantName(tenantId).then(name => alertWhatsAppAuthFailure(name, tenantId, msg));
    });

    // ── Incoming messages ──────────────────────────────────────────────────
    client.on("message", async (msg: any) => {
      try {
        if (msg.from.includes("@g.us") || msg.from === "status@broadcast") return;
        if (msg.fromMe) return;

        const chatId = msg.from;
        const phoneNumber = msg.from.replace(/@\S+$/, "");
        const contactName: string | null = msg._data?.notifyName ?? null;
        const messageId: string = msg.id?.id ?? msg.id?._serialized ?? "wwjs_" + Date.now();

        // Cache the real chatId so outbound sends (dashboard, scheduler, etc.)
        // can use it even when they only have the phone number.
        storeChatId(tenantId, phoneNumber, chatId);

        const tenantLabel = await getTenantName(tenantId);
        console.log(`📨 [${tenantLabel}] Message from ${phoneNumber}: "${(msg.body ?? "").slice(0, 60)}"`);

        // Update activity stats
        const prev = getStateForTenant(tenantId);
        tenantStates.set(tenantId, { ...prev, lastActivity: new Date(), messageCount24h: prev.messageCount24h + 1 });

        const { enqueueMessage } = await import("../services/messageQueue.js");

        if (msg.type === "ptt" || msg.type === "audio") {
          const { transcribeAudio } = await import("../services/voiceService.js");
          const { db } = await import("../db.js");
          const { botConfig } = await import("../../drizzle/schema.js");
          const { eq } = await import("drizzle-orm");
          const [config] = await db.select({ enableVoiceTranscription: botConfig.enableVoiceTranscription })
            .from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

          if (!config?.enableVoiceTranscription) {
            await sendViaWhatsAppWeb(tenantId, chatId, "I received your voice message but voice transcription is not enabled. Please send a text message. 🙏");
            return;
          }
          try {
            const media = await msg.downloadMedia();
            if (!media?.data) {
              await sendViaWhatsAppWeb(tenantId, chatId, "I couldn't process your voice message. Please try sending a text message.");
              return;
            }
            const audioBuffer = Buffer.from(media.data, "base64");
            const transcribed = await transcribeAudio(audioBuffer, media.mimetype ?? "audio/ogg");
            if (!transcribed) {
              await sendViaWhatsAppWeb(tenantId, chatId, "I received your voice message but couldn't transcribe it. Please send a text message instead. 🙏");
              return;
            }
            await enqueueMessage({ tenantId, phoneNumber, chatId, messageText: transcribed, contactName, messageId, isVoice: true });
          } catch (err) {
            console.error(`WWJS voice error for tenant ${tenantId}:`, err);
          }
          return;
        }

        if (msg.type === "image" || msg.type === "document") {
          try {
            const media = await msg.downloadMedia();
            if (!media?.data) {
              await sendViaWhatsAppWeb(tenantId, chatId, "I received your image but couldn't read it. Please try sending it again. 🙏");
              return;
            }

            // Use Groq vision model to extract text/verse from the image
            const OpenAI = (await import("openai")).default;
            const { db: dbInst } = await import("../db.js");
            const { botConfig: bc } = await import("../../drizzle/schema.js");
            const { eq: eqOp, desc: descOp } = await import("drizzle-orm");
            const [cfg] = await dbInst.select({ aiApiUrl: bc.aiApiUrl, aiApiKey: bc.aiApiKey })
              .from(bc).where(eqOp(bc.tenantId, tenantId)).orderBy(descOp(bc.updatedAt)).limit(1);

            const apiUrl = cfg?.aiApiUrl || process.env.AI_API_URL || "https://api.groq.com/openai/v1";
            const { decrypt: decryptKey } = await import("../services/encryptionService.js");
            const apiKey = decryptKey(cfg?.aiApiKey || "") || process.env.AI_API_KEY || "";

            const client = new OpenAI({ baseURL: apiUrl, apiKey });
            const mimeType = media.mimetype || "image/jpeg";
            const dataUrl = `data:${mimeType};base64,${media.data}`;

            const vision = await client.chat.completions.create({
              model: "meta-llama/llama-4-scout-17b-16e-instruct",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "image_url",
                      image_url: { url: dataUrl },
                    },
                    {
                      type: "text",
                      text: "Extract all text from this image exactly as it appears. If it contains a Bible verse or reference, include it in full. Return only the extracted text, nothing else.",
                    },
                  ],
                },
              ],
              max_tokens: 1000,
            });

            const extractedText = vision.choices[0]?.message?.content?.trim();
            if (!extractedText) {
              await sendViaWhatsAppWeb(tenantId, chatId, "I could see your image but couldn't read any text from it. Please try sending the verse as a text message. 🙏");
              return;
            }

            console.log(`🖼️  [${tenantId}] Image text extracted: "${extractedText.slice(0, 80)}"`);
            const messageText = msg.body?.trim()
              ? `${msg.body}\n\n[Image text: ${extractedText}]`
              : extractedText;

            await enqueueMessage({ tenantId, phoneNumber, chatId, messageText, contactName, messageId });
          } catch (err: any) {
            console.error(`WWJS image error for tenant ${tenantId}:`, err.message);
            await sendViaWhatsAppWeb(tenantId, chatId, "I had trouble reading your image. Please try sending the verse as a text message. 🙏");
          }
          return;
        }

        if (msg.type === "chat") {
          const messageText: string = msg.body ?? "";
          if (!messageText.trim()) return;
          await enqueueMessage({ tenantId, phoneNumber, chatId, messageText, contactName, messageId });
        }
      } catch (err) {
        console.error(`WWJS message handler error for tenant ${tenantId}:`, err);
      }
    });

    // ── Delivery/read receipts ────────────────────────────────────────────────
    // whatsapp-web.js fires message_ack when a sent message changes status:
    //   1=sent, 2=delivered, 3=read, 4=played (voice)
    client.on("message_ack", async (msg: any, ack: number) => {
      try {
        const msgId: string = msg.id?.id ?? msg.id?._serialized;
        const phone: string = (msg.to ?? "").replace(/@\S+$/, "");
        if (!msgId) return;
        const statusMap: Record<number, "sent" | "delivered" | "read"> = { 1: "sent", 2: "delivered", 3: "read", 4: "read" };
        const status = statusMap[ack];
        if (!status) return;
        const { db: dbInst } = await import("../db.js");
        const { messageStatus: msgStatusTable } = await import("../../drizzle/schema.js");
        await dbInst.insert(msgStatusTable).values({ messageId: msgId, phoneNumber: phone, status, updatedAt: new Date() })
          .onDuplicateKeyUpdate({ set: { status, updatedAt: new Date() } });
        // Emit via Socket.IO so Inbox updates in real-time
        const io = (globalThis as any).__io as import("socket.io").Server | undefined;
        if (io) io.emit(`messageStatus:${tenantId}`, { messageId: msgId, status });
      } catch { /* non-fatal */ }
    });

    tenantClients.set(tenantId, client);

    try {
      await client.initialize();
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      // "Execution context was destroyed" is a known Puppeteer race condition
      // that happens when WhatsApp Web navigates during script injection.
      // The client often recovers on its own — just log and let it continue.
      if (msg.includes("Execution context was destroyed") || msg.includes("Session closed")) {
        console.warn(`⚠️  [Tenant ${tenantId}] Puppeteer navigation race during init (will retry in 15s):`, msg);
        tenantClients.delete(tenantId);
        tenantStates.set(tenantId, { ...defaultState(), error: null });
        // Retry once after a short delay
        setTimeout(() => {
          const current = getStateForTenant(tenantId);
          if (current.status === "disconnected") {
            console.log(`🔄 [Tenant ${tenantId}] Retrying WWJS init after navigation error...`);
            initClientForTenant(tenantId).catch(e =>
              console.error(`❌ [Tenant ${tenantId}] Retry init failed:`, e.message)
            );
          }
        }, 15_000);
        return;
      }
      throw err; // re-throw unexpected errors
    }
  } catch (err: any) {
    console.error(`❌ WWJS init failed for tenant ${tenantId}:`, err.message);
    tenantStates.set(tenantId, { ...defaultState(), error: err.message });
    tenantClients.delete(tenantId);
  }
}

/** Send a "typing..." indicator to a chat — fire-and-forget, safe to ignore errors */
export async function sendTypingIndicator(tenantId: number, chatId: string): Promise<void> {
  const client = tenantClients.get(tenantId);
  if (!client) return;
  try {
    const chat = await client.getChatById(chatId.includes("@") ? chatId : chatId + "@c.us");
    await chat.sendSeen();
    await chat.sendStateTyping();
  } catch { /* non-fatal */ }
}

export async function destroyClientForTenant(tenantId: number): Promise<void> {
  const client = tenantClients.get(tenantId);
  if (!client) return;
  try {
    await client.destroy();
  } catch { /* ignore */ }
  tenantClients.delete(tenantId);
  tenantStates.set(tenantId, defaultState());
  everAuthenticated.delete(tenantId);
  reconnectAttempts.delete(tenantId);
  qrLoggedOnce.delete(tenantId);
  console.log(`🗑️ WWJS client destroyed for tenant ${tenantId}`);
}

export async function sendViaWhatsAppWeb(tenantId: number, to: string, message: string, audioBuffer?: Buffer): Promise<boolean> {
  const client = tenantClients.get(tenantId);
  const state = getStateForTenant(tenantId);
  if (!client || state.status !== "connected") return false;

  try {
    let resolvedChatId: string;
    if (to.includes("@")) {
      resolvedChatId = to;
    } else {
      const digits = to.replace(/\D/g, "");
      // 1. Prefer a cached @lid from a previous inbound message — most reliable
      const cached = getCachedChatId(tenantId, digits);
      if (cached) {
        resolvedChatId = cached;
      } else {
        resolvedChatId = digits + "@c.us";
        try {
          const numberId = await client.getNumberId(digits);
          if (numberId) resolvedChatId = numberId._serialized;
        } catch { /* fall back to @c.us */ }
      }
    }

    const sendLabel = await getTenantName(tenantId);
    console.log(`📤 [${sendLabel}] Sending to ${resolvedChatId}`);

    if (audioBuffer) {
      const wwjs2 = await import("whatsapp-web.js");
      const mod2 = (wwjs2 as any).default ?? wwjs2;
      const MessageMedia = mod2.MessageMedia ?? (wwjs2 as any).MessageMedia;
      const base64 = audioBuffer.toString("base64");
      const media = new MessageMedia("audio/mpeg", base64, "response.mp3");
      try {
        const chat = await client.getChatById(resolvedChatId);
        await chat.sendMessage(media, { sendAudioAsVoice: true });
      } catch {
        await client.sendMessage(resolvedChatId, media, { sendAudioAsVoice: true });
      }
      return true;
    }

    // Try getChatById first; fall back through client.sendMessage() then @lid suffix
    try {
      const chat = await client.getChatById(resolvedChatId);
      await chat.sendMessage(message);
    } catch (chatErr: any) {
      console.warn(`WWJS getChatById failed (${chatErr.message}) — retrying with client.sendMessage()`);
      try {
        await client.sendMessage(resolvedChatId, message);
      } catch (sendErr: any) {
        // WhatsApp now uses @lid for many accounts — if @c.us fails with "No LID"
        // swap the suffix and try one more time.
        if (sendErr.message?.includes("No LID") && resolvedChatId.endsWith("@c.us")) {
          const lidId = resolvedChatId.replace("@c.us", "@lid");
          console.warn(`WWJS @c.us rejected (No LID) — retrying as ${lidId}`);
          await client.sendMessage(lidId, message);
          // Cache this @lid so future sends skip the retry entirely
          storeChatId(tenantId, resolvedChatId.replace("@c.us", ""), lidId);
        } else {
          throw sendErr;
        }
      }
    }
    return true;
  } catch (err) {
    console.error(`WWJS send failed for tenant ${tenantId}:`, err);
    return false;
  }
}

/** Send an image buffer as a WhatsApp image message with an optional caption */
export async function sendImageViaWhatsAppWeb(
  tenantId: number,
  to: string,
  imageBuffer: Buffer,
  caption?: string,
): Promise<boolean> {
  const client = tenantClients.get(tenantId);
  const state = getStateForTenant(tenantId);
  if (!client || state.status !== "connected") return false;

  try {
    let resolvedChatId: string;
    if (to.includes("@")) {
      resolvedChatId = to;
    } else {
      const digits = to.replace(/\D/g, "");
      const cached = getCachedChatId(tenantId, digits);
      if (cached) {
        resolvedChatId = cached;
      } else {
        resolvedChatId = digits + "@c.us";
        try {
          const numberId = await client.getNumberId(digits);
          if (numberId) resolvedChatId = numberId._serialized;
        } catch { /* fall back to @c.us */ }
      }
    }

    const wwjs = await import("whatsapp-web.js");
    const mod = (wwjs as any).default ?? wwjs;
    const MessageMedia = mod.MessageMedia ?? (wwjs as any).MessageMedia;
    const base64 = imageBuffer.toString("base64");
    const media = new MessageMedia("image/jpeg", base64, "verse-image.jpg");

    // Try via getChatById first; if it fails (e.g. @lid format not found),
    // fall back to client.sendMessage() which accepts the chat ID directly.
    try {
      const chat = await client.getChatById(resolvedChatId);
      await chat.sendMessage(media, { caption: caption ?? "" });
    } catch (chatErr: any) {
      console.warn(`WWJS getChatById failed (${chatErr.message}) — retrying with client.sendMessage()`);
      try {
        await client.sendMessage(resolvedChatId, media, { caption: caption ?? "" });
      } catch (sendErr: any) {
        if (sendErr.message?.includes("No LID") && resolvedChatId.endsWith("@c.us")) {
          const lidId = resolvedChatId.replace("@c.us", "@lid");
          console.warn(`WWJS @c.us rejected (No LID) — retrying image as ${lidId}`);
          await client.sendMessage(lidId, media, { caption: caption ?? "" });
          storeChatId(tenantId, resolvedChatId.replace("@c.us", ""), lidId);
        } else {
          throw sendErr;
        }
      }
    }
    return true;
  } catch (err) {
    console.error(`WWJS image send failed for tenant ${tenantId}:`, err);
    return false;
  }
}
