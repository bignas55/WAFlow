import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { messageStatus } from "../../drizzle/schema.js";
import { eq, inArray } from "drizzle-orm";

export const messageStatusRouter = router({
  // Get delivery/read status for a list of message IDs
  getStatuses: protectedProcedure
    .input(z.object({ messageIds: z.array(z.string()).max(100) }))
    .query(async ({ input }) => {
      if (!input.messageIds.length) return [];
      const rows = await db.select()
        .from(messageStatus)
        .where(inArray(messageStatus.messageId, input.messageIds));
      return rows.map(r => ({ messageId: r.messageId, status: r.status, updatedAt: r.updatedAt }));
    }),
});
