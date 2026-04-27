import {
  mysqlTable, int, varchar, text, boolean, datetime, decimal, json, mysqlEnum, index, uniqueIndex, tinyint,
} from "drizzle-orm/mysql-core";
import { relations, sql } from "drizzle-orm";

// USERS
export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "user"]).default("user").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: datetime("last_login_at"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
  // Billing fields
  plan: mysqlEnum("plan", ["free", "starter", "pro", "enterprise"]).default("free").notNull(),
  planExpiresAt: datetime("plan_expires_at"),
  messageLimit: int("message_limit").default(500).notNull(),       // messages/month
  messagesUsedThisMonth: int("messages_used_this_month").default(0).notNull(),
  billingResetAt: datetime("billing_reset_at"),                     // next monthly reset
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).default("0.00").notNull(),
  notes: text("notes"),                                             // admin billing notes
  // Invite flow — set when admin provisions a new client
  inviteToken: varchar("invite_token", { length: 128 }),
  inviteExpiresAt: datetime("invite_expires_at"),
  inviteAccepted: boolean("invite_accepted").default(true).notNull(), // false = pending first login
  // Self-service password reset
  resetToken: varchar("reset_token", { length: 128 }),
  resetTokenExpires: datetime("reset_token_expires"),
  // Two-factor authentication (TOTP)
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorSecret: varchar("two_factor_secret", { length: 64 }),
  twoFactorBackupCodes: json("two_factor_backup_codes").$type<string[]>(),
  // Sub-role for finer permissions within a tenant
  subRole: mysqlEnum("sub_role", ["owner", "manager", "agent", "viewer"]).default("owner").notNull(),
  // Incremented on every password change — used to invalidate existing JWTs
  passwordVersion: int("password_version").default(1).notNull(),
  // ── Subscription & Trial ─────────────────────────────────────────────────
  accountStatus: mysqlEnum("account_status", ["trial_active", "trial_expired", "active_paid", "suspended"]).default("trial_active").notNull(),
  trialStartDate: datetime("trial_start_date"),
  trialEndDate:   datetime("trial_end_date"),
  // trial reminder flags — prevents duplicate emails
  trialReminder10Sent: boolean("trial_reminder_10_sent").default(false).notNull(),
  trialReminder13Sent: boolean("trial_reminder_13_sent").default(false).notNull(),
  trialReminder14Sent: boolean("trial_reminder_14_sent").default(false).notNull(),
  // ── Email Verification ───────────────────────────────────────────────────
  // emailVerified = false until the user confirms the 6-digit OTP sent on signup.
  // Trial clock only starts AFTER successful verification.
  emailVerified:                  boolean("email_verified").default(false).notNull(),
  emailVerificationCode:          varchar("email_verification_code", { length: 255 }), // bcrypt hash of OTP
  emailVerificationExpires:       datetime("email_verification_expires"),
  emailVerificationAttempts:      int("email_verification_attempts").default(0).notNull(), // brute-force counter
  emailVerificationResendCount:   int("email_verification_resend_count").default(0).notNull(),
  emailVerificationResendWindowAt: datetime("email_verification_resend_window_at"), // window start for resend rate-limit
});

