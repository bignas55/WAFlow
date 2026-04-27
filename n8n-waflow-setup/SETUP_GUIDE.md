# n8n WhatsApp Multi-Tenant SaaS — Complete Setup Guide

## Quick Start (5 minutes)

### 1. Prerequisites
- Docker & Docker Compose installed
- Git (optional)
- Groq API key (free at https://console.groq.com)
- Meta Business Account (for WhatsApp Business API fallback)

### 2. Start Everything
```bash
# Navigate to this directory
cd n8n-waflow-setup

# Start MySQL + n8n
docker-compose up -d

# Wait for both services to be ready (30-60 seconds)
docker-compose logs -f
# Look for: "n8n is now ready" and MySQL health check green
```

### 3. Access n8n
- **URL:** http://localhost:5678
- **Default Setup:** First time you access it, n8n will prompt you to create an admin user
  - Email: `admin@localhost`
  - Password: Choose a strong password
  - Organization name: `WAFlow`

### 4. Verify Database
```bash
# Get MySQL shell
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n

# List tables (should show 16 tables)
SHOW TABLES;

# Exit
EXIT;
```

---

## Architecture Overview

### Database Layer (MySQL)
- **16 tables** — users, bot_config, conversations, customers, templates, knowledge_base, appointments, staff, broadcast, webhooks, analytics, audit_logs, n8n_workflows, system_settings
- **Multi-tenant:** Every table has `tenant_id` column (except auth tables)
- **Isolation:** All queries MUST filter by `tenant_id = $tenant_id`
- **User = Tenant:** `users.id` is the `tenant_id` used everywhere

### Workflow Layer (n8n)
- **8 core workflows** (see below)
- **Webhook receivers** for WhatsApp → parse → route to appropriate workflow
- **Database nodes** to read/write tenant-specific data
- **External APIs** (Groq, Meta, OpenAI, custom)

### Multi-Tenancy Pattern
Every workflow must include this pattern:
1. Extract `tenant_id` from request (webhook path, header, or database lookup by phone)
2. Verify `tenant_id` has WhatsApp configured and is active
3. Filter all DB queries: `WHERE tenant_id = $tenant_id`
4. Isolate response to that tenant only
5. Log action in audit_logs with `tenant_id`

---

## Core Workflows

### Workflow #1: WhatsApp Webhook Receiver
**Purpose:** Receive inbound WhatsApp messages, validate, and route

**Flow:**
1. Webhook trigger on `/webhook/whatsapp/:tenantId` (POST)
2. Validate webhook signature (HMAC-SHA256 vs `WHATSAPP_APP_SECRET`)
3. Parse message: phone, text, media, timestamp
4. Lookup tenant by `tenantId` in path
5. Check if opt-out or rate-limited (phone rate limit: 20/hour)
6. Route based on message type:
   - Interactive menu → Workflow #8 (Menu Handler)
   - Booking request → Workflow #3 (Booking Flow)
   - Normal message → Workflow #2 (Template & AI)
7. Store incoming message in `conversations` table
8. Emit Socket.IO event `message:new` (for real-time UI)

**Nodes:**
- HTTP Webhook trigger
- Function node (validate signature, parse)
- MySQL: Get bot_config for tenant
- MySQL: Check rate limit & opt-out
- Switch (route by message type)
- MySQL: Insert into conversations
- Webhook response

**Error Handling:**
- Invalid signature → 403 Unauthorized
- Opt-out → silent discard
- Rate limited → queue for later
- Bot disabled → send "we're temporarily unavailable"

---

### Workflow #2: Template & AI Response
**Purpose:** Match templates, generate AI responses, or both

**Flow:**
1. Trigger from Webhook Receiver (for normal text messages)
2. Extract `tenant_id`, `phone`, `text`
3. Fetch bot_config (AI settings, business hours)
4. Check business hours:
   - Outside hours → send `afterHoursMessage`, stop
5. Search templates:
   - Query `templates` table where `tenant_id = $tenant_id` and message matches triggers
   - Order by `priority`
   - If match found → send template response + stop
6. If no template match → use AI:
   - Fetch relevant KB articles for context (semantic search)
   - Call Groq/OpenAI with system prompt + KB context + customer history
   - Save response in `conversations` table
7. Send response via WhatsApp
8. Update customer `last_message_at`
9. Analyze sentiment (positive/neutral/negative)
10. If negative sentiment → escalate to Workflow #7

**Nodes:**
- Workflow trigger (from #1)
- Function (extract data, check business hours)
- MySQL: Get templates
- Switch (template match vs AI)
- MySQL: Get knowledge base articles
- HTTP Call to Groq (or OpenAI/Ollama)
- Function (parse response, sentiment analysis)
- WhatsApp Send
- MySQL: Update conversations & customers
- Conditional (escalate if negative)

**Error Handling:**
- AI API timeout → fallback template "I'm having trouble, please try again"
- No KB articles → proceed without context
- Rate limit on AI API → queue message

---

### Workflow #3: Booking Flow
**Purpose:** Collect booking info, check availability, create appointment

**Flow:**
1. Trigger when message contains booking keywords
2. Check if `enable_bookings` = true in bot_config
3. Collect booking details via interactive menu:
   - "What service?" → list services
   - "What date?" → show next 14 days
   - "What time?" → show available slots
4. Validate slot availability:
   - Query `appointments` table for conflicts
   - Check staff availability
5. Confirm with customer
6. If confirmed:
   - Insert into `appointments` table
   - Send confirmation message
   - Schedule reminder (Workflow #4, in 24 hours)
7. Store conversation thread in `conversations`

**Nodes:**
- Trigger: Keyword match ("book", "appointment", "schedule")
- MySQL: Check `enable_bookings`
- Conversation flow (menu options)
- MySQL: Get available services & staff
- MySQL: Get appointments for date range
- Function (calculate available slots)
- Interactive buttons (confirmation)
- MySQL: Insert appointment
- WhatsApp Send confirmation
- Schedule function (set reminder in 24h)

---

### Workflow #4: Appointment Reminder (Scheduled)
**Purpose:** Send appointment reminders 24h before

**Flow:**
1. Cron trigger: every hour
2. Query appointments where `date = tomorrow` and `reminder_sent = false`
3. For each appointment:
   - Get customer phone
   - Get appointment details
   - Send WhatsApp reminder message
   - Update `reminder_sent = true`

**Nodes:**
- Cron: Every hour
- MySQL: Get upcoming appointments
- Loop appointments
  - Get customer phone
  - WhatsApp Send reminder
  - MySQL: Update reminder_sent

---

### Workflow #5: Broadcast Sender (Scheduled)
**Purpose:** Send scheduled bulk messages

**Flow:**
1. Cron trigger: every 5 minutes
2. Query `broadcast_schedules` where `status = scheduled` and `scheduled_for <= NOW()`
3. For each broadcast:
   - Get recipient filter (tags, opt-in list, date range)
   - Query `customers` with filter
   - For each customer:
     - Send WhatsApp message
     - Insert into `broadcast_log` with status=sent or failed
     - Increment `sent_count`
   - Update broadcast status to "sent"

**Nodes:**
- Cron: Every 5 minutes
- MySQL: Get scheduled broadcasts
- Loop broadcasts
  - Get recipients by filter
  - Loop customers
    - WhatsApp Send
    - MySQL: Insert into broadcast_log
    - MySQL: Increment sent_count

**Error Handling:**
- Invalid phone → mark as failed with error message
- Rate limit → backoff and retry
- Opt-out → skip silently, mark as blocked

---

### Workflow #6: Customer CRM Update
**Purpose:** Sync customer data, update interactions, tag management

**Flow:**
1. Trigger on conversation or appointment changes (Socket.IO or DB notification)
2. Extract `tenant_id`, `phone`, customer data
3. Lookup/create customer in `customers` table:
   - If exists: update `message_count`, `last_message_at`
   - If not exists: create new record
4. Apply tags based on:
   - Booking history → "frequentist" or "new"
   - Sentiment → "positive", "escalated"
   - Opted out → "opted_out"
5. Update `total_spent` if payment info available
6. Log to audit_logs

**Nodes:**
- Trigger: Workflow #2 completion or API call
- MySQL: Get or create customer
- Function (apply tags, calculate metrics)
- MySQL: Update customer
- MySQL: Insert audit_log

---

### Workflow #7: Escalation Handler
**Purpose:** Escalate conversations to agents when needed

**Flow:**
1. Trigger when:
   - Negative sentiment detected (from Workflow #2)
   - Customer explicitly asks for agent
   - Conversation unresolved after 3 AI exchanges
2. Check if escalation enabled in bot_config
3. Mark conversation as `escalated = true`
4. Notify admin/agent via:
   - Email notification
   - Dashboard update (Socket.IO)
   - SMS to on-call staff
5. Assign to available staff member
6. Log action in audit_logs

**Nodes:**
- Trigger: From #2 (negative sentiment) or keyword match
- MySQL: Update conversations (escalated=true)
- MySQL: Get available staff
- Email: Send to agent
- Socket.IO: Notify dashboard
- MySQL: Insert audit_log

---

### Workflow #8: Analytics Aggregator (Nightly)
**Purpose:** Calculate daily analytics, aggregate metrics

**Flow:**
1. Cron trigger: Daily at 2 AM
2. For each tenant:
   - Count messages (received, sent)
   - Count conversations (resolved, escalated)
   - Count AI responses
   - Count new customers
   - Count opt-outs
   - Calculate average response time
   - Calculate appointments booked
   - Upsert into `analytics_daily` table
3. Log completion

**Nodes:**
- Cron: Daily at 2 AM
- MySQL: Get all active tenants
- Loop tenants
  - MySQL: Count messages today (by type, direction)
  - MySQL: Count conversations (by status)
  - MySQL: Count new customers
  - MySQL: Count opt-outs
  - MySQL: Count appointments
  - MySQL: Calculate avg response time
  - MySQL: Upsert analytics_daily

---

## Environment Variables

Create a `.env` file in this directory:

```bash
# DATABASE
DATABASE_URL=mysql://waflow:waflow123@localhost:3306/waflow_n8n
DB_HOST=mysql
DB_PORT=3306
DB_NAME=waflow_n8n
DB_USER=waflow
DB_PASSWORD=waflow123

# N8N
N8N_HOST=0.0.0.0
N8N_PORT=5678
N8N_PROTOCOL=http
WEBHOOK_URL=http://localhost:5678/

# JWT & SECURITY
N8N_JWT_SECRET=your-super-secret-jwt-key-change-in-production
ENCRYPTION_KEY=1234567890123456789012345678901234567890
WHATSAPP_APP_SECRET=your_whatsapp_app_secret

# AI PROVIDERS
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=mixtral-8x7b-32768
OPENAI_API_KEY=your_openai_key  # optional
OLLAMA_API_URL=http://localhost:11434/v1  # optional

# WHATSAPP
WHATSAPP_API_TYPE=groq  # options: wwjs, meta_api
META_BUSINESS_ACCOUNT_ID=your_business_id
META_ACCESS_TOKEN=your_access_token

# EMAIL (optional, for alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# LOGGING
LOG_LEVEL=info
NODE_ENV=development
```

---

## Importing Workflows into n8n

### Option 1: Via n8n UI
1. Open n8n at http://localhost:5678
2. Click **Projects** → **Workflows**
3. Click **+ Create** → **From file** (or paste JSON)
4. Upload each workflow JSON file
5. Click **Save**
6. Test webhook with cURL (see Testing section below)

### Option 2: Via API
```bash
# Get your n8n API key from Settings → API Credentials
curl -X POST http://localhost:5678/api/v1/workflows \
  -H "X-N8N-API-KEY: your_api_key" \
  -H "Content-Type: application/json" \
  -d @workflow1.json
```

---

## Testing

### Test WhatsApp Webhook Receiver
```bash
# Simulate incoming WhatsApp message
curl -X POST http://localhost:5678/webhook/whatsapp/2 \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature: sha256=fake_signature" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "1234567890",
            "id": "msg123",
            "timestamp": "'$(date +%s)'",
            "text": {"body": "Hello bot!"}
          }]
        }
      }]
    }]
  }'
```

### Check Database
```bash
# Connect to MySQL
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n

# See recent conversations
SELECT id, phone, content, created_at FROM conversations ORDER BY created_at DESC LIMIT 5;

# See customers
SELECT id, phone, name, message_count FROM customers WHERE tenant_id = 2;

# Exit
EXIT;
```

### Monitor n8n Logs
```bash
# Real-time logs
docker-compose logs -f n8n

# Just n8n (exclude MySQL)
docker-compose logs -f n8n --tail 50
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| MySQL not connecting | Check health: `docker-compose ps`. If unhealthy, restart: `docker-compose restart mysql` |
| n8n won't start | Check logs: `docker-compose logs n8n`. Common: insufficient disk space |
| Webhook not triggering | Check path matches: `/webhook/whatsapp/:tenantId`. Verify tenant_id exists in users table |
| AI responses failing | Check API key in bot_config. Test directly: `curl https://api.groq.com/openai/v1/chat/completions -H "Authorization: Bearer $GROQ_API_KEY"` |
| Database locked | Restart MySQL: `docker-compose restart mysql`. Check for long queries: `SHOW PROCESSLIST;` |

---

## Next Steps

1. **Create admin user** in n8n (on first login)
2. **Import workflow JSONs** (see "Importing Workflows" section)
3. **Configure bot_config** for your tenant:
   - Set AI provider (Groq, OpenAI, Ollama)
   - Add WhatsApp credentials (Meta API or WWJS)
   - Set business hours
4. **Test workflows** (use cURL examples above)
5. **Connect to WhatsApp:**
   - Option A: Meta Business API (easiest)
   - Option B: whatsapp-web.js (via n8n node)
6. **Deploy to production** (see Production Deployment section)

---

## Production Deployment

### Environment
```bash
NODE_ENV=production
N8N_PROTOCOL=https
N8N_HOST=yourdomain.com
WEBHOOK_URL=https://yourdomain.com/
```

### Database Backup
```bash
# Daily backup
docker-compose exec mysql mysqldump -u waflow -pwaflow123 waflow_n8n > backup_$(date +%Y%m%d).sql

# Restore from backup
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n < backup_20260427.sql
```

### SSL/HTTPS
Use nginx reverse proxy:
```nginx
server {
  listen 443 ssl;
  server_name yourdomain.com;
  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://localhost:5678;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection upgrade;
    proxy_set_header Host $host;
  }
}
```

### Monitoring
```bash
# Check resource usage
docker stats n8n_app n8n_mysql

# Set up health check alerts
# Monitor logs: tail -f docker-compose.log

# Database monitoring
# Regular backups + test restores
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│          WhatsApp Business API / WWJS           │
└──────────────────┬──────────────────────────────┘
                   │ (Inbound Messages)
┌──────────────────▼──────────────────────────────┐
│      n8n Webhook Receiver [Workflow #1]         │
│  ✓ Validate signature, parse, rate limit       │
│  ✓ Route to appropriate workflow               │
└──────────────┬────────────────┬────────────────┘
               │                │
        ┌──────▼──────┐   ┌──────▼──────────────┐
        │ Template &  │   │ Booking Flow       │
        │ AI [WF #2]  │   │ [WF #3]            │
        └──────┬──────┘   └──────┬──────────────┘
               │                 │
        ┌──────▼──────────────────▼──────┐
        │  MySQL Database (Multi-Tenant) │
        │  • conversations               │
        │  • customers                   │
        │  • bot_config                  │
        │  • appointments, etc.          │
        └────────────┬────────────────────┘
                     │
        ┌────────────▼─────────────┐
        │  Analytics [WF #8]       │
        │  Daily Aggregation       │
        └──────────────────────────┘
```

---

## Costs (Self-Hosted)

| Service | Cost | Notes |
|---|---|---|
| Server (VM) | $5-20/mo | 1GB RAM, 10GB disk minimum |
| Database backup storage | $1-5/mo | AWS S3 or similar |
| AI API (Groq free tier) | $0 | 100 requests/day free, $0.001/token paid |
| WhatsApp API | $0.05/msg | Meta Business API pricing |
| **Total** | **$6-25/mo** | For ~1000 messages/day |

---

## Support & Issues

- **n8n Docs:** https://docs.n8n.io
- **n8n Community:** https://community.n8n.io
- **Issue:** Found a bug? Check MySQL logs and n8n logs
- **Feature:** Want to add a new workflow? Follow the pattern of existing ones

---

**Created:** 2026-04-27  
**WAFlow n8n Multi-Tenant SaaS**
