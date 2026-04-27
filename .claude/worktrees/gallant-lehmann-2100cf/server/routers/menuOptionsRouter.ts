import { getInsertId } from "../utils.js";
/**
 * menuOptionsRouter.ts  —  Admin-only CRUD for bot menu options.
 *
 * Each tenant can have up to 9 numbered menu items (1–9).
 * The WhatsApp bot presents these as a list when the customer sends the
 * configured trigger word (default: "menu").
 */

import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../trpc.js";
import { db } from "../db.js";
import { botMenuOptions, botConfig } from "../../drizzle/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ── Zod shapes ───────────────────────────────────────────────────────────────

const menuItemInput = z.object({
  itemNumber:  z.number().int().min(1).max(9),
  title:       z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  response:    z.string().min(1),
  actionType:  z.enum(["reply", "escalate", "booking", "kb_search"]).default("reply"),
  isActive:    z.boolean().default(true),
  sortOrder:   z.number().int().default(0),
});

// ── 5 pre-built sample sets ──────────────────────────────────────────────────

export const MENU_SAMPLES = [
  {
    name: "General Business",
    greeting: "👋 Welcome! How can we help you today?\n\nPlease reply with a number to choose an option:",
    footer: "Reply *0* at any time to speak with a person.",
    items: [
      { itemNumber: 1, title: "📅 Book an Appointment",     description: "Schedule a visit with us",              response: "Great! Let me help you book an appointment. What date and time works best for you? 📅",          actionType: "booking" as const },
      { itemNumber: 2, title: "💰 Pricing & Services",      description: "See what we offer and our rates",       response: "Here are our services and pricing. For a full list, visit our website or ask me any specific questions! 💬", actionType: "reply" as const },
      { itemNumber: 3, title: "📍 Location & Hours",        description: "Find us and our opening times",         response: "We're open Mon–Fri 9am–5pm. Find us at [ADDRESS]. Need directions? Just ask! 📍",             actionType: "reply" as const },
      { itemNumber: 4, title: "❓ FAQs",                   description: "Common questions answered",             response: "Let me search our knowledge base for you. What would you like to know?",                     actionType: "kb_search" as const },
      { itemNumber: 5, title: "🧑 Speak to Someone",        description: "Connect with a team member",           response: "Connecting you to one of our team members now. Please hold — someone will be with you shortly! 🙏", actionType: "escalate" as const },
    ],
  },
  {
    name: "Beauty & Salon",
    greeting: "💅 Hi gorgeous! Welcome to [Business Name].\n\nHow can we pamper you today?",
    footer: "Reply *0* to chat with a stylist.",
    items: [
      { itemNumber: 1, title: "💅 Book a Treatment",        description: "Hair, nails, skin & more",              response: "Let's get you booked in! Which treatment are you interested in? 💅",                            actionType: "booking" as const },
      { itemNumber: 2, title: "📋 Our Services & Prices",   description: "Full treatment menu & rates",           response: "Here's our service menu. Prices start from R200. Ask me about any specific treatment! 💄",     actionType: "reply" as const },
      { itemNumber: 3, title: "📅 My Appointments",         description: "View or change your bookings",         response: "To view or change your appointments, please tell me your name and the date you booked.",         actionType: "reply" as const },
      { itemNumber: 4, title: "🎁 Promotions & Packages",   description: "Current deals & gift vouchers",        response: "🎉 Current specials: 10% off first visit! Ask us about gift vouchers too. What interests you?",  actionType: "reply" as const },
      { itemNumber: 5, title: "📞 Contact Us",              description: "Chat with our reception",               response: "Routing you to our reception team now. They'll be with you in a moment! 💬",                   actionType: "escalate" as const },
    ],
  },
  {
    name: "Medical / Healthcare",
    greeting: "🏥 Hello! Welcome to [Practice Name].\n\nHow can we assist you today?\n\nPlease choose an option:",
    footer: "For emergencies call 112. Reply *0* to speak with our receptionist.",
    items: [
      { itemNumber: 1, title: "📅 Book an Appointment",     description: "See a doctor or specialist",            response: "I'll help you schedule an appointment. Which doctor would you like to see, and when are you available? 📅", actionType: "booking" as const },
      { itemNumber: 2, title: "💊 Repeat Prescription",     description: "Request a prescription refill",         response: "For a repeat prescription, please provide your full name, ID number, and the medication name. A doctor will review and approve. 💊", actionType: "reply" as const },
      { itemNumber: 3, title: "🧾 Medical Certificate",     description: "Request a sick note",                   response: "To request a medical certificate, you'll need to book a consultation first. Would you like to book now? 📋", actionType: "reply" as const },
      { itemNumber: 4, title: "📋 Test Results",            description: "Follow up on lab results",              response: "For test results please provide your full name and ID number, and a nurse will follow up with you shortly. 🔬", actionType: "escalate" as const },
      { itemNumber: 5, title: "❓ Health Questions",        description: "General health information",            response: "Let me search our health information for you. What would you like to know?",                    actionType: "kb_search" as const },
    ],
  },
  {
    name: "Restaurant & Food",
    greeting: "🍽️ Welcome to [Restaurant Name]! \n\nWhat can we help you with today?",
    footer: "Reply *0* to speak with our team.",
    items: [
      { itemNumber: 1, title: "📋 View Our Menu",           description: "See today's dishes & specials",         response: "🍽️ Check out our full menu at [LINK]. Today's specials include [SPECIALS]. What can I get for you?", actionType: "reply" as const },
      { itemNumber: 2, title: "🪑 Make a Reservation",      description: "Book a table",                          response: "I'd love to reserve a table for you! How many guests, and what date/time suits you? 🗓️",          actionType: "booking" as const },
      { itemNumber: 3, title: "🛵 Order for Delivery",      description: "Get food delivered to you",             response: "For delivery please visit [ORDER LINK] or tell me your address and what you'd like to order. 🛵", actionType: "reply" as const },
      { itemNumber: 4, title: "🎂 Private Events",          description: "Birthdays, functions & catering",       response: "We love hosting private events! Tell us the date, number of guests, and type of occasion. 🎉",    actionType: "reply" as const },
      { itemNumber: 5, title: "⭐ Leave a Review",          description: "Share your experience",                  response: "We appreciate your feedback! Please leave us a review at [REVIEW LINK] — it means the world to us! ⭐", actionType: "reply" as const },
    ],
  },
  {
    name: "Real Estate",
    greeting: "🏡 Welcome to [Agency Name]!\n\nHow can we help you on your property journey?",
    footer: "Reply *0* to speak directly with an agent.",
    items: [
      { itemNumber: 1, title: "🔍 Browse Properties",       description: "Find homes to buy or rent",             response: "I can help you find the perfect property! Are you looking to *buy* or *rent*? What area and budget are you working with? 🏡", actionType: "reply" as const },
      { itemNumber: 2, title: "📊 Get a Valuation",         description: "Find out what your property is worth",  response: "To get a free property valuation, please share the address and property type (house/flat/etc). An agent will contact you within 24 hours! 📊", actionType: "escalate" as const },
      { itemNumber: 3, title: "📅 Book a Viewing",          description: "See a property in person",              response: "I'll arrange a viewing for you! Which property are you interested in, and when are you available? 📅", actionType: "booking" as const },
      { itemNumber: 4, title: "📋 Application Process",     description: "How to apply for a rental or bond",     response: "Let me explain the application process for you. What type of property are you applying for — rental or bond finance?", actionType: "kb_search" as const },
      { itemNumber: 5, title: "🤝 Sell or Rent My Property", description: "List your property with us",           response: "Excellent! We'd love to help you sell or rent your property. Tell us the address and property type, and we'll get an agent to contact you. 🤝", actionType: "escalate" as const },
    ],
  },
] as const;