// BOT CONFIG
export const botConfig = mysqlTable("bot_config", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  businessName: varchar("business_name", { length: 255 }).default("My Business").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  enableBusinessHours: boolean("enable_business_hours").default(false).notNull(),
  businessHoursStart: varchar("business_hours_start", { length: 5 }).default("09:00").notNull(),
  businessHoursEnd: varchar("business_hours_end", { length: 5 }).default("17:00").notNull(),
  businessDays: varchar("business_days", { length: 20 }).default("1,2,3,4,5").notNull(),
  timezone: varchar("timezone", { length: 100 }).default("Africa/Johannesburg").notNull(),
  afterHoursMessage: text("after_hours_message").notNull(),
  whatsappPhoneNumberId: varchar("whatsapp_phone_number_id", { length: 255 }).default("").notNull(),
  whatsappBusinessAccountId: varchar("whatsapp_business_account_id", { length: 255 }).default("").notNull(),
  whatsappAccessToken: text("whatsapp_access_token").default("").notNull(),
  whatsappWebhookToken: varchar("whatsapp_webhook_token", { length: 255 }).default("").notNull(),
  aiModel: varchar("ai_model", { length: 100 }).default("llama3.2").notNull(),
  aiApiUrl: varchar("ai_api_url", { length: 255 }).default("http://localhost:11434/v1").notNull(),
  aiApiKey: text("ai_api_key").default("ollama").notNull(),
  aiTemperature: decimal("ai_temperature", { precision: 3, scale: 2 }).default("0.7").notNull(),
  maxTokens: int("max_tokens").default(500).notNull(),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  enableMultiLanguage: boolean("enable_multi_language").default(false).notNull(),
  enableSentimentAnalysis: boolean("enable_sentiment_analysis").default(true).notNull(),
  enableGoogleCalendar: boolean("enable_google_calendar").default(false).notNull(),
  enableVoiceTranscription: boolean("enable_voice_transcription").default(false).notNull(),
  enableVoiceResponse: boolean("enable_voice_response").default(false).notNull(),
  ttsVoice: varchar("tts_voice", { length: 50 }).default("alloy").notNull(),
  whisperApiUrl: varchar("whisper_api_url", { length: 255 }).default("").notNull(),
  twilioAccountSid: varchar("twilio_account_sid", { length: 255 }).default("").notNull(),
  twilioAuthToken: text("twilio_auth_token").default("").notNull(),
  twilioPhoneNumber: varchar("twilio_phone_number", { length: 50 }).default("").notNull(),
  smtpHost: varchar("smtp_host", { length: 255 }).default("").notNull(),
  smtpPort: int("smtp_port").default(587).notNull(),
  smtpUser: varchar("smtp_user", { length: 255 }).default("").notNull(),
  smtpPass: text("smtp_pass").default("").notNull(),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  // Notification preferences
  enableDailySummary: boolean("enable_daily_summary").default(true).notNull(),
  enableWeeklyReport: boolean("enable_weekly_report").default(true).notNull(),
  enableFollowUp: boolean("enable_follow_up").default(true).notNull(),
  enableNoShowNotify: boolean("enable_no_show_notify").default(true).notNull(),
  enableReEngagement: boolean("enable_re_engagement").default(false).notNull(),
  reEngagementDays: int("re_engagement_days").default(30).notNull(),
  reEngagementMessage: text("re_engagement_message"),
  enableApptConfirmation: boolean("enable_appt_confirmation").default(true).notNull(),
  // Outbound webhook
  enableWebhook: boolean("enable_webhook").default(false).notNull(),
  webhookUrl: varchar("webhook_url", { length: 1000 }).default("").notNull(),
  // AI fallback
  aiFallbackModel: varchar("ai_fallback_model", { length: 100 }).default("").notNull(),
  aiFallbackApiUrl: varchar("ai_fallback_api_url", { length: 255 }).default("").notNull(),
  aiFallbackApiKey: text("ai_fallback_api_key"),
  // Birthday messages
  enableBirthdayMessages: boolean("enable_birthday_messages").default(false).notNull(),
  birthdayMessage: text("birthday_message"),
  // Conversation auto-close
  enableConversationAutoClose: boolean("enable_conversation_auto_close").default(false).notNull(),
  autoCloseDays: int("auto_close_days").default(7).notNull(),
  // Public booking page
  bookingSlug: varchar("booking_slug", { length: 100 }),
  bookingPageTitle: varchar("booking_page_title", { length: 255 }).default("Book an Appointment"),
  bookingPageDescription: text("booking_page_description"),
  // Deposit collection
  depositRequired: boolean("deposit_required").default(false).notNull(),
  depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }).default("0.00").notNull(),
  paymentLinkTemplate: varchar("payment_link_template", { length: 1000 }).default("").notNull(),
  // Advert / business profile
  businessWhatsappNumber: varchar("business_whatsapp_number", { length: 30 }),
  businessWebsite: varchar("business_website", { length: 500 }),
  businessTagline: varchar("business_tagline", { length: 500 }),
  businessLogoUrl: varchar("business_logo_url", { length: 1000 }),
  // SMS fallback + service menu
  enableSmsFallback:   tinyint("enable_sms_fallback").default(0).notNull(),
  enableServiceMenu:   tinyint("enable_service_menu").default(0).notNull(),
  serviceMenuTrigger:  varchar("service_menu_trigger", { length: 255 }),
  // Interactive numbered menu (admin-configurable)
  enableMenuMode:  tinyint("enable_menu_mode").default(0).notNull(),
  menuTrigger:     varchar("menu_trigger", { length: 255 }).default("menu"),
  menuGreeting:    text("menu_greeting"),
  menuFooter:      varchar("menu_footer", { length: 500 }),
  // Loyalty program
  loyaltyEnabled: tinyint("loyalty_enabled").default(0).notNull(),
  loyaltyPointsPerVisit: int("loyalty_points_per_visit").default(10).notNull(),
  loyaltyBronzeThreshold: int("loyalty_bronze_threshold").default(0).notNull(),
  loyaltySilverThreshold: int("loyalty_silver_threshold").default(50).notNull(),
  loyaltyGoldThreshold: int("loyalty_gold_threshold").default(150).notNull(),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// BOT MENU OPTIONS — numbered menu items per tenant (admin-configurable)
