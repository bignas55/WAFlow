/**
 * messageWorker.ts
 * BullMQ worker that processes inbound WhatsApp messages from the queue.
 *
 * Concurrency = 50 means up to 50 messages processed simultaneously.
 * Each job is one inbound message going through the full pipeline.
 */

import { Worker, Job } from "bullmq";
import { createRedisConnection, WhatsAppMessageJob } from "../services/messageQueue.js";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 50);

let _worker: Worker<WhatsAppMessageJob> | null = null;

export function startMessageWorker(): void {
  if (_worker) return; // already running

  const connection = createRedisConnection();

  _worker = new Worker<WhatsAppMessageJob>(
    "whatsapp-messages",
    async (job: Job<WhatsAppMessageJob>) => {
      const { processWhatsAppWebhook } = await import(
        "../whatsapp/messagePipeline.js"
      );
      await processWhatsAppWebhook(job.data);
    },
    {
      connection,
      concurrency: CONCURRENCY,
      // Stagger job starts slightly to avoid DB thundering herd
      limiter: {
        max: CONCURRENCY,
        duration: 1000, // max 50 jobs per second
      },
    }
  );

  _worker.on("completed", (job: Job<WhatsAppMessageJob>) => {
    const { tenantId, phoneNumber } = job.data;
    console.log(
      `✅ [Worker] Job ${job.id} done — tenant=${tenantId} phone=${phoneNumber}`
    );
  });

  _worker.on("failed", (job: Job<WhatsAppMessageJob> | undefined, err: Error) => {
    if (!job) return;
    const { tenantId, phoneNumber } = job.data;
    console.error(
      `❌ [Worker] Job ${job.id} failed (attempt ${job.attemptsMade}) — tenant=${tenantId} phone=${phoneNumber} — ${err.message}`
    );
  });

  _worker.on("error", (err: Error) => {
    console.error("❌ [Worker] Worker error:", err.message);
  });

  console.log(
    `🚀 [Worker] Message worker started — concurrency=${CONCURRENCY}`
  );
}

export async function stopMessageWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
    console.log("🛑 [Worker] Message worker stopped");
  }
}
