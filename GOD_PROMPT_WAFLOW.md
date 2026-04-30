# WAFlow — God Prompt for Complete Project Implementation

## Project Overview

**WAFlow** is a **multi-tenant WhatsApp SaaS platform** that enables businesses to:
- Connect a WhatsApp number via QR code (whatsapp-web.js)
- Configure an AI receptionist (powered by Groq)
- Manage customer relationships (CRM)
- Handle appointment bookings and scheduling
- Maintain a knowledge base for AI context
- Send broadcast messages
- Track analytics and customer interactions
- Manage staff/team members

**Key Insight:** Each registered user IS a tenant. Their `users.id` becomes their `tenantId` used everywhere. All data is isolated per tenant via `tenantId` filtering.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js 18+ + Express + tRPC v11 |
| **Database** | MySQL 8+ (mysql2 driver) |
| **ORM** | Drizzle ORM (fully typed) |
| **Realtime** | Socket.IO |
| **Frontend** | React 19 + Vite 5 + TypeScript |
| **Styling** | TailwindCSS 3.4+ |
| **Data Fetching** | TanStack Query v5 + tRPC React |
| **Auth** | JWT (httpOnly cookies, 7-day expiry) + bcrypt + TOTP 2FA |
| **WhatsApp** | whatsapp-web.js (Puppeteer-based, local QR) |
| **AI** | Groq API only (llama-3.1-8b-instant recommended) |
| **Encryption** | AES-256-GCM (for sensitive DB fields) |
| **Build** | pnpm 8.15+, tsx (dev), tsc (prod), Vite (client) |
| **Tests** | Vitest |
| **Security** | Helmet, rate limiters, HMAC webhook verification |

---

## Project Structure

```
waflow/
├── server/
│   ├── index.ts                    # Express app, Socket.IO, tRPC handler, middlewares
│   ├── trpc.ts                     # tRPC router setup, context, procedures
│   ├── auth.ts                     # JWT, bcrypt, password hashing, token validation
│   ├── db.ts                       # Drizzle MySQL connection pool
│   ├── routers.ts                  # Combines all routers
│   ├── routers/                    # 30+ routers (auth, botConfig, whatsapp, etc.)
│   ├── services/                   # Business logic (pipeline, AI, KB, bookings)
│   ├── middleware/
│   │   ├── rateLimiter.ts          # Sliding window + brute force tracking
│   │   └── authMiddleware.ts       # JWT validation
│   ├── whatsapp/
│   │   ├── WhatsAppWebManager.ts   # Multi-tenant WWJS client management
│   │   ├── messagePipeline.ts      # Inbound message flow (core logic)
│   │   └── inputSanitizer.ts       # Prompt injection detection
│   ├── services/
│   │   ├── encryptionService.ts    # AES-256-GCM encryption
│   │   ├── templateService.ts      # Template matching
│   │   ├── bookingService.ts       # Appointment logic
│   │   └── kbService.ts            # Knowledge base retrieval
│   └── utils/
│       └── groqService.ts          # Groq API calls
├── client/
│   └── src/
│       ├── pages/                  # 38+ React pages
│       ├── components/             # Reusable UI components
│       ├── lib/
│       │   ├── trpc.ts             # tRPC client setup
│       │   └── utils.ts            # Client utilities
│       └── styles/                 # Global CSS
├── drizzle/
│   ├── schema.ts                   # 42-table MySQL schema (single source of truth)
│   └── seed.ts                     # Admin seed + defaults
├── shared/
│   ├── types.ts                    # Shared TypeScript types
│   └── constants.ts                # Shared constants
├── .env                            # Environment variables (never commit)
├── drizzle.config.ts               # Drizzle Kit config
├── vite.config.ts                  # Vite bundler config
├── tsconfig.json                   # TypeScript config
├── package.json                    # Dependencies
└── README.md                        # Documentation
```

---

## Database Schema (42 Tables)

### Core Tables

