# WAFlow Staging Deployment — Quick Reference

## 📋 Files Created

| File | Purpose |
|------|---------|
| `docker-compose.staging.yml` | Full staging infrastructure (6 services) |
| `.env.staging` | Environment template with all variables |
| `Dockerfile.staging` | Production-grade Node.js + Chromium image |
| `nginx.conf` | Reverse proxy with SSL/TLS and security headers |
| `prometheus.yml` | Metrics collection configuration |
| `STAGING_DEPLOYMENT.md` | Complete step-by-step deployment guide (50+ pages) |
| `deploy-staging.sh` | Automated deployment script |
| `setup-ssl.sh` | SSL certificate setup script |
| `health-check.sh` | Health monitoring script |
| `QUICK_REFERENCE.md` | This file |

---

## ⚡ Quick Start (5 minutes)

### Prerequisites
- Ubuntu 22.04+ with 16GB RAM, 4 CPU cores, 100GB disk
- Domain pointing to your server IP

### One-Command Deployment
\`\`\`bash
# 1. Navigate to waflow directory
cd ~/waflow-staging

# 2. Run automated deployment
chmod +x deploy-staging.sh
./deploy-staging.sh --domain staging.yourdomain.com --email admin@example.com

# 3. Update .env with your AI API key
nano .env
# Find: AI_API_KEY=your_groq_or_openai_key

# 4. Verify deployment
docker compose -f docker-compose.staging.yml logs -f waflow
\`\`\`

### First Login
- **URL:** \`https://staging.yourdomain.com\`
- **Email:** \`admin@waflow.com\`
- **Password:** \`admin123\`
- **Action:** Change immediately in Settings → Profile

---

## 🔒 SSL/TLS Certificate

### Let's Encrypt (Production)
\`\`\`bash
sudo bash setup-ssl.sh letsencrypt staging.yourdomain.com admin@example.com
\`\`\`

### Self-Signed (Testing Only)
\`\`\`bash
bash setup-ssl.sh self-signed staging.yourdomain.com
\`\`\`

---

## 📊 Access Points

| Service | URL | Purpose |
|---------|-----|---------|
| Application | https://staging.yourdomain.com | Main WAFlow |
| Prometheus | https://staging.yourdomain.com:9090 | Metrics |
| Grafana | https://staging.yourdomain.com:3001 | Dashboards |
| Health | https://staging.yourdomain.com/health | Status |

---

## 🛠️ Common Commands

### Logs
\`\`\`bash
docker compose -f docker-compose.staging.yml logs -f waflow
\`\`\`

### Database
\`\`\`bash
docker compose -f docker-compose.staging.yml exec mysql \
  mysql -uwaflow -pwaflowpassword waflow
\`\`\`

### Health Check
\`\`\`bash
bash health-check.sh --watch
\`\`\`

### Stop/Start
\`\`\`bash
docker compose -f docker-compose.staging.yml down
docker compose -f docker-compose.staging.yml up -d
\`\`\`

---

## 🧪 Load Testing

\`\`\`bash
npm install -g artillery
artillery run load-test.yml --target https://staging.yourdomain.com
\`\`\`

**Expected (5K concurrent):** p95 <1000ms, <1% errors, 500+ req/sec

---

## ✅ Deployment Checklist

- [ ] All Docker services running
- [ ] Application accessible via HTTPS
- [ ] Can login with admin@waflow.com
- [ ] Health check passes
- [ ] Prometheus collecting metrics
- [ ] Grafana dashboards load
- [ ] SSL certificate valid
- [ ] Backups scheduled and tested
- [ ] No errors in recent logs
- [ ] Response times acceptable

---

## 📞 Documentation

- **Full Guide:** \`STAGING_DEPLOYMENT.md\` (comprehensive)
- **Architecture:** \`CLAUDE.md\` (patterns & design)

---

**Status:** Ready for deployment  
**Created:** April 24, 2026