// ── Router ────────────────────────────────────────────────────────────────────

export const menuOptionsRouter = router({

  /** List all menu options for a tenant (admin view) */
  list: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(botMenuOptions)
        .where(eq(botMenuOptions.tenantId, input.tenantId))
        .orderBy(asc(botMenuOptions.sortOrder), asc(botMenuOptions.itemNumber));
    }),

  /** Get the menu config (enable flag + greeting) for a tenant */
  getConfig: adminProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      const [cfg] = await db
        .select({
          enableMenuMode: botConfig.enableMenuMode,
          menuTrigger:    botConfig.menuTrigger,
          menuGreeting:   botConfig.menuGreeting,
          menuFooter:     botConfig.menuFooter,
        })
        .from(botConfig)
        .where(eq(botConfig.tenantId, input.tenantId))
        .limit(1);
      return cfg ?? { enableMenuMode: 0, menuTrigger: "menu", menuGreeting: null, menuFooter: null };
    }),

  /** Update the menu mode settings (enable, trigger word, greeting text) */
  updateConfig: adminProcedure
    .input(z.object({
      tenantId:      z.number(),
      enableMenuMode: z.boolean(),
      menuTrigger:   z.string().max(255).default("menu"),
      menuGreeting:  z.string().max(2000).optional(),
      menuFooter:    z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      await db.update(botConfig).set({
        enableMenuMode: input.enableMenuMode ? 1 : 0,
        menuTrigger:    input.menuTrigger || "menu",
        menuGreeting:   input.menuGreeting || null,
        menuFooter:     input.menuFooter || null,
        updatedAt:      new Date(),
      }).where(eq(botConfig.tenantId, input.tenantId));
      return { success: true };
    }),

  /** Upsert a single menu option */
  upsert: adminProcedure
    .input(z.object({
      tenantId: z.number(),
      id:       z.number().optional(),  // omit for create
      ...menuItemInput.shape,
    }))
    .mutation(async ({ input }) => {
      if (input.id) {
        // Update existing
        await db.update(botMenuOptions).set({
          title:       input.title,
          description: input.description ?? null,
          response:    input.response,
          actionType:  input.actionType,
          isActive:    input.isActive ? 1 : 0,
          sortOrder:   input.sortOrder,
          itemNumber:  input.itemNumber,
          updatedAt:   new Date(),
        }).where(and(
          eq(botMenuOptions.id, input.id),
          eq(botMenuOptions.tenantId, input.tenantId),
        ));
        return { success: true, id: input.id };
      }

      // Create new — enforce max 9 items
      const existing = await db
        .select({ id: botMenuOptions.id })
        .from(botMenuOptions)
        .where(eq(botMenuOptions.tenantId, input.tenantId));
      if (existing.length >= 9) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 9 menu items allowed per tenant." });
      }

      const [result] = await db.insert(botMenuOptions).values({
        tenantId:    input.tenantId,
        itemNumber:  input.itemNumber,
        title:       input.title,
        description: input.description ?? null,
        response:    input.response,
        actionType:  input.actionType,
        isActive:    input.isActive ? 1 : 0,
        sortOrder:   input.sortOrder,
      });
      return { success: true, id: getInsertId(result) as number };
    }),

  /** Delete a menu option */
  delete: adminProcedure
    .input(z.object({ tenantId: z.number(), id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(botMenuOptions).where(and(
        eq(botMenuOptions.id, input.id),
        eq(botMenuOptions.tenantId, input.tenantId),
      ));
      return { success: true };
    }),

  /** Bulk replace all items with a sample set */
  applySample: adminProcedure
    .input(z.object({
      tenantId:   z.number(),
      sampleName: z.string(),
    }))
    .mutation(async ({ input }) => {
      const sample = MENU_SAMPLES.find(s => s.name === input.sampleName);
      if (!sample) throw new TRPCError({ code: "NOT_FOUND", message: "Sample not found" });

      // Delete existing items for this tenant
      await db.delete(botMenuOptions).where(eq(botMenuOptions.tenantId, input.tenantId));

      // Insert sample items
      for (const item of sample.items) {
        await db.insert(botMenuOptions).values({
          tenantId:    input.tenantId,
          itemNumber:  item.itemNumber,
          title:       item.title,
          description: item.description,
          response:    item.response,
          actionType:  item.actionType,
          isActive:    1,
          sortOrder:   item.itemNumber,
        });
      }

      // Update greeting + footer from the sample
      await db.update(botConfig).set({
        menuGreeting: sample.greeting,
        menuFooter:   sample.footer,
        updatedAt:    new Date(),
      }).where(eq(botConfig.tenantId, input.tenantId));

      return { success: true, count: sample.items.length };
    }),

  /** Get active menu options for the bot pipeline (used by messagePipeline) */
  getActiveForTenant: protectedProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(botMenuOptions)
        .where(and(
          eq(botMenuOptions.tenantId, input.tenantId),
          eq(botMenuOptions.isActive, 1),
        ))
        .orderBy(asc(botMenuOptions.sortOrder), asc(botMenuOptions.itemNumber));
    }),
});
