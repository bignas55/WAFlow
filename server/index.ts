import { getInsertId } from "./utils.js";
import "dotenv/config";
import { validateConfig } from "./config.js";

// ── Validate configuration at startup (fail fast if env vars missing) ─────────
validateConfig();

// ── Initialize error monitoring (Sentry) ─────────────────────────────────────
import { initSentry, Sentry, isSentryEnabled } from "./services/sentryService.js";
initSentry();

import crypto from "crypto";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { startHealthScheduler } from "./services/healthScheduler.js";
import { startHeartbeat } from "./services/heartbeatService.js";
import { startAppointmentReminderScheduler } from "./services/appointmentReminder.js";
import { startBroadcastScheduler } from "./services/broadcastScheduler.js";
import { startAbandonedBookingScheduler } from "./services/abandonedBookingService.js";
import { startDailyVerseScheduler } from "./services/dailyVerseScheduler.js";
import { startFollowUpScheduler } from "./services/followUpScheduler.js";
import { startFeaturesScheduler } from "./services/featuresScheduler.js";
import { startTrialScheduler } from "./services/trialService.js";
import { confirmPayment, verifyWebhookSignature } from "./services/easypayService.js";
import { authLimiter, apiLimiter, webhookLimiter, receptionistLimiter, adminLimiter } from "./middleware/rateLimiter.js";
import { securityHeaders, validateRequestHeaders, preventParameterPollution } from "./middleware/security.js";
import { handleHealthCheck, startHealthCheckScheduler } from "./services/healthCheck.js";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers.js";
import { createContext } from "./trpc.js";
import { enqueueMessage } from "./services/messageQueue.js";
import { startMessageWorker, stopMessageWorker } from "./workers/messageWorker.js";
import { parseDocument } from "./services/documentParser.js";
import { db } from "./db.js";
import { knowledgeBase } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { verifyToken, extractTokenFromRequest } from "./auth.js";
import { runAutoMigrations } from "./services/autoMigrate.js";

// ── Global error safety net ───────────────────────────────────────────────────
// Prevent unhandled Promise rejections (e.g. from Puppeteer/WWJS navigation
// race conditions) from crashing the entire server process.
// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 ${signal} received — shutting down gracefully...`);
  await stopMessageWorker();
  process.exit(0);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason: any) => {
  const msg = reason?.message ?? String(reason);
  // Log but don't crash — WWJS handles its own reconnect logic
  console.warn("⚠️  Unhandled promise rejection (caught by safety net):", msg);
});

process.on("uncaughtException", (err: Error) => {
  const msg = err?.message ?? String(err);
  // Execution context destroyed is a known WWJS/Puppeteer race — safe to ignore
  if (msg.includes("Execution context was destroyed") || msg.includes("Session closed")) {
    console.warn("⚠️  Known Puppeteer error (ignoring):", msg);
    return;
  }
  // For genuine unknown errors, log and exit so pm2/nodemon can restart cleanly
  console.error("💥 Uncaught exception:", err);
  process.exit(1);
});

const app = express();
const httpServer = createServer(app);

// ── Sentry Request Tracing ───────────────────────────────────────────────────
if (isSentryEnabled()) {
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

const uploadTypeMap = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "txt",
  ".md": "txt",
  ".csv": "txt",
} as const;

function getKnowledgeBaseType(filename: string): "pdf" | "docx" | "txt" {
  const ext = path.extname(filename).toLowerCase() as keyof typeof uploadTypeMap;
  return uploadTypeMap[ext] ?? "txt";
}

// Socket.IO
const allowedOrigins = process.env.NODE_ENV === "production"
  ? [process.env.VITE_API_URL, process.env.APP_URL].filter(Boolean) as string[]
  : [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://cyclist-majorette-ripeness.ngrok-free.dev",
      /^https:\/\/.*\.ngrok(-free)?\.dev$/,  // Allow any ngrok domain
    ];

export const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  // Reconnection settings for stability
  pingInterval: 25000,
  pingTimeout: 60000,
  transports: ["websocket", "polling"],
  allowUpgrades: true,
  // Connection pooling and buffering
  maxHttpBufferSize: 1e6,
  // Enable automatic reconnection on client
});

