# WAFlow Production Deployment Guide

**Scale:** 1000 concurrent users  
**Architecture:** 3-instance load-balanced setup with shared MySQL and Redis  
**Latency Target:** <2 second message responses, instant template/cached responses  
**Status:** Production-ready

---

## Pre-Deployment Checklist

### 1. Environment Setup

- [ ] Copy `.env.production` to `/root/.env` or container env vars
- [ ] Generate new `JWT_SECRET` (64+ character random string)
- [ ] Generate new `ENCRYPTION_KEY` (32-byte hex, never change after launch)
- [ ] Set `AI_API_KEY` (Groq, OpenAI, or Ollama)
- [ ] Set `WHATSAPP_APP_SECRET` (from Meta Business console)
- [ ] Set `DATABASE_URL` to production MySQL
- [ ] Set `REDIS_URL` to production Redis
- [ ] Verify all environment variables with `env | grep -E "DATABASE_URL|JWT_SECRET|AI_|WHATSAPP_"`

### 2. Infrastructure Readiness

- [ ] Docker and Docker Compose installed
- [ ] Sufficient disk space for logs and backups (100GB+ recommended)
- [ ] MySQL database created and empty
- [ ] Redis instance running and accessible
- [ ] Firewall allows: port 80 (Nginx), 3306 (MySQL), 6379 (Redis)
- [ ] SSL certificates ready (for HTTPS, optional but recommended)

### 3. Database Preparation

```bash
# Create empty database
mysql -u root -p -e "CREATE DATABASE waflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Create app user with permissions
mysql -u root -p -e "GRANT ALL PRIVILEGES ON waflow.* TO 'waflow'@'%' IDENTIFIED BY 'your_secure_password';"
mysql -u root -p -e "FLUSH PRIVILEGES;"
```

### 4. Data Backup

```bash
# If migrating from existing system, backup current database
mysqldump -u waflow -p waflow > backup_$(date +%Y%m%d_%H%M%S).sql

# Store backup securely
aws s3 cp backup_*.sql s3://your-backup-bucket/
```

---

## Deployment Steps

### Step 1: Clone and Prepare Repository

```bash
cd /opt/waflow  # or your deployment directory

git clone https://github.com/yourusername/waflow.git .
git checkout main

# Install dependencies
pnpm install
```

### Step 2: Build Application

```bash
# Build frontend (React/Vite)
pnpm build:client

# Build server (TypeScript compilation)
pnpm build:server

# Verify build artifacts
ls -la dist/
ls -la server/dist/
```

### Step 3: Run Database Migrations

```bash
# Set environment
export DATABASE_URL="mysql://waflow:password@localhost:3306/waflow"

# Run migrations
pnpm drizzle:migrate

# Seed default admin user + templates
pnpm db:seed

# Verify schema
mysql -u waflow -p waflow -e "SHOW TABLES;" | wc -l  # Should show 42 tables
```

### Step 4: Start Production Infrastructure

```bash
# Navigate to project directory
cd /opt/waflow

# Set production environment
export NODE_ENV=production

# Load all environment variables
source .env.production

# Start the 3-instance setup
docker-compose -f docker-compose.1k-users.yml up -d

# Wait for services to be healthy
sleep 15

# Verify all containers are running
docker-compose -f docker-compose.1k-users.yml ps
```

**Expected output:**
```
NAME                COMMAND                  SERVICE      STATUS      PORTS
waflow-1            "node server/dist/in"   waflow-1     Up (healthy)
waflow-2            "node server/dist/in"   waflow-2     Up (healthy)
waflow-3            "node server/dist/in"   waflow-3     Up (healthy)
waflow-db           "docker-entrypoint.s"   db           Up (healthy)
waflow-redis        "redis-server"          redis        Up (healthy)
nginx               "nginx -g daemon of"    nginx        Up (healthy)
```

### Step 5: Health Verification

```bash
# Test Nginx load balancer
curl http://localhost/health

# Test individual instances
for port in 3000 3001 3002; do
  echo "Testing port $port:"
  curl http://localhost:$port/health
done

# Test database connectivity
mysql -h localhost -u waflow -p waflow -e "SELECT COUNT(*) FROM users;"

# Test Redis connectivity
redis-cli -h localhost PING
```

### Step 6: Verify Cache Service

```bash
# Check cache is initialized
docker-compose -f docker-compose.1k-users.yml logs waflow-1 | grep "Cache service"

# Expected: ✅ Cache service initialized with Redis

# Monitor cache activity
docker-compose -f docker-compose.1k-users.yml logs -f waflow-1 | grep "Cache HIT"
```

### Step 7: Configure Monitoring

