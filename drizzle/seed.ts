import { db } from "../server/db.js";
import {
  botConfig, users, templates, services, agents,
  availableSlots, notificationTemplates, automatedFollowUps,
} from "./schema.js";
import bcrypt from "bcryptjs";
import { sql, eq } from "drizzle-orm";

export async function seed() {
  console.log("🌱 Seeding database...");

  const hashedPassword = await bcrypt.hash("admin123", 10);
  await db.insert(users).values({
    email: "admin@waflow.com",
    password: hashedPassword,
    name: "Admin User",
    role: "admin",
  }).onDuplicateKeyUpdate({ set: { name: "Admin User" } });

  // Get the admin user ID so botConfig is linked to the correct tenant
  const [adminUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@waflow.com")).limit(1);
  const adminId = adminUser?.id ?? 1;

  // Only insert botConfig if one doesn't already exist for this tenant
  const [existingConfig] = await db.select({ id: botConfig.id }).from(botConfig).where(eq(botConfig.tenantId, adminId)).limit(1);
  if (!existingConfig) {
    // ✅ Ensure AI config has proper defaults, not undefined values
    const aiApiUrl = process.env.AI_API_URL || "http://host.docker.internal:11434/v1";
    const aiApiKey = process.env.AI_API_KEY || "ollama";  // Default to ollama if not set

    await db.insert(botConfig).values({
      tenantId: adminId,
      businessName: "My Business",
      systemPrompt: `You are a helpful WhatsApp receptionist for My Business.
You assist customers with inquiries, appointments, and general information.
Be friendly, professional, and concise in your responses (under 200 words).
Always respond in the same language the customer is using.`,
      businessHoursStart: "09:00",
      businessHoursEnd: "17:00",
      businessDays: "1,2,3,4,5",
      timezone: "Africa/Johannesburg",
      afterHoursMessage: "Thank you for contacting us! Our business hours are Monday-Friday 9am-5pm SAST. We'll respond during business hours.",
      aiModel: process.env.AI_MODEL || "gemma4:latest",
      aiApiUrl: aiApiUrl,  // ✅ Always has a value
      aiApiKey: aiApiKey,  // ✅ Always has a value
      aiTemperature: "0.7",
      maxTokens: 500,
      language: "en",
    });
  }

  await db.insert(templates).values([
    {
      tenantId: adminId,
      name: "Greeting",
      trigger: "hello, hi, hey, good morning, good afternoon",
      keywords: ["hello", "hi", "hey", "good morning", "good afternoon"],
      response: "Hello! Welcome to My Business 👋 How can I help you today?",
      category: "greeting",
      language: "en",
      isActive: true,
      priority: 10,
    },
    {
      tenantId: adminId,
      name: "Hours",
      trigger: "hours, open, close, time, when",
      keywords: ["hours", "open", "close", "time", "when"],
      response: "Our business hours are Monday-Friday 9am-5pm SAST. We're closed on weekends and public holidays.",
      category: "faq",
      language: "en",
      isActive: true,
      priority: 5,
    },
    {
      tenantId: adminId,
      name: "Appointment",
      trigger: "book, appointment, schedule, reserve, booking",
      keywords: ["book", "appointment", "schedule", "reserve", "booking"],
      response: "I'd love to help you book an appointment! Please let me know:\n1. What service you need\n2. Your preferred date and time\n3. Your name",
      category: "booking",
      language: "en",
      isActive: true,
      priority: 8,
    },
    {
      tenantId: adminId,
      name: "Price",
      trigger: "price, cost, how much, fee, rate",
      keywords: ["price", "cost", "how much", "fee", "rate"],
      response: "For pricing information please contact us directly. Our team will be happy to provide a detailed quote based on your needs.",
      category: "faq",
      language: "en",
      isActive: true,
      priority: 5,
    },
    {
      tenantId: adminId,
      name: "Thanks",
      trigger: "thank, thanks, thank you, thx",
      keywords: ["thank", "thanks", "thank you", "thx"],
      response: "You're welcome! Is there anything else I can help you with? 😊",
      category: "closing",
      language: "en",
      isActive: true,
      priority: 3,
    },
  ]).onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)` } });

  await db.insert(services).values([
    { name: "Consultation", description: "30-minute initial consultation", duration: 30, price: "0.00", color: "#25D366" },
    { name: "Standard Service", description: "Standard service appointment", duration: 60, price: "500.00", color: "#128C7E" },
    { name: "Premium Service", description: "Premium 2-hour service", duration: 120, price: "1200.00", color: "#075E54" },
  ]).onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)` } });

  for (let day = 1; day <= 5; day++) {
    await db.insert(availableSlots).values({
      dayOfWeek: day,
      startTime: "09:00",
      endTime: "17:00",
      slotDuration: 60,
      isActive: true,
      maxBookingsPerSlot: 1,
    }).onDuplicateKeyUpdate({ set: { isActive: true } });
  }

  await db.insert(agents).values({
    name: "Support Agent",
    email: "agent@waflow.com",
    role: "receptionist",
    status: "offline",
  }).onDuplicateKeyUpdate({ set: { name: "Support Agent" } });

  await db.insert(notificationTemplates).values([
    {
      name: "Appointment Confirmation",
      type: "whatsapp",
      body: "Hi {customerName}! Your appointment for {serviceName} is confirmed for {date} at {time}.",
      variables: ["customerName", "serviceName", "date", "time"],
    },
    {
      name: "Appointment Reminder",
      type: "whatsapp",
      body: "Reminder: You have an appointment for {serviceName} tomorrow at {time}.",
      variables: ["serviceName", "time"],
    },
  ]).onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)` } });

  await db.insert(automatedFollowUps).values([
    {
      name: "Post-Appointment Survey",
      triggerEvent: "post_appointment",
      delayHours: 24,
      message: "Hi! We hope your appointment went well. Please rate your experience 1-5 (5 = excellent).",
      isActive: true,
    },
  ]).onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)` } });

  console.log("✅ Database seeded! Login: admin@waflow.com / admin123");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
