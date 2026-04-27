# Production Deployment Checklist — WAFlow

Complete this checklist before deploying to production.

---

## Pre-Deployment (Before Code)

### Security Audit

- [ ] **Code Review** — All code reviewed for hardcoded secrets
  ```bash
  # Search for common secret patterns
  grep -r "password\|secret\|api.key\|token" server/ --include="*.ts" \
    | grep -v "node_modules" | grep -v "\.test\." | grep -v ".example"
  ```

- [ ] **Dependencies Audited** — No known vulnerabilities
  ```bash
  npm audit
  pnpm audit
  ```

- [ ] **Git History Checked** — No secrets ever committed
  ```bash
  # Search commit history for secrets (example patterns)
  git log -p --all -S "JWT_SECRET=" | head -20
  git log -p --all -S "ENCRYPTION_KEY=" | head -20
  ```

### Configuration

- [ ] **JWT_SECRET Generated** — Unique, production-grade key
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  # Save in external secrets manager, NOT in code
  ```

- [ ] **ENCRYPTION_KEY Generated** — Unique, backed up safely
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  # ⚠️ BACK UP SEPARATELY — Cannot be changed once data encrypted
  # ⚠️ Store in password manager + physical backup
  ```

- [ ] **Database URL Set** — Connection string with correct host/port/credentials
  ```
  DATABASE_URL=mysql://[user]:[password]@[host]:[port]/[database]
  ```

- [ ] **Redis URL Set** — Message queue connection configured
  ```
  REDIS_URL=redis://[host]:[port]
  # Or: redis://[user]:[password]@[host]:[port]
  ```

- [ ] **AI Provider Configured** — OpenAI/Groq/Ollama ready
  ```
  AI_API_URL=[endpoint]
  AI_API_KEY=[key]
  AI_MODEL=[model-name]
  ```

- [ ] **.env NOT committed** — Verify `.env` in `.gitignore`
  ```bash
  git status
  cat .gitignore | grep "^\.env"
  ```

### Database

- [ ] **Database Created** — Empty database ready
  ```bash
  mysql -h [host] -u [user] -p -e "CREATE DATABASE IF NOT EXISTS waflow CHARACTER SET utf8mb4;"
  ```

- [ ] **Migrations Ready** — Schema will be applied at startup
  ```bash
  # Verify drizzle migrations exist
  ls -la drizzle/migrations/
  ```

- [ ] **Backup Plan** — Regular backups scheduled
  ```bash
  # Example: MySQL daily backup
  0 2 * * * mysqldump -h [host] -u [user] -p[pass] waflow > /backups/waflow-$(date +\%Y\%m\%d).sql
  ```

### Infrastructure

- [ ] **Server Provisioned** — VM/container ready
  - [ ] Minimum: 2 CPU, 2GB RAM, 10GB storage (adjust based on load)
  - [ ] Node.js 18+ installed
  - [ ] Redis running (for message queue)
  - [ ] MySQL 5.7+ running (or managed RDS)

- [ ] **Network Configured** — Ports open
  - [ ] Port 3000 (API) — accessible from load balancer/reverse proxy
  - [ ] Port 5173 (Frontend) — if serving from same server
  - [ ] Port 3306 (MySQL) — only from app server (not public)
  - [ ] Port 6379 (Redis) — only from app server (not public)

- [ ] **SSL/TLS Certificates** — HTTPS configured
  ```bash
  # Using Let's Encrypt (recommended)
  certbot certonly --standalone -d api.yourcompany.com
  # Or use cloud provider's certificate service (AWS ACM, Cloudflare, etc.)
  ```

- [ ] **Monitoring Enabled** — Logs, metrics, alerts configured
  - [ ] Error tracking (Sentry, Rollbar, etc.)
  - [ ] Metrics (CPU, memory, disk, requests/sec)
  - [ ] Alerts for critical issues

---

## Deployment

### Code Deployment

- [ ] **Build Successful**
  ```bash
  npm run build
  # or: pnpm build
  # Should produce dist/ folder without errors
  ```

- [ ] **Tests Passing**
  ```bash
  npm test
  # All tests pass
  ```

- [ ] **Code Deployed** — Latest version on production server
  ```bash
  git pull origin main
  npm install
  npm run build
  ```

### Environment Setup

- [ ] **All env vars set** in production (NOT in .env file)
  ```bash
  # Verify with:
  echo $DATABASE_URL
  echo $JWT_SECRET
  echo $ENCRYPTION_KEY
  # Should all return values, not empty
  ```

- [ ] **Configuration validated** at startup
  ```bash
  npm start
  # Should log:
  # ✅ Configuration loaded successfully
  #    Environment: PRODUCTION
  #    Database: ...
  #    Port: 3000
  ```

