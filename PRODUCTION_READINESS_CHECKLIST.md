# WAFlow Production Readiness Checklist

**Date:** April 25, 2026  
**Version:** 1.0  
**Target Scale:** 1000 concurrent users  
**Status:** Ready for Production Deployment

---

## Pre-Deployment Phase

### Infrastructure & Environment

- [ ] Docker and Docker Compose installed on production server
- [ ] 100GB+ disk space available for logs and backups
- [ ] PostgreSQL/MySQL database created and empty
- [ ] Redis instance provisioned (4GB minimum)
- [ ] Firewall rules configured for ports 80, 443, 3306, 6379
- [ ] SSL certificates obtained and ready (HTTPS)
- [ ] Email service configured (SendGrid or AWS SES)

### Environment Variables

- [ ] `DATABASE_URL` set to production MySQL instance
- [ ] `REDIS_URL` set to production Redis instance
- [ ] `JWT_SECRET` generated (64+ character random string)
- [ ] `ENCRYPTION_KEY` generated (32-byte hex, documented for backup)
- [ ] `AI_API_KEY` set (Groq, OpenAI, or Ollama API key)
- [ ] `AI_API_URL` set correctly for AI provider
- [ ] `AI_MODEL` set to production model (gpt-3.5-turbo recommended)
- [ ] `WHATSAPP_APP_SECRET` set from Meta Business console
- [ ] `OPENAI_API_KEY` / AI provider API key valid
- [ ] All environment variables verified: `env | grep -E "DATABASE|JWT|ENCRYPTION|AI_|WHATSAPP"`

### Security

- [ ] `.env.production` is NOT committed to git
- [ ] Secrets stored in AWS Secrets Manager or equivalent
- [ ] Database user has minimum required privileges
- [ ] Root MySQL user changed from default password
- [ ] SSL certificates installed and HTTPS enforced
- [ ] CORS whitelist configured for frontend domain
- [ ] Rate limiters enabled (auth, API, webhook, per-phone)
- [ ] Helmet.js security headers enabled
- [ ] HMAC webhook signature verification enabled

---

## Deployment Phase

### Build & Compilation

- [ ] Repository cloned to production directory
- [ ] `pnpm install` completed without errors
- [ ] `pnpm build:client` succeeded (React/Vite build)
- [ ] `pnpm build:server` succeeded (TypeScript compilation)
- [ ] Build artifacts verified: `dist/` and `server/dist/` exist
- [ ] No TypeScript errors: `pnpm tsc --noEmit` passes
- [ ] No build warnings from security tools

### Database Migration

- [ ] `pnpm drizzle:migrate` completed successfully
- [ ] All 42 database tables created: `mysql -e "SHOW TABLES;" | wc -l` = 42
- [ ] Schema matches `drizzle/schema.ts`
- [ ] Indexes created on: tenantId, conversations, templates, customers, appointments
- [ ] `pnpm db:seed` executed to create default admin user
- [ ] Admin user created: `admin@waflow.com` / `admin123`
- [ ] Default templates seeded
- [ ] Default bot config for admin tenant created

### Infrastructure Startup

- [ ] `docker-compose -f docker-compose.1k-users.yml up -d` executed
- [ ] All 7 containers started: waflow-1, waflow-2, waflow-3, db, redis, nginx, health-monitor
- [ ] No container crashes: `docker-compose ps | grep -v "Up"` returns nothing
- [ ] Services are healthy: All containers show "(healthy)" status
- [ ] MySQL accessible: `mysql -h localhost -u waflow -pwaflow -e "SELECT 1;"`
- [ ] Redis accessible: `redis-cli ping` returns PONG
- [ ] Nginx responding: `curl http://localhost` succeeds

### Health Verification

- [ ] Instance 1 responds: `curl http://localhost:3000/health` = 200
- [ ] Instance 2 responds: `curl http://localhost:3001/health` = 200
- [ ] Instance 3 responds: `curl http://localhost:3002/health` = 200
- [ ] Load balancer routing: `curl http://localhost/health` = 200
- [ ] Database connections pool stable: < 400 per instance
- [ ] Redis memory usage: < 100MB (will grow with cache)
- [ ] No startup errors: `docker-compose logs | grep "error\|Error"` returns nothing

### Admin Access

- [ ] Admin dashboard accessible: `http://localhost/admin` (or `https://` in production)
- [ ] Admin login works: `admin@waflow.com` / `admin123`
- [ ] Password change completed to secure password
- [ ] Default tenant configuration accessible
- [ ] Bot settings page loads
- [ ] Template management page loads
- [ ] Knowledge base page loads
- [ ] Analytics page loads

