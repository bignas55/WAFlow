import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { googleCalendarIntegration, botConfig } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";
import { GoogleCalendarService } from "../services/calendarService.js";
import { TRPCError } from "@trpc/server";

const calSvc = new GoogleCalendarService();

export const calendarRouter = router({
  // Get Google Calendar connection status + auth URL
  status: protectedProcedure.query(async () => {
    const [row] = await db.select({
      syncEnabled: googleCalendarIntegration.syncEnabled,
      calendarId: googleCalendarIntegration.calendarId,
      lastSyncAt: googleCalendarIntegration.lastSyncAt,
    }).from(googleCalendarIntegration).limit(1);

    const authUrl = calSvc.getAuthUrl();
    return {
      connected: !!row?.syncEnabled,
      calendarId: row?.calendarId ?? "primary",
      lastSyncAt: row?.lastSyncAt ?? null,
      authUrl,
    };
  }),

  disconnect: protectedProcedure.mutation(async () => {
    await db.update(googleCalendarIntegration).set({ syncEnabled: false, accessToken: null, refreshToken: null });
    return { success: true };
  }),
});