export const botMenuOptions = mysqlTable("bot_menu_options", {
  id:          int("id").primaryKey().autoincrement(),
  tenantId:    int("tenant_id").notNull(),
  itemNumber:  int("item_number").notNull(),           // 1-9 digit customer presses
  title:       varchar("title", { length: 255 }).notNull(),
  description: varchar("description", { length: 500 }),
  response:    text("response").notNull(),
  // 'reply' = send the response text
  // 'escalate' = hand to human agent
  // 'booking' = redirect to booking flow
  // 'kb_search' = search KB and reply with top result
  actionType:  varchar("action_type", { length: 50 }).default("reply").notNull(),
  isActive:    tinyint("is_active").default(1).notNull(),
  sortOrder:   int("sort_order").default(0).notNull(),
  createdAt:   datetime("created_at").$defaultFn(() => new Date()),
  updatedAt:   datetime("updated_at").$defaultFn(() => new Date()),
});

// CONVERSATIONS
export const conversations = mysqlTable("conversations", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  message: text("message").notNull(),
  response: text("response"),
  source: mysqlEnum("source", ["template", "ai", "agent", "after_hours"]).notNull(),
  templateId: int("template_id"),
  agentId: int("agent_id"),
  language: varchar("language", { length: 10 }).default("en"),
  sentiment: mysqlEnum("sentiment", ["positive", "neutral", "negative"]),
  isEscalated: boolean("is_escalated").default(false).notNull(),
  isResolved: boolean("is_resolved").default(false).notNull(),
  resolvedAt: datetime("resolved_at"),
  responseTimeMs: int("response_time_ms"),
  // Media attachment fields
  mediaUrl: varchar("media_url", { length: 1000 }),
  mediaType: mysqlEnum("media_type", ["image", "video", "audio", "document", "sticker"]),
  mediaCaption: varchar("media_caption", { length: 1000 }),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  phoneIdx: index("phone_idx").on(t.phoneNumber),
  createdAtIdx: index("created_at_idx").on(t.createdAt),
  sourceIdx: index("source_idx").on(t.source),
}));

// TEMPLATES
export const templates = mysqlTable("templates", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  trigger: varchar("trigger", { length: 1000 }).notNull().default(""),
  keywords: json("keywords").$type<string[]>().notNull(),
  response: text("response").notNull(),
  category: varchar("category", { length: 100 }).default("general"),
  language: varchar("language", { length: 10 }).default("en"),
  isActive: boolean("is_active").default(true).notNull(),
  matchCount: int("match_count").default(0).notNull(),
  priority: int("priority").default(0).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// KNOWLEDGE BASE
export const knowledgeBase = mysqlTable("knowledge_base", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  type: mysqlEnum("type", ["pdf", "link", "text", "docx", "txt"]).default("text").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }).default("general"),
  tags: json("tags").$type<string[]>().default([]),
  sourceUrl: varchar("source_url", { length: 1000 }),
  fileName: varchar("file_name", { length: 255 }),
  fileSize: int("file_size"),
  status: mysqlEnum("status", ["pending", "processing", "ready", "error"]).default("ready").notNull(),
  processingError: text("processing_error"),
  lastSyncAt: datetime("last_sync_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// CUSTOMERS
export const customers = mysqlTable("customers", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  location: varchar("location", { length: 500 }),
  notes: text("notes"),
  tags: json("tags").$type<string[]>().default([]),
  totalAppointments: int("total_appointments").default(0).notNull(),
  completedAppointments: int("completed_appointments").default(0).notNull(),
  noShows: int("no_shows").default(0).notNull(),
  lifetimeValue: decimal("lifetime_value", { precision: 10, scale: 2 }).default("0.00").notNull(),
  preferredLanguage: varchar("preferred_language", { length: 10 }).default("en"),
  optedOut: boolean("opted_out").default(false).notNull(),
  lastReEngagementAt: datetime("last_re_engagement_at"),
  dateOfBirth: datetime("date_of_birth"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantPhoneUnique: uniqueIndex("customers_tenant_phone_unique").on(t.tenantId, t.phoneNumber),
}));

