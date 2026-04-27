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
  const redis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    // Reconnection settings
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // Timeout settings to prevent hanging
    connectTimeout: 10000,
    maxRetriesPerRequest: null,
  });

  // Better error handling for Redis connection
  redis.on("error", (err) => {
    console.warn("⚠️  Redis connection error:", err.message);
  });

  redis.on("connect", () => {
    console.log("✅ Redis connected");
  });

  redis.on("reconnecting", () => {
    console.log("🔄 Redis reconnecting...");
  });

  return redis;
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

    // ── Start queue depth monitoring ──────────────────────────────────────────
    // Log queue size every 5 minutes and alert if backpressure detected
    let monitoringActive = false;
    async function startQueueMonitoring() {
      if (monitoringActive) return;
      monitoringActive = true;
      setInterval(async () => {
        try {
          const counts = await _queue!.getJobCounts();
          const total = counts.waiting + counts.delayed + counts.active;
          if (total > 1000) {
            console.warn(
              `⚠️  [MessageQueue] HIGH BACKPRESSURE: ${total} jobs pending (waiting:${counts.waiting} active:${counts.active} delayed:${counts.delayed})`
            );
          } else if (total > 100) {
            console.log(
              `📊 [MessageQueue] Queue depth: ${total} jobs (waiting:${counts.waiting} active:${counts.active} delayed:${counts.delayed})`
            );
          }
        } catch (err: any) {
          console.error("❌ [MessageQueue] Failed to get queue counts:", err.message);
        }
      }, 5 * 60 * 1000); // every 5 minutes
    }
    startQueueMonitoring().catch(err => console.error("Failed to start queue monitoring:", err));

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
    // Use dash separator instead of colon (BullMQ doesn't allow colons in job IDs)
    await queue.add("process", job, {
      jobId: `${job.tenantId}-${job.messageId}`,
    });
    // Silently succeed — queue will auto-retry if Redis connection drops
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(
      `⚠️  [MessageQueue] Failed to enqueue (${detail}) — processing inline. Redis may not be running.`,
    );
    console.log(`   💡 To fix: Run 'docker compose up -d redis' or ensure Redis is accessible at ${REDIS_URL}`);
    try {
      const { processWhatsAppWebhook } = await import(
        "../whatsapp/messagePipeline.js"
      );
      await processWhatsAppWebhook(job);
    } catch (pipelineErr) {
      const pipelineDetail = pipelineErr instanceof Error ? pipelineErr.message : String(pipelineErr);
      console.error(`❌ [MessageQueue] Inline processing failed: ${pipelineDetail}`);
      throw pipelineErr;
    }
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