```bash
# Copy monitoring scripts
chmod +x scripts/health-check.sh
chmod +x scripts/auto-recovery.sh
chmod +x scripts/metrics-export.sh

# Setup cron for auto-recovery (every 5 minutes)
(crontab -l 2>/dev/null || echo "") | \
  (cat; echo "*/5 * * * * /opt/waflow/scripts/auto-recovery.sh >> /var/log/waflow-recovery.log 2>&1") | \
  crontab -

# Setup cron for metrics export (every 60 minutes)
(crontab -l 2>/dev/null || echo "") | \
  (cat; echo "0 * * * * /opt/waflow/scripts/metrics-export.sh >> /var/log/waflow-metrics.log 2>&1") | \
  crontab -

# Verify cron jobs
crontab -l | grep waflow
```

### Step 8: Test Admin Login

```bash
# Default credentials from seed:
# Email: admin@waflow.com
# Password: admin123

# Open http://localhost in browser
# Login and change password immediately
```

---

## Post-Deployment Configuration

### 1. HTTPS Setup (Recommended)

```bash
# If using Let's Encrypt with Certbot:
certbot certonly --standalone -d api.waflow.com -d app.waflow.com

# Update Nginx configuration to use SSL certificates
# See docker-compose.1k-users.yml for examples

# Restart Nginx
docker-compose -f docker-compose.1k-users.yml restart nginx
```

### 2. Email Alerts Configuration

Update `.env.production`:

```bash
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Or for custom HTTP endpoint:
ALERT_WEBHOOK_URL=https://your-monitoring-service.com/webhooks/waflow
```

### 3. Database Backups

```bash
# Setup automated daily backups
(crontab -l 2>/dev/null || echo "") | \
  (cat; echo "0 2 * * * mysqldump -u waflow -p\$MYSQL_PASSWORD waflow | gzip > /backups/waflow_\$(date +\\%Y\\%m\\%d).sql.gz") | \
  crontab -

# Or use AWS RDS automated backups (recommended)
```

### 4. Log Aggregation (Optional)

```bash
# Configure log forwarding to ELK, Datadog, or CloudWatch

# Example: Forward logs to CloudWatch
docker-compose -f docker-compose.1k-users.yml logs \
  --follow waflow-1 waflow-2 waflow-3 | \
  aws logs put-log-events \
    --log-group-name /waflow/production \
    --log-stream-name app-logs
```

---

## Capacity Testing

### Test 1: Health Check

```bash
./scripts/health-check.sh

# All containers should show "Up (healthy)"
# All connection tests should pass
```

### Test 2: Concurrent User Simulation

```bash
# Using Apache Bench or similar tool
ab -n 1000 -c 100 http://localhost/api/trpc/auth.me

# Expected: All requests succeed within 2s
# Database pool should not be exhausted
```

### Test 3: Message Load Test

```bash
# Use a tool to simulate WhatsApp webhooks
# Example: Send 100 messages/second to /api/whatsapp/webhook

# Monitor:
# - Response time stays < 500ms for template matches
# - Response time stays < 2s for AI responses
# - Error rate remains 0%
# - Database pool utilization < 80%
```

### Test 4: Failover Simulation

```bash
# Stop one instance and verify others handle traffic
docker-compose -f docker-compose.1k-users.yml stop waflow-1

# Monitor Nginx load balancing
curl http://localhost/health  # Should still succeed

# Restart failed instance
docker-compose -f docker-compose.1k-users.yml start waflow-1
```

---

## Production Monitoring

### Key Metrics to Watch

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **CPU Usage** | <70% | >85% |
| **Memory Usage** | <75% | >90% |
| **Disk Space** | >20% free | <5% free |
| **DB Connections** | <400 per instance | >450 per instance |
| **Redis Memory** | <3GB | >3.5GB |
| **Message Latency (p95)** | <2s | >5s |
| **Error Rate** | <0.1% | >1% |
| **Queue Depth** | <100 | >2000 |

### Dashboard Setup (Optional)

Create a Prometheus + Grafana stack:

```bash
# Export metrics in Prometheus format
curl http://localhost:3000/metrics

# Configure Grafana to scrape metrics every 15 seconds
# Create alerts for thresholds above
```

---

## Ongoing Operations

### Daily Tasks

- [ ] Review error logs: `docker-compose logs --tail 100 waflow-1 | grep "❌"`
- [ ] Check disk space: `df -h`
- [ ] Monitor message queue depth: `redis-cli LLEN message_queue`
- [ ] Verify all 3 instances healthy: `./scripts/health-check.sh`

### Weekly Tasks

- [ ] Export and review metrics: `./scripts/metrics-export.sh`
- [ ] Check database query performance: Review slow query log
- [ ] Verify backups completed: Check last backup timestamp
- [ ] Test auto-recovery: `./scripts/auto-recovery.sh`

### Monthly Tasks

- [ ] Review cache hit rates
- [ ] Analyze 1000-user load capacity (are we approaching limits?)
- [ ] Update dependencies: `pnpm update`
- [ ] Audit security logs and IP access patterns

