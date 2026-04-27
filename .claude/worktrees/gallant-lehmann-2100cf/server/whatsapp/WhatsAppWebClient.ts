/**
 * WhatsApp Web Client (whatsapp-web.js)
 * Provides QR-code based connection — no Meta developer account needed.
 * Session is persisted in .wwebjs_auth so re-scanning is not needed after restart.
 */

export type WWJSStatus = "disconnected" | "qr_ready" | "connecting" | "connected";

interface WWJSState {
  status: WWJSStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  name: string | null;
  error: string | null;
}

let state: WWJSState = {
  status: "disconnected",
  qrDataUrl: null,
  phoneNumber: null,
  name: null,
  error: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let clientInstance: any = null;

export function getWWJSState(): WWJSState {
  return { ...state };
}

export async function initWhatsAppWebClient(tenantId = 0): Promise<void> {
  if (clientInstance) {
    console.log("⚡ WhatsApp Web client already initialised");
    return;
  }

  state = { status: "connecting", qrDataUrl: null, phoneNumber: null, name: null, error: null };

  try {
    // Dynamic import so the server still starts even before pnpm install is run
    // whatsapp-web.js is CJS — named exports may be on .default when imported as ESM
    const wwjs = await import("whatsapp-web.js");
    const mod = (wwjs as any).default ?? wwjs;
    const Client = mod.Client ?? (wwjs as any).Client;
    const LocalAuth = mod.LocalAuth ?? (wwjs as any).LocalAuth;
    const QRCode = await import("qrcode");

    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
        ],
      },
    });

    clientInstance = client;

    client.on("qr", async (qr: string) => {
      state.status = "qr_ready";
      state.error = null;
      try {
        state.qrDataUrl = await QRCode.default.toDataURL(qr, { width: 280, margin: 2 });
      } catch {
        state.qrDataUrl = null;
      }
      console.log("📱 QR code ready — open the app to scan");
    });

    client.on("authenticated", () => {
      state.status = "connecting";
      state.qrDataUrl = null;
      console.log("🔑 WhatsApp Web authenticated");
    });

    client.on("ready", () => {
      const info = (client as any).info;
      state.status = "connected";
      state.qrDataUrl = null;
      state.phoneNumber = info?.wid?.user ?? null;
      state.name = info?.pushname ?? null;
      state.error = null;
      console.log(`🟢 WhatsApp Web connected as ${state.name} (+${state.phoneNumber})`);
    });

    // ── Incoming messages ───────────────────────────────────────────────────
    client.on("message", async (msg: any) => {
      try {
        console.log(`📨 WWJS message received — from: ${msg.from}, type: ${msg.type}, fromMe: ${msg.fromMe}`);

        // Skip messages from groups and status broadcasts
        if (msg.from.includes("@g.us") || msg.from === "status@broadcast") {
          console.log("⏭️  Skipping group/status message");
          return;
        }
        // Skip our own outgoing messages
        if (msg.fromMe) {
          console.log("⏭️  Skipping own message");
          return;
        }

        // Preserve the full chat ID (may be @c.us or @lid for LID-based contacts)
        const chatId = msg.from; // e.g. "60123456789@c.us" or "150852404793537@lid"
        // Clean number for DB storage — strip @c.us, @lid, etc.
        const phoneNumber = msg.from.replace(/@\S+$/, "");
        const contactName: string | null = msg._data?.notifyName || null;
        const messageId: string = msg.id?.id || msg.id?._serialized || "wwjs_" + Date.now();

        console.log(`✅ Processing message from ${phoneNumber} (chatId: ${chatId}): "${msg.body?.slice(0, 60)}"`);

        // ── Voice / audio message ──────────────────────────────────────────
        if (msg.type === "ptt" || msg.type === "audio") {
          console.log(`🎤 Voice message from ${phoneNumber}`);
          // Use dynamic import to avoid circular dep at module load
          const { transcribeAudio } = await import("../services/voiceService.js");
          const { db } = await import("../db.js");
          const { botConfig } = await import("../../drizzle/schema.js");
          const [config] = await db.select({ enableVoiceTranscription: botConfig.enableVoiceTranscription }).from(botConfig).limit(1);

          if (!config?.enableVoiceTranscription) {
            // Politely inform they need to send text
            await sendViaWhatsAppWeb(chatId, "I received your voice message but voice transcription is not enabled. Please send a text message. 🙏");
            return;
          }

          try {
            const media = await msg.downloadMedia();
            if (!media?.data) {
              await sendViaWhatsAppWeb(chatId, "I couldn't process your voice message. Please try sending a text message.");
              return;
            }
            const audioBuffer = Buffer.from(media.data, "base64");
            const transcribed = await transcribeAudio(audioBuffer, media.mimetype || "audio/ogg");

            if (!transcribed) {
              await sendViaWhatsAppWeb(chatId, "I received your voice message but couldn't transcribe it. Please send a text message instead. 🙏");
              return;
            }

            console.log(`📝 Transcribed: "${transcribed}"`);
            const { processWhatsAppWebhook } = await import("./messagePipeline.js");
            await processWhatsAppWebhook({ tenantId, phoneNumber, chatId, messageText: transcribed, contactName, messageId, isVoice: true });
          } catch (err) {
            console.error("WWJS voice handling error:", err);
          }
          return;
        }

        // ── Text message ───────────────────────────────────────────────────
        if (msg.type === "chat") {
          const messageText: string = msg.body || "";
          if (!messageText.trim()) return;
          const { processWhatsAppWebhook } = await import("./messagePipeline.js");
          await processWhatsAppWebhook({ tenantId, phoneNumber, chatId, messageText, contactName, messageId });
        }
      } catch (err) {
        console.error("WWJS message handler error:", err);
      }
    });

    client.on("disconnected", (reason: string) => {
      console.log("🔴 WhatsApp Web disconnected:", reason);
      state = { status: "disconnected", qrDataUrl: null, phoneNumber: null, name: null, error: reason };
      clientInstance = null;
    });

    client.on("auth_failure", (msg: string) => {
      console.error("❌ WhatsApp auth failure:", msg);
      state = { status: "disconnected", qrDataUrl: null, phoneNumber: null, name: null, error: `Auth failed: ${msg}` };
      clientInstance = null;
    });

    await client.initialize();
  } catch (err: any) {
    const msg = err?.message || "Unknown error";
    console.error("❌ WhatsApp Web init failed:", msg);
    state = { status: "disconnected", qrDataUrl: null, phoneNumber: null, name: null, error: msg };
    clientInstance = null;
  }
}