**users** — Tenants and admin
```sql
id INT PK | email VARCHAR UNIQUE | passwordHash TEXT | passwordVersion INT | 
role ENUM('user','admin') | twoFactorEnabled BOOLEAN | totpSecret VARCHAR | 
backupCodes TEXT | plan VARCHAR | createdAt DATETIME | updatedAt DATETIME
```

**bot_config** — Per-tenant settings (one row per tenant)
```sql
id INT PK | tenantId INT FK(users.id) | 
businessName VARCHAR | systemPrompt TEXT | 
aiModel VARCHAR DEFAULT 'llama-3.1-8b-instant' |
aiApiUrl VARCHAR DEFAULT 'https://api.groq.com/openai/v1' |
aiApiKey TEXT (encrypted) | aiTemperature DECIMAL |
maxTokens INT | language VARCHAR |
enableBusinessHours BOOLEAN | businessHoursStart/End VARCHAR |
businessDays VARCHAR | timezone VARCHAR | afterHoursMessage TEXT |
whatsappPhoneNumberId VARCHAR | whatsappAccessToken TEXT |
enableVoiceTranscription BOOLEAN | ttsVoice VARCHAR |
enableWebhook BOOLEAN | webhookUrl VARCHAR |
[+ 20 more config fields for features] | updatedAt DATETIME
```

**conversations** — Message history
```sql
id INT PK | tenantId INT FK | customerId INT FK | 
messageText TEXT | responseText TEXT | source ENUM('ai','template','agent','after_hours') |
sentiment VARCHAR | escalated BOOLEAN | assignedAgent VARCHAR |
createdAt DATETIME | updatedAt DATETIME
```

**customers** — CRM contacts
```sql
id INT PK | tenantId INT FK | phoneNumber VARCHAR UNIQUE | 
name VARCHAR | email VARCHAR | tags JSON | 
totalConversations INT | appointmentCount INT | optedOut BOOLEAN |
birthday DATE | lastMessageAt DATETIME | createdAt DATETIME
```

**templates** — Keyword-triggered responses
```sql
id INT PK | tenantId INT FK | trigger VARCHAR | response TEXT |
priority INT | enabled BOOLEAN | createdAt DATETIME
```

**appointments** — Bookings
```sql
id INT PK | tenantId INT FK | customerId INT FK |
serviceId INT FK | staffId INT FK | startTime DATETIME | 
duration INT | status ENUM('scheduled','confirmed','cancelled','completed') |
notes TEXT | recurrence VARCHAR | createdAt DATETIME
```

**knowledge_base** — AI context source
```sql
id INT PK | tenantId INT FK | title VARCHAR | content LONGTEXT |
source ENUM('text','pdf','url','scraped') | externalUrl VARCHAR |
createdAt DATETIME | updatedAt DATETIME
```

**staff** — Team members (not system users)
```sql
id INT PK | tenantId INT FK | name VARCHAR | email VARCHAR |
phone VARCHAR | role VARCHAR | createdAt DATETIME
```

**broadcast_schedules** — Bulk messaging
```sql
id INT PK | tenantId INT FK | message TEXT | recipientCount INT |
status ENUM('draft','scheduled','sent','failed') | 
scheduledFor DATETIME | createdAt DATETIME
```

**audit_logs** — Admin action trail
```sql
id INT PK | tenantId INT FK | action VARCHAR | details JSON | createdAt DATETIME
```

**[+ 32 more tables for features]** — flows, loyalty, menu_options, etc.

---

## Multi-Tenancy Architecture

### Golden Rule
**Every query MUST filter by `tenantId`.**

```typescript
// ✅ CORRECT
const [data] = await db.select().from(conversations)
  .where(eq(conversations.tenantId, ctx.user.userId));

// ❌ WRONG
const [data] = await db.select().from(conversations);
```

### Context
```typescript
// In tRPC context
type Context = {
  user: { userId: number; email: string; role: string };
};
```

