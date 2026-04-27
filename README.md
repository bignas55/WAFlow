# WAFlow — AI WhatsApp Receptionist Platform

A production-ready SaaS platform that automates WhatsApp customer service using a **local Ollama AI** (free, private, no cloud required).

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Lucide Icons, Recharts |
| Backend | Node.js, Express, tRPC 11, Socket.IO |
| Database | MySQL 8, Drizzle ORM |
| AI | **Ollama** (local LLM — llama3.2, mistral, phi3.5, etc.) |
| WhatsApp | Meta WhatsApp Business Cloud API |
| Auth | JWT |

## Features

### Core AI & Messaging
- 🤖 **AI Receptionist** — Handles customer messages 24/7 using local Ollama models or any OpenAI-compatible API
- 🔁 **Smart Pipeline** — Rate limit → Business hours → Satisfaction capture → Template match → Escalation → AI fallback
- 📋 **Template Engine** — Keyword-triggered responses with category + language support
- 📚 **Knowledge Base** — Business info, PDF/DOCX/URL ingestion the AI uses to answer questions
- 🌍 **Multi-language** — Auto-detects 10 languages (English, Afrikaans, Zulu, Xhosa, Spanish, French, German, Portuguese, Arabic, Chinese)
- 🔄 **AI Fallback** — Configure a secondary AI model/endpoint when the primary fails

### Appointments
- 📅 **Appointment Booking** — AI-assisted booking flow over WhatsApp
- ⏰ **Dual Reminders** — Separate 24-hour and 1-hour reminder messages per appointment
- 🧾 **Invoice PDF** — Auto-generated printable invoice on appointment completion (15% VAT)
- 📊 **No-show Tracking** — Auto no-show marking with per-service analytics
- ⭐ **Satisfaction Surveys** — 1–5 star rating captured after appointment follow-up

### Customer Management
- 👥 **CRM** — Customer profiles, conversation history, tags, notes
- 🎂 **Birthday Messages** — Automated birthday greetings via WhatsApp (customisable template)
- 📥 **CSV Import** — Bulk-import customers with flexible column detection
- 🔀 **Customer Merge** — Merge duplicate customer records with full conversation/appointment history
- 📆 **Date of Birth** — Editable DOB field per customer for birthday automation

### Analytics
- 📊 **Revenue & LTV** — Per-period revenue tracking + customer lifetime value
- 🔥 **Peak Hours Heatmap** — 7×12 grid showing busiest days/times over 90 days
- 📉 **No-show Rate by Service** — Colour-coded bar chart (red/yellow/green thresholds)
- 👤 **Customer Retention** — Stacked weekly bar chart: new vs returning customers
- ⭐ **Satisfaction by Service** — Average star rating per service type
- 📈 **Sentiment, language, AI vs human** — Standard conversation analytics

### Operations & Platform
- 🕵️ **Live Monitoring** — Real-time conversation dashboard via Socket.IO
- 🧑‍💼 **Agent Management** — Performance metrics per human agent with escalation routing
- 📢 **Broadcast** — Send bulk WhatsApp messages to customer segments
- 🔔 **Escalation** — Automatic escalation to human agents with WhatsApp/email notifications
- 🔒 **Audit Log** — Paginated, filterable log of all platform actions (appointments, broadcasts, KB, settings)
- 🧹 **Conversation Auto-close** — Automatically resolve stale conversations after N days
- 💡 **Re-engagement** — Automated follow-up messages to inactive customers
- 📧 **Daily Summary & Weekly Report** — Email digest of appointments and activity
- 🏥 **Health Scheduler** — Monitors tenant health, billing resets, alerts on issues
- 🔑 **License System** — Self-hosted instances phone home to the admin cloud for license validation
- 🐳 **Docker** — Full Docker Compose setup for one-command production deployment

## Quick Start

### Prerequisites

- Node.js 20+
- MySQL 8
- [Ollama](https://ollama.com) installed and running

### 1. Install Ollama & download a model

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model (choose one)
ollama pull llama3.2        # Recommended — 2GB, fast
ollama pull mistral         # Alternative — 4GB, high quality
ollama pull phi3.5          # Lightweight — 2.2GB
ollama pull qwen2.5:3b      # Best for multilingual — 1.9GB
```

### 2. Set up the database

```bash
# Start MySQL and create the database
mysql -u root -p -e "CREATE DATABASE waflow;"
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env — set DB_* credentials. AI defaults are already set for Ollama.
```

### 4. Install dependencies & run migrations

```bash
npm install
npm run drizzle:migrate
npm run db:seed
```

### 5. Start the development server

```bash
npm run dev
```

Visit **http://localhost:5173** and log in with:
- Email: `admin@waflow.com`
- Password: `admin123`

## Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=waflow
DB_USER=root
DB_PASSWORD=

# AI (Ollama — defaults work out of the box)
AI_API_URL=http://localhost:11434/v1
AI_API_KEY=ollama
AI_MODEL=llama3.2

# WhatsApp (from Meta for Developers console)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=my_verify_token_123

# App
PORT=3001
JWT_SECRET=change-me-in-production
```

## Project Structure

```
waflow/
├── client/               # React frontend (Vite + Tailwind)
│   └── src/
│       ├── pages/        # 25+ pages: Dashboard, Inbox, Appointments, Analytics, CRM,
│       │                 #   CustomerProfiles, AuditLog, Broadcast, Configuration, …
│       ├── components/   # Layout, UI components (Badge, Spinner)
│       ├── hooks/        # useAuth, useWhatsAppSocket
│       └── lib/          # tRPC client
├── server/               # Express + tRPC backend
│   ├── routers/          # 18 tRPC routers (auth, botConfig, appointments,
│   │                     #   crm, analytics, audit, broadcast, billing, …)
│   ├── whatsapp/         # Message pipeline, WhatsApp Web client, Business API
│   └── services/         # Appointment reminders, scheduler, alert, audit,
│                         #   knowledge retrieval, sentiment, multi-language, …
├── drizzle/
│   ├── schema.ts         # Full DB schema (35+ tables)
│   ├── migrations/       # 14 incremental SQL migrations (0000–0013)
│   └── seed.ts           # Demo data seed
└── shared/               # Shared types and constants
```

## Changing AI Models

In the dashboard → **Configuration → AI & Model**, select any Ollama model, then run the shown `ollama pull` command in your terminal. No restart required — the new model takes effect on the next message.

## Production Deployment

See `QUICK_START.md` for Docker deployment instructions.

## License

MIT
# WAFlow
# WAFlow