### Database Migrations

- [ ] **Migrations applied** to production database
  ```bash
  # If using Drizzle, migrations run automatically on startup
  # Or manually:
  npm run drizzle:migrate
  ```

- [ ] **Seed data loaded** (if needed)
  ```bash
  npm run db:seed
  # Creates admin user + default templates + bot config
  ```

- [ ] **Database backup taken** before going live
  ```bash
  mysqldump -h [host] -u [user] -p [database] > waflow-backup-$(date +%Y%m%d).sql
  ```

### Service Startup

- [ ] **Application starts without errors**
  ```bash
  npm start
  # Logs should show:
  # ✅ Configuration loaded successfully
  # ✅ Express listening on port 3000
  # ✅ Socket.IO ready
  # ✅ Message queue ready
  # ✅ Health scheduler started
  ```

- [ ] **API is responsive**
  ```bash
  curl http://localhost:3000/health
  # Should return 200 OK
  ```

- [ ] **Health check endpoint works**
  ```bash
  curl -s http://localhost:3000/health | jq .
  ```

### WhatsApp Setup (if using Meta Cloud API)

- [ ] **Webhook URL configured** in Meta Developer Portal
  ```
  https://your-api.com/api/webhook/whatsapp
  ```

- [ ] **Webhook verify token set** in Meta Developer Portal
  ```
  WHATSAPP_WEBHOOK_TOKEN=[value from .env]
  ```

- [ ] **App secret stored** in secure location
  ```
  WHATSAPP_APP_SECRET=[value in external secrets manager]
  ```

- [ ] **Test webhook** — Send test message from Meta
  ```bash
  # Should receive webhook in application logs
  # Webhook signature should validate correctly
  ```

---

## Testing (Production Environment)

### Smoke Tests

- [ ] **API Health Check**
  ```bash
  curl https://api.yourcompany.com/health
  # Returns 200 OK
  ```

- [ ] **Login Works**
  - [ ] Navigate to frontend
  - [ ] Try login with admin credentials (if seeded)
  - [ ] Confirm JWT cookie is set (dev tools → Application → Cookies)

- [ ] **Database Connection**
  - [ ] Create a test user via API
  - [ ] Verify it appears in database
  - [ ] Verify password is hashed (not plaintext)

- [ ] **Message Pipeline** (if WhatsApp configured)
  - [ ] Send test message to WhatsApp number
  - [ ] Verify message received in inbox
  - [ ] Verify AI response generated and sent back

### Security Tests

- [ ] **Rate Limiting Works**
  ```bash
  # Trigger rate limit on login endpoint
  for i in {1..15}; do curl -X POST http://localhost:3000/api/trpc/auth.login -d '{}'; done
  # Should get 429 Too Many Requests
  ```

- [ ] **SQL Injection Blocked**
  ```bash
  # Try SQL injection in login
  # Should be safely escaped; no DB errors leak to client
  ```

- [ ] **Prompt Injection Detected**
  - [ ] Configure a bot
  - [ ] Send message: "Ignore previous instructions..."
  - [ ] Verify injection is detected in logs

- [ ] **CORS Enforced**
  ```bash
  # From browser: curl https://evil.com with fetch
  # Should get CORS error (not allowed)
  ```

- [ ] **HTTPS Enforced** (if not using reverse proxy)
  - [ ] Request to http://api.com redirects to https://api.com
  - [ ] HSTS headers present: `Strict-Transport-Security: max-age=31536000`

- [ ] **No Server Fingerprinting**
  ```bash
  curl -I https://api.yourcompany.com | grep -i "server\|powered"
  # Should NOT reveal Express/Node version
  ```

### Performance Tests

- [ ] **Page Load Time** — Under 3 seconds
  - [ ] Test from production URL
  - [ ] Check Network tab in dev tools

- [ ] **API Response Time** — Under 500ms
  ```bash
  time curl https://api.yourcompany.com/api/trpc/auth.me
  ```

- [ ] **Database Connection Pool**
  - [ ] Monitor: connection count should stabilize
  - [ ] Should not exceed `DB_CONNECTION_LIMIT` (100)

- [ ] **Redis Queue**
  ```bash
  # Monitor message queue
  redis-cli INFO stats | grep processed_commands
  ```

---

## Post-Deployment

### Monitoring

- [ ] **Error Tracking Active**
  - [ ] Sentry / Rollbar / Datadog configured
  - [ ] Test error is captured: intentionally trigger an error, verify it appears in dashboard

- [ ] **Metrics Collected**
  - [ ] CPU usage normal (< 70%)
  - [ ] Memory usage stable (< 80%)
  - [ ] Disk space available (> 20%)