---

## Stability & Hardening Phase

### Code Quality

- [ ] All 5 critical stability fixes applied (documented in STABILITY_AUDIT_FIXES.md):
  - [ ] Hardcoded credentials removed, DATABASE_URL validation added
  - [ ] Fire-and-forget promise errors fixed with try-catch blocks
  - [ ] Socket.IO error handlers added
  - [ ] WhatsApp reconnect race condition fixed
  - [ ] File cleanup errors properly logged
- [ ] No TypeScript `any` casts in critical paths
- [ ] Error logging enabled: `console.error()` for all exceptions
- [ ] Async errors handled: No unhandled promise rejections
- [ ] Database connection errors handled gracefully

### Caching Layer

- [ ] Cache service initialized: `✅ Cache service initialized with Redis`
- [ ] Redis cache connected: `⚡ Cache HIT` messages appear in logs
- [ ] Local cache fallback working: Works if Redis temporarily unavailable
- [ ] Cache TTLs configured correctly:
  - [ ] `CONFIG_CACHE_TTL=3600` (1 hour)
  - [ ] `TEMPLATE_CACHE_TTL=3600` (1 hour)
  - [ ] `KB_CACHE_TTL=7200` (2 hours)
  - [ ] `MENU_CACHE_TTL=3600` (1 hour)
- [ ] Cache cleanup scheduled: Runs every 5 minutes
- [ ] No unbounded memory growth: Local cache size monitored

### Monitoring & Alerting

- [ ] Monitoring scripts created: `scripts/health-check.sh`, `auto-recovery.sh`, `metrics-export.sh`
- [ ] Health check cron job scheduled: `*/5 * * * *` for auto-recovery
- [ ] Metrics export cron job scheduled: `0 * * * *` for hourly metrics
- [ ] Log rotation configured: Logs don't grow unbounded
- [ ] Alert webhook configured: `ALERT_WEBHOOK_URL` set
- [ ] Slack/email notifications tested
- [ ] Dashboard created or monitoring service configured

### Backup & Disaster Recovery

- [ ] First backup created: `mysqldump` saved to `backups/` directory
- [ ] Backup automation scheduled: Daily at 2 AM
- [ ] Backup retention policy set: Keep 30 days
- [ ] Backup encryption enabled (if sensitive data)
- [ ] Backup tested: Verified restoration possible
- [ ] Off-site backup storage: S3 or cloud storage configured
- [ ] Recovery runbook documented (see OPERATIONAL_RUNBOOKS.md)
- [ ] Point-in-time recovery enabled: MySQL binary logging active

---

## Performance Testing Phase

### Load Testing

- [ ] Test 1 (Connection Pool): 500 concurrent connections complete successfully
  - [ ] All requests succeed (0 connection refused errors)
  - [ ] DB connections < 450 per instance
  - [ ] Latency p99 < 500ms
- [ ] Test 2 (Message Processing): 1000 messages processed successfully
  - [ ] Throughput > 100 msg/sec (for AI responses)
  - [ ] Throughput > 300 msg/sec (for template matches)
  - [ ] Error rate < 0.1%
- [ ] Test 3 (Cache Performance): Cache hit rate > 70%
  - [ ] Repeated queries hit cache in < 1ms
  - [ ] Redis eviction working (LRU policy)
  - [ ] Local fallback works if Redis unavailable
- [ ] Test 4 (Concurrent Users): 1000 concurrent users
  - [ ] All user requests complete successfully
  - [ ] No timeout errors
  - [ ] Response time < 2 seconds average
- [ ] Test 5 (Failover): Instance failure handled gracefully
  - [ ] Nginx auto-failover to healthy instances
  - [ ] No 502 Bad Gateway errors
  - [ ] Failed instance restarts automatically
  - [ ] Service restored in < 5 minutes
- [ ] Test 6 (Rate Limiting): Rate limiters enforced
  - [ ] Auth rate limit: 10 attempts per 15 minutes
  - [ ] API rate limit: 300 requests per minute
  - [ ] Per-phone message limit: 20 messages per 60 seconds
- [ ] Test 7 (Database Performance): Query performance acceptable
  - [ ] Average query time < 10ms
  - [ ] Slow queries (> 500ms) < 1% of total
  - [ ] No N+1 query patterns detected

### Baseline Metrics Documented

