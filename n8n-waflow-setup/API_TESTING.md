# WAFlow n8n — API Testing & Webhook Guide

## Quick Reference

### Get Your URLs

```bash
# Frontend/Admin Dashboard
http://localhost:5678

# Webhook Receiver (for WhatsApp)
http://localhost:5678/webhook/whatsapp/:tenantId

# MySQL Database
localhost:3306 (user: waflow, password: waflow123)
```

---

## Testing Webhooks

### Test 1: Send a Simple Message

```bash
curl -X POST http://localhost:5678/webhook/whatsapp/2 \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "1234567890",
            "id": "msg_'$(date +%s)'_1",
            "timestamp": "'$(date +%s)'",
            "type": "text",
            "text": {
              "body": "Hello! What are your hours?"
            }
          }]
        }
      }]
    }]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Message received"
}
```

**Verify in Database:**
```bash
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n -e \
  "SELECT id, phone, content, direction, created_at FROM conversations ORDER BY created_at DESC LIMIT 5;"
```

---

### Test 2: Send a Booking Request

```bash
curl -X POST http://localhost:5678/webhook/whatsapp/2 \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "9876543210",
            "id": "msg_'$(date +%s)'_2",
            "timestamp": "'$(date +%s)'",
            "type": "text",
            "text": {
              "body": "I want to book an appointment"
            }
          }]
        }
      }]
    }]
  }'
```

**Expected:** Message routed to Workflow #3 (Booking Flow)

---

### Test 3: Multiple Messages from Same Customer

```bash
for i in {1..5}; do
  curl -X POST http://localhost:5678/webhook/whatsapp/2 \
    -H "Content-Type: application/json" \
    -d '{
      "entry": [{
        "changes": [{
          "value": {
            "messages": [{
              "from": "1234567890",
              "id": "msg_'$(date +%s)'_'$i'",
              "timestamp": "'$(date +%s)'",
              "type": "text",
              "text": {
                "body": "Message '$i'"
              }
            }]
          }
        }]
      }]
    }'
  sleep 1
done
```

**Verify:** Check `message_count` for customer incremented:
```bash
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n -e \
  "SELECT phone, name, message_count, last_message_at FROM customers WHERE tenant_id = 2;"
```

---

## Database Testing

### Connect to MySQL

```bash
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n
```

### See Recent Messages

```sql
SELECT id, phone, content, direction, source, created_at 
FROM conversations 
WHERE tenant_id = 2 
ORDER BY created_at DESC 
LIMIT 10;
```

### See Customers

```sql
SELECT id, phone, name, message_count, last_message_at, opted_out
FROM customers 
WHERE tenant_id = 2
ORDER BY message_count DESC;
```

### See Templates

```sql
SELECT id, name, trigger_keywords, response_text, priority
FROM templates 
WHERE tenant_id = 2
ORDER BY priority DESC;
```

### See Bot Config

```sql
SELECT * FROM bot_config WHERE tenant_id = 2\G
```

### See Appointments

```sql
SELECT a.id, c.name, a.service, a.date, a.time_start, a.status
FROM appointments a
LEFT JOIN customers c ON a.customer_id = c.id
WHERE a.tenant_id = 2
ORDER BY a.date DESC;
```

---

## n8n Testing

### Check Workflow Status

```bash
# View n8n logs in real-time
docker-compose logs -f n8n --tail 100

# Look for:
# - "Workflow started"
# - "Database query executed"
# - "HTTP request sent"
# - "Workflow completed"
```

### Check n8n API

```bash
# Get n8n API key from n8n UI: Settings → API Credentials

# List workflows
curl -X GET http://localhost:5678/api/v1/workflows \
  -H "X-N8N-API-KEY: your_api_key"

# Execute workflow manually
curl -X POST http://localhost:5678/api/v1/workflows/1/execute \
  -H "X-N8N-API-KEY: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"testData": true}'
```

---

## Load Testing

### Simulate High Volume

```bash
# Send 100 messages in parallel
for i in {1..100}; do
  curl -X POST http://localhost:5678/webhook/whatsapp/2 \
    -H "Content-Type: application/json" \
    -d '{
      "entry": [{
        "changes": [{
          "value": {
            "messages": [{
              "from": "555555'$(printf "%04d" $i)'",
              "id": "msg_'$(date +%s)'_'$i'",
              "timestamp": "'$(date +%s)'",
              "type": "text",
              "text": {
                "body": "Stress test message '$i'"
              }
            }]
          }
        }]
      }]
    }' &
done
wait
```

