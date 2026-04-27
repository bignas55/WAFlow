import { z } from "zod";
import { router, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { botConfig } from "../../drizzle/schema.js";
import axios from "axios";
import { eq } from "drizzle-orm";
import {
  getStateForTenant,
  initClientForTenant,
  destroyClientForTenant,
  sendViaWhatsAppWeb,
} from "../whatsapp/WhatsAppWebManager.js";

export const whatsappRouter = router({
  // ── Meta API status ──────────────────────────────────────────────────────
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const [config] = await db.select({
      whatsappPhoneNumberId: botConfig.whatsappPhoneNumberId,
      whatsappAccessToken: botConfig.whatsappAccessToken,
    }).from(botConfig).where(eq(botConfig.tenantId, ctx.user.userId)).limit(1);

    if (!config?.whatsappPhoneNumberId || !config?.whatsappAccessToken) {
      return { connected: false, phoneNumber: null };
    }

    try {
      const res = await axios.get(
        `https://graph.facebook.com/v18.0/${config.whatsappPhoneNumberId}`,
        { headers: { Authorization: `Bearer ${config.whatsappAccessToken}` }, timeout: 5000 }
      );
      return {
        connected: true,
        phoneNumber: res.data?.display_phone_number || null,
        verifiedName: res.data?.verified_name || null,
      };
    } catch {
      return { connected: false, phoneNumber: null };
    }
  }),

  // ── Meta API credential verify ───────────────────────────────────────────
  verifyConnection: protectedProcedure
    .input(z.object({
      phoneNumberId: z.string(),
      accessToken: z.string(),
    }))
    .mutation(async ({ input }) => {
      if (!input.phoneNumberId || !input.accessToken) {
        return { success: false, error: "Phone Number ID and Access Token are required." };
      }
      try {
        const res = await axios.get(
          `https://graph.facebook.com/v18.0/${input.phoneNumberId}`,
          { headers: { Authorization: `Bearer ${input.accessToken}` }, timeout: 8000 }
        );
        return {
          success: true,
          displayPhoneNumber: res.data?.display_phone_number || null,
          verifiedName: res.data?.verified_name || null,
          qualityRating: res.data?.quality_rating || null,
        };
      } catch (err: any) {
        const msg = err?.response?.data?.error?.message || err?.message || "Connection failed";
        return { success: false, error: msg };
      }
    }),

  // ── Meta API test send ───────────────────────────────────────────────────
  testMessage: protectedProcedure
    .input(z.object({ phoneNumber: z.string(), message: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { WhatsAppBusinessAPI } = await import("../whatsapp/WhatsAppBusinessAPI.js");
      const api = await WhatsAppBusinessAPI.fromConfig(ctx.user.userId);
      const messageId = await api.sendTextMessage(input.phoneNumber, input.message);
      return { success: !!messageId, messageId };
    }),

  // ── WhatsApp Web (QR) ────────────────────────────────────────────────────
  qrStatus: protectedProcedure.query(({ ctx }) => {
    return getStateForTenant(ctx.user.userId);
  }),

  qrConnect: protectedProcedure.mutation(async ({ ctx }) => {
    const state = getStateForTenant(ctx.user.userId);
    if (state.status === "connected" || state.status === "connecting" || state.status === "qr_ready") {
      return { success: true, message: "Already connecting or connected" };
    }
    // Run in background — client emits QR events the frontend polls for
    initClientForTenant(ctx.user.userId).catch(err => console.error("WWJS init error:", err));
    return { success: true, message: "Connecting..." };
  }),

  qrDisconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await destroyClientForTenant(ctx.user.userId);
    return { success: true };
  }),

  // ── QR test message ──────────────────────────────────────────────────────
  qrTestMessage: protectedProcedure
    .input(z.object({ phoneNumber: z.string(), message: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const ok = await sendViaWhatsAppWeb(ctx.user.userId, input.phoneNumber, input.message);
      return { success: ok };
    }),

  // ── Interactive Button Message (Business API only) ────────────────────────
  sendInteractiveButtons: protectedProcedure
    .input(z.object({
      phoneNumber: z.string(),
      bodyText:    z.string().min(1).max(1024),
      headerText:  z.string().max(60).optional(),
      footerText:  z.string().max(60).optional(),
      buttons:     z.array(z.object({ id: z.string(), title: z.string().max(20) })).min(1).max(3),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const [cfg] = await db.select({
        whatsappPhoneNumberId: botConfig.whatsappPhoneNumberId,
        whatsappAccessToken:   botConfig.whatsappAccessToken,
      }).from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      if (!cfg?.whatsappPhoneNumberId || !cfg?.whatsappAccessToken) {
        throw new Error("WhatsApp Business API credentials not configured. Please set Phone Number ID and Access Token in Configuration.");
      }

      const { WhatsAppBusinessAPI } = await import("../whatsapp/WhatsAppBusinessAPI.js");
      const api = new WhatsAppBusinessAPI(cfg.whatsappPhoneNumberId, cfg.whatsappAccessToken);
      const msgId = await api.sendInteractiveButtons(
        input.phoneNumber, input.bodyText, input.buttons, input.headerText, input.footerText
      );
      return { success: !!msgId, messageId: msgId };
    }),

  // ── Interactive List Message (Business API only) ──────────────────────────
  sendInteractiveList: protectedProcedure
    .input(z.object({
      phoneNumber:  z.string(),
      bodyText:     z.string().min(1).max(1024),
      buttonLabel:  z.string().max(20).default("See Options"),
      headerText:   z.string().max(60).optional(),
      sections:     z.array(z.object({
        title: z.string(),
        rows:  z.array(z.object({ id: z.string(), title: z.string(), description: z.string().optional() })),
      })).min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.user.userId;
      const [cfg] = await db.select({
        whatsappPhoneNumberId: botConfig.whatsappPhoneNumberId,
        whatsappAccessToken:   botConfig.whatsappAccessToken,
      }).from(botConfig).where(eq(botConfig.tenantId, tenantId)).limit(1);

      if (!cfg?.whatsappPhoneNumberId || !cfg?.whatsappAccessToken) {
        throw new Error("WhatsApp Business API credentials not configured.");
      }

      const { WhatsAppBusinessAPI } = await import("../whatsapp/WhatsAppBusinessAPI.js");
      const api = new WhatsAppBusinessAPI(cfg.whatsappPhoneNumberId, cfg.whatsappAccessToken);
      const msgId = await api.sendInteractiveList(
        input.phoneNumber, input.bodyText, input.buttonLabel, input.sections, input.headerText
      );
      return { success: !!msgId, messageId: msgId };
    }),
});
