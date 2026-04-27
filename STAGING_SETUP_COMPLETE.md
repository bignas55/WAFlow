# WAFlow Staging Deployment — Setup Complete ✅

**Status:** Ready to Deploy  
**Created:** April 24, 2026  
**Target Capacity:** 5,000 concurrent users  
**Estimated Setup Time:** 30-45 minutes

---

## 📦 What Has Been Created

### Core Infrastructure Files
1. **docker-compose.staging.yml** (261 lines)
   - MySQL 8.0 with optimized configuration
   - Redis 7.0 for message queue and caching
   - WAFlow application container
   - Nginx reverse proxy with SSL/TLS
   - Prometheus metrics collection
   - Grafana visualization and alerting
   - All services configured with health checks
   - Persistent volumes for data

2. **Dockerfile.staging** (62 lines)
   - Multi-stage build for optimized image size
   - Node.js 20 with production dependencies
   - Chromium + system libraries for whatsapp-web.js
   - Non-root user for security
   - Health checks configured
   - Ready for containerized deployment

3. **nginx.conf** (240 lines)
   - SSL/TLS termination (HTTP/2)
   - Security headers (HSTS, CSP, X-Frame-Options)
   - Rate limiting (auth: 10/min, api: 300/sec, webhook: 100/sec)
   - WebSocket support for Socket.IO
   - Gzip compression
   - Request logging with timing metrics
   - Automatic denial of access to sensitive files

4. **prometheus.yml** (48 lines)
   - Metrics collection configuration
   - Scrape targets for app, database, cache, infrastructure
   - 30-day retention policy
   - Ready for Grafana integration

### Configuration Templates
5. **.env.staging** (82 lines)
   - All environment variables documented
   - Database configuration
   - JWT and encryption secrets (placeholders)
   - AI provider options (Groq, OpenAI, Ollama)
   - WhatsApp and third-party integrations
   - Email and SMS fallback
   - Clear instructions for each section

### Deployment Automation
6. **deploy-staging.sh** (310 lines)
   - Automated one-command deployment
   - Prerequisite checking
   - Secret generation
   - Directory structure creation
   - SSL certificate setup
   - Docker image building
   - Service health monitoring
   - Database initialization
   - Comprehensive deployment summary
   - Command-line options for domain, email, Let's Encrypt

7. **setup-ssl.sh** (240 lines)
   - Self-signed certificate generation
   - Let's Encrypt integration
   - Certificate verification
   - Auto-renewal setup and monitoring
   - Certificate expiry checking
   - Nginx configuration updates

8. **health-check.sh** (400 lines)
   - Comprehensive service health checks
   - Docker service status verification
   - Database connectivity and size monitoring
   - Redis memory and client tracking
   - Application health and API responsiveness
   - Nginx process and certificate verification
   - Disk space monitoring with alerts
   - Docker resource usage stats
   - Error log scanning
   - Backup status verification
   - Continuous monitoring mode (--watch)
   - Detailed logging to health-check.log

### Documentation
9. **STAGING_DEPLOYMENT.md** (1000+ lines)
   - Step-by-step deployment guide (12 major sections)
   - Prerequisites and server preparation
   - Application configuration
   - SSL/TLS setup with Let's Encrypt
   - Service startup and verification
   - Database initialization
   - Monitoring setup (Prometheus + Grafana)
   - Backup and disaster recovery procedures
   - Load testing instructions
   - Maintenance and troubleshooting
   - Security hardening checklist
   - Scaling to 5,000 concurrent users

10. **QUICK_REFERENCE.md** (280 lines)
    - Quick start guide (5-minute deployment)
    - Access points for all services
    - Common commands reference
    - Configuration update procedures
    - Performance tuning for 1K/5K users
    - Backup and restore procedures
    - Load testing setup
    - Troubleshooting quick fixes
    - Security checklist
    - Success criteria for launch

---

## 🎯 Next Steps to Deploy

### Step 1: Prepare Your Server
```bash
# Ubuntu 22.04+ with:
# - 16GB RAM
# - 4+ CPU cores
# - 100GB disk
# - Static IP or domain name

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker (script included in deploy-staging.sh)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

### Step 2: Clone/Copy Files
```bash
# If starting fresh:
mkdir ~/waflow-staging && cd ~/waflow-staging
# Copy all .yml, .sh, and .md files here

