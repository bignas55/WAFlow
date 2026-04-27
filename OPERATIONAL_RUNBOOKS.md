# WAFlow Operational Runbooks

Quick reference guides for common production tasks.

---

## 1. Emergency: Application Not Responding

**Symptoms:** 502 Bad Gateway errors, requests timing out

### Immediate Actions (2 minutes)

```bash
# Check container health
docker-compose -f docker-compose.1k-users.yml ps

# Check for crashes
docker-compose logs waflow-1 | tail -50

# Check for obvious errors
docker-compose logs waflow-1 | grep "❌" | tail -10
```

### Recovery Steps

**If all instances are down:**

```bash
# Restart all services
docker-compose -f docker-compose.1k-users.yml restart waflow-1 waflow-2 waflow-3

# Wait 15 seconds for startup
sleep 15

# Verify health
./scripts/health-check.sh

# If still down, check dependencies
docker-compose logs db | tail -20
docker-compose logs redis | tail -20
```

**If one instance is down:**

```bash
# Restart just that instance
docker-compose -f docker-compose.1k-users.yml restart waflow-1

# Nginx will auto-failover to other instances
# Verify in 5 seconds
curl http://localhost/health
```

**If Redis is down:**

```bash
# Restart Redis
docker-compose -f docker-compose.1k-users.yml restart redis

# Cache will fall back to local in-memory
# Data won't be lost but multi-instance cache won't sync
```

**If MySQL is down:**

```bash
# Restart MySQL
docker-compose -f docker-compose.1k-users.yml restart db

# Wait 30 seconds for recovery
sleep 30

# Check connection
mysql -h localhost -u waflow -pwaflow -e "SELECT 1;"
```

---

## 2. Emergency: Database Locked / Performance Degradation

**Symptoms:** Slow responses, high CPU, message queue backing up

### Diagnosis (1 minute)

```bash
# Check active processes
mysql -e "SHOW PROCESSLIST\G" | head -30

# Check table locks
mysql -e "SHOW OPEN TABLES WHERE In_use > 0;"

# Check cache status
redis-cli INFO stats | grep -E "total_connections|total_commands_processed"
```

### Recovery

**If there's a long-running query:**

```bash
# Kill the query (CAREFULLY - get ID from PROCESSLIST)
mysql -e "KILL <query_id>;"

# The client will get an error but DB will unlock
```

**If MySQL is out of connections:**

```bash
# Check current connections
mysql -e "SHOW STATUS LIKE 'Threads%';"

# Restart MySQL to reset pool
docker-compose -f docker-compose.1k-users.yml restart db
```

**If Redis is at memory limit:**

```bash
# Check memory usage
redis-cli INFO memory

# Clear old cache
redis-cli FLUSHDB  # ⚠️ WARNING: This drops all cache data

# Or just restart
docker-compose -f docker-compose.1k-users.yml restart redis

# Monitor recovery
watch -n 1 'redis-cli INFO memory | grep used_memory'
```

---

## 3. Emergency: Data Corruption Suspected

**Symptoms:** Conversations appearing in wrong order, duplicate messages, missing messages

### Diagnosis

```bash
# Check database integrity
mysql -e "CHECK TABLE conversations;" waflow

# Check for locks
mysql -e "SHOW OPEN TABLES WHERE In_use > 0;"

# Look for recent errors
docker-compose logs waflow-1 | grep "error\|Error" | tail -20
```

### Recovery

**Option 1: Restore from backup (safest)**

```bash
# Find latest backup
ls -lh backups/ | tail -5

# Restore
gunzip < backups/waflow_20260425.sql.gz | mysql -u waflow -pwaflow waflow

# Verify data
mysql -e "SELECT COUNT(*) FROM conversations;" waflow
```

**Option 2: Repair table**

```bash
# Only if backup not available
mysql -e "REPAIR TABLE conversations;" waflow

# Verify
mysql -e "CHECK TABLE conversations;" waflow
```

---

## 4. Database Backup & Recovery

### Create Manual Backup