export async function destroyWhatsAppWebClient(): Promise<void> {
  if (clientInstance) {
    try {
      await clientInstance.destroy();
    } catch { /* ignore */ }
    clientInstance = null;
  }
  state = { status: "disconnected", qrDataUrl: null, phoneNumber: null, name: null, error: null };
  console.log("🔴 WhatsApp Web client stopped");
}

export async function sendViaWhatsAppWeb(to: string, message: string, audioBuffer?: Buffer): Promise<boolean> {
  if (!clientInstance || state.status !== "connected") return false;
  try {
    // If 'to' already looks like a full WhatsApp chat ID (contains @), use it directly.
    // This handles @lid, @c.us, @g.us etc. without modification.
    let resolvedChatId: string;
    if (to.includes("@")) {
      resolvedChatId = to;
    } else {
      // Plain phone number — strip non-digits, resolve via getNumberId
      const digits = to.replace(/\D/g, "");
      resolvedChatId = digits + "@c.us";
      try {
        const numberId = await clientInstance.getNumberId(digits);
        if (numberId) resolvedChatId = numberId._serialized;
      } catch {
        // getNumberId may throw on some versions — fall back to plain @c.us
      }
    }

    console.log(`📤 Sending to chatId: ${resolvedChatId}`);

    // Use getChatById + chat.sendMessage — handles both @c.us and @lid reliably
    const chat = await clientInstance.getChatById(resolvedChatId);

    // If audio buffer provided, send as voice note
    if (audioBuffer) {
      const wwjs2 = await import("whatsapp-web.js");
      const mod2 = (wwjs2 as any).default ?? wwjs2;
      const MessageMedia = mod2.MessageMedia ?? (wwjs2 as any).MessageMedia;
      const base64 = audioBuffer.toString("base64");
      const media = new MessageMedia("audio/mpeg", base64, "response.mp3");
      await chat.sendMessage(media, { sendAudioAsVoice: true });
      return true;
    }

    await chat.sendMessage(message);
    return true;
  } catch (err) {
    console.error("WWJS send failed:", err);
    return false;
  }
}