### Procedures
```typescript
export const protectedProcedure = publicProcedure
  .use(middleware to check JWT)
  .use(middleware to extract userId);

export const adminProcedure = protectedProcedure
  .use(middleware to check role === 'admin');
```

---

## Authentication System

### JWT
- **Algorithm:** HS256
- **Payload:** `{ userId, email, role, passwordVersion }`
- **Storage:** httpOnly cookie named `token`
- **Expiry:** 7 days
- **Refresh:** `auth.refresh` procedure renews sliding window

### Password Security
- **Hash:** bcrypt (12 rounds)
- **Validation:** `passwordVersion` increments on each password change
- **Stale tokens:** Automatically cleared if passwordVersion doesn't match

### 2FA (TOTP)
- **Algorithm:** Pure Node crypto (no external lib)
- **Setup:** `setup2FA` generates secret
- **Confirmation:** `confirm2FA` validates first code
- **Backup codes:** 10 bcrypt-hashed codes for recovery
- **Disable:** `disable2FA` removes secret and codes

---

## WhatsApp Integration (WWJS Only)

### Architecture
**File:** `server/whatsapp/WhatsAppWebManager.ts`

- One Puppeteer/whatsapp-web.js client per tenant
- Stored in `tenantClients: Map<number, Client>`
- Sessions persist via `.wwebjs_auth/session-tenant_{id}/`
- Auto-reconnect: 3 attempts (30s/60s/90s backoff)

### QR Connection Flow
```
1. User clicks "Connect WhatsApp"
2. whatsapp.qrConnect mutation starts session
3. WhatsApp QR code displayed
4. User scans with phone
5. whatsapp.qrStatus query polls for connection
6. On success, session saved to disk
```

### Message Flow
```
WhatsApp server → WWJS client → messagePipeline.ts → 
Rate limit check → Spam check → Input sanitize → 
Business hours check → Template match → Booking flow → 
AI call (Groq) → Save to DB → Socket.IO emit
```

---

## Message Pipeline (`messagePipeline.ts`)

**File:** `server/whatsapp/messagePipeline.ts`

### Inbound Message Handler

```
1. Rate Limit Check
   - 20 messages / 60 seconds per phone per tenant
   - Uses in-memory sliding window

2. Spam Check
   - Block repeated identical messages

3. Input Sanitization
   - Strip null bytes
   - Detect 30+ prompt injection patterns
   - Wrap detected messages in [CUSTOMER MESSAGE START]...[END]

4. Business Hours Check
   - Load config for tenant
   - Check current time vs businessHours
   - If outside: send afterHoursMessage and stop

5. Opt-Out Check
   - customer.optedOut === true → don't process

6. Template Matching
   - Query templates table (priority-ordered)
   - On match: send template response, stop

7. Booking Flow Check
   - If handleBookingFlow() active: process booking logic

8. Knowledge Base Retrieval
   - embedSimilarity() finds relevant KB articles
   - Pass context to AI

9. AI Response (Groq)
   - systemPrompt + customer context + KB context
   - Call Groq API via groqService.ts
   - Save response to conversations table

10. Sentiment Analysis
    - Classify response sentiment
    - If negative threshold: escalate

11. Socket.IO Broadcast
    - Emit message:new event to frontend
    - Emit conversation:update event
```

### Config Loading
```typescript
// Always fresh, most recent config
const [config] = await db.select().from(botConfig)
  .where(eq(botConfig.tenantId, msg.tenantId))
  .orderBy(desc(botConfig.updatedAt))
  .limit(1);
```

### Groq API Call
```typescript
// File: server/utils/groqService.ts

const response = await groq.chat.completions.create({
  model: config.aiModel,
  messages: [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage }
  ],
  temperature: parseFloat(config.aiTemperature || "0.7"),
  max_tokens: safeMaxTokens,
});
```

---

## tRPC Routers (30+ routers)