# Or use git:
git clone <your-repo> ~/waflow-staging && cd ~/waflow-staging
```

### Step 3: Run Automated Deployment
```bash
chmod +x deploy-staging.sh

# Run with your domain
./deploy-staging.sh --domain staging.yourdomain.com --email admin@example.com
```

### Step 4: Post-Deployment Configuration
```bash
# Edit .env and add your actual values:
nano .env

# Update these critical fields:
# - AI_API_KEY (get from Groq, OpenAI, or run local Ollama)
# - GRAFANA_PASSWORD (strong password)
# - Google credentials (if using calendar)

# Restart app with new values:
docker compose -f docker-compose.staging.yml restart waflow
```

### Step 5: Verify Everything Works
```bash
# Check all services running
docker compose -f docker-compose.staging.yml ps

# Test application health
curl https://staging.yourdomain.com/health

# Monitor logs
docker compose -f docker-compose.staging.yml logs -f waflow

# Run health checks
bash health-check.sh
```

### Step 6: Access Your Application
- **URL:** https://staging.yourdomain.com
- **Email:** admin@waflow.com
- **Password:** admin123
- **Action:** Change password immediately!

---

## 📊 Infrastructure Overview

```
                    ┌─────────────────────┐
                    │   Client Browsers   │
                    └──────────┬──────────┘
                               │ HTTPS
                    ┌──────────▼──────────┐
                    │   Nginx Reverse     │
                    │   Proxy (SSL/TLS)   │
                    └──────────┬──────────┘
                               │ HTTP
                ┌──────────────┼──────────────┐
                │              │              │
        ┌───────▼────┐ ┌──────▼──┐ ┌────────▼────┐
        │  WAFlow    │ │Prometheus│ │  Grafana    │
        │  App       │ │ :9090    │ │  :3001      │
        │  :3000     │ └──────┬───┘ └─────────────┘
        └───────┬────┘        │
                │             │ Queries
        ┌───────▼──────────────▼──┐
        │   MySQL Database        │
        │   (3307)                │
        └───────┬──────────────────┘
                │
        ┌───────▼───────┐
        │  Redis Queue  │
        │  (6380)       │
        └───────────────┘
```

**Services & Ports:**
- WAFlow App: 3000 (internal)
- Nginx: 80 (HTTP), 443 (HTTPS)
- MySQL: 3307 (exposed for backups)
- Redis: 6380 (exposed for monitoring)
- Prometheus: 9090 (internal → 443 via Nginx)
- Grafana: 3001 (internal → 443 via Nginx)

---

## 🔐 Security Features Included

✅ SSL/TLS with Let's Encrypt support  
✅ Security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)  
✅ Rate limiting (per-IP, per-endpoint)  
✅ Non-root Docker container user  
✅ AES-256-GCM encryption for sensitive data  
✅ JWT token-based authentication  
✅ CORS origin whitelist  
✅ Brute-force login protection  
✅ Firewall rules (via ufw)  
✅ SQL injection prevention (Drizzle ORM)  

---

## 📈 Capacity & Performance

**Staging Configuration Targets:**
- **Concurrent Users:** 5,000
- **Messages/Second:** 200-300 (at peak)
- **Response Time (p95):** <1 second
- **Error Rate:** <1%
- **Uptime SLA:** 99.5%

**Resource Allocation:**
- MySQL: 500 max connections, 2GB buffer pool
- Redis: 2GB max memory with LRU eviction
- WAFlow: 200 concurrent workers
- Nginx: 10,000 worker connections

**Database Sizing:**
- Initial: ~50MB for empty database
- Per 1,000 customers: ~10-20MB (depending on message volume)
- Per 1 million messages: ~500MB

---

## 🧪 Load Testing Ready

Included with deployment:
- **artillery** setup for load testing
- **prometheus** metrics collection
- **grafana** visualization dashboards
- **health-check.sh** for continuous monitoring

Expected load test:
```bash
artillery run load-test.yml --target https://staging.yourdomain.com