**Monitor with:**
```bash
# Watch message count grow
while true; do
  docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n -e \
    "SELECT COUNT(*) as total_messages FROM conversations WHERE tenant_id = 2;"
  sleep 2
done
```

---

## Debugging

### Check Database Connection

```bash
docker-compose exec n8n bash -c "mysql -h mysql -u waflow -pwaflow123 waflow_n8n -e 'SELECT 1;'"
```

### Check Groq API

```bash
# Test your Groq API key
curl -X POST https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mixtral-8x7b-32768",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### Check Workflow Executions

In n8n UI:
1. Click on a workflow
2. Click **Executions** tab
3. See all past runs with:
   - Execution time
   - Node-by-node logs
   - Errors and warnings
   - Input/output for each node

---

## Common Issues & Fixes

### Webhook Returns 404

**Problem:** `curl: (52) Empty reply from server`

**Fix:**
```bash
# Check if workflow is active
docker-compose logs n8n | grep "webhook"

# Verify path matches workflow: /webhook/whatsapp/:tenantId
# Check tenant_id exists:
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n -e \
  "SELECT id, email FROM users WHERE id = 2;"
```

### AI Response Not Generated

**Problem:** Workflow runs but no AI response in conversations table

**Fix:**
```bash
# Check Groq API key in .env
grep GROQ_API_KEY .env

# Test Groq directly
GROQ_API_KEY=$(grep GROQ_API_KEY .env | cut -d= -f2)
curl https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "mixtral-8x7b-32768", "messages": [{"role": "user", "content": "Test"}]}'

# If returns 401, regenerate key at console.groq.com
```

### Database Locked

**Problem:** `Error: LOCK WAIT TIMEOUT EXCEEDED`

**Fix:**
```bash
docker-compose restart mysql
```

### n8n Won't Start

**Problem:** Port 5678 already in use

**Fix:**
```bash
# Find what's using port 5678
lsof -ti:5678 | xargs kill

# Or change port in docker-compose.yml
# Change "5678:5678" to "5679:5678"
```

---

## Performance Monitoring

### Real-Time Stats

```bash
# Database size
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n -e \
  "SELECT table_name, ROUND(((data_length + index_length) / 1024 / 1024), 2) as size_mb FROM information_schema.TABLES WHERE table_schema = 'waflow_n8n' ORDER BY size_mb DESC;"

# Message count by hour
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n -e \
  "SELECT DATE(created_at) as date, COUNT(*) as count FROM conversations GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 7;"

# Container stats
docker stats --no-stream
```

---

## Backup & Restore

### Backup Database

```bash
# Full backup
docker-compose exec mysql mysqldump -u waflow -pwaflow123 waflow_n8n > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup with gzip compression
docker-compose exec mysql mysqldump -u waflow -pwaflow123 waflow_n8n | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restore Database

```bash
# From uncompressed backup
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n < backup_20260427_120000.sql

# From gzipped backup
gunzip -c backup_20260427_120000.sql.gz | docker-compose exec -T mysql mysql -u waflow -pwaflow123 waflow_n8n
```

---

## Next Steps

1. **Send test webhooks** using examples above
2. **Monitor logs:** `docker-compose logs -f n8n`
3. **Check database:** `docker-compose exec mysql mysql ...`
4. **Visit n8n UI:** http://localhost:5678
5. **Create templates** in the `templates` table
6. **Add knowledge base** articles in `knowledge_base` table
7. **Test each workflow** individually

---

## Support Commands

```bash
# Show all running containers
docker-compose ps

# View container logs
docker-compose logs [service] -f --tail 50

# Execute command in container
docker-compose exec [service] [command]

# Restart service
docker-compose restart [service]

# Stop all
docker-compose stop

# Start all
docker-compose start

# Remove containers (keep volumes)
docker-compose down

# Remove everything (wipe data)
docker-compose down -v
```

---

**Questions?** Check SETUP_GUIDE.md for more detailed information.
