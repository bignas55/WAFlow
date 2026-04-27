// Webhook router is handled directly in server/index.ts
// This file is kept for reference/future webhook management endpoints
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { webhookLogs } from "../../drizzle/schema.js";
import { desc } from "drizzle-orm";

export const webhookRouter = router({
  getLogs: protectedProcedure.query(async () => {
    return db.select().from(webhookLogs).orderBy(desc(webhookLogs.createdAt)).limit(100);
  }),
});
