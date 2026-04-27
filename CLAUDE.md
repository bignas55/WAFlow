# WAFlow — Master Project Prompt

## What This Project Is

WAFlow is a **multi-tenant WhatsApp SaaS platform**. Each registered user IS a tenant — their `users.id` is their `tenantId` used everywhere. Tenants connect a WhatsApp number (via QR scan or Meta Cloud API), configure an AI receptionist, and the platform handles inbound messages, bookings, CRM, broadcasting, analytics, and more.

**Owner / admin:** Nathan (shirangonathan88@gmail.com). The `role = "admin"` user has a super-admin dashboard (Instances, UserManagement, AdminRouter) that can see and manage all tenants.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js + Express + tRPC v11 |
| **Database ORM** | Drizzle ORM (MySQL / mysql2) |
| **Realtime** | Socket.IO |
| **Frontend** | React 19 + Vite 5 + TypeScript |
| **Styling** | TailwindCSS |
| **Data fetching** | TanStack Query + tRPC React Query |
| **Auth** | JWT (httpOnly cookies, 7d) + bcrypt + TOTP 2FA + backup codes |
| **WhatsApp** | whatsapp-web.js (QR, multi-tenant) + Meta WhatsApp Business Cloud API fallback |
| **AI** | OpenAI-compatible API (Ollama / Groq / OpenAI — tenant-configurable) |
| **Build** | pnpm@8.15.0, tsx (dev), tsc (prod server), Vite (client) |
| **Tests** | Vitest |

---

## Project Structure

```
v2/
├── server/
│   ├── index.ts              # Express app, Socket.IO, rate limiters, tRPC handler
│   ├── trpc.ts               # tRPC init, context, protectedProcedure, adminProcedure
│   ├── auth.ts               # JWT sign/verify, bcrypt, timingSafeEqual, authMiddleware
│   ├── db.ts                 # Drizzle mysql2 pool connection
│   ├── routers.ts            # Combines all routers into appRouter
│   ├── routers/              # One file per feature (30+ routers)
│   ├── services/             # Business logic (pipeline, AI, KB, bookings, etc.)
│   ├── middleware/
│   │   └── rateLimiter.ts    # In-memory sliding window limiters + brute-force tracker
│   └── whatsapp/
│       ├── WhatsAppWebManager.ts    # Multi-tenant WWJS (QR), one client per tenant
│       ├── WhatsAppBusinessAPI.ts   # Meta Cloud API fallback
│       └── messagePipeline.ts       # Core inbound message handler (AI, templates, booking)
├── client/
│   └── src/
│       ├── pages/            # 38 React pages (Dashboard, Inbox, Appointments, etc.)
│       ├── components/       # Shared UI components
│       └── lib/trpc.ts       # tRPC client setup
├── drizzle/
│   ├── schema.ts             # 42-table MySQL schema (single source of truth)
│   └── seed.ts               # Seeds admin user + default templates + bot config
├── shared/
│   ├── types.ts              # Shared TS types (client + server)
│   └── constants.ts          # Shared constants
├── .env                      # Local environment variables (never commit)
├── drizzle.config.ts         # Points drizzle-kit at schema + DB
└── CLAUDE.md                 # This file
```

---

## Critical Architectural Patterns

### Multi-Tenancy
- Every `users.id` IS the `tenantId`. There are no separate tenant records.
- All feature tables (`botConfig`, `conversations`, `templates`, `customers`, etc.) have a `tenantId int NOT NULL` column.
- Every DB query MUST filter by `tenantId` — use `eq(table.tenantId, ctx.user.userId)`.
- Never query across tenants except in `adminRouter` (role check enforced by `adminProcedure`).

### tRPC Routers
- All API calls go through tRPC at `/api/trpc/*`
- tRPC uses **dot-notation** for procedure paths: `/api/trpc/auth.login`, `/api/trpc/botConfig.get`
- Express `app.use("/api/trpc/auth", ...)` does NOT match dot-notation — use regex: `app.use(/^\/api\/trpc\/auth/, limiter)`
- Three procedure types: `publicProcedure` (no auth), `protectedProcedure` (JWT required), `adminProcedure` (role=admin required)

### Authentication
- JWT stored as httpOnly cookie named `token`, 7-day expiry
- `JWTPayload = { userId, email, role, passwordVersion }`
- `passwordVersion` increments on every password change — stale tokens are rejected in `createContext()`
- Cookie cleared silently when stale token detected (no 401 thrown at middleware level)
- 2FA: TOTP via `totpService.ts` (pure Node crypto, no external lib), backup codes bcrypt-hashed
- `auth.refresh` procedure renews the cookie sliding window — call it on app focus or every 60 min