---

## Troubleshooting

### Issue: 502 Bad Gateway from Nginx

**Diagnosis:**
```bash
docker-compose logs nginx
docker-compose logs waflow-1
```

**Common Causes:**
1. Backend instances not running: Restart with `docker-compose restart waflow-1 waflow-2 waflow-3`
2. Database unreachable: Verify `DATABASE_URL` is correct
3. Out of memory: Check heap usage and restart

### Issue: Slow Message Responses

**Diagnosis:**
```bash
# Check cache hit rate
docker-compose logs waflow-1 | grep -c "Cache HIT"
docker-compose logs waflow-1 | grep -c "Cache MISS"

# Check database connection pool
mysql -e "SHOW STATUS LIKE 'Threads_%';"
```

**Solutions:**
1. If low cache hit rate: Verify cache service initialization
2. If high MISS rate: Increase `CONFIG_CACHE_TTL` and `KB_CACHE_TTL`
3. If DB connections maxed: Increase `DB_CONNECTION_LIMIT` or add instance 4

### Issue: Redis Memory Growing

**Diagnosis:**
```bash
redis-cli INFO memory
redis-cli KEYS "*" | wc -l
```

**Solutions:**
1. Run cleanup manually: `docker-compose logs waflow-1 | grep "cleanup"`
2. Lower cache TTL values
3. Increase Redis `maxmemory` limit

---

## Scaling Beyond 1000 Users

### Add a 4th Instance

```bash
# Update docker-compose.1k-users.yml
# Add waflow-4 service on port 3003
# Update Nginx upstream to include 3003

# Restart
docker-compose -f docker-compose.1k-users.yml up -d

# Verify new instance registered
curl http://localhost:3003/health
```

### Scale MySQL

```bash
# If database becomes bottleneck (>80% connection pool usage):
# 1. Add read replicas for analytics queries
# 2. Enable query caching (already enabled in .env.production)
# 3. Add missing indexes (documented in STABILITY_AUDIT_FIXES.md)
```

### Scale Redis

```bash
# If Redis memory exceeds 3.5GB:
# 1. Increase maxmemory: `CONFIG SET maxmemory 6gb`
# 2. Or use Redis Cluster for horizontal scaling
```

---

## Disaster Recovery

### Backup Restoration

```bash
# Restore from backup
gunzip < waflow_20260425.sql.gz | mysql -u waflow -p waflow

# Verify restoration
mysql -u waflow -p waflow -e "SELECT COUNT(*) FROM conversations;"
```

### Zero-Downtime Restart

```bash
# Update code
git pull origin main
pnpm build:server

# Restart one instance at a time
docker-compose -f docker-compose.1k-users.yml restart waflow-1
# Wait 30 seconds for it to rejoin load balancer
sleep 30

docker-compose -f docker-compose.1k-users.yml restart waflow-2
sleep 30

docker-compose -f docker-compose.1k-users.yml restart waflow-3

# Verify all instances healthy
./scripts/health-check.sh
```

---

## Security Hardening

### 1. Firewall Rules

```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3306      # MySQL (internal only)
ufw allow 6379      # Redis (internal only)
ufw enable
```

### 2. Database Security

```bash
# Change default MySQL password
mysql -u waflow -p -e "ALTER USER 'waflow'@'%' IDENTIFIED BY 'new_secure_password';"

# Remove root account
mysql -u root -p -e "DROP USER 'root'@'localhost';"

# Disable binary logging (if backups use snapshots)
# In MySQL config: skip-log-bin
```

### 3. Environment Secrets

```bash
# Never commit .env.production to git
echo ".env.production" >> .gitignore

# Store secrets in:
# - AWS Secrets Manager
# - HashiCorp Vault
# - Environment variables set by deployment system
```

---

## Support & Documentation

- **Stability Audit:** See `STABILITY_AUDIT_FIXES.md` for 5 critical fixes
- **Cache Integration:** See `INTEGRATION_GUIDE.md` for caching setup
- **API Reference:** See tRPC routers in `/server/routers/`
- **Architecture:** See `CLAUDE.md` for project overview

---

## Deployment Success Criteria

✅ **Production is ready when:**
- All 3 instances show "Up (healthy)"
- `./scripts/health-check.sh` passes 100%
- Message responses complete <2 seconds
- Error rate <0.1%
- Database pool utilization <80%
- Redis memory <3GB
- Load test shows 1000 concurrent users stable
- Failover works (stop one instance, others handle traffic)
- Auto-recovery restarts failed services automatically
- Admin dashboard accessible at http://localhost
- Cache service initialized with Redis
- Monitoring cron jobs running

✅ **You're ready to accept production users when all criteria met.**

---

**Questions? See CLAUDE.md or contact support@waflow.com**
