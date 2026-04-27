# WAFlow n8n — Production Deployment Guide

This guide covers deploying WAFlow to production with SSL, monitoring, backups, and scaling.

---

## Pre-Deployment Checklist

- [ ] All 8 workflows tested locally and working
- [ ] Database backed up
- [ ] `.env` file configured with production values
- [ ] SSL certificates obtained (Let's Encrypt)
- [ ] Backups to cloud storage configured (S3, GCS, etc.)
- [ ] Monitoring/alerting set up
- [ ] Admin user created and password changed
- [ ] Domain name and DNS configured

---

## 1. Server Setup

### Recommended: AWS EC2

**Instance Type:**
- `t3.medium` (2 vCPU, 4GB RAM, ~$30/month)
- Ubuntu 22.04 LTS
- 30GB EBS volume

**Security Group:**
```
Inbound:
  - 80/tcp (HTTP) from 0.0.0.0/0
  - 443/tcp (HTTPS) from 0.0.0.0/0
  - 22/tcp (SSH) from YOUR_IP
```

**Install Docker:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
```

### Alternative: DigitalOcean

- Droplet: 2GB / 2 vCPU / $12/month
- Image: Docker (1-Click App)
- Firewall: port 80, 443, 22

---

## 2. Deploy Code

```bash
# SSH into server
ssh ubuntu@your-server-ip

# Clone repository (or upload files)
git clone https://github.com/yourrepo/waflow-n8n.git
cd waflow-n8n/n8n-waflow-setup

# Create production .env
cp .env.template .env
nano .env  # Edit with production values
```

### Production .env Template

```bash
# Core
NODE_ENV=production
N8N_PROTOCOL=https
N8N_HOST=yourdomain.com
N8N_PORT=5678
N8N_SECURE_COOKIE=true

# Database
DB_HOST=mysql
DB_PORT=3306
DB_NAME=waflow_n8n
DB_USER=waflow
DB_PASSWORD=$(openssl rand -base64 32)  # Generate strong password

# JWT & Security
N8N_JWT_SECRET=$(openssl rand -base64 64)  # Long random string
N8N_USER_MANAGEMENT_JWT_SECRET=$(openssl rand -base64 64)
ENCRYPTION_KEY=$(openssl rand -hex 32)  # 32-byte hex
WHATSAPP_APP_SECRET=your_secret_here

# AI
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
GROQ_MODEL=mixtral-8x7b-32768

# Email (for alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@yourdomain.com
SMTP_PASSWORD=your_app_password
ADMIN_EMAIL=admin@yourdomain.com

# Monitoring
LOG_LEVEL=info
N8N_METRICS_ENABLED=true
N8N_DIAGNOSTICS_ENABLED=false
```

---

## 3. SSL/HTTPS with Let's Encrypt

### Using nginx Reverse Proxy

**Install nginx:**
```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

**Create nginx config:**
```bash
sudo nano /etc/nginx/sites-available/waflow
```

**Content:**
```nginx
upstream n8n {
    server localhost:5678;
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL certificates (certbot will create these)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy settings
    location / {
        proxy_pass http://n8n;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;

        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Webhook endpoint (bypass auth)
    location /webhook/ {
        proxy_pass http://n8n;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Enable and get SSL certificate:**
```bash
sudo ln -s /etc/nginx/sites-available/waflow /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get Let's Encrypt certificate
sudo certbot certonly --webroot -w /var/www/letsencrypt -d yourdomain.com

# Auto-renew (certbot runs automatically)
sudo systemctl enable certbot.timer
```

---

## 4. Docker Compose Production

Update `docker-compose.yml` for production:

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    container_name: waflow_mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME}
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - waflow_network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping"]
      timeout: 20s
      retries: 10

  n8n:
    image: n8nio/n8n:latest
    container_name: waflow_n8n
    restart: always
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      N8N_PROTOCOL: ${N8N_PROTOCOL}
      N8N_HOST: ${N8N_HOST}
      N8N_PORT: 5678
      DB_TYPE: mysqldb
      DB_MYSQLDB_HOST: mysql
      DB_MYSQLDB_PORT: 3306
      DB_MYSQLDB_DATABASE: ${DB_NAME}
      DB_MYSQLDB_USER: ${DB_USER}
      DB_MYSQLDB_PASSWORD: ${DB_PASSWORD}
      N8N_JWT_SECRET: ${N8N_JWT_SECRET}
      N8N_ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      N8N_SECURE_COOKIE: ${N8N_SECURE_COOKIE}
      WEBHOOK_URL: https://${N8N_HOST}/
    volumes:
      - n8n_data:/home/node/.n8n
    networks:
      - waflow_network
    ports:
      - "5678:5678"

networks:
  waflow_network:
    driver: bridge

volumes:
  mysql_data:
    driver: local
  n8n_data:
    driver: local
```

---

## 5. Start Services

```bash
# Start containers in detached mode
docker-compose up -d

# Verify they're running
docker-compose ps

# Check logs
docker-compose logs -f n8n
```

---

## 6. Backup Strategy

### Automated Daily Backup Script

Create `/home/ubuntu/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backups"
RETENTION_DAYS=30
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# MySQL backup
docker-compose exec -T mysql mysqldump -u waflow -p$DB_PASSWORD waflow_n8n | gzip > $BACKUP_DIR/waflow_n8n_$DATE.sql.gz

# n8n data backup
docker cp waflow_n8n:/home/node/.n8n $BACKUP_DIR/n8n_$DATE

# Upload to S3 (if configured)
aws s3 cp $BACKUP_DIR/waflow_n8n_$DATE.sql.gz s3://your-backup-bucket/waflow/mysql/
aws s3 cp $BACKUP_DIR/n8n_$DATE s3://your-backup-bucket/waflow/n8n/ --recursive

# Clean old backups (local only)
find $BACKUP_DIR -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $DATE"
```

Make executable:
```bash
chmod +x /home/ubuntu/backup.sh
```

### Setup Cron Job

```bash
crontab -e

# Add this line (daily at 2 AM)
0 2 * * * /home/ubuntu/backup.sh >> /var/log/waflow-backup.log 2>&1
```

### S3 Backup Setup

```bash
# Install AWS CLI
sudo apt install awscli

# Configure credentials
aws configure
# Enter:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region
# - Default output format

# Create S3 bucket
aws s3 mb s3://waflow-backups-$(date +%s)

# Grant backup permissions
aws s3api put-bucket-versioning --bucket waflow-backups-xxx --versioning-configuration Status=Enabled
```

---

## 7. Monitoring & Alerts

### Health Checks

```bash
# Manual health check
curl https://yourdomain.com/api/v1/health

# Webhook test
curl -X POST https://yourdomain.com/webhook/whatsapp/2 \
  -H "Content-Type: application/json" \
  -d '{"entry": [{"changes": [{"value": {"messages": [{"from": "1234567890", "text": {"body": "test"}}]}}]}]}'
```

### Monitoring Stack (Optional)

**Install Prometheus + Grafana:**

```bash
docker run -d --name prometheus prom/prometheus
docker run -d --name grafana grafana/grafana
```

**Monitor metrics:**
```bash
# Container stats
docker stats

# Database queries
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n -e \
  "SHOW PROCESSLIST;"

# n8n workflows
curl https://yourdomain.com/api/v1/statistics \
  -H "X-N8N-API-KEY: your_api_key"
```

### Log Aggregation

```bash
# Stream logs to file
docker-compose logs -f > /var/log/waflow.log &

# Rotate logs
sudo apt install logrotate

# Add to /etc/logrotate.d/waflow
/var/log/waflow.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 root root
}
```

---

## 8. Scaling

### Horizontal Scaling (Multiple Instances)

For high volume (1000+ messages/day), run multiple n8n instances:

```yaml
# docker-compose.yml - Add load balancer
  nginx-lb:
    image: nginx:latest
    ports:
      - "5678:80"
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf
    depends_on:
      - n8n_1
      - n8n_2

  n8n_1:
    image: n8nio/n8n:latest
    environment:
      INSTANCE_ID: "1"
      # ... rest of config

  n8n_2:
    image: n8nio/n8n:latest
    environment:
      INSTANCE_ID: "2"
      # ... rest of config
```

### Database Scaling

For 100k+ messages:
- Use AWS RDS for MySQL (managed, auto-backups, read replicas)
- Add read replicas for query performance
- Enable binary logging for replication

---

## 9. Security Hardening

### Firewall Rules

```bash
sudo ufw enable
sudo ufw allow 22/tcp  # SSH
sudo ufw allow 80/tcp  # HTTP
sudo ufw allow 443/tcp # HTTPS
sudo ufw default deny incoming
sudo ufw default allow outgoing
```

### Regular Updates

```bash
# Daily security updates
sudo apt update
sudo apt upgrade -y

# Docker images
docker-compose pull
docker-compose up -d
```

### Secrets Management

Never commit secrets to git:

```bash
# Use environment file
cat > /home/ubuntu/.env.production
# Paste production values

# Load on startup
export $(cat /home/ubuntu/.env.production | xargs)
```

---

## 10. Troubleshooting Production

### Containers Keep Restarting

```bash
docker-compose logs n8n | tail -50
# Check for:
# - Database connection errors
# - Out of disk space
# - Memory issues
```

### Database Connection Issues

```bash
# Test from n8n container
docker-compose exec n8n ping mysql

# Check network
docker-compose exec n8n nslookup mysql

# Verify credentials
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n -e "SELECT 1;"
```

### High CPU/Memory Usage

```bash
# Check stats
docker stats

# If n8n using too much:
# - Reduce concurrent workflows
# - Increase container memory: docker-compose.yml resources section
# - Enable workflow throttling in n8n settings
```

---

## 11. Cost Optimization

**Typical Production Costs:**

| Component | Cost |
|-----------|------|
| Server (EC2 t3.medium) | $30/month |
| Backup storage (S3) | $5-10/month |
| SSL certificate (Let's Encrypt) | FREE |
| Domain | $10-15/year |
| Groq API (100k msgs/month) | ~$100 |
| **Total** | **$135-145/month** |

**Cost Reduction Tips:**
- Use Groq free tier while testing
- Compress old backups
- Use lifecycle policies on S3
- Monitor and optimize API calls

---

## 12. Disaster Recovery

### Recovery Plan

**If Database Corrupted:**
```bash
# Stop n8n
docker-compose stop n8n

# Restore from backup
docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n < /backups/waflow_n8n_TIMESTAMP.sql

# Restart
docker-compose start n8n
```

**If Server Down:**
```bash
# Spin up new server
# Copy .env file
# Run docker-compose up -d
# Restore from backup
# Workflows automatically resume
```

---

## Maintenance Schedule

### Weekly
- [ ] Check disk space: `df -h`
- [ ] Review logs for errors: `docker-compose logs | grep ERROR`
- [ ] Verify backups succeeded: `ls -lh /backups/`

### Monthly
- [ ] Update Docker images: `docker-compose pull && docker-compose up -d`
- [ ] Review workflow performance: n8n UI → Executions
- [ ] Check database size: `SELECT table_name, ROUND(((data_length + index_length) / 1024 / 1024), 2) as size FROM information_schema.TABLES WHERE table_schema = 'waflow_n8n';`

### Quarterly
- [ ] Test restore from backup
- [ ] Security audit
- [ ] Performance optimization review

---

## Support

- **n8n Docs:** https://docs.n8n.io/hosting/
- **Docker Docs:** https://docs.docker.com/
- **MySQL Docs:** https://dev.mysql.com/doc/
- **Let's Encrypt:** https://letsencrypt.org/

---

**Production deployment ready!** 🚀