### WhatsApp Architecture
- **Primary:** `WhatsAppWebManager.ts` — manages one Puppeteer/whatsapp-web.js client per tenant, stored in `tenantClients: Map<number, Client>`
- **Fallback:** `WhatsAppBusinessAPI.ts` — Meta Cloud API, used when WWJS isn't connected
- `sendMessage()` in `messagePipeline.ts` tries WWJS first, falls back to Meta API automatically
- WWJS sessions persist across restarts via `.wwebjs_auth/session-tenant_{id}/`
- Auto-reconnect: 3 attempts with 30s/60s/90s backoff, only if tenant was previously authenticated
- `storeChatId(tenantId, phone, chatId)` caches WhatsApp's `@lid` format for reliable outbound sends

### Message Pipeline (`messagePipeline.ts`)
Inbound message flow:
1. **Rate limit** — `checkPhoneMessageLimit()` (20 msgs/60s per phone per tenant)
2. **Spam check** — repeated identical messages blocked
3. **Input sanitize** — `sanitizeIncomingMessage()` strips null bytes, detects prompt injection
4. **Business hours** — if outside hours, send `afterHoursMessage` and stop
5. **Opt-out check** — `customer.optedOut` stops all processing
6. **Interactive menu** — if `enableMenuMode` and message matches `menuTrigger`
7. **Template match** — keyword/trigger match against `templates` table (priority-ordered)
8. **Booking flow** — if `handleBookingFlow()` is active for this customer session
9. **Knowledge base** — `getRelevantContext()` fetches relevant KB articles
10. **AI response** — calls configured LLM with system prompt + customer context + KB context
11. **Sentiment analysis** — classifies response sentiment, escalates if negative threshold hit
12. **Save to DB** — conversation record created, customer memory updated, Socket.IO event emitted

### Security
- **Helmet** — sets secure HTTP headers, removes `x-powered-by`
- **Rate limiters** — `authLimiter` (10 req/15min on `/api/trpc/auth.*`), `apiLimiter` (300 req/min), `webhookLimiter` (100 req/min)
- **HMAC-SHA256** — webhook signature verification via `WHATSAPP_APP_SECRET`
- **AES-256-GCM** — `encryptionService.ts` encrypts sensitive DB fields (API keys, tokens)
- **Prompt injection** — `inputSanitizer.ts` detects 30+ injection patterns, wraps detected messages in `[CUSTOMER MESSAGE START]...[CUSTOMER MESSAGE END]` delimiters
- **Brute-force** — per-IP failed login counter, blocks after 15 failures
- **CORS** — strict origin whitelist (`http://localhost:5173` in dev, `APP_URL` in prod)

---

## Database Schema (Key Tables)

| Table | Purpose |
|---|---|
| `users` | Tenants + admin. `id` = tenantId. Has `passwordVersion`, `twoFactorEnabled`, `plan`, billing fields |
| `bot_config` | Per-tenant AI + WhatsApp + business settings. One row per tenant |
| `conversations` | Every inbound/outbound message. Source: `template\|ai\|agent\|after_hours` |
| `templates` | Keyword-triggered auto-replies. Matched before AI |
| `customers` | CRM: phone, name, tags, appointment counts, opt-out, birthday |
| `appointments` | Bookings with service, staff, date, time, status, recurrence |
| `knowledge_base` | Articles/docs (PDF, URL, text) for AI context retrieval |
| `staff` | Per-tenant practitioners (not system users) |
| `broadcast_schedules` | Scheduled bulk WhatsApp sends |
| `audit_logs` | Admin action trail per tenant |
| `licenses` | Self-hosted client licensing + heartbeat monitoring |

Full schema: `drizzle/schema.ts` — 42 tables.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL connection string |
| `JWT_SECRET` | HMAC key for JWT signing — **never change in production** |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM — **never change once data exists** |
| `AI_API_URL` | OpenAI-compatible endpoint (Ollama: `http://localhost:11434/v1`) |
| `AI_API_KEY` | API key (`ollama` for Ollama) |
| `AI_MODEL` | Model name (e.g. `gemma4:latest`, `llama3.2`, `gpt-4o-mini`) |
| `WHATSAPP_APP_SECRET` | Meta app secret for webhook HMAC verification |
| `PUPPETEER_EXECUTABLE_PATH` | Path to Chrome/Brave/Chromium binary for whatsapp-web.js |
| `PORT` | Server port (default 3000) |
| `NODE_ENV` | `development` or `production` |
| `APP_URL` | Public URL used in email reset links |
| `SMTP_HOST` | Leave blank to disable email, use console alerts instead |