- [ ] Baseline CPU usage: _____% (target: < 70%)
- [ ] Baseline memory usage: _____% (target: < 75%)
- [ ] Baseline message latency: _____ms (target: < 2000ms)
- [ ] Baseline cache hit rate: ____% (target: > 70%)
- [ ] Baseline error rate: ____% (target: < 0.1%)

---

## Production Operations Phase

### Runbooks & Documentation

- [ ] STABILITY_AUDIT_FIXES.md reviewed and understood
- [ ] INTEGRATION_GUIDE.md reviewed (cache service integration)
- [ ] PRODUCTION_DEPLOYMENT.md reviewed (step-by-step instructions)
- [ ] OPERATIONAL_RUNBOOKS.md reviewed (emergency procedures)
- [ ] LOAD_TESTING_GUIDE.md reviewed (how to run load tests)
- [ ] Emergency response procedures documented
- [ ] Escalation procedures defined
- [ ] On-call rotation established

### Team Readiness

- [ ] At least 2 team members trained on deployment
- [ ] At least 2 team members trained on operational runbooks
- [ ] Emergency contact information updated
- [ ] Incident response procedure defined
- [ ] Rollback procedure documented and tested
- [ ] Post-incident review process defined

### Monitoring Setup

- [ ] Prometheus/Grafana or equivalent monitoring tool configured
- [ ] Key metrics dashboards created:
  - [ ] CPU, memory, disk usage per instance
  - [ ] Database connections and query performance
  - [ ] Redis memory and cache hit rate
  - [ ] Message processing latency and throughput
  - [ ] Error rate and exception tracking
- [ ] Alerts configured for:
  - [ ] CPU > 85%
  - [ ] Memory > 90%
  - [ ] Disk < 5%
  - [ ] DB connections > 450
  - [ ] Redis memory > 3.5GB
  - [ ] Message latency > 5s
  - [ ] Error rate > 1%
  - [ ] Queue depth > 2000

---

## Final Sign-Off

### Checklist Completion

- [ ] All pre-deployment items checked
- [ ] All deployment items checked
- [ ] All stability items checked
- [ ] All performance testing items checked
- [ ] All documentation items checked
- [ ] All operations items checked

### Go/No-Go Decision

**Go to Production?**

- [ ] **YES** — All items checked, system ready for production traffic
- [ ] **NO** — See notes below, address before deployment

**Notes/Issues:**
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

### Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **DevOps Lead** | _____________ | _____________ | _______ |
| **System Admin** | _____________ | _____________ | _______ |
| **Engineering Lead** | _____________ | _____________ | _______ |

---

## Post-Deployment (First Week)

### Daily Tasks

- [ ] Morning: Run `./scripts/health-check.sh`
- [ ] Morning: Review error logs for ❌ messages
- [ ] Afternoon: Check message processing latency
- [ ] Evening: Verify all backups completed

### End-of-Week Tasks

- [ ] Export and review metrics: `./scripts/metrics-export.sh`
- [ ] Analyze cache hit rates (target: > 70%)
- [ ] Check database slow query log
- [ ] Verify all monitoring alerts functional
- [ ] Test backup restoration
- [ ] Document any incidents and resolutions

### Readiness for 2000 Users (Future)

When approaching capacity:

- [ ] Add 4th instance (`waflow-4`)
- [ ] Increase MySQL `max_connections` to 1500 (500 × 3 instances)
- [ ] Consider MySQL read replicas for analytics
- [ ] Consider Redis Cluster for multi-region caching
- [ ] Document scaling procedure in runbooks

---

## Success Criteria

✅ **Production is ready when:**

1. All checklist items are completed
2. `./scripts/health-check.sh` passes 100%
3. Admin login works: `admin@waflow.com` (with new password)
4. Load testing shows 1000+ concurrent users handled
5. Message latency < 2 seconds for AI responses
6. Cache hit rate > 70% for template matches
7. Error rate < 0.1%
8. Failover works when instance stopped
9. Database backups completing successfully
10. Monitoring and alerting operational
11. Operational team trained and confident
12. Emergency runbooks documented and tested

---

## Production Support

**Issues encountered?**

- [ ] Check OPERATIONAL_RUNBOOKS.md for your issue
- [ ] Check STABILITY_AUDIT_FIXES.md for known issues
- [ ] Review docker-compose logs: `docker-compose logs waflow-1 | grep "❌"`
- [ ] Run diagnostics: `./scripts/health-check.sh`
- [ ] Contact engineering team with logs

---

**Date Approved for Production:** _______________

**Expected Launch Date:** _______________

**Target: Ready for production traffic 1000 concurrent users with instant message responses**