### Router Pattern
```typescript
// server/routers/exampleRouter.ts
export const exampleRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    const [rows] = await db.select().from(table)
      .where(eq(table.tenantId, ctx.user.userId));
    return rows;
  }),
  
  create: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db.insert(table).values({
        tenantId: ctx.user.userId,
        name: input.name,
      });
      return { success: true };
    }),
};
```

### All Routers Required
```
authRouter — login, logout, me, refresh, register, changePassword, 
            forgotPassword, resetPassword, setup2FA, disable2FA, selfRegister

botConfigRouter — get, update, checkAI, getOnboardingStatus, completeOnboarding

whatsappRouter — getStatus, qrConnect, qrDisconnect, qrStatus, 
                 testMessage, getWebhookInfo

conversationsRouter — list, getStats, resolve, escalate, assignAgent

templatesRouter — list, create, update, delete, reorder

knowledgeBaseRouter — list, create, update, delete, scrapeUrl, getStats

appointmentsRouter — list, create, update, cancel, getAvailableSlots, 
                     sendConfirmation

crmRouter — listCustomers, getCustomer, updateCustomer, addTag, 
            removeTag, optOut

broadcastRouter — list, create, schedule, cancel, getStats

analyticsRouter — getDashboard, getConversationStats, 
                  getAppointmentStats, getAIStats

staffRouter — list, create, update, delete

bookingRouter — getPage, getServices, getSlots, createBooking (public)

[+ 15 more routers]
```

---

## Frontend Structure (38+ Pages)

### Page Categories

**Authentication**
- SignIn, SignUp, ForgotPassword, ResetPassword, Setup2FA, Confirm2FA

**Dashboard**
- Dashboard (overview), Analytics, Metrics

**Messaging**
- Inbox, Conversations, Templates, BroadcastCenter

**CRM**
- Customers, CustomerDetail, Tags, OptOut Management

**Appointments**
- Appointments, BookingPage, AvailableSlots, RecurrenceSetup

**Knowledge Base**
- KnowledgeBase, ArticleEditor, URLScraper

**Configuration**
- Configuration (AI, WhatsApp, Business Hours, Notifications, Webhooks)

**Admin** (role=admin only)
- UserManagement, AdminDashboard, AuditLogs, SystemSettings, Instances

**Staff**
- StaffDirectory, StaffEditor

**Other**
- Settings, Profile, Billing (if enabled), Flows, LoyaltyProgram, 
  MenuOptions, Support/Ticketing

---

## Security

### Headers
- **Helmet.js** — Secure HTTP headers, remove `x-powered-by`

### Rate Limiting
```
authLimiter: 10 requests / 15 minutes per IP on /api/trpc/auth.*
apiLimiter: 300 requests / minute per IP
webhookLimiter: 100 requests / minute per IP
messageRateLimiter: 20 messages / 60 seconds per phone per tenant
bruteForceTracker: Block IP after 15 failed login attempts
```

### Encryption
```
AES-256-GCM for:
  - aiApiKey (Groq)
  - whatsappAccessToken
  - twilioAuthToken
  - smtpPass
```

### Input Validation
```
Zod schemas for all tRPC inputs
inputSanitizer.ts detects:
  - SQL injection patterns
  - Prompt injection (30+ patterns)
  - XSS attempts
  - Command injection
Wraps detected payloads in [CUSTOMER MESSAGE START]...[END]
```

### HMAC Verification
```
Webhook from Meta WhatsApp:
  - Verify HMAC-SHA256 using WHATSAPP_APP_SECRET
  - Reject unsigned requests
```

### Session Isolation
```
Each tenant's whatsapp-web.js session isolated via tenantId
Puppeteer processes run with --no-sandbox in prod (or Chromium sandbox)
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=mysql://user:pass@localhost:3306/waflow

# JWT
JWT_SECRET=your-256bit-hex-secret-never-change-in-prod

# Encryption
ENCRYPTION_KEY=your-32byte-hex-key-never-change-once-data-exists

# Groq API
GROQ_API_KEY=gsk_...
GROQ_API_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.1-8b-instant

# WhatsApp (optional, for Meta API fallback if implemented)
WHATSAPP_APP_SECRET=your-meta-app-secret
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_ACCESS_TOKEN=...

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@waflow.com
SMTP_PASS=your-password

# Server
PORT=3000
NODE_ENV=production
APP_URL=https://waflow.example.com

# Browser (for WWJS)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

---

## Development Commands

```bash
# Install
pnpm install