io.on("connection", (socket) => {
  console.log(`✅ Socket connected [${socket.id}]`);

  // Error handler to catch socket errors without crashing
  socket.on("error", (err: Error) => {
    console.error(`❌ Socket error [${socket.id}]:`, err.message);
  });

  socket.on("join:dashboard", () => {
    socket.join("dashboard");
    console.log(`📊 Socket ${socket.id} joined dashboard room`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`🔌 Socket disconnected [${socket.id}]: ${reason}`);
  });

  // Handle unexpected client disconnects gracefully
  socket.on("connect_error", (error) => {
    console.warn(`⚠️  Socket connection error [${socket.id}]:`, error.message);
  });
});

// Global error handler for Socket.IO to prevent server crashes
io.on("error", (err: Error) => {
  console.error("❌ Socket.IO error:", err.message);
});

// Monitor socket.io health
setInterval(() => {
  const clientCount = io.engine.clientsCount ?? 0;
  if (clientCount > 0) {
    console.log(`📡 Socket.IO: ${clientCount} active connection${clientCount !== 1 ? 's' : ''}`);
  }
}, 60000); // every minute

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,      // handled by client separately
  crossOriginEmbedderPolicy: false,  // needed for Socket.IO
  hsts: {
    maxAge: 31536000,                // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  noSniff: true,                     // X-Content-Type-Options: nosniff
  frameguard: { action: "deny" },    // X-Frame-Options: DENY
  xssFilter: true,                   // X-XSS-Protection: 1; mode=block
}));

// Remove server fingerprinting headers
app.disable("x-powered-by");

