# WAFlow n8n Multi-Tenant SaaS Platform

**Build a WhatsApp SaaS platform with n8n + MySQL in minutes, not months.**

Complete multi-tenant architecture with AI responses, appointment booking, CRM, broadcasting, and analytics — no code required.

---

## What You Get

✅ **Complete n8n Platform**
- 8 core workflows (webhook receiver, AI response, booking, broadcast, escalation, analytics, etc.)
- Multi-tenant isolation (every tenant gets their own data silo)
- Webhook receivers for WhatsApp integration
- Database layer (16 tables, fully normalized)

✅ **Production-Ready**
- Docker Compose setup (MySQL + n8n)
- Security best practices (JWT, encryption, rate limiting)
- Audit logging & compliance-ready
- Scalable database schema
- Error handling & resilience

✅ **AI-Powered**
- Groq API integration (free tier: 100 req/day)
- Fallback to OpenAI or Ollama
- Knowledge base RAG for context-aware responses
- Sentiment analysis & escalation

✅ **Multi-Tenancy**
- Every tenant = one user record
- Complete data isolation via `tenant_id` filtering
- Per-tenant configurations (AI provider, WhatsApp settings, business hours)
- Admin dashboard for super-admin (you)

---

## Quick Start (5 minutes)

### Prerequisites
```bash
# Check you have these installed:
docker --version       # Should be 20.10+
docker-compose --version  # Should be 1.29+
```

### Start Everything

```bash
# 1. Navigate to this directory
cd n8n-waflow-setup

# 2. Make scripts executable
chmod +x quickstart.sh test-webhook.sh

# 3. Run quick start (starts MySQL + n8n)
./quickstart.sh
```

That's it! You'll see:
```
✅ SETUP COMPLETE!
📍 n8n URL: http://localhost:5678
```

### Access n8n

1. Open **http://localhost:5678** in your browser
2. Create admin account (first time only)
3. Import the workflow JSON files (see below)

---

## Architecture

### Database Layer
- **MySQL 8.0** with 16 tables
- **Multi-tenant schema:** Every table has `tenant_id` column
- **Data isolation:** All queries filter by tenant
- **Seeded data:** Admin user, demo tenant, sample templates

### Workflow Layer
- **8 core workflows** in n8n
- **Webhook receivers** for inbound WhatsApp messages
- **Database nodes** for CRUD operations
- **External API calls** to Groq/OpenAI/Ollama

### Integration Points
```
WhatsApp → Webhook → n8n Workflows → MySQL
                  ↓
              Groq API
              (AI responses)
```

---

## Workflow Overview

| # | Workflow | Purpose | Trigger |
|---|----------|---------|---------|
| 1 | Webhook Receiver | Parse WhatsApp messages, validate, route | HTTP POST `/webhook/whatsapp/:tenantId` |
| 2 | Template & AI | Match templates or generate AI responses | From Workflow #1 |
| 3 | Booking Flow | Collect booking info, create appointments | Keyword match: "book", "appointment" |
| 4 | Reminder Sender | Send appointment reminders 24h before | Cron: hourly |
| 5 | Broadcast Sender | Send scheduled bulk messages | Cron: every 5min |
| 6 | Customer CRM | Update customer data, apply tags | From Workflow #2 |
| 7 | Escalation Handler | Escalate to agents when needed | Negative sentiment or explicit request |
| 8 | Analytics Aggregator | Calculate daily metrics | Cron: daily at 2 AM |

---

## Setup Checklist