# Development (watch mode, hot reload)
pnpm dev
  # Starts: server (tsx watch :3000) + client (vite :5173)

# Build
pnpm build
  # Builds: client (Vite), server (tsc)

# Production
pnpm start
  # Runs compiled build

# Testing
pnpm test                    # Run Vitest suite
pnpm test:watch              # Watch mode

# Database
pnpm drizzle:generate        # Generate migration from schema changes
pnpm drizzle:migrate         # Apply migrations
pnpm exec drizzle-kit push   # Direct push (dev only)
pnpm db:seed                 # Seed admin + defaults
pnpm drizzle:studio          # Open Drizzle Studio

# Docker
docker compose up -d         # Start MySQL + app
docker compose down          # Stop
docker compose down -v       # Stop + wipe data
```

---

## Default Credentials (After Seed)

```
Email: admin@waflow.com
Password: admin123
Change immediately after first login!
```

---

## Groq Integration (Only AI Provider)

### Setup
1. Get API key from https://console.groq.com
2. Set `GROQ_API_KEY` in `.env`
3. Model: `llama-3.1-8b-instant` (recommended, fast & accurate)
4. URL: `https://api.groq.com/openai/v1`

### Service File: `server/utils/groqService.ts`

```typescript
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function callGroqAPI(params: {
  systemPrompt: string;
  userMessage: string;
  model: string;
  maxTokens: number;
  temperature: number;
}) {
  const response = await groq.chat.completions.create({
    model: params.model,
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userMessage }
    ],
    temperature: params.temperature,
    max_tokens: params.maxTokens,
  });
  
  return response.choices[0]?.message?.content || '';
}
```

### Message Pipeline Usage
```typescript
// In messagePipeline.ts, around line 2100
const response = await callGroqAPI({
  systemPrompt: fullSystemPrompt,
  userMessage: msg.messageText,
  model: config.aiModel, // llama-3.1-8b-instant
  maxTokens: safeMaxTokens,
  temperature: parseFloat(config.aiTemperature || '0.7'),
});
```

---

## Frontend Setup (React + Vite)

### Entry Point: `client/src/main.tsx`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

### tRPC Client: `client/src/lib/trpc.ts`

```typescript
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../server/routers';

export const trpc = createTRPCReact<AppRouter>();
```

### Routing: `client/src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Inbox from './pages/Inbox';
import Configuration from './pages/Configuration';
// ... import all 38 pages

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/config" element={<Configuration />} />
        {/* ... all routes */}
      </Routes>
    </BrowserRouter>
  );
}
```

### Component Example

```typescript
// pages/Inbox.tsx
import { trpc } from '../lib/trpc';

