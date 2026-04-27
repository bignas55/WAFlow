/**
 * messageQueue.ts
 * BullMQ-based message queue for processing inbound WhatsApp messages.
 * Decouples message receipt from processing so high bursts don't crash the server.
 */

import { Queue, Worker, Job, QueueEvents } from "bullmq";
import IORedis from "ioredis";

// ── Redis connection ──────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/**
 * Shared Redis connection used by Queue + Worker.
 * maxRetriesPerRequest: null is REQUIRED by BullMQ.
 */
export function createRedisConnection() {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
}

// ── Queue definition ──────────────────────────────────────────────────────────

export interface WhatsAppMessageJob {
  tenantId: number;
  phoneNumber: string;
  chatId: string;
  messageText: string;
  contactName: string | null;
  messageId: string;
  isVoice?: boolean;
}

const QUEUE_NAME = "whatsapp-messages";

let _queue: Queue<WhatsAppMessageJob> | null = null;
let _connection: IORedis | null = null;

export function getMessageQueue(): Queue<WhatsAppMessageJob> {
  if (!_queue) {
    _connection = createRedisConnection();
    _queue = new Queue<WhatsAppMessageJob>(QUEUE_NAME, {
      connection: _connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: { count: 1000 }, // keep last 1000 completed jobs
        removeOnFail: { count: 500 },       // keep last 500 failed jobs
      },
    });

    _queue.on("error", (err: Error) => {
      console.error("❌ [MessageQueue] Queue error:", err.message);
    });

    console.log("✅ [MessageQueue] Queue ready —", REDIS_URL);
  }
  return _queue;
}

/**
 * Push an inbound WhatsApp message onto the queue.
 * Called from WhatsAppWebManager and webhook handler — never blocks.
 *
 * If Redis is unavailable (common in local dev without `docker compose` Redis),
 * we process the message inline so customers still get replies.
 */
export async function enqueueMessage(job: WhatsAppMessageJob): Promise<void> {
  try {
    const queue = getMessageQueue();
    await queue.add("process", job, {
      jobId: `${job.tenantId}:${job.messageId}`,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      "❌ [MessageQueue] Failed to enqueue — processing inline (is Redis running? Set REDIS_URL or start Redis.)",
      detail,
    );
    const { processWhatsAppWebhook } = await import(
      "../whatsapp/messagePipeline.js"
    );
    await processWhatsAppWebhook(job);
  }
}

/**
 * Gracefully close queue connection on shutdown.
 */
export async function closeMessageQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  if (_connection) {
    await _connection.quit();
    _connection = null;
  }
}