---

## Development Commands

```bash
pnpm dev                    # Start server (tsx watch :3000) + client (vite :5173)
pnpm build                  # Build client (Vite) + server (tsc)
pnpm start                  # Run production build

pnpm test                   # Run Vitest test suite
pnpm test:watch             # Vitest in watch mode

pnpm drizzle:generate       # Generate SQL migration from schema changes
pnpm drizzle:migrate        # Apply migrations to DB
pnpm exec drizzle-kit push  # Push schema directly (dev only, skips migration files)
pnpm db:seed                # Seed admin user + templates + default bot config
pnpm drizzle:studio         # Open Drizzle Studio at https://local.drizzle.studio

docker compose up -d db     # Start only the MySQL container (port 3307)
docker compose up -d        # Start MySQL + full app in Docker
docker compose down         # Stop containers (keep volumes)
docker compose down -v      # Wipe all data
```

---

## Key Routers and What They Do

| Router | Procedures |
|---|---|
| `auth` | login, logout, me, refresh, register, changePassword, forgotPassword, resetPassword, setup2FA, confirm2FA, disable2FA, selfRegister, updateProfile |
| `botConfig` | get, update (tenant AI/WhatsApp/business settings) |
| `whatsapp` | getStatus, startSession, stopSession, getQR, testMessage, getWebhookInfo |
| `conversations` | list, getStats, resolve, escalate, assignAgent |
| `templates` | list, create, update, delete, reorder |
| `knowledgeBase` | list, create, update, delete, scrapeUrl, getStats |
| `appointments` | list, create, update, cancel, getAvailableSlots, sendConfirmation |
| `crm` | listCustomers, getCustomer, updateCustomer, addTag, removeTag, optOut |
| `broadcast` | list, create, schedule, cancel, getStats |
| `analytics` | getDashboard, getConversationStats, getAppointmentStats, getAIStats |
| `admin` | listUsers, createUser, updateUser, deactivate (admin only) |
| `billing` | getPlans, getCurrentPlan, updatePlan (admin only) |
| `staff` | list, create, update, delete |
| `booking` | getPage, getServices, getSlots, createBooking (public, no auth) |
| `tickets` | list, create, update, close (IT support ticketing) |
| `flows` | list, create, update, delete (visual conversation flow builder) |
| `menuOptions` | list, create, update, delete, reorder (numbered WhatsApp menu) |
| `loyalty` | getPoints, addPoints, getLeaderboard, getTiers |
| `audit` | list (admin audit trail) |
| `promptExpert` | generate (AI-assisted system prompt builder) |

---

## Adding a New Feature — Checklist

1. **Schema** — add table/columns to `drizzle/schema.ts`, run `pnpm drizzle:generate && pnpm drizzle:migrate`
2. **Router** — create `server/routers/myFeatureRouter.ts`, use `protectedProcedure`, always filter by `tenantId: ctx.user.userId`
3. **Register** — import and add to `server/routers.ts` appRouter
4. **Client** — add tRPC hooks in React page, import from `~/lib/trpc`
5. **Page** — add route in `client/src/App.tsx` (or wherever routing lives)
6. **Tests** — add `server/tests/myFeature.test.ts` (vitest, no DB required for unit tests)

---

## Common Gotchas

- **tRPC path matching:** Always use regex `app.use(/^\/api\/trpc\/auth/, ...)` not string `"/api/trpc/auth"` for Express middleware on tRPC routes
- **Default values in overload signatures** are illegal in TypeScript — use optional params (`limit?: number`) in the overload, defaults only in the implementation
- **Dynamic import of CJS modules** (bcrypt, etc.) — use static `import bcrypt from "bcryptjs"` not `await import()`, otherwise functions land on `.default`
- **WhatsApp chatId vs phone:** Always store/use the raw `msg.from` as `chatId` (may be `@lid` format). Strip `@...` suffix to get the plain phone number for DB storage
- **Drizzle `undefined` vs `null`:** Passing `undefined` for a column in `.values()` omits it (DB default applies). Passing `null` sets it to NULL explicitly
- **Socket.IO events** are emitted from `messagePipeline.ts` after every inbound message — clients subscribe to `message:new` and `conversation:update`
- **`WhatsAppWebClient.ts`** is dead code — the active multi-tenant implementation is `WhatsAppWebManager.ts`

---

## Default Credentials (seed)

- **Email:** `admin@waflow.com`
- **Password:** `admin123`
- Change immediately after first login via Settings → Profile