export default function Inbox() {
  const { data: conversations, isLoading } = trpc.conversations.list.useQuery();
  const updateMutation = trpc.conversations.update.useMutation({
    onSuccess: () => {
      utils.conversations.list.invalidate();
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div>
      {conversations?.map((conv) => (
        <ConversationCard 
          key={conv.id} 
          conversation={conv}
          onUpdate={(data) => updateMutation.mutate(data)}
        />
      ))}
    </div>
  );
}
```

---

## Testing Strategy

### Unit Tests
```typescript
// server/tests/auth.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../auth';

describe('auth', () => {
  it('should hash password', () => {
    const hash = hashPassword('password123');
    expect(hash).not.toBe('password123');
  });
  
  it('should verify correct password', () => {
    const hash = hashPassword('password123');
    expect(verifyPassword('password123', hash)).toBe(true);
  });
});
```

### Integration Tests
```typescript
// server/tests/botConfig.test.ts
import { describe, it, expect } from 'vitest';
import { db } from '../db';
import { botConfig } from '../../drizzle/schema';

describe('botConfig router', () => {
  it('should update config', async () => {
    // Create test context
    // Call router.update
    // Verify DB was updated
  });
});
```

### Run Tests
```bash
pnpm test                    # Run all tests
pnpm test --watch            # Watch mode
pnpm test --coverage         # Coverage report
```

---

## Deployment Architecture

### Infrastructure
- **Database:** MySQL 8+ (managed or self-hosted)
- **App Server:** Node.js 18+ (Docker or bare metal)
- **Reverse Proxy:** Nginx/Caddy (SSL termination)
- **Process Manager:** PM2 or systemd
- **Logging:** Winston or pino to files/centralized service

### Docker Compose (Local Dev)
```yaml
version: '3.8'
services:
  db:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: waflow
      MYSQL_ROOT_PASSWORD: root
    volumes:
      - db_data:/var/lib/mysql
    ports:
      - "3307:3306"
  
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: mysql://root:root@db:3306/waflow
      GROQ_API_KEY: ${GROQ_API_KEY}
    depends_on:
      - db
    volumes:
      - .wwebjs_auth:/app/.wwebjs_auth

volumes:
  db_data:
```

### Production Deployment
1. Push to Git (main branch)
2. CI/CD runs: `pnpm install && pnpm build && pnpm test`
3. Deploy built assets and server binary
4. Run migrations: `pnpm drizzle:migrate`
5. Start with PM2 or systemd
6. Nginx reverse proxy with SSL (Let's Encrypt)

---

## Key Implementation Notes

### No Provider Switching
- **Only Groq** is configured
- No OpenAI, Claude, Ollama options
- Remove all provider selection logic from Configuration UI
- Hard-code model as `llama-3.1-8b-instant`

### Simplified Config
- Remove `aiProvider`, `claudeApiKey`, `claudeModel` fields
- Keep only: `aiApiKey` (Groq), `aiModel`, `aiTemperature`
- Configuration page just has Groq settings

### Message Pipeline
- No provider checks/switching
- Always call `callGroqAPI()`
- No fallback logic to other providers

### Database Schema
- Remove any provider-specific columns
- Keep only Groq-related config

---

## Success Criteria

- ✅ User can register and login
- ✅ User can scan WhatsApp QR and connect
- ✅ Inbound WhatsApp messages trigger Groq AI response
- ✅ Messages saved to conversations table
- ✅ Configuration page works (Groq settings only)
- ✅ Templates can be created and matched
- ✅ Customers CRM works
- ✅ Appointments booking works
- ✅ Knowledge base articles stored and retrieved
- ✅ Business hours enforced
- ✅ 2FA works
- ✅ Admin user has super-admin dashboard
- ✅ All 38 frontend pages functional
- ✅ Tests pass
- ✅ Deployed and live

---

## Important: Groq API Considerations

### Rate Limits
- Free tier: Varies, check https://console.groq.com
- Production: Consider paid tier for reliable throughput
- Implement exponential backoff for retries

### Model Performance
- `llama-3.1-8b-instant` — Recommended (fast, accurate, cheap)
- `mixtral-8x7b-32768` — Larger, slower, more capable
- Others available — Check Groq console for latest

### Cost Optimization
- Prompt caching if available
- Batch requests where possible
- Monitor usage in Groq dashboard

---

## Next Steps for Claude Code

1. Create project structure from scratch
2. Set up MySQL database + Drizzle schema
3. Build Express app with tRPC
4. Implement WhatsApp WWJS integration
5. Build message pipeline with Groq integration
6. Create React frontend with 38 pages
7. Implement authentication (JWT + 2FA)
8. Build all 30+ routers
9. Add Socket.IO realtime updates
10. Write tests
11. Deploy

---

**This prompt is self-contained and comprehensive enough for Claude Code to implement the entire project from scratch with Groq as the only AI provider.**