// SERVICES
export const services = mysqlTable("services", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  duration: int("duration").default(60).notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).default("0.00").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  color: varchar("color", { length: 7 }).default("#25D366"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("idx_services_tenant").on(t.tenantId),
}));

// APPOINTMENTS
export const appointments = mysqlTable("appointments", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  customerId: int("customer_id").notNull(),
  serviceId: int("service_id").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  time: varchar("time", { length: 5 }).notNull(),
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled", "no_show"]).default("scheduled").notNull(),
  notes: text("notes"),
  reminderSent: boolean("reminder_sent").default(false).notNull(),
  reminder1hSent: boolean("reminder_1h_sent").default(false).notNull(),
  satisfactionScore: int("satisfaction_score"),
  googleCalendarEventId: varchar("google_calendar_event_id", { length: 500 }),
  confirmationSent: boolean("confirmation_sent").default(false).notNull(),
  // Staff assignment
  staffId: int("staff_id"),
  // Recurring appointments
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurrencePattern: mysqlEnum("recurrence_pattern", ["weekly", "fortnightly", "monthly"]),
  recurrenceEndDate: varchar("recurrence_end_date", { length: 10 }),
  parentAppointmentId: int("parent_appointment_id"),
  // Deposit
  depositPaid: boolean("deposit_paid").default(false).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  dateIdx: index("date_idx").on(t.date),
  customerIdx: index("customer_idx").on(t.customerId),
  tenantIdx: index("idx_appt_tenant").on(t.tenantId),
}));

// AVAILABLE SLOTS
export const availableSlots = mysqlTable("available_slots", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  dayOfWeek: int("day_of_week").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  slotDuration: int("slot_duration").default(60).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  maxBookingsPerSlot: int("max_bookings_per_slot").default(1).notNull(),
}, (t) => ({
  tenantIdx: index("idx_avail_slots_tenant").on(t.tenantId),
}));

// HOLIDAYS
export const holidays = mysqlTable("holidays", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantDateUnique: uniqueIndex("holidays_tenant_date_unique").on(t.tenantId, t.date),
  tenantIdx: index("idx_holidays_tenant").on(t.tenantId),
}));

