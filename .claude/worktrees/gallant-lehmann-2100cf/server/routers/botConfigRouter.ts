import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { botConfig } from "../../drizzle/schema.js";
import { decrypt, encryptIfNeeded } from "../services/encryptionService.js";
import { TRPCError } from "@trpc/server";

export const botConfigRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    let config: typeof botConfig.$inferSelect | undefined;
    try {
      const [row] = await db.select().from(botConfig)
        .where(eq(botConfig.tenantId, ctx.user.userId))
        .orderBy(desc(botConfig.updatedAt))
        .limit(1);
      config = row;
    } catch (err: any) {
      console.error(`❌ [botConfig.get] DB error for tenant ${ctx.user.userId}:`, err.message);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Database error: ${err.message}` });
    }
    if (!config) return null;
    return {
      businessName: config.businessName,
      systemPrompt: config.systemPrompt,
      aiApiUrl: config.aiApiUrl,
      aiApiKey: decrypt(config.aiApiKey || ""),
      aiModel: config.aiModel,
      phoneNumberId: config.whatsappPhoneNumberId,
      businessAccountId: config.whatsappBusinessAccountId,
      accessToken: config.whatsappAccessToken,
      verifyToken: config.whatsappWebhookToken,
      businessHoursEnabled: config.enableBusinessHours,
      businessHoursTimezone: config.timezone,
      businessHoursStart: config.businessHoursStart,
      businessHoursEnd: config.businessHoursEnd,
      businessDays: (config.businessDays || "1,2,3,4,5").split(",").map((d) => {
        const dayMap: Record<string, string> = { "1": "monday", "2": "tuesday", "3": "wednesday", "4": "thursday", "5": "friday", "6": "saturday", "0": "sunday" };
        return dayMap[d] || d;
      }),
      afterHoursMessage: config.afterHoursMessage,
      maxConversationLength: config.maxTokens,
      responseDelay: 1000,
      notificationsEnabled: true,
      escalationEmail: config.smtpUser,
      escalationPhone: config.twilioPhoneNumber,
      // Language
      language: config.language,
      enableMultiLanguage: config.enableMultiLanguage,
      // Voice
      enableVoiceTranscription: config.enableVoiceTranscription,
      enableVoiceResponse: config.enableVoiceResponse,
      ttsVoice: config.ttsVoice,
      whisperApiUrl: config.whisperApiUrl,
      // Notification preferences
      enableDailySummary: config.enableDailySummary,
      enableWeeklyReport: config.enableWeeklyReport,
      enableFollowUp: config.enableFollowUp,
      enableNoShowNotify: config.enableNoShowNotify,
      enableReEngagement: config.enableReEngagement,
      reEngagementDays: config.reEngagementDays,
      reEngagementMessage: config.reEngagementMessage ?? "",
      enableApptConfirmation: config.enableApptConfirmation,
      // Outbound webhook
      enableWebhook: config.enableWebhook,
      webhookUrl: config.webhookUrl,
      // AI fallback
      aiFallbackModel: config.aiFallbackModel ?? "",
      aiFallbackApiUrl: config.aiFallbackApiUrl ?? "",
      aiFallbackApiKey: decrypt(config.aiFallbackApiKey || ""),
      // Birthday messages
      enableBirthdayMessages: config.enableBirthdayMessages,
      birthdayMessage: config.birthdayMessage ?? "",
      // Conversation auto-close
      enableConversationAutoClose: config.enableConversationAutoClose,
      autoCloseDays: config.autoCloseDays,
      // Public booking page
      bookingSlug: config.bookingSlug ?? "",
      bookingPageTitle: config.bookingPageTitle ?? "Book an Appointment",
      bookingPageDescription: config.bookingPageDescription ?? "",
      // Deposit
      depositRequired: config.depositRequired,
      depositAmount: config.depositAmount ?? "0.00",
      paymentLinkTemplate: config.paymentLinkTemplate ?? "",
      // Advert / business profile
      businessWhatsappNumber: config.businessWhatsappNumber ?? "",
      businessWebsite: config.businessWebsite ?? "",
      businessTagline: config.businessTagline ?? "",
      businessLogoUrl: config.businessLogoUrl ?? "",
      enableServiceMenu:   !!(config.enableServiceMenu),
      serviceMenuTrigger:  config.serviceMenuTrigger ?? "MENU",
      enableSmsFallback:   !!(config.enableSmsFallback),
    };
  }),

  update: protectedProcedure
    .input(z.object({
      businessName: z.string().optional(),
      systemPrompt: z.string().optional(),
      aiApiUrl: z.string().optional(),
      aiApiKey: z.string().optional(),
      aiModel: z.string().optional(),
      phoneNumberId: z.string().optional(),
      businessAccountId: z.string().optional(),
      accessToken: z.string().optional(),
      verifyToken: z.string().optional(),
      businessHoursEnabled: z.boolean().optional(),
      businessHoursTimezone: z.string().optional(),
      businessHoursStart: z.string().optional(),
      businessHoursEnd: z.string().optional(),
      businessDays: z.array(z.string()).optional(),
      afterHoursMessage: z.string().optional(),
      maxConversationLength: z.number().optional(),
      responseDelay: z.number().optional(),
      notificationsEnabled: z.boolean().optional(),
      escalationEmail: z.string().optional(),
      escalationPhone: z.string().optional(),
      // Language
      language: z.string().optional(),
      enableMultiLanguage: z.boolean().optional(),
      // Voice
      enableVoiceTranscription: z.boolean().optional(),
      enableVoiceResponse: z.boolean().optional(),
      ttsVoice: z.string().optional(),
      whisperApiUrl: z.string().optional(),
      // Notification preferences
      enableDailySummary: z.boolean().optional(),
      enableWeeklyReport: z.boolean().optional(),
      enableFollowUp: z.boolean().optional(),
      enableNoShowNotify: z.boolean().optional(),
      enableReEngagement: z.boolean().optional(),
      reEngagementDays: z.number().min(1).max(365).optional(),
      reEngagementMessage: z.string().optional(),
      enableApptConfirmation: z.boolean().optional(),
      // Outbound webhook
      enableWebhook: z.boolean().optional(),
      webhookUrl: z.string().optional(),
      // AI fallback
      aiFallbackModel: z.string().optional(),
      aiFallbackApiUrl: z.string().optional(),
      aiFallbackApiKey: z.string().optional(),
      // Birthday messages
      enableBirthdayMessages: z.boolean().optional(),
      birthdayMessage: z.string().optional(),
      // Conversation auto-close
      enableConversationAutoClose: z.boolean().optional(),
      autoCloseDays: z.number().min(1).max(365).optional(),
      // Public booking page
      bookingSlug: z.string().max(100).optional(),
      bookingPageTitle: z.string().max(255).optional(),
      bookingPageDescription: z.string().optional(),
      // Deposit
      depositRequired: z.boolean().optional(),
      // Accept both number and numeric string — the server-side `get` returns
      // this as a string from MySQL's DECIMAL column; coerce prevents Zod from
      // rejecting the save when the full form is spread into the mutation.
      depositAmount: z.coerce.number().min(0).optional(),
      paymentLinkTemplate: z.string().optional(),
      // Advert / business profile
      businessWhatsappNumber: z.string().max(30).optional(),
      businessWebsite: z.string().max(500).optional(),
      businessTagline: z.string().max(500).optional(),
      businessLogoUrl: z.string().max(1000).optional(),
      // Service menu
      enableServiceMenu: z.boolean().optional(),
      serviceMenuTrigger: z.string().max(255).optional(),
      // SMS fallback
      enableSmsFallback: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const dayMap: Record<string, string> = { monday: "1", tuesday: "2", wednesday: "3", thursday: "4", friday: "5", saturday: "6", sunday: "0" };

      // Build the set of columns to update. Keys must match the TypeScript
      // property names on the botConfig schema (camelCase) — Drizzle maps them
      // to the snake_case SQL column names at query-build time.
      const colUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.businessName !== undefined) colUpdates.businessName = input.businessName;
      if (input.systemPrompt !== undefined) colUpdates.systemPrompt = input.systemPrompt;
      if (input.aiApiUrl !== undefined) colUpdates.aiApiUrl = input.aiApiUrl;
      if (input.aiApiKey !== undefined) colUpdates.aiApiKey = encryptIfNeeded(input.aiApiKey);
      if (input.aiModel !== undefined) colUpdates.aiModel = input.aiModel;
      if (input.phoneNumberId !== undefined) colUpdates.whatsappPhoneNumberId = input.phoneNumberId;
      if (input.businessAccountId !== undefined) colUpdates.whatsappBusinessAccountId = input.businessAccountId;
      if (input.accessToken !== undefined) colUpdates.whatsappAccessToken = input.accessToken;
      if (input.verifyToken !== undefined) colUpdates.whatsappWebhookToken = input.verifyToken;
      if (input.businessHoursEnabled !== undefined) colUpdates.enableBusinessHours = input.businessHoursEnabled;
      if (input.businessHoursTimezone !== undefined) colUpdates.timezone = input.businessHoursTimezone;
      if (input.businessHoursStart !== undefined) colUpdates.businessHoursStart = input.businessHoursStart;
      if (input.businessHoursEnd !== undefined) colUpdates.businessHoursEnd = input.businessHoursEnd;
      if (input.businessDays !== undefined) colUpdates.businessDays = input.businessDays.map((d) => dayMap[d] || d).join(",");
      if (input.afterHoursMessage !== undefined) colUpdates.afterHoursMessage = input.afterHoursMessage;
      if (input.maxConversationLength !== undefined) colUpdates.maxTokens = input.maxConversationLength;
      if (input.escalationEmail !== undefined) colUpdates.smtpUser = input.escalationEmail;
      if (input.escalationPhone !== undefined) colUpdates.twilioPhoneNumber = input.escalationPhone;
      if (input.language !== undefined) colUpdates.language = input.language;
      if (input.enableMultiLanguage !== undefined) colUpdates.enableMultiLanguage = input.enableMultiLanguage;
      if (input.enableVoiceTranscription !== undefined) colUpdates.enableVoiceTranscription = input.enableVoiceTranscription;
      if (input.enableVoiceResponse !== undefined) colUpdates.enableVoiceResponse = input.enableVoiceResponse;
      if (input.ttsVoice !== undefined) colUpdates.ttsVoice = input.ttsVoice;
      if (input.whisperApiUrl !== undefined) colUpdates.whisperApiUrl = input.whisperApiUrl;
      if (input.enableDailySummary !== undefined) colUpdates.enableDailySummary = input.enableDailySummary;
      if (input.enableWeeklyReport !== undefined) colUpdates.enableWeeklyReport = input.enableWeeklyReport;
      if (input.enableFollowUp !== undefined) colUpdates.enableFollowUp = input.enableFollowUp;
      if (input.enableNoShowNotify !== undefined) colUpdates.enableNoShowNotify = input.enableNoShowNotify;
      if (input.enableReEngagement !== undefined) colUpdates.enableReEngagement = input.enableReEngagement;
      if (input.reEngagementDays !== undefined) colUpdates.reEngagementDays = input.reEngagementDays;
      if (input.reEngagementMessage !== undefined) colUpdates.reEngagementMessage = input.reEngagementMessage;
      if (input.enableApptConfirmation !== undefined) colUpdates.enableApptConfirmation = input.enableApptConfirmation;
      if (input.enableWebhook !== undefined) colUpdates.enableWebhook = input.enableWebhook;
      if (input.webhookUrl !== undefined) colUpdates.webhookUrl = input.webhookUrl;
      if (input.aiFallbackModel !== undefined) colUpdates.aiFallbackModel = input.aiFallbackModel;
      if (input.aiFallbackApiUrl !== undefined) colUpdates.aiFallbackApiUrl = input.aiFallbackApiUrl;
      if (input.aiFallbackApiKey !== undefined) colUpdates.aiFallbackApiKey = encryptIfNeeded(input.aiFallbackApiKey);
      if (input.enableBirthdayMessages !== undefined) colUpdates.enableBirthdayMessages = input.enableBirthdayMessages;
      if (input.birthdayMessage !== undefined) colUpdates.birthdayMessage = input.birthdayMessage;
      if (input.enableConversationAutoClose !== undefined) colUpdates.enableConversationAutoClose = input.enableConversationAutoClose;
      if (input.autoCloseDays !== undefined) colUpdates.autoCloseDays = input.autoCloseDays;
      if (input.bookingSlug !== undefined) colUpdates.bookingSlug = input.bookingSlug || null;
      if (input.bookingPageTitle !== undefined) colUpdates.bookingPageTitle = input.bookingPageTitle;
      if (input.bookingPageDescription !== undefined) colUpdates.bookingPageDescription = input.bookingPageDescription;
      if (input.depositRequired !== undefined) colUpdates.depositRequired = input.depositRequired;
      if (input.depositAmount !== undefined) colUpdates.depositAmount = String(input.depositAmount);
      if (input.paymentLinkTemplate !== undefined) colUpdates.paymentLinkTemplate = input.paymentLinkTemplate;
      if (input.businessWhatsappNumber !== undefined) colUpdates.businessWhatsappNumber = input.businessWhatsappNumber || null;
      if (input.businessWebsite !== undefined) colUpdates.businessWebsite = input.businessWebsite || null;
      if (input.businessTagline !== undefined) colUpdates.businessTagline = input.businessTagline || null;
      if (input.businessLogoUrl !== undefined) colUpdates.businessLogoUrl = input.businessLogoUrl || null;
      if (input.enableServiceMenu !== undefined) colUpdates.enableServiceMenu = input.enableServiceMenu ? 1 : 0;
      if (input.serviceMenuTrigger !== undefined) colUpdates.serviceMenuTrigger = input.serviceMenuTrigger || null;
      if (input.enableSmsFallback !== undefined) colUpdates.enableSmsFallback = input.enableSmsFallback ? 1 : 0;

      const [existing] = await db.select({ id: botConfig.id }).from(botConfig)
        .where(eq(botConfig.tenantId, ctx.user.userId))
        .orderBy(desc(botConfig.updatedAt))
        .limit(1);

      if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.update(botConfig).set(colUpdates as any).where(eq(botConfig.id, existing.id));
        // Verify the write landed — this confirms Drizzle actually updated the row
        const [verify] = await db
          .select({ aiModel: botConfig.aiModel, updatedAt: botConfig.updatedAt })
          .from(botConfig)
          .where(eq(botConfig.id, existing.id));
        console.log(`✅ [botConfig.update] tenant=${ctx.user.userId} id=${existing.id} wanted="${colUpdates.aiModel ?? "(no change)"}" got="${verify?.aiModel}"`);
      } else {
        // No config row exists yet for this tenant — create one
        console.log(`ℹ️  [botConfig.update] tenant=${ctx.user.userId} — no row found, inserting`);
        // Cast to any — many schema columns have DB defaults; only the required
        // subset is provided here and the rest rely on DEFAULT values.
        await (db.insert(botConfig) as any).values({
          tenantId: ctx.user.userId,
          businessName: (colUpdates.businessName as string) ?? "My Business",
          systemPrompt: (colUpdates.systemPrompt as string) ?? "",
          afterHoursMessage: "",
          aiModel: (colUpdates.aiModel as string) ?? "gemma4:latest",
          aiApiUrl: (colUpdates.aiApiUrl as string) ?? "http://host.docker.internal:11434/v1",
          aiApiKey: encryptIfNeeded((colUpdates.aiApiKey as string) ?? "ollama"),
          ...colUpdates,
        });
      }
      return { success: true };
    }),

  // Return onboarding status
  getOnboardingStatus: protectedProcedure.query(async ({ ctx }) => {
    const [config] = await db.select({ onboardingCompleted: botConfig.onboardingCompleted })
      .from(botConfig).where(eq(botConfig.tenantId, ctx.user.userId)).limit(1);
    return { completed: config?.onboardingCompleted ?? false };
  }),

  // Mark onboarding as complete
  completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    await db.update(botConfig)
      .set({ onboardingCompleted: true, updatedAt: new Date() })
      .where(eq(botConfig.tenantId, ctx.user.userId));
    return { success: true };
  }),

  // Ping the configured AI endpoint to check it's reachable
  checkAI: protectedProcedure.query(async ({ ctx }) => {
    const [config] = await db.select({ aiApiUrl: botConfig.aiApiUrl, aiModel: botConfig.aiModel, aiApiKey: botConfig.aiApiKey })
      .from(botConfig).where(eq(botConfig.tenantId, ctx.user.userId)).limit(1);
    if (!config?.aiApiUrl) return { ok: false, error: "No AI API URL configured" };
    try {
      const headers: Record<string, string> = {};
      const decryptedKey = decrypt(config.aiApiKey || "");
      if (decryptedKey && decryptedKey !== "ollama") {
        headers["Authorization"] = `Bearer ${decryptedKey}`;
      }
      const res = await fetch(`${config.aiApiUrl.replace(/\/+$/, "")}/models`, {
        headers,
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return { ok: false, error: `AI endpoint returned ${res.status}` };
      return { ok: true, model: config.aiModel };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Connection failed" };
    }
  }),
});