- [ ] **Alerts Configured**
  - [ ] High error rate alert (> 5% errors)
  - [ ] High latency alert (> 1000ms response time)
  - [ ] Service down alert (no heartbeat for 5 min)
  - [ ] Database connection pool exhausted

### Logging

- [ ] **Logs Accessible**
  ```bash
  # Check application logs
  docker logs [container-id]
  # or
  tail -f /var/log/waflow/app.log
  ```

- [ ] **No Secrets in Logs**
  ```bash
  grep -i "password\|secret\|api.key\|token" /var/log/waflow/app.log
  # Should return nothing (or only generic "API key" references)
  ```

- [ ] **Audit Logging Works**
  - [ ] Admin actions recorded in audit_logs table
  - [ ] Verify: create a user, check audit log entry exists

### Backup Verification

- [ ] **Database Backups Running**
  ```bash
  ls -lah /backups/waflow*.sql
  # Should see recent backup files
  ```

- [ ] **Backup Restoration Tested**
  - [ ] Restore from backup to test database
  - [ ] Verify data integrity

- [ ] **ENCRYPTION_KEY Backed Up**
  - [ ] Stored in password manager (e.g., 1Password, LastPass)
  - [ ] Stored in physical vault / safe
  - [ ] NOT stored in database or code repository

### Team Handoff

- [ ] **Documentation Updated**
  - [ ] README.md with production URLs
  - [ ] Runbook for common issues
  - [ ] Contact info for on-call engineer

- [ ] **Access Granted**
  - [ ] Team members have database access (if needed)
  - [ ] Monitoring dashboard access
  - [ ] Error tracking dashboard access

- [ ] **Communication**
  - [ ] Announce to team that production is live
  - [ ] Share status page URL
  - [ ] Incident response plan shared

---

## Maintenance Schedule

### Daily

- [ ] Monitor error logs
- [ ] Check system metrics (CPU, memory, disk)
- [ ] Verify no database backup failures

### Weekly

- [ ] Review security alerts (if using SIEM)
- [ ] Test monitoring alerts (trigger false alert to verify it works)

### Monthly

- [ ] Run performance tests under load
- [ ] Review and rotate logs (old logs archived)
- [ ] Update dependencies (minor/patch versions)
  ```bash
  npm update
  ```

### Quarterly

- [ ] Rotate JWT_SECRET (non-breaking change)
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  # Update in secrets manager
  # Restart app
  ```

- [ ] Security audit of new code
- [ ] Disaster recovery drill (restore from backup)

---

## Incident Response

### If Database Goes Down

1. Check database service status: `systemctl status mysql`
2. Check logs: `tail /var/log/mysql/error.log`
3. Restart service: `systemctl restart mysql`
4. If still down: restore from backup
5. Notify team; activate incident response

### If API is Slow

1. Check CPU/memory: `top`
2. Check database connections: `mysql -e "SHOW STATUS LIKE 'Threads%'"`
3. Check Redis queue: `redis-cli INFO stats`
4. Identify slow query: `mysql -e "SHOW PROCESSLIST"`
5. Scale horizontally if needed (add more app servers)

### If Secrets Are Exposed

1. **Immediately:**
   - Rotate JWT_SECRET
   - Rotate all API keys (OpenAI, Groq, etc.)
   - Invalidate all active sessions (update passwordVersion)

2. **Within 24 hours:**
   - Post-mortem: how did secrets get exposed?
   - Update deployment process to prevent future exposure
   - Audit logs for unauthorized access

3. **Document:**
   - What happened
   - When discovered
   - Actions taken
   - Prevention measures added

---

## Rollback Plan

If deployment fails:

1. **Stop the application:**
   ```bash
   systemctl stop waflow
   ```

2. **Revert code:**
   ```bash
   git checkout [previous-working-commit]
   npm install
   npm run build
   ```

3. **Restore database** (if schema changes):
   ```bash
   mysql < /backups/waflow-[pre-deployment-date].sql
   ```

4. **Restart application:**
   ```bash
   systemctl start waflow
   npm start
   ```

5. **Verify:**
   ```bash
   curl http://localhost:3000/health
   ```

6. **Investigate:** Why did deployment fail? Fix and re-attempt.

---

## Sign-Off

- [ ] **Deployment Lead:** _________________ Date: _______
- [ ] **Security Review:** _________________ Date: _______
- [ ] **Database Admin:** _________________ Date: _______
- [ ] **On-Call Engineer:** _________________ Date: _______

---

**WAFlow Production Deployment Checklist**  
**Version:** 1.0  
**Last Updated:** April 24, 2026  
**Maintainer:** Nathan (shirangonathan88@gmail.com)