```bash
# Full backup with timestamp
mysqldump -u waflow -pwaflow waflow | \
  gzip > backups/waflow_$(date +%Y%m%d_%H%M%S).sql.gz

# Verify backup
gunzip -t backups/waflow_*.sql.gz | head -1

# Upload to cloud
aws s3 cp backups/waflow_*.sql.gz s3://your-bucket/backups/
```

### Restore from Backup

```bash
# List available backups
ls -lh backups/

# Restore specific backup
gunzip < backups/waflow_20260425.sql.gz | mysql -u waflow -pwaflow waflow

# Verify restoration
mysql -e "SELECT COUNT(*) FROM conversations;" waflow

# Check data integrity
mysql -e "SELECT MAX(createdAt) FROM conversations;" waflow
```

---

## 5. Scale to 4 Instances

**Use this when 1000-user load approaches limits**

### Add New Instance

```bash
# Edit docker-compose.1k-users.yml and add:
  waflow-4:
    image: waflow:latest
    ports:
      - "3003:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      # ... rest of env vars from waflow-1
    depends_on:
      - db
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3

# Update Nginx config to include upstream port 3003
# Then restart
docker-compose -f docker-compose.1k-users.yml restart nginx

# Verify
curl http://localhost:3003/health
```

### Database Connection Pool Adjustment

```bash
# Edit .env.production
DB_CONNECTION_LIMIT=375  # (1500 / 4 instances)

# Restart instances
docker-compose -f docker-compose.1k-users.yml restart waflow-1 waflow-2 waflow-3 waflow-4
```

---

## 6. Cache Issues

### Clear All Cache

```bash
# Clear Redis
redis-cli FLUSHDB

# Instances will rebuild cache on next requests
# Monitor:
docker-compose logs waflow-1 | grep "Cache MISS"
```

### Increase Cache TTL

For slower-changing data (less frequent invalidation):

```bash
# Edit .env.production
CONFIG_CACHE_TTL=7200      # 2 hours (was 1)
TEMPLATE_CACHE_TTL=7200    # 2 hours (was 1)
KB_CACHE_TTL=86400         # 24 hours (was 2)

# Restart instances
docker-compose restart waflow-1 waflow-2 waflow-3

# Monitor cache hit improvements
docker-compose logs waflow-1 | grep "Cache HIT" | wc -l
```

### Troubleshoot Cache Misses

```bash
# Check if Redis is connected
docker-compose logs waflow-1 | grep "Redis"

# Expected: ✅ Cache service initialized with Redis

# If not connected, Redis may be down
docker-compose restart redis

# Monitor Redis health
redis-cli ping
redis-cli INFO server
```

---

## 7. Monitoring & Alerts

### Daily Health Check

```bash
# Run this every morning
./scripts/health-check.sh

# Expected output:
# ✅ All 3 instances healthy
# ✅ MySQL healthy
# ✅ Redis healthy
# ✅ Nginx healthy
```

### Weekly Performance Review

```bash
# Export metrics
./scripts/metrics-export.sh

# Review logs
docker-compose logs --tail 1000 waflow-1 > weekly_logs.txt

# Check cache effectiveness
docker-compose logs waflow-1 | grep -c "Cache HIT"
docker-compose logs waflow-1 | grep -c "Cache MISS"

# Check error rate
docker-compose logs waflow-1 | grep -c "❌"
```

### Setup Email Alerts

```bash
# Edit .env.production
ALERT_WEBHOOK_URL=https://your-monitoring.com/webhooks/waflow

# Or for Slack
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Test alert
curl -X POST $ALERT_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"text":"WAFlow test alert","severity":"info"}'
```

---

## 8. Log Management

### View Live Logs

```bash
# All instances
docker-compose logs -f waflow-1 waflow-2 waflow-3

# Specific instance
docker-compose logs -f waflow-1

# Last 100 lines
docker-compose logs --tail 100 waflow-1

# Filter by errors
docker-compose logs waflow-1 | grep "❌"
```

### Export Logs for Analysis

