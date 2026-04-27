import { google } from "googleapis";
import { db } from "../db.js";
import { googleCalendarIntegration } from "../../drizzle/schema.js";

export class GoogleCalendarService {
  private oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback"
  );

  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/calendar"],
      prompt: "consent",
    });
  }

  async handleCallback(code: string): Promise<void> {
    const { tokens } = await this.oauth2Client.getToken(code);
    await db.insert(googleCalendarIntegration).values({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      syncEnabled: true,
    }).onDuplicateKeyUpdate({
      set: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || undefined, updatedAt: new Date() },
    });
  }

  async createEvent(params: { summary: string; description?: string; startDateTime: string; endDateTime: string; attendeeEmail?: string }): Promise<string | null> {
    try {
      const [integration] = await db.select().from(googleCalendarIntegration).limit(1);
      if (!integration?.accessToken) throw new Error("Google Calendar not connected");
      this.oauth2Client.setCredentials({ access_token: integration.accessToken, refresh_token: integration.refreshToken });
      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });
      const res = await calendar.events.insert({
        calendarId: integration.calendarId || "primary",
        requestBody: {
          summary: params.summary,
          description: params.description,
          start: { dateTime: params.startDateTime, timeZone: "Africa/Johannesburg" },
          end: { dateTime: params.endDateTime, timeZone: "Africa/Johannesburg" },
          attendees: params.attendeeEmail ? [{ email: params.attendeeEmail }] : [],
        },
      });
      return res.data.id || null;
    } catch (error) {
      console.error("Calendar error:", error);
      return null;
    }
  }

  async deleteEvent(eventId: string): Promise<void> {
    try {
      const [integration] = await db.select().from(googleCalendarIntegration).limit(1);
      if (!integration?.accessToken) return;
      this.oauth2Client.setCredentials({ access_token: integration.accessToken });
      const calendar = google.calendar({ version: "v3", auth: this.oauth2Client });
      await calendar.events.delete({ calendarId: integration.calendarId || "primary", eventId });
    } catch { /* ignore */ }
  }
}

export const calendarService = new GoogleCalendarService();
