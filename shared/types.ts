export interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "user";
  createdAt: Date;
}

export interface BotConfig {
  id: number;
  businessName: string;
  systemPrompt: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: string;
  timezone: string;
  afterHoursMessage: string;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccountId: string;
  whatsappAccessToken: string;
  whatsappWebhookToken: string;
  aiModel: string;
  aiApiUrl: string;
  aiApiKey: string;
  aiTemperature: number;
  maxTokens: number;
  language: string;
  enableMultiLanguage: boolean;
  enableSentimentAnalysis: boolean;
  enableGoogleCalendar: boolean;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  updatedAt: Date;
}

export interface Conversation {
  id: number;
  phoneNumber: string;
  contactName: string | null;
  message: string;
  response: string | null;
  source: "template" | "ai" | "agent" | "after_hours";
  templateId: number | null;
  agentId: number | null;
  language: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  isEscalated: boolean;
  responseTimeMs: number | null;
  createdAt: Date;
}

export interface Template {
  id: number;
  name: string;
  keywords: string[];
  response: string;
  isActive: boolean;
  matchCount: number;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: number;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  location: string | null;
  notes: string | null;
  totalAppointments: number;
  lifetimeValue: number;
  preferredLanguage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Appointment {
  id: number;
  customerId: number;
  serviceId: number;
  date: string;
  time: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  notes: string | null;
  googleCalendarEventId: string | null;
  createdAt: Date;
}

export interface Service {
  id: number;
  name: string;
  description: string | null;
  duration: number;
  price: number;
  isActive: boolean;
  color: string;
}

export interface Agent {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: "available" | "busy" | "offline";
  role: string;
  escalationCount: number;
  avgResponseTime: number;
  createdAt: Date;
}

export interface KnowledgeBaseEntry {
  id: number;
  type: "pdf" | "link" | "text";
  title: string;
  content: string;
  contentPreview?: string;
  sourceUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  isActive: boolean;
  createdAt: Date;
}

export interface AnalyticsStats {
  totalConversations: number;
  totalToday: number;
  templateMatches: number;
  aiResponses: number;
  agentEscalations: number;
  afterHours: number;
  avgResponseTime: number;
  satisfactionScore: number | null;
  conversationsByHour: Array<{ hour: number; count: number }>;
  conversationsByDay: Array<{ date: string; count: number; source: string }>;
  languageBreakdown: Array<{ language: string; count: number }>;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
}