- [ ] Run `./quickstart.sh`
- [ ] Create admin account in n8n (http://localhost:5678)
- [ ] Copy `.env.template` to `.env`
- [ ] Add your Groq API key to `.env` (free at https://console.groq.com)
- [ ] Import workflow JSON files in n8n:
  - [ ] `workflow-1-webhook-receiver.json`
  - [ ] `workflow-2-template-ai.json`
- [ ] Update `bot_config` table with your AI settings
- [ ] Test with `./test-webhook.sh`
- [ ] Connect WhatsApp Business Account (Meta API)
- [ ] Create templates and knowledge base articles
- [ ] Enable workflows

---

## Files Explained

```
n8n-waflow-setup/
├── docker-compose.yml           # Start MySQL + n8n
├── init.sql                     # Database schema (16 tables)
├── .env.template                # Environment variables (copy to .env)
├── quickstart.sh                # One-command setup
├── test-webhook.sh              # Test webhook receiver
├── SETUP_GUIDE.md              # Detailed guide (this is comprehensive!)
│
├── workflow-1-webhook-receiver.json  # Parse WhatsApp messages
├── workflow-2-template-ai.json       # Template + AI response
├── workflow-3-booking.json           # Appointment booking
├── workflow-4-reminders.json         # Scheduled reminders
├── workflow-5-broadcast.json         # Bulk message sending
├── workflow-6-crm.json               # Customer data sync
├── workflow-7-escalation.json        # Agent escalation
└── workflow-8-analytics.json         # Daily metrics
```

---

## Configuration

### 1. AI Provider

Edit `.env` to choose your AI:

**Groq (Recommended for free tier):**
```bash
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
GROQ_MODEL=mixtral-8x7b-32768
```

**OpenAI:**
```bash
OPENAI_API_KEY=sk-xxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
```

**Ollama (Self-hosted, free):**
```bash
OLLAMA_API_URL=http://localhost:11434/v1
OLLAMA_MODEL=mistral
```

### 2. WhatsApp Integration

Update `bot_config` table:

```sql
UPDATE bot_config 
SET 
  whatsapp_api_type = 'meta_api',
  meta_api_access_token = 'your_token',
  meta_api_phone_number_id = 'your_phone_id',
  ai_provider = 'groq',
  ai_api_key = 'your_groq_key',
  ai_model = 'mixtral-8x7b-32768'
WHERE tenant_id = 2;
```

### 3. Business Hours

```sql
UPDATE bot_config 
SET 
  business_hours_enabled = true,
  business_hours_start = '09:00:00',
  business_hours_end = '17:00:00',
  business_hours_timezone = 'America/New_York',
  after_hours_message = 'We are closed now. We will respond during business hours.'
WHERE tenant_id = 2;
```

---

## Database Access

### Command Line
```bash
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n
```

### Query Examples

**See recent messages:**
```sql
SELECT * FROM conversations 
ORDER BY created_at DESC LIMIT 10;
```

**See customers:**
```sql
SELECT * FROM customers 
WHERE tenant_id = 2;
```

**See templates:**
```sql
SELECT * FROM templates 
WHERE tenant_id = 2;
```

---

## Testing

### Test Webhook
```bash
./test-webhook.sh
```

### Manual Test with cURL
```bash
curl -X POST http://localhost:5678/webhook/whatsapp/2 \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "1234567890",
            "id": "test123",
            "timestamp": "'$(date +%s)'",
            "text": {
              "body": "Hello!"
            }
          }]
        }
      }]
    }]
  }'
```

### Check Logs
```bash
docker-compose logs -f n8n      # n8n logs
docker-compose logs -f mysql    # MySQL logs
docker-compose ps               # Container status
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 5678 already in use | `lsof -ti:5678 \| xargs kill` or change port in docker-compose.yml |
| MySQL connection refused | `docker-compose logs mysql` — check for errors |
| n8n won't start | Check disk space: `df -h`. Restart: `docker-compose restart n8n` |
| AI API returns 401 | Check API key in `.env` and bot_config |
| Webhook not triggering | Verify tenant_id matches URL path: `/webhook/whatsapp/2` |
| Database locked | Restart MySQL: `docker-compose restart mysql` |

---

## Deploying to Production

### Environment Setup
```bash
# Update .env for production
NODE_ENV=production
N8N_PROTOCOL=https
N8N_HOST=yourdomain.com
N8N_JWT_SECRET=<long-random-string>
ENCRYPTION_KEY=<32-byte-hex>
WHATSAPP_APP_SECRET=<your-secret>
```

### Database Backup
```bash
# Daily backup
docker-compose exec mysql mysqldump -u waflow -pwaflow123 waflow_n8n > backup.sql

# Restore
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n < backup.sql
```

### SSL/HTTPS
Use nginx reverse proxy in front of n8n on port 443.

### Monitoring
```bash
docker stats                    # Resource usage
docker-compose logs -f --tail 100  # Recent logs
```

---

## Multi-Tenancy Explained

### How It Works
1. **Every user is a tenant** — `users.id` = `tenant_id`
2. **Data isolation** — All queries include `WHERE tenant_id = $tenant_id`
3. **Separate configurations** — Each tenant has own bot_config, templates, KB
4. **Complete isolation** — One tenant can't see another's data

### Example: Workflow Pattern
```javascript
// 1. Extract tenant_id from request
const tenantId = $request.params.tenantId;

// 2. Verify tenant exists
SELECT * FROM users WHERE id = $tenantId;

// 3. Filter all queries by tenant
SELECT * FROM conversations 
WHERE tenant_id = $tenantId AND phone = '123456';

// 4. Isolate response
return { data: results, tenantId };
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│      WhatsApp Business API / WWJS       │
└────────────────┬────────────────────────┘
                 │
        ┌────────▼──────────┐
        │  n8n Webhook      │
        │  /webhook/        │
        │  whatsapp/:id     │
        └────────┬──────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
┌───▼──────────┐  ┌──────────▼───┐
│ Template &   │  │ Booking Flow │
│ AI Response  │  │              │
└───┬──────────┘  └──────────┬───┘
    │                        │
    └────────────┬───────────┘
             ┌───▼────────────┐
             │  MySQL (16TB)  │
             │  Multi-Tenant  │
             └────────────────┘
```

---

## Costs (Self-Hosted MVP)

| Service | Cost | Notes |
|---------|------|-------|
| Server | $5-20/mo | 1GB RAM, 10GB disk |
| Backup storage | $1-5/mo | AWS S3 |
| Groq API | $0/mo | 100 free requests/day |
| WhatsApp API | $0.05/msg | $1 per 20 msgs |
| **Total** | **$6-25/mo** | For 1000 msgs/day |

---

## Next Steps

1. **✅ Run quickstart.sh** (you are here!)
2. **Create admin account** in n8n (http://localhost:5678)
3. **Import workflows** from JSON files
4. **Add Groq API key** to `.env`
5. **Configure bot_config** for your tenant
6. **Connect WhatsApp** via Meta Business API
7. **Create templates** in the templates table
8. **Test webhooks** with `./test-webhook.sh`
9. **Enable workflows** and activate tenant

---

## FAQ

**Q: Can I add my own workflows?**
A: Absolutely! n8n supports 400+ integrations. Follow the pattern of existing workflows.

**Q: How many tenants can I have?**
A: Unlimited. Data is completely isolated per tenant. Scale horizontally by running multiple n8n instances.

**Q: Can I use a different AI provider?**
A: Yes! Groq, OpenAI, Ollama, Azure OpenAI, etc. Update the HTTP Call node in workflows.

**Q: How do I backup the database?**
A: `docker-compose exec mysql mysqldump -u waflow -pwaflow123 waflow_n8n > backup.sql`

**Q: Can I export/import workflows?**
A: Yes! n8n has built-in export/import. Both JSON exports are included.

---

## Support

- **n8n Docs:** https://docs.n8n.io
- **n8n Community:** https://community.n8n.io
- **MySQL Docs:** https://dev.mysql.com/doc/
- **Groq API:** https://console.groq.com

---

## License

This platform is provided as-is for educational and commercial use.

---

**Created:** 2026-04-27  
**Version:** 1.0.0  
**Author:** WAFlow Team
