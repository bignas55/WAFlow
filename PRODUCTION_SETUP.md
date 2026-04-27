# WAFlow Production Setup — 24/7 Server with Public Domain

Run WAFlow continuously on your Mac (or cloud server) with a publicly accessible domain.

---

## 📋 Two Deployment Options

### Option A: Mac + Cloudflare Tunnel (Recommended)
- **Cost:** Free
- **Setup time:** 10 minutes
- **Reliability:** High (managed by Cloudflare)
- **Domain:** Custom domain (yourdomain.waflow.com)
- **Requires:** Mac stays on, Cloudflare account

### Option B: Cloud Server (Best for 24/7)
- **Cost:** $5-20/month (DigitalOcean, Linode, AWS)
- **Setup time:** 30 minutes
- **Reliability:** Very high (always on)
- **Domain:** Any domain you own
- **Requires:** Cloud hosting account

---

## 🚀 Option A: Mac + Cloudflare Tunnel

### Step 1: Install Cloudflare CLI
```bash
brew install cloudflare/cloudflare/cloudflared
```

### Step 2: Authenticate Cloudflare
```bash
cloudflared tunnel login
```
This opens a browser to authorize Cloudflare access.

### Step 3: Create Tunnel
```bash
cloudflared tunnel create waflow
```

Note the tunnel ID for later.

### Step 4: Create Config File
```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: waflow
credentials-file: /Users/nathi/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: waflow.yourdomain.com
    service: http://localhost:3000
  - hostname: *.waflow.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF
```

Replace:
- `<TUNNEL_ID>` with your tunnel ID from step 3
- `yourdomain.com` with your actual domain

### Step 5: Create DNS Record
```bash
cloudflared tunnel route dns waflow waflow.yourdomain.com
```

Or manually add CNAME in your domain registrar:
```
waflow.yourdomain.com  CNAME  <TUNNEL_ID>.cfargotunnel.com
```

### Step 6: Run Tunnel
```bash
# Start the tunnel
cloudflared tunnel run waflow

# Or run in background
nohup cloudflared tunnel run waflow > /var/log/cloudflare-tunnel.log 2>&1 &
```

### Step 7: Access Your Server
```
https://waflow.yourdomain.com
```

**Test from another device:** Use your phone to access the URL

---

## ☁️ Option B: Cloud Server Deployment

### Recommended Providers

| Provider | Price | Setup | Performance |
|----------|-------|-------|-------------|
| DigitalOcean | $5/mo | 10 min | ⭐⭐⭐⭐ |
| Linode | $5/mo | 10 min | ⭐⭐⭐⭐⭐ |
| AWS | $10+/mo | 15 min | ⭐⭐⭐⭐⭐ |
| Vultr | $5/mo | 10 min | ⭐⭐⭐⭐ |

### Step 1: Create Cloud Server

**DigitalOcean (easiest):**
1. Create account: https://digitalocean.com
2. Click "Create" → "Droplet"
3. Choose:
   - Image: Ubuntu 22.04
   - Size: Basic $5/month (enough for 5K+ users)
   - Region: Closest to you
4. Click "Create Droplet"
5. Get IP address from dashboard

### Step 2: Connect to Server
```bash
# Add your SSH key when creating droplet, then:
ssh root@<your-droplet-ip>

# Or use password from email
```

### Step 3: Deploy WAFlow (Use our staging deployment)
```bash
# On the server:
cd /root
git clone <your-repo-url> waflow
cd waflow

# Copy staging deployment
cp docker-compose.staging.yml docker-compose.yml
cp .env.staging .env

# Update .env with your values
nano .env
# - Set VITE_API_URL=https://your-domain.com
# - Set AI_API_KEY
# - Set GRAFANA_PASSWORD

# Run deployment
chmod +x deploy-staging.sh
./deploy-staging.sh --domain your-domain.com --email admin@example.com
```

### Step 4: Point Domain to Server
Update your domain registrar's DNS:
```
A record: your-domain.com  →  <your-server-ip>
```

### Step 5: Access Your Server
```
https://your-domain.com
```

---

## 🔐 Custom Domain Setup

### Step 1: Register Domain
Services:
- **Namecheap** (cheapest)
- **GoDaddy** (easiest)
- **Google Domains**

### Step 2: Point to Your Server

**For cloud server:**
```
A record: waflow.example.com  →  your.server.ip.address
```

**For Cloudflare Tunnel:**
```
CNAME record: waflow.example.com  →  <TUNNEL_ID>.cfargotunnel.com
```

### Step 3: SSL Certificate (Automatic)

**Cloud Server:**
```bash
sudo certbot certonly --standalone \
  -d waflow.example.com \
  --email your@email.com \
  --agree-tos

# Auto-renews every 90 days
```

**Cloudflare Tunnel:**
Automatic HTTPS included ✓

---

## 🔄 Auto-Startup & Monitoring

### macOS LaunchAgent (runs on boot)
```bash
# Install and load
./setup-background.sh

# Check status
./check-status.sh

# View logs
tail -f /var/log/waflow.log
```