```bash
# Export last 1000 lines
docker-compose logs --tail 1000 waflow-1 > logs_$(date +%Y%m%d_%H%M%S).txt

# Export with timestamps
docker-compose logs waflow-1 --timestamps > logs_with_time.txt

# Send to S3
aws s3 cp logs_*.txt s3://your-bucket/logs/
```

### Archive Old Logs

```bash
# Keep only last 7 days of logs
docker-compose logs waflow-1 | tail -n 100000 > logs_current.txt

# Or configure log driver in docker-compose
# "log-driver": "json-file",
# "log-opts": {
#   "max-size": "100m",
#   "max-file": "10"
# }
```

---

## 9. Configuration Changes

### Update Environment Variables

```bash
# Edit .env.production
nano .env.production

# Apply changes (restart all instances)
docker-compose -f docker-compose.1k-users.yml restart waflow-1 waflow-2 waflow-3

# Verify
docker-compose logs waflow-1 | grep "Starting"
```

### Update Application Code

```bash
# Pull latest
git pull origin main

# Build new version
pnpm build:server
pnpm build:client

# Restart instances one at a time (zero-downtime)
docker-compose -f docker-compose.1k-users.yml restart waflow-1
sleep 30

docker-compose -f docker-compose.1k-users.yml restart waflow-2
sleep 30

docker-compose -f docker-compose.1k-users.yml restart waflow-3

# Verify all running
./scripts/health-check.sh
```

---

## 10. Troubleshooting Guide

### Issue: Messages not processing

**Check:**
```bash
# 1. Is WhatsApp connected?
curl http://localhost/api/trpc/whatsapp.getStatus

# 2. Are rate limiters blocking?
mysql -e "SELECT * FROM rate_limits ORDER BY createdAt DESC LIMIT 5;" waflow

# 3. Are templates matching?
mysql -e "SELECT COUNT(*) FROM templates WHERE tenantId = 1;" waflow

# 4. Check pipeline logs
docker-compose logs waflow-1 | grep "Pipeline"
```

### Issue: Slow responses

**Check:**
```bash
# 1. Database performance
mysql -e "SHOW STATUS LIKE 'Innodb_rows%';" waflow

# 2. Cache hit rate
docker-compose logs waflow-1 | grep "Cache HIT" | wc -l

# 3. Queue depth
redis-cli LLEN message_queue

# 4. Instance CPU
docker stats waflow-1 --no-stream
```

### Issue: High memory usage

**Check:**
```bash
# 1. Redis memory
redis-cli INFO memory

# 2. Node.js heap
docker exec waflow-1 node -e "console.log(process.memoryUsage())"

# 3. Container memory limit
docker inspect waflow-1 | grep -A 5 "Memory"
```

---

## Quick Command Reference

```bash
# Health status
./scripts/health-check.sh

# View logs
docker-compose logs -f waflow-1

# Restart instance
docker-compose restart waflow-1

# Check database
mysql -h localhost -u waflow -pwaflow waflow -e "SHOW STATUS;"

# Check Redis
redis-cli INFO

# Monitor containers
watch -n 1 'docker stats --no-stream'

# Export metrics
./scripts/metrics-export.sh

# Backup database
mysqldump -u waflow -pwaflow waflow | gzip > backup_$(date +%Y%m%d).sql.gz

# Clear cache
redis-cli FLUSHDB

# Check connections
mysql -e "SHOW PROCESSLIST;" waflow

# Restart all
docker-compose -f docker-compose.1k-users.yml restart
```

---

## Emergency Contact

- **Database issues:** Check `STABILITY_AUDIT_FIXES.md` section on database errors
- **Cache issues:** See `INTEGRATION_GUIDE.md` cache configuration
- **Performance issues:** See `LOAD_TESTING_GUIDE.md` baseline metrics
- **Deployment issues:** See `PRODUCTION_DEPLOYMENT.md` troubleshooting section

---

**Last Updated:** April 25, 2026  
**Applicable to:** WAFlow 1000-user production setup