// AGENTS
export const agents = mysqlTable("agents", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 50 }),
  status: mysqlEnum("status", ["available", "busy", "offline"]).default("offline").notNull(),
  role: varchar("role", { length: 100 }).default("receptionist").notNull(),
  escalationCount: int("escalation_count").default(0).notNull(),
  avgResponseTime: int("avg_response_time").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastActiveAt: datetime("last_active_at"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// ESCALATION RULES
export const escalationRules = mysqlTable("escalation_rules", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  triggerKeywords: json("trigger_keywords").$type<string[]>().notNull(),
  assignToAgentId: int("assign_to_agent_id"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// CONVERSATION ASSIGNMENTS
export const conversationAssignments = mysqlTable("conversation_assignments", {
  id: int("id").primaryKey().autoincrement(),
  conversationId: int("conversation_id").notNull(),
  agentId: int("agent_id").notNull(),
  assignedAt: datetime("assigned_at").notNull().$defaultFn(() => new Date()),
  resolvedAt: datetime("resolved_at"),
  status: mysqlEnum("status", ["active", "resolved", "transferred"]).default("active").notNull(),
  notes: text("notes"),
});

// AGENT METRICS
export const agentMetrics = mysqlTable("agent_metrics", {
  id: int("id").primaryKey().autoincrement(),
  agentId: int("agent_id").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  conversationsHandled: int("conversations_handled").default(0).notNull(),
  avgResponseTime: int("avg_response_time").default(0).notNull(),
  satisfactionScore: decimal("satisfaction_score", { precision: 3, scale: 2 }),
  escalationsReceived: int("escalations_received").default(0).notNull(),
  escalationsResolved: int("escalations_resolved").default(0).notNull(),
});

// NOTIFICATION TEMPLATES
export const notificationTemplates = mysqlTable("notification_templates", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["sms", "email", "whatsapp"]).notNull(),
  subject: varchar("subject", { length: 500 }),
  body: text("body").notNull(),
  variables: json("variables").$type<string[]>().default([]),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// NOTIFICATION LOGS
export const notificationLogs = mysqlTable("notification_logs", {
  id: int("id").primaryKey().autoincrement(),
  templateId: int("template_id"),
  type: mysqlEnum("type", ["sms", "email", "whatsapp"]).notNull(),
  recipient: varchar("recipient", { length: 255 }).notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["sent", "failed", "pending"]).default("pending").notNull(),
  errorMessage: text("error_message"),
  sentAt: datetime("sent_at"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// TAGS
export const tags = mysqlTable("tags", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  color: varchar("color", { length: 7 }).default("#25D366").notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// CONVERSATION TAGS
export const conversationTags = mysqlTable("conversation_tags", {
  id: int("id").primaryKey().autoincrement(),
  conversationId: int("conversation_id").notNull(),
  tagId: int("tag_id").notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// SURVEYS
export const surveys = mysqlTable("surveys", {
  id: int("id").primaryKey().autoincrement(),
  conversationId: int("conversation_id").notNull(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  score: int("score"),
  feedback: text("feedback"),
  sentAt: datetime("sent_at").notNull().$defaultFn(() => new Date()),
  respondedAt: datetime("responded_at"),
  status: mysqlEnum("status", ["sent", "responded", "expired"]).default("sent").notNull(),
});

// WEBHOOK LOGS
export const webhookLogs = mysqlTable("webhook_logs", {
  id: int("id").primaryKey().autoincrement(),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  phoneNumber: varchar("phone_number", { length: 50 }),
  messageId: varchar("message_id", { length: 255 }),
  payload: json("payload").notNull(),
  status: mysqlEnum("status", ["success", "error"]).notNull(),
  errorMessage: text("error_message"),
  processingTimeMs: int("processing_time_ms"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  createdAtIdx: index("webhook_created_at_idx").on(t.createdAt),
}));

// SPAM LOGS
export const spamLogs = mysqlTable("spam_logs", {
  id: int("id").primaryKey().autoincrement(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  message: text("message").notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  messageCount: int("message_count").default(1).notNull(),
  blockedUntil: datetime("blocked_until"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// BUSINESS RULES
export const businessRules = mysqlTable("business_rules", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  triggerType: mysqlEnum("trigger_type", ["keyword", "time", "sentiment", "escalation", "appointment"]).notNull(),
  triggerConfig: json("trigger_config").notNull(),
  actionType: mysqlEnum("action_type", ["send_message", "notify_agent", "book_appointment", "tag_conversation", "escalate"]).notNull(),
  actionConfig: json("action_config").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  executionCount: int("execution_count").default(0).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("br_tenant_idx").on(t.tenantId),
}));

// AUTOMATED FOLLOW-UPS
export const automatedFollowUps = mysqlTable("automated_follow_ups", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  triggerEvent: mysqlEnum("trigger_event", ["appointment_booked", "appointment_reminder", "no_show", "post_appointment", "survey"]).notNull(),
  delayHours: int("delay_hours").default(24).notNull(),
  message: text("message").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sentCount: int("sent_count").default(0).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// GOOGLE CALENDAR INTEGRATION
export const googleCalendarIntegration = mysqlTable("google_calendar_integration", {
  id: int("id").primaryKey().autoincrement(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  calendarId: varchar("calendar_id", { length: 255 }).default("primary"),
  syncEnabled: boolean("sync_enabled").default(false).notNull(),
  lastSyncAt: datetime("last_sync_at"),
  expiresAt: datetime("expires_at"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// PHONE CALLS
export const phoneCalls = mysqlTable("phone_calls", {
  id: int("id").primaryKey().autoincrement(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  status: mysqlEnum("status", ["answered", "missed", "voicemail", "busy"]).notNull(),
  duration: int("duration"),
  agentId: int("agent_id"),
  notes: text("notes"),
  twilioCallSid: varchar("twilio_call_sid", { length: 255 }),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// CALL QUEUE
export const callQueue = mysqlTable("call_queue", {
  id: int("id").primaryKey().autoincrement(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("status", ["waiting", "assigned", "completed", "abandoned"]).default("waiting").notNull(),
  assignedAgentId: int("assigned_agent_id"),
  reason: text("reason"),
  waitTimeMinutes: int("wait_time_minutes").default(0).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// STAFF NOTIFICATIONS
export const staffNotifications = mysqlTable("staff_notifications", {
  id: int("id").primaryKey().autoincrement(),
  agentId: int("agent_id").notNull(),
  type: mysqlEnum("type", ["escalation", "appointment", "urgent", "system"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  conversationId: int("conversation_id"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// MESSAGE STATUS
export const messageStatus = mysqlTable("message_status", {
  id: int("id").primaryKey().autoincrement(),
  messageId: varchar("message_id", { length: 255 }).notNull().unique(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["sent", "delivered", "read", "failed"]).notNull(),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
});

// RATE LIMITS
export const rateLimits = mysqlTable("rate_limits", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  messageCount: int("message_count").default(0).notNull(),
  windowStart: datetime("window_start").notNull().$defaultFn(() => new Date()),
  isBlocked: boolean("is_blocked").default(false).notNull(),
  blockedUntil: datetime("blocked_until"),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantPhoneUnique: uniqueIndex("rate_limits_tenant_phone_unique").on(t.tenantId, t.phoneNumber),
}));

// LICENSES / INSTANCES
// One license per client. Cloud tenants have selfHosted=false; self-hosted clients have selfHosted=true
// and phone home so Nathan can monitor them from his admin dashboard.
export const licenses = mysqlTable("licenses", {
  id: int("id").primaryKey().autoincrement(),

  // The license key sent to the client (cloud or self-hosted)
  licenseKey: varchar("license_key", { length: 64 }).notNull().unique(),

  // Linked cloud tenant (null = self-hosted only, no cloud account)
  tenantId: int("tenant_id"),

  // Client details
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientEmail: varchar("client_email", { length: 255 }).notNull(),

  // Plan info (mirrors users.plan for self-hosted clients)
  plan: mysqlEnum("plan", ["free", "starter", "pro", "enterprise"]).default("free").notNull(),
  expiresAt: datetime("expires_at"),
  isActive: boolean("is_active").default(true).notNull(),

  // Hosting type
  selfHosted: boolean("self_hosted").default(false).notNull(),
  // For self-hosted: the URL the client's WAFlow is running at (set on first heartbeat)
  instanceUrl: varchar("instance_url", { length: 500 }),
  // WAFlow version the client is running
  instanceVersion: varchar("instance_version", { length: 50 }),
  // Last time the self-hosted instance phoned home
  lastHeartbeatAt: datetime("last_heartbeat_at"),
  // Latest health/status data from the self-hosted instance
  lastHeartbeatData: json("last_heartbeat_data"),

  // Invite token (for client to accept and set password)
  inviteToken: varchar("invite_token", { length: 128 }),
  inviteExpiresAt: datetime("invite_expires_at"),
  inviteAcceptedAt: datetime("invite_accepted_at"),

  notes: text("notes"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  licenseKeyIdx: uniqueIndex("license_key_idx").on(t.licenseKey),
  clientEmailIdx: index("license_client_email_idx").on(t.clientEmail),
}));

// CONVERSATION FLOWS (replaces file-based data/flows.json)
export const conversationFlows = mysqlTable("conversation_flows", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  flowId: varchar("flow_id", { length: 50 }).notNull(),   // client-assigned UUID
  name: varchar("name", { length: 120 }).notNull(),
  trigger: varchar("trigger", { length: 500 }).notNull(),
  nodes: json("nodes").notNull(),                          // FlowNode[]
  isActive: boolean("is_active").default(false).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("cf_tenant_idx").on(t.tenantId),
  flowIdIdx: index("cf_flow_id_idx").on(t.flowId, t.tenantId),
}));

// IT SUPPORT TICKETS (replaces file-based data/it_tickets.json)
export const itSupportTickets = mysqlTable("it_support_tickets", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  ticketId: varchar("ticket_id", { length: 50 }).notNull(),  // client-assigned UUID
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  category: varchar("category", { length: 100 }).notNull(),
  priority: mysqlEnum("priority", ["high", "medium", "low"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "resolved", "escalated"]).default("open").notNull(),
  description: text("description").notNull(),
  answers: json("answers").notNull(),
  diagnosis: text("diagnosis"),
  slaDeadlineAt: datetime("sla_deadline_at"),
  resolvedAt: datetime("resolved_at"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("its_tenant_idx").on(t.tenantId),
  statusIdx: index("its_status_idx").on(t.status),
}));

// RELATIONS
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  template: one(templates, { fields: [conversations.templateId], references: [templates.id] }),
  agent: one(agents, { fields: [conversations.agentId], references: [agents.id] }),
  tags: many(conversationTags),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  appointments: many(appointments),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  customer: one(customers, { fields: [appointments.customerId], references: [customers.id] }),
  service: one(services, { fields: [appointments.serviceId], references: [services.id] }),
}));

export const agentsRelations = relations(agents, ({ many }) => ({
  assignments: many(conversationAssignments),
  metrics: many(agentMetrics),
  notifications: many(staffNotifications),
}));

// AUDIT LOGS
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  userId: int("user_id"),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: int("entity_id"),
  details: json("details").$type<Record<string, unknown>>(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("idx_audit_tenant").on(t.tenantId),
  createdIdx: index("idx_audit_created").on(t.createdAt),
}));

// STAFF (per-tenant employees / practitioners)
export const staff = mysqlTable("staff", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  bio: text("bio"),
  color: varchar("color", { length: 7 }).default("#6366f1").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // Per-staff working hours: { mon: { start:"09:00", end:"17:00", enabled:true }, ... }
  // Keys: sun mon tue wed thu fri sat
  workingHours: json("working_hours").$type<Record<string, { start: string; end: string; enabled: boolean }>>(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("idx_staff_tenant").on(t.tenantId),
}));

// WAITLIST
export const waitlist = mysqlTable("waitlist", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  serviceId: int("service_id").notNull(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }),
  requestedDate: varchar("requested_date", { length: 10 }),  // preferred date YYYY-MM-DD
  notifiedAt: datetime("notified_at"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("idx_waitlist_tenant").on(t.tenantId),
  serviceIdx: index("idx_waitlist_service").on(t.serviceId),
}));

// ── BROADCAST SCHEDULES ───────────────────────────────────────────────────────
export const broadcastSchedules = mysqlTable("broadcast_schedules", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  message: text("message").notNull(),
  filter: varchar("filter", { length: 50 }),
  phoneNumbers: json("phone_numbers").$type<string[]>(),
  scheduledAt: datetime("scheduled_at").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  sentAt: datetime("sent_at"),
  recipientCount: int("recipient_count"),
  errorMessage: text("error_message"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("idx_bcast_sched_tenant").on(t.tenantId),
  statusIdx: index("idx_bcast_sched_status").on(t.status),
}));

// ── LOYALTY POINTS ────────────────────────────────────────────────────────────
export const loyaltyPoints = mysqlTable("loyalty_points", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  customerId: int("customer_id").notNull(),
  phoneNumber: varchar("phone_number", { length: 30 }).notNull(),
  points: int("points").default(0).notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("idx_loyalty_tenant").on(t.tenantId),
  customerIdx: index("idx_loyalty_customer").on(t.customerId),
}));

// ── SELF-SERVICE TOKENS ───────────────────────────────────────────────────────
export const selfServiceTokens = mysqlTable("self_service_tokens", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  customerId: int("customer_id"),
  phoneNumber: varchar("phone_number", { length: 30 }).notNull(),
  token: varchar("token", { length: 100 }).notNull(),
  expiresAt: datetime("expires_at").notNull(),
  usedAt: datetime("used_at"),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tokenIdx: uniqueIndex("uq_self_svc_token").on(t.token),
  tenantIdx: index("idx_self_svc_tenant").on(t.tenantId),
}));

// ── BOOKING ATTEMPTS (abandoned recovery) ────────────────────────────────────
export const bookingAttempts = mysqlTable("booking_attempts", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  phoneNumber: varchar("phone_number", { length: 30 }).notNull(),
  name: varchar("name", { length: 255 }),
  serviceId: int("service_id"),
  attemptedDate: varchar("attempted_date", { length: 20 }),
  slug: varchar("slug", { length: 100 }),
  abandonedAt: datetime("abandoned_at").notNull(),
  followUpSent: tinyint("follow_up_sent").default(0).notNull(),
  followUpSentAt: datetime("follow_up_sent_at"),
  converted: tinyint("converted").default(0).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("idx_booking_attempt_tenant").on(t.tenantId),
}));

// ── OUTBOUND WEBHOOKS ─────────────────────────────────────────────────────────
export const outboundWebhooks = mysqlTable("outbound_webhooks", {
  id:              int("id").primaryKey().autoincrement(),
  tenantId:        int("tenant_id").notNull(),
  name:            varchar("name", { length: 255 }).notNull(),
  url:             varchar("url", { length: 1000 }).notNull(),
  events:          json("events").$type<string[]>().notNull(),
  secret:          varchar("secret", { length: 255 }),
  isActive:        tinyint("is_active").default(1).notNull(),
  lastTriggeredAt: datetime("last_triggered_at"),
  failureCount:    int("failure_count").default(0).notNull(),
  createdAt:       datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("idx_ow_tenant").on(t.tenantId),
}));

export const outboundWebhookLogs = mysqlTable("outbound_webhook_logs", {
  id:           int("id").primaryKey().autoincrement(),
  webhookId:    int("webhook_id").notNull(),
  tenantId:     int("tenant_id").notNull(),
  event:        varchar("event", { length: 100 }).notNull(),
  payload:      json("payload").$type<Record<string, unknown>>().notNull(),
  status:       varchar("status", { length: 20 }).default("pending").notNull(),
  responseCode: int("response_code"),
  responseBody: text("response_body"),
  errorMessage: text("error_message"),
  attempt:      int("attempt").default(1).notNull(),
  createdAt:    datetime("created_at").notNull().$defaultFn(() => new Date()),
});

// ── CUSTOM FIELDS ─────────────────────────────────────────────────────────────
export const customFieldDefinitions = mysqlTable("custom_field_definitions", {
  id:         int("id").primaryKey().autoincrement(),
  tenantId:   int("tenant_id").notNull(),
  fieldKey:   varchar("field_key", { length: 100 }).notNull(),
  label:      varchar("label", { length: 255 }).notNull(),
  fieldType:  varchar("field_type", { length: 20 }).default("text").notNull(),
  options:    json("options").$type<string[]>(),
  isRequired: tinyint("is_required").default(0).notNull(),
  isActive:   tinyint("is_active").default(1).notNull(),
  sortOrder:  int("sort_order").default(0).notNull(),
  createdAt:  datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("idx_cfd_tenant").on(t.tenantId),
}));

export const customFieldValues = mysqlTable("custom_field_values", {
  id:         int("id").primaryKey().autoincrement(),
  tenantId:   int("tenant_id").notNull(),
  customerId: int("customer_id").notNull(),
  fieldKey:   varchar("field_key", { length: 100 }).notNull(),
  value:      text("value"),
  updatedAt:  datetime("updated_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  customerIdx: index("idx_cfv_customer").on(t.customerId),
}));

// ── PAYMENT HISTORY ──────────────────────────────────────────────────────────
export const paymentHistory = mysqlTable("payment_history", {
  id:             int("id").primaryKey().autoincrement(),
  tenantId:       int("tenant_id").notNull(),
  plan:           varchar("plan", { length: 50 }).notNull(),
  billingCycle:   mysqlEnum("billing_cycle", ["monthly", "yearly", "once"]).default("monthly").notNull(),
  amountZar:      decimal("amount_zar", { precision: 10, scale: 2 }).notNull(),
  currency:       varchar("currency", { length: 10 }).default("ZAR").notNull(),
  paymentRef:     varchar("payment_ref", { length: 128 }).notNull(),   // our internal ref
  easypayRef:     varchar("easypay_ref", { length: 128 }),             // Easypay reference number
  easypayNumber:  varchar("easypay_number", { length: 50 }),           // Easypay account number for payment
  status:         mysqlEnum("status", ["pending", "paid", "failed", "refunded"]).default("pending").notNull(),
  paidAt:         datetime("paid_at"),
  metadata:       json("metadata").$type<Record<string, unknown>>(),
  createdAt:      datetime("created_at").notNull().$defaultFn(() => new Date()),
}, (t) => ({
  tenantIdx: index("idx_payments_tenant").on(t.tenantId),
  refIdx:    index("idx_payments_ref").on(t.paymentRef),
}));

// ── RECEPTIONIST LEADS ────────────────────────────────────────────────────────
// Visitors who chatted with the live AI receptionist before signing up
export const receptionistLeads = mysqlTable("receptionist_leads", {
  id:        int("id").primaryKey().autoincrement(),
  name:      varchar("name", { length: 255 }).notNull(),
  email:     varchar("email", { length: 255 }).notNull(),
  phone:     varchar("phone", { length: 30 }),
  notes:     text("notes"),
  sessionId: varchar("session_id", { length: 128 }).notNull(),
  converted: boolean("converted").default(false).notNull(),
  createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});