# Result targets:
# - Warm up phase (60s): 10 req/s
# - Sustained (5min): 100 req/s
# - Spike (60s): 500 req/s
# - Cool down (60s): 10 req/s
```

---

## 🔄 Backup Strategy

**Automatic Backups:**
- Daily at 2 AM
- MySQL database dumps (gzipped)
- Application file uploads
- Retention: 7 days minimum

**Manual Backup:**
```bash
bash ~/backup-waflow.sh
ls -lh /backups/waflow/
```

**Restore Procedure:**
```bash
# 1. Stop services
docker compose -f docker-compose.staging.yml down

# 2. Restore database
docker compose -f docker-compose.staging.yml up -d mysql
sleep 10
docker compose -f docker-compose.staging.yml exec -T mysql \
  mysql -uroot -p"${DB_ROOT_PASSWORD}" < /backups/waflow/mysql_TIMESTAMP.sql.gz

# 3. Restore files
tar -xzf /backups/waflow/app_TIMESTAMP.tar.gz -C ~/waflow-staging/

# 4. Start all services
docker compose -f docker-compose.staging.yml up -d
```

---

## 📚 File Reference

### Deployment Scripts
```
deploy-staging.sh          Main deployment automation
setup-ssl.sh              SSL certificate setup
health-check.sh           Health monitoring
backup-waflow.sh          Backup automation (created by deploy-staging.sh)
```

### Configuration Files
```
docker-compose.staging.yml  Container orchestration
.env.staging              Environment template (copy to .env)
nginx.conf               Reverse proxy configuration
prometheus.yml           Metrics scraping config
Dockerfile.staging       Container image build
```

### Documentation
```
STAGING_DEPLOYMENT.md    Complete guide (50+ pages)
QUICK_REFERENCE.md      Quick reference (5-10 pages)
CLAUDE.md               Architecture & patterns
```

---

## ✅ Deployment Verification Checklist

Run through these before considering staging "ready":

- [ ] All 6 Docker services running (\`docker compose ps\`)
- [ ] Application accessible via HTTPS
- [ ] Can login with default credentials
- [ ] Health endpoint returns \`{"status":"ok"}\`
- [ ] Prometheus scraping metrics
- [ ] Grafana dashboards loading
- [ ] SSL certificate shows valid date
- [ ] No critical errors in logs (\`docker compose logs --tail=100\`)
- [ ] Database responding (\`SELECT COUNT(*) FROM users\`)
- [ ] Redis responding (\`redis-cli ping\`)
- [ ] Backups running daily
- [ ] Response time p50 < 500ms on simple requests
- [ ] Load test passes with acceptable metrics

---

## 🎓 Learning Resources

### Inside Your Project
- **CLAUDE.md** - Full system architecture explanation
- **STAGING_DEPLOYMENT.md** - Step-by-step deployment procedures
- **QUICK_REFERENCE.md** - Quick lookup guide

### External Documentation
- [Docker Compose Docs](https://docs.docker.com/compose/)
- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Docs](https://grafana.com/docs/)
- [Nginx Docs](https://nginx.org/en/docs/)

---

## 🚀 Ready for Beta Launch?

After staging is stable for **1 week**, you'll be ready to:
1. ✅ Run comprehensive load testing (5K concurrent users)
2. ✅ Create operational documentation
3. ✅ Set up production monitoring
4. ✅ Plan soft launch to 100 beta users
5. ✅ Establish SLAs and escalation procedures

---

## 📞 Support & Troubleshooting

**Most Common Issues:**

1. **Docker won't start**
   - Check: `docker info`
   - Fix: Ensure Docker daemon is running

2. **Services unhealthy after startup**
   - Wait 30-60 seconds (initialization)
   - Check logs: `docker compose logs`
   - Rebuild: `docker compose build --no-cache`

3. **SSL certificate errors**
   - Verify certificate: `openssl x509 -in ssl/certs/fullchain.pem -text -noout`
   - Renew: `bash setup-ssl.sh letsencrypt staging.yourdomain.com email@example.com`

4. **High resource usage**
   - Check Docker stats: `docker stats`
   - Reduce concurrency in `.env`
   - Increase server resources

5. **Database connection errors**
   - Test MySQL: `docker compose exec mysql mysqladmin ping`
   - Check connection pool: `SELECT COUNT(*) FROM INFORMATION_SCHEMA.PROCESSLIST`

---

**Everything is prepared. You're ready to deploy! 🚀**

Next: Run \`./deploy-staging.sh\` and follow the prompts.