// ── Security Middleware (prompt injection detection, header validation, etc.) ──
app.use(securityHeaders);
app.use(validateRequestHeaders);
app.use(preventParameterPollution);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
// Capture raw body for HMAC-SHA256 signature verification on webhook requests
app.use(express.json({
  limit: "50mb",
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;  // used by webhook signature checker
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── File upload (Knowledge Base documents) ────────────────────────────────
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter(_req, file, cb) {
    const allowed = [".pdf", ".docx", ".txt", ".md", ".csv"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type ${ext}. Allowed: ${allowed.join(", ")}`));
    }
  },
});

app.post("/api/knowledge-base/upload", upload.single("file"), async (req, res) => {
  // Auth check — extract tenantId from JWT
  const token = extractTokenFromRequest(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const tenantId = payload.userId;

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const { category = "general", tags = "[]" } = req.body as { category?: string; tags?: string };

  // Parse tags JSON with error handling
  let parsedTags: any[] = [];
  try {
    parsedTags = JSON.parse(tags);
    if (!Array.isArray(parsedTags)) {
      parsedTags = [];
    }
  } catch (err) {
    res.status(400).json({ error: "Invalid tags JSON format" });
    return;
  }

  // Insert placeholder — scoped to tenant
  const [result] = await db.insert(knowledgeBase).values({
    tenantId,
    title: path.basename(req.file.originalname, path.extname(req.file.originalname)),
    content: "Processing...",
    type: getKnowledgeBaseType(req.file.originalname),
    status: "processing",
    fileName: req.file.originalname,
    fileSize: req.file.size,
    category,
    tags: parsedTags,
    isActive: false,
  });
  const id = getInsertId(result) as number;

  // Parse document in background
  parseDocument(req.file.path, req.file.originalname)
    .then(async ({ title, content }) => {
      try {
        await db.update(knowledgeBase).set({
          title,
          content,
          status: "ready",
          isActive: true,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(knowledgeBase.id, id));
        console.log(`✅ KB document parsed: ${title} (${content.length} chars)`);
      } catch (dbErr) {
        console.error(`❌ KB database update failed [${req.file!.originalname}]:`, dbErr);
        // Attempt to mark as error in DB
        try {
          await db.update(knowledgeBase).set({
            status: "error",
            processingError: `Database update failed: ${(dbErr as Error).message}`,
            updatedAt: new Date(),
          }).where(eq(knowledgeBase.id, id));
        } catch (fallbackErr) {
          console.error(`❌ KB error state update also failed:`, fallbackErr);
        }
      }
    })
    .catch(async (err: Error) => {
      console.error(`❌ KB parse failed [${req.file!.originalname}]:`, err.message);
      try {
        await db.update(knowledgeBase).set({
          status: "error",
          processingError: err.message,
          content: "Failed to parse document.",
          updatedAt: new Date(),
        }).where(eq(knowledgeBase.id, id));
      } catch (dbErr) {
        console.error(`❌ KB error state update failed:`, dbErr);
      }
    })
    .finally(() => {
      // Clean up temp file with proper error handling
      fs.unlink(req.file!.path, (err) => {
        if (err) {
          console.warn(`⚠️ Failed to delete temp file [${req.file!.path}]:`, err.message);
        } else {
          console.log(`✅ Temp file cleaned up: ${req.file!.path}`);
        }
      });
    });

  res.json({ success: true, id, message: "Document uploaded and queued for processing." });
});

// ── Admin KB file upload (any tenant) ─────────────────────────────────────
app.post("/api/admin/knowledge-base/upload", upload.single("file"), async (req, res) => {
  const token = extractTokenFromRequest(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload || (payload as any).role !== "admin") {
    res.status(401).json({ error: "Admin access required" });
    return;
  }

  const tenantId = parseInt(req.body.tenantId);
  if (!tenantId || isNaN(tenantId)) {
    res.status(400).json({ error: "tenantId required" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const category = req.body.category || "general";

  const [result] = await db.insert(knowledgeBase).values({
    tenantId,
    title: path.basename(req.file.originalname, path.extname(req.file.originalname)),
    content: "Processing...",
    type: getKnowledgeBaseType(req.file.originalname),
    status: "processing",
    fileName: req.file.originalname,
    fileSize: req.file.size,
    category,
    tags: [],
    isActive: false,
  });
  const id = getInsertId(result) as number;

  parseDocument(req.file.path, req.file.originalname)
    .then(async ({ title, content }) => {
      try {
        await db.update(knowledgeBase).set({
          title,
          content,
          status: "ready",
          isActive: true,
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(knowledgeBase.id, id));
        console.log(`✅ Admin KB doc parsed for tenant ${tenantId}: ${title}`);
      } catch (dbErr) {
        console.error(`❌ Admin KB database update failed [tenant ${tenantId}]:`, dbErr);
        try {
          await db.update(knowledgeBase).set({
            status: "error",
            processingError: `Database update failed: ${(dbErr as Error).message}`,
            updatedAt: new Date(),
          }).where(eq(knowledgeBase.id, id));
        } catch (fallbackErr) {
          console.error(`❌ Admin KB error state update also failed:`, fallbackErr);
        }
      }
    })
    .catch(async (err: Error) => {
      console.error(`❌ Admin KB parse failed [tenant ${tenantId}]:`, err.message);
      try {
        await db.update(knowledgeBase).set({
          status: "error",
          processingError: err.message,
          content: "Failed to parse document.",
          updatedAt: new Date(),
        }).where(eq(knowledgeBase.id, id));
      } catch (dbErr) {
        console.error(`❌ Admin KB error state update failed:`, dbErr);
      }
    })
    .finally(() => {
      fs.unlink(req.file!.path, (err) => {
        if (err) {
          console.warn(`⚠️ Failed to delete temp file [${req.file!.path}]:`, err.message);
        } else {
          console.log(`✅ Temp file cleaned up: ${req.file!.path}`);
        }
      });
    });

  res.json({ success: true, id, message: "Document uploaded and processing." });
});

// ── Rate limiting ──────────────────────────────────────────────────────────
// tRPC uses dot-notation paths (e.g. /api/trpc/auth.login), so we cannot use
// app.use("/api/trpc/auth", ...) — Express only matches slash-separated segments.
// A regex correctly catches /api/trpc/auth.* (login, logout, register, etc.)
app.use(/^\/api\/trpc\/auth/, authLimiter);                    // strict: login, register, 2FA
app.use(/^\/api\/trpc\/admin/, adminLimiter);                  // admin endpoints: 100 req/min
app.use(/^\/api\/trpc\/liveReceptionist/, receptionistLimiter); // public AI chat widget
app.use("/api/trpc", apiLimiter);                              // general API
app.use("/api/webhooks/whatsapp", webhookLimiter);             // Meta webhook

// ── Health check endpoint (monitors memory, DB, API metrics) ──────────────────
app.get("/health", async (_req, res) => {
  try {
    await handleHealthCheck(_req, res);
  } catch (err) {
    console.error("Health check error:", err);
    res.status(503).json({
      status: "unhealthy",
      message: "Health check failed",
      timestamp: new Date().toISOString()
    });
  }
});

// Start periodic health check scheduler (every 60 seconds)
startHealthCheckScheduler(60000);

// ── tRPC ───────────────────────────────────────────────────────────────────
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error }) {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        console.error("tRPC error:", error);
      }
    },
  })
);

// WhatsApp Webhook
app.get("/api/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.WHATSAPP_WEBHOOK_TOKEN || "";

  if (mode === "subscribe" && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ── Easypay payment webhook ───────────────────────────────────────────────────
app.post("/api/webhooks/easypay", express.raw({ type: "*/*" }), async (req, res) => {
  const rawBody  = req.body?.toString("utf8") ?? "";
  const sig      = req.headers["x-easypay-signature"] as string ?? "";

  if (!verifyWebhookSignature(rawBody, sig)) {
    console.warn("⚠️  Easypay webhook: invalid signature");
    res.sendStatus(403);
    return;
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { res.sendStatus(400); return; }

  const { payment_ref, easypay_ref, amount, status } = payload;
  if (status !== "paid" && status !== "success") {
    res.sendStatus(200); // acknowledge but don't process non-paid events
    return;
  }

  const result = await confirmPayment({
    paymentRef: payment_ref,
    easypayRef: easypay_ref ?? payment_ref,
    amountPaid: Number(amount) / 100,
  });

  if (result.success) {
    console.log(`✅ [Easypay webhook] Tenant ${result.tenantId} upgraded to ${result.plan}`);
    res.status(200).json({ received: true });
  } else {
    res.status(422).json({ error: "Payment reference not found" });
  }
});

// ── Meta webhook deduplication cache (in-memory, 5-minute TTL) ──────────────
// Prevents Meta retries from being processed multiple times
const webhookDedupeCache = new Map<string, boolean>();
function cleanupDedupeCache() {
  setInterval(() => {
    // In production, you might use Redis instead for distributed deduplication
    if (webhookDedupeCache.size > 10000) {
      // Keep cache size bounded — oldest entries will be garbage collected naturally by TTL
      const keysToDelete = Array.from(webhookDedupeCache.keys()).slice(0, 1000);
      keysToDelete.forEach(k => webhookDedupeCache.delete(k));
      console.log(`🧹 Webhook dedup cache trimmed (was ${webhookDedupeCache.size} entries)`);
    }
  }, 5 * 60 * 1000); // every 5 minutes
}
cleanupDedupeCache();

app.post("/api/webhooks/whatsapp", async (req, res) => {
  // ── Meta webhook signature verification ────────────────────────────────────
  // Meta signs every webhook POST with HMAC-SHA256 using the App Secret.
  // Reject anything that doesn't have a valid signature — this stops spoofed
  // webhook events from reaching our message pipeline.
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const sigHeader = req.headers["x-hub-signature-256"] as string | undefined;

  if (appSecret) {
    if (!sigHeader || !sigHeader.startsWith("sha256=")) {
      console.warn("⚠️  Webhook rejected: missing X-Hub-Signature-256 header");
      res.sendStatus(403);
      return;
    }
    const rawBody: Buffer = (req as any).rawBody;
    if (!rawBody) {
      console.warn("⚠️  Webhook rejected: raw body unavailable for HMAC check");
      res.sendStatus(400);
      return;
    }
    const expected = "sha256=" + crypto
      .createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex");

    // Timing-safe comparison prevents timing-oracle attacks
    const sigBuf      = Buffer.from(sigHeader);
    const expectedBuf = Buffer.from(expected);
    const signaturesMatch =
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf);

    if (!signaturesMatch) {
      console.warn(`⚠️  Webhook rejected: invalid signature (got ${sigHeader.slice(0, 20)}…)`);
      res.sendStatus(403);
      return;
    }
  } else if (process.env.NODE_ENV === "production") {
    // In production, reject webhooks if the app secret is not configured
    console.error("❌  WHATSAPP_APP_SECRET not set — webhook rejected in production");
    res.sendStatus(403);
    return;
  }
  // ── End signature check ────────────────────────────────────────────────────

  res.sendStatus(200); // Respond immediately to Meta

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const { db: dbInst } = await import("./db.js");
    const { botConfig: bc } = await import("../drizzle/schema.js");
    const { eq: eqOp } = await import("drizzle-orm");

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value?.messages) continue;

        // Resolve tenant from the phone number ID in the webhook metadata
        const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
        let tenantId: number | null = null;

        if (phoneNumberId) {
          const [cfgRow] = await dbInst.select({ tenantId: bc.tenantId })
            .from(bc)
            .where(eqOp(bc.whatsappPhoneNumberId, phoneNumberId))
            .limit(1);
          tenantId = cfgRow?.tenantId ?? null;
        }

        if (!tenantId) {
          console.warn(`⚠️  Meta webhook: no tenant found for phone_number_id=${phoneNumberId} — skipping`);
          continue;
        }

        for (const message of value.messages) {
          const contact = value.contacts?.find((c: any) => c.wa_id === message.from);
          const contactName = contact?.profile?.name || null;

          // ── Deduplication: check if we've already processed this messageId ────
          const dedupeKey = `${tenantId}:${message.id}`;
          if (webhookDedupeCache.has(dedupeKey)) {
            console.log(`↙️  Meta webhook dedup: skipped message ${message.id} (already processed)`);
            continue;
          }
          // Mark as processed and set 5-minute TTL
          webhookDedupeCache.set(dedupeKey, true);
          setTimeout(() => webhookDedupeCache.delete(dedupeKey), 5 * 60 * 1000);

          // ── Text message ────────────────────────────────────────────────
          if (message.type === "text") {
            await enqueueMessage({
              tenantId,
              phoneNumber: message.from,
              chatId: message.from,
              messageText: message.text.body,
              contactName,
              messageId: message.id,
            });
            continue;
          }

          // ── Voice / audio message ───────────────────────────────────────
          if (message.type === "audio" || message.type === "voice") {
            const mediaId: string = message.audio?.id || message.voice?.id;
            if (!mediaId) continue;

            // Fetch config for this specific tenant
            const [cfg] = await dbInst.select({
              enableVoiceTranscription: bc.enableVoiceTranscription,
              whatsappAccessToken: bc.whatsappAccessToken,
            }).from(bc).where(eqOp(bc.tenantId, tenantId)).limit(1);

            if (!cfg?.enableVoiceTranscription) {
              await enqueueMessage({
                tenantId,
                phoneNumber: message.from,
                chatId: message.from,
                messageText: "I received your voice message but voice transcription is not enabled. Please send a text message. 🙏",
                contactName,
                messageId: message.id,
              });
              continue;
            }

            // Download and transcribe
            const { downloadMetaAudio, transcribeAudio } = await import("./services/voiceService.js");
            const audio = await downloadMetaAudio(mediaId, cfg.whatsappAccessToken);
            if (!audio) continue;

            const transcribed = await transcribeAudio(audio.buffer, audio.mimeType);
            if (!transcribed) {
              await enqueueMessage({
                tenantId,
                phoneNumber: message.from,
                chatId: message.from,
                messageText: "I received your voice message but could not transcribe it. Please send a text message. 🙏",
                contactName,
                messageId: message.id,
              });
              continue;
            }

            console.log(`📝 [Tenant ${tenantId}] Meta voice transcribed: "${transcribed}"`);
            await enqueueMessage({
              tenantId,
              phoneNumber: message.from,
              chatId: message.from,
              messageText: transcribed,
              contactName,
              messageId: message.id,
              isVoice: true,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
  }
});

// ── Google Calendar OAuth callback ────────────────────────────────────────
app.get("/api/auth/google/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) return res.redirect("/?error=google_auth_failed");
  try {
    const { GoogleCalendarService } = await import("./services/calendarService.js");
    const svc = new GoogleCalendarService();
    await svc.handleCallback(code);
    res.redirect("/?google_calendar=connected");
  } catch (e: any) {
    console.error("Google OAuth callback error:", e.message);
    res.redirect("/?error=google_auth_failed");
  }
});

// Health check
app.get("/api/health", (_, res) => res.json({ status: "ok", timestamp: new Date() }));

// Serve static files in production
// IMPORTANT: both paths must be absolute — Express requires absolute paths for
// res.sendFile() and resolves express.static() from process.cwd() which varies
// between environments. Using path.resolve() makes it explicit and reliable.
if (process.env.NODE_ENV === "production") {
  const clientDist = path.resolve(process.cwd(), "dist/client");
  app.use(express.static(clientDist));
  app.get("*", (_, res) => {
    const indexHtml = path.join(clientDist, "index.html");
    res.sendFile(indexHtml, (err) => {
      if (err) {
        console.error("❌ Could not serve index.html:", err.message);
        res.status(500).json({ error: "Frontend not built. Run pnpm build:client." });
      }
    });
  });
}

const PORT = parseInt(process.env.PORT || "3000");

// Validate database connection and run migrations before accepting traffic
async function startServer() {
  try {
    // Test database connectivity
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    console.log("✅ Database connection verified");
  } catch (err: any) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1);
  }

  // Run schema migrations
  try {
    await runAutoMigrations();
  } catch (err) {
    console.error("⚠️  Auto-migration error (server will still start):", (err as any).message);
  }

  // ── Sentry Error Handler ──────────────────────────────────────────────────
  // Must be registered after all other middleware
  if (isSentryEnabled()) {
    app.use(Sentry.Handlers.errorHandler());
  }

  // Start the server
  httpServer.listen(PORT, () => {
    console.log(`🚀 WAFlow server running on http://localhost:${PORT}`);
    console.log(`🤖 AI: ${process.env.AI_API_URL || "http://localhost:11434/v1"} / ${process.env.AI_MODEL || "gemma4:latest"}`);
    // Start message queue worker (BullMQ + Redis)
    startMessageWorker();
    // Start background services
    startHealthScheduler();
    startHeartbeat(); // only activates when LICENSE_KEY + CLOUD_ADMIN_URL are set (self-hosted mode)
    startAppointmentReminderScheduler(); // sends WhatsApp reminders 24h and 1h before appointments
    startBroadcastScheduler();           // fires scheduled broadcast campaigns at their scheduled time
    startAbandonedBookingScheduler();    // follows up with customers who started but didn't complete a booking
    startTrialScheduler();               // checks trial expiry daily, sends Day 10/13/14 reminder emails
    // NOTE: proactive outbound schedulers are disabled — bot only responds to incoming messages
    // startDailyVerseScheduler();
    // startFollowUpScheduler();
    // startFeaturesScheduler(
    //   process.env.AI_API_URL || "http://localhost:11434/v1",
    //   process.env.AI_API_KEY || "ollama",
    //   process.env.AI_MODEL  || "gemma4:latest",
    // );
    // Auto-reconnect any tenants that have a saved WhatsApp Web session on disk.
    // This means the AI keeps responding even after a server restart — no need
    // to log back into the dashboard and click "Connect" every time.
    autoReconnectWhatsAppSessions();
  });
}

// Start the server
startServer().catch(err => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});

/**
 * Scan .wwebjs_auth/ for saved sessions and re-initialise those clients.
 * Sessions are stored as  .wwebjs_auth/session-tenant_<id>/  directories.
 * We wait 5 s after the HTTP server is up so DB / other services are ready.
 */
async function autoReconnectWhatsAppSessions() {
  await new Promise(r => setTimeout(r, 5000));
  const authDir = path.join(process.cwd(), ".wwebjs_auth");
  if (!fs.existsSync(authDir)) return;

  const { initClientForTenant } = await import("./whatsapp/WhatsAppWebManager.js");

  const entries = fs.readdirSync(authDir);
  const candidateIds: number[] = [];

  for (const entry of entries) {
    // Directory names are like "session-tenant_1"
    const match = entry.match(/^session-tenant_(\d+)$/);
    if (match) {
      const sessionPath = path.join(authDir, entry);
      // Only restore if the session folder actually has content
      if (fs.statSync(sessionPath).isDirectory() && fs.readdirSync(sessionPath).length > 0) {
        candidateIds.push(parseInt(match[1]));
      }
    }
  }

  if (candidateIds.length === 0) return;

  // Validate against DB — only restore sessions for tenants that actually exist
  const { db } = await import("./db.js");
  const { users } = await import("../drizzle/schema.js");
  const { inArray } = await import("drizzle-orm");
  const validUsers = await db.select({ id: users.id }).from(users).where(inArray(users.id, candidateIds));
  const validIds = new Set(validUsers.map(u => u.id));

  // Delete session folders for tenants that no longer exist in the DB
  for (const id of candidateIds) {
    if (!validIds.has(id)) {
      const staleDir = path.join(authDir, `session-tenant_${id}`);
      fs.rmSync(staleDir, { recursive: true, force: true });
      console.log(`🗑️  Removed stale session folder for deleted tenant ${id}`);
    }
  }

  const tenantIds = candidateIds.filter(id => validIds.has(id));
  if (tenantIds.length === 0) return;

  console.log(`🔄 Auto-restoring WhatsApp sessions for tenant(s): ${tenantIds.join(", ")}`);

  for (const tenantId of tenantIds) {
    try {
      await initClientForTenant(tenantId);
      // Small gap between tenants to avoid hammering Chromium
      await new Promise(r => setTimeout(r, 3000));
    } catch (err: any) {
      console.error(`❌ Auto-restore failed for tenant ${tenantId}:`, err.message);
    }
  }
}