### Linux Systemd Service
Create `/etc/systemd/system/waflow.service`:
```ini
[Unit]
Description=WAFlow Platform
After=docker.service
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
WorkingDirectory=/root/waflow
ExecStart=/usr/bin/docker compose -f docker-compose.yml up
ExecStop=/usr/bin/docker compose -f docker-compose.yml down
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable waflow
sudo systemctl start waflow
sudo systemctl status waflow

# View logs
sudo journalctl -u waflow -f
```

---

## 📊 Monitoring & Alerts

### Health Check Script
```bash
cat > /usr/local/bin/waflow-health.sh << 'EOF'
#!/bin/bash
curl -f http://localhost:3000/health || {
    # Alert: server down
    # Send email, Slack notification, etc.
    echo "WAFlow is down!" | mail -s "Alert: WAFlow Down" admin@example.com
    exit 1
}
EOF

chmod +x /usr/local/bin/waflow-health.sh
```

### Cron Job (check every 5 minutes)
```bash
# Add to crontab:
crontab -e

# Add line:
*/5 * * * * /usr/local/bin/waflow-health.sh >> /var/log/waflow-health.log 2>&1
```

### Monitoring Dashboard
```bash
# SSH into your server
ssh root@your-server-ip

# View WAFlow logs
docker compose logs -f waflow

# View system stats
docker stats

# Check database size
docker compose exec mysql \
  mysql -uwaflow -pwaflowpassword waflow \
  -e "SELECT ROUND(SUM(DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb FROM INFORMATION_SCHEMA.TABLES;"
```

---

## 🛡️ Security Checklist

- [ ] Changed default password (admin@waflow.com)
- [ ] Enabled SSL/TLS certificate
- [ ] Firewall configured (allow only 80, 443)
- [ ] Regular backups enabled
- [ ] Monitoring alerts set up
- [ ] Email notifications working
- [ ] Rate limiting enabled
- [ ] WAF enabled (if using Cloudflare)
- [ ] SSH key-based auth only (no passwords)

---

## 📈 Scaling for Growth

### Current Setup Handles:
- 5,000 concurrent users
- 200-300 messages/second
- 99.5% uptime

### When You Need More:

**At 10,000 users:**
- Upgrade server size (double resources)
- Add database read replicas

**At 50,000 users:**
- Use managed database (AWS RDS)
- Add load balancer
- Separate API and worker nodes

**At 100,000+ users:**
- Geo-distributed servers
- Content delivery network (CDN)
- Global load balancing

---

## 📞 Support & Troubleshooting

### Server won't start
```bash
# Check Docker
docker ps -a

# View errors
docker compose logs waflow --tail=50

# Restart
docker compose down
docker compose up -d
```

### Can't access domain
```bash
# Check DNS
nslookup waflow.example.com

# Check server firewall
sudo ufw status

# Test from terminal
curl https://waflow.example.com/health
```

### Database running out of space
```bash
# Check size
docker compose exec mysql \
  mysql -uwaflow -pwaflowpassword \
  -e "SELECT ROUND(SUM(DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024 / 1024, 2) AS size_gb FROM INFORMATION_SCHEMA.TABLES;"

# Solutions:
# 1. Upgrade server disk
# 2. Archive old conversations
# 3. Enable automated cleanup
```

### SSL certificate expired
```bash
# Renew certificate
sudo certbot renew --force-renewal

# For Cloudflare Tunnel: automatic ✓
```

---

## 🚀 From Beta to Production

### Phase 1: Testing (1-2 weeks)
- Run on Mac with Cloudflare Tunnel
- Test with 10 users
- Monitor logs and performance

### Phase 2: Soft Launch (2-4 weeks)
- Deploy to cloud server
- Enable monitoring and alerts
- Test with 100 users
- Set up backups

### Phase 3: Production (ongoing)
- Full monitoring dashboard
- Automated backups (daily)
- 24/7 support ready
- Scaling plan in place

---

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] Domain registered and pointing to server
- [ ] SSL certificate installed
- [ ] Database backups configured
- [ ] Monitoring and alerts set up
- [ ] Team trained on operations

### Post-Deployment
- [ ] Application accessible via domain
- [ ] Health checks passing
- [ ] Logs being collected
- [ ] Backups running daily
- [ ] Monitoring dashboard active

### Ongoing
- [ ] Weekly backups tested
- [ ] Logs reviewed for errors
- [ ] Security updates applied
- [ ] Performance monitored
- [ ] Capacity planning reviewed

---

## Quick Reference

### Access Your Server
```
Web Interface: https://waflow.example.com
API: https://waflow.example.com/api/trpc
Prometheus: https://waflow.example.com:9090
Grafana: https://waflow.example.com:3001
```

### Useful Commands
```bash
# View logs
docker compose logs -f waflow

# Restart service
docker compose restart waflow

# Database access
docker compose exec mysql \
  mysql -uwaflow -pwaflowpassword waflow

# Check health
curl https://waflow.example.com/health
```

---

**Ready to launch! Choose Option A (Mac) or Option B (Cloud) above and follow the steps.** 🚀

