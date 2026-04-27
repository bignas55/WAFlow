# WAFlow Staging Deployment Guide

## Overview

This guide walks you through deploying WAFlow to a staging environment. The staging setup is production-grade with monitoring, SSL/TLS, reverse proxy, and auto-scaling capabilities.

**Target capacity:** 5,000 concurrent users
**Estimated setup time:** 30-45 minutes

---

## Prerequisites

### Infrastructure Requirements
- **Server:** Ubuntu 22.04 LTS or similar (t3.large or better on AWS)
- **Disk space:** 100GB minimum (20GB OS + 30GB Docker images + 50GB database)
- **RAM:** 16GB minimum (8GB for application, 4GB for database, 2GB for Redis, 2GB buffer)
- **CPU cores:** 4+ cores
- **Network:** Static IP or fixed domain name

### Software Requirements
- Docker 20.10+ and Docker Compose 2.0+
- Git
- curl/wget
- OpenSSL (for SSL certificate generation)

### Domain Setup
- A domain name (e.g., `staging.yourdomain.com`)
- DNS A record pointing to your server's IP
- Email for Let's Encrypt SSL certificate

---

## Step 1: Server Preparation

### 1.1 Connect to your server
```bash
ssh -i your-key.pem ubuntu@your-server-ip
```

### 1.2 Update system packages
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.3 Install Docker and Docker Compose
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose --version
```

### 1.4 Create application directory
```bash
mkdir -p ~/waflow-staging && cd ~/waflow-staging
```

### 1.5 Set up firewall
```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Verify
sudo ufw status
```

---

## Step 2: Clone and Configure Application

### 2.1 Clone repository (if using git)
```bash
git clone https://your-repo-url.git .
cd ~/waflow-staging
```

### 2.2 Copy configuration files
```bash
# Copy environment file
cp .env.staging .env

# Create directories for SSL certificates
mkdir -p ssl/certs
mkdir -p nginx-logs
mkdir -p uploads
mkdir -p .wwebjs_auth
```

### 2.3 Generate encryption and JWT secrets
```bash
# Generate JWT secret
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "JWT_SECRET: $JWT_SECRET"

# Generate encryption key
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "ENCRYPTION_KEY: $ENCRYPTION_KEY"

# Add to .env file
sed -i "s/your_staging_jwt_secret_here_generate_with_crypto/$JWT_SECRET/" .env
sed -i "s/your_staging_encryption_key_here_32_bytes_hex/$ENCRYPTION_KEY/" .env
```

### 2.4 Update .env file with your settings
```bash
nano .env
```

Edit these critical values:
- `VITE_API_URL=https://staging.yourdomain.com`
- `APP_URL=https://staging.yourdomain.com`
- `GOOGLE_REDIRECT_URI=https://staging.yourdomain.com/api/auth/google/callback`
- `GRAFANA_PASSWORD=your_secure_password_here`
- `AI_API_KEY=your_groq_or_openai_key`

---

## Step 3: SSL/TLS Certificate Setup

### Option A: Let's Encrypt (Recommended for production)

#### 3A.1 Install Certbot
```bash
sudo apt install certbot python3-certbot-nginx -y
```

#### 3A.2 Generate certificate
```bash
sudo certbot certonly --standalone \
  -d staging.yourdomain.com \
  --email your-email@example.com \
  --agree-tos \
  --non-interactive
```

#### 3A.3 Copy certificates to application directory
```bash
sudo cp /etc/letsencrypt/live/staging.yourdomain.com/fullchain.pem ssl/certs/
sudo cp /etc/letsencrypt/live/staging.yourdomain.com/privkey.pem ssl/certs/
sudo chown $USER:$USER ssl/certs/*
```

#### 3A.4 Set up auto-renewal
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Verify renewal works
sudo certbot renew --dry-run
```

### Option B: Self-signed certificate (for testing only)

```bash
openssl req -x509 -newkey rsa:4096 -keyout ssl/certs/privkey.pem \
  -out ssl/certs/fullchain.pem -days 365 -nodes \
  -subj "/CN=staging.yourdomain.com"
```

### 3.5 Update nginx.conf with your domain
```bash
sed -i 's/staging.yourdomain.com/your-actual-domain.com/g' nginx.conf
```

---

## Step 4: Start Services

### 4.1 Build Docker image
```bash
# This builds the image with all dependencies
docker compose -f docker-compose.staging.yml build
```

### 4.2 Start all services
```bash
docker compose -f docker-compose.staging.yml up -d
```

### 4.3 Verify services are running
```bash
docker compose -f docker-compose.staging.yml ps

# Expected output:
# NAME                    STATUS              
# waflow-mysql-staging    Up (healthy)        
# waflow-redis-staging    Up (healthy)        
# waflow-app-staging      Up (healthy)        
# waflow-nginx-staging    Up                  
# waflow-prometheus-staging  Up                  
# waflow-grafana-staging  Up                  
```

### 4.4 Check service logs
```bash
# Full logs from all services
docker compose -f docker-compose.staging.yml logs -f

# Specific service logs
docker compose -f docker-compose.staging.yml logs waflow
docker compose -f docker-compose.staging.yml logs nginx
```

---

## Step 5: Initialize Database

### 5.1 Wait for database to be ready (30 seconds)
```bash
sleep 30
```

### 5.2 Run database migrations
```bash
docker compose -f docker-compose.staging.yml exec -T waflow \
  npx drizzle-kit migrate:mysql
```

### 5.3 Seed default data
```bash
docker compose -f docker-compose.staging.yml exec -T waflow \
  npm run db:seed
```

### 5.4 Verify database is populated
```bash
docker compose -f docker-compose.staging.yml exec -T mysql \
  mysql -uwaflow -pwaflowpassword waflow -e "SELECT COUNT(*) as users FROM users;"
```

---

## Step 6: Verify Deployment

### 6.1 Check application health
```bash
curl https://staging.yourdomain.com/health
# Expected response: {"status":"ok"}
```

### 6.2 Test login endpoint
```bash
curl -X POST https://staging.yourdomain.com/api/trpc/auth.login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@waflow.com","password":"admin123"}'
```

### 6.3 Check frontend accessibility
```bash
curl -I https://staging.yourdomain.com/
# Expected: HTTP/2 200
```

### 6.4 Monitor logs in real-time
```bash
docker compose -f docker-compose.staging.yml logs -f waflow
```

---

## Step 7: Set Up Monitoring

### 7.1 Access Prometheus
Open browser to: `https://staging.yourdomain.com:9090`

Verify these targets are active:
- waflow
- mysql (after adding mysqld_exporter)
- redis (after adding redis_exporter)

### 7.2 Access Grafana
1. Open browser to: `https://staging.yourdomain.com:3001`
2. Login: `admin` / (the password you set in .env)
3. Change password immediately
4. Add Prometheus as data source: `http://prometheus:9090`

### 7.3 Create Grafana dashboards

#### Dashboard 1: Application Metrics
- Request rate (req/sec)
- Response time (p50, p95, p99)
- Error rate
- Active connections

#### Dashboard 2: Database Metrics
- Query performance
- Connection pool utilization
- Slow query count
- Replication lag (if applicable)

#### Dashboard 3: System Metrics
- CPU usage
- Memory usage
- Disk I/O
- Network throughput

### 7.4 Set up alerts
Configure alerts in Prometheus for:
- Service down (no response in 2 minutes)
- High error rate (>5%)
- Database connection pool > 80%
- Redis memory usage > 80%
- Disk usage > 90%

---

## Step 8: Backup & Disaster Recovery

### 8.1 Create backup script
```bash
cat > ~/backup-waflow.sh << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/backups/waflow"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup MySQL database
docker compose -f ~/waflow-staging/docker-compose.staging.yml exec -T mysql \
  mysqldump -uroot -p"${DB_ROOT_PASSWORD}" --all-databases > \
  $BACKUP_DIR/mysql_$TIMESTAMP.sql.gz

# Backup application files
tar -czf $BACKUP_DIR/app_$TIMESTAMP.tar.gz \
  ~/waflow-staging/uploads \
  ~/waflow-staging/.wwebjs_auth

# Keep only last 7 days of backups
find $BACKUP_DIR -name "mysql_*.sql.gz" -mtime +7 -delete
find $BACKUP_DIR -name "app_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $TIMESTAMP"
EOF

chmod +x ~/backup-waflow.sh
```

### 8.2 Schedule daily backups
```bash
# Add to crontab
(crontab -l 2>/dev/null; echo "0 2 * * * ~/backup-waflow.sh") | crontab -
```

### 8.3 Test restore procedure
```bash
# List available backups
ls -lh /backups/waflow/

# To restore (in emergency):
# 1. Stop application
docker compose -f docker-compose.staging.yml down

# 2. Restore database
docker compose -f docker-compose.staging.yml up -d mysql
sleep 10
docker compose -f docker-compose.staging.yml exec -T mysql \
  mysql -uroot -p"${DB_ROOT_PASSWORD}" < /backups/waflow/mysql_TIMESTAMP.sql.gz

# 3. Restore files
tar -xzf /backups/waflow/app_TIMESTAMP.tar.gz -C ~/waflow-staging/

# 4. Restart all services
docker compose -f docker-compose.staging.yml up -d
```

---

## Step 9: Load Testing

### 9.1 Install load testing tools
```bash
npm install -g artillery
```

### 9.2 Create load test configuration
```bash
cat > load-test.yml << 'EOF'
config:
  target: "https://staging.yourdomain.com"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 300
      arrivalRate: 100
      name: "Sustained load"
    - duration: 60
      arrivalRate: 500
      name: "Spike test"
    - duration: 60
      arrivalRate: 10
      name: "Cool down"
  defaults:
    headers:
      User-Agent: "load-test"

scenarios:
  - name: "Health check"
    flow:
      - get:
          url: "/health"
  - name: "Login flow"
    flow:
      - post:
          url: "/api/trpc/auth.login"
          json:
            email: "admin@waflow.com"
            password: "admin123"
EOF
```

### 9.3 Run load test
```bash
artillery run load-test.yml --target https://staging.yourdomain.com
```

### 9.4 Monitor during load test
```bash
# In another terminal
watch 'docker compose -f docker-compose.staging.yml exec waflow \
  curl -s http://localhost:3000/metrics | grep -E "http_requests|process_cpu"'
```

---

## Step 10: Maintenance & Troubleshooting

### 10.1 View logs
```bash
# Real-time logs
docker compose -f docker-compose.staging.yml logs -f waflow

# Last 100 lines
docker compose -f docker-compose.staging.yml logs --tail=100 waflow

# Specific container
docker compose -f docker-compose.staging.yml logs nginx
```

### 10.2 Database queries
```bash
# Connect to MySQL
docker compose -f docker-compose.staging.yml exec mysql \
  mysql -uwaflow -pwaflowpassword waflow

# Example queries
SHOW TABLES;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM conversations;
```

### 10.3 Common issues

#### Issue: Services won't start
```bash
# Check Docker daemon
docker info

# Verify disk space
df -h

# Rebuild image
docker compose -f docker-compose.staging.yml build --no-cache
```

#### Issue: SSL certificate errors
```bash
# Verify certificate
openssl x509 -in ssl/certs/fullchain.pem -text -noout

# Check certificate expiry
openssl x509 -in ssl/certs/fullchain.pem -noout -dates

# Renew certificate (Let's Encrypt)
sudo certbot renew --force-renewal
```

#### Issue: High memory usage
```bash
# Check Docker memory stats
docker stats

# Reduce memory allocation
# Edit docker-compose.staging.yml and add:
# services:
#   waflow:
#     deploy:
#       resources:
#         limits:
#           memory: 4G
```

### 10.4 Performance tuning

#### Increase database performance
```bash
# Edit docker-compose.staging.yml, MySQL section:
# - innodb-buffer-pool-size=4G (adjust based on available RAM)
# - innodb-log-file-size=1G
# - max_connections=1000
```

#### Optimize Redis
```bash
# Edit docker-compose.staging.yml, Redis section:
# - maxmemory 4gb
# - maxmemory-policy allkeys-lru (evict least recently used)
```

#### Increase worker concurrency
```bash
# Edit .env
WORKER_CONCURRENCY=400  # Increased from 200
DB_CONNECTION_LIMIT=500  # Increased from 300
```

---

## Step 11: Security Hardening

### 11.1 Update Nginx headers
- HSTS: 31536000 seconds (1 year)
- CSP: Restrictive but allow required domains
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff

### 11.2 Implement rate limiting
Already configured in `nginx.conf`:
- Auth endpoints: 10 requests/minute
- API endpoints: 300 requests/second
- Webhook endpoints: 100 requests/second

### 11.3 Enable WAF (Web Application Firewall)
```bash
# Install ModSecurity
sudo apt install libmodsecurity3 libmodsecurity-dev -y

# Configure in Nginx (advanced setup)
```

### 11.4 Set up fail2ban
```bash
sudo apt install fail2ban -y

# Configure to block repeated failed logins
```

---

## Step 12: Scaling to 5,000 Concurrent Users

### 12.1 Horizontal scaling (multiple app instances)

Update `docker-compose.staging.yml`:
```yaml
services:
  waflow-1:
    # ... same config
  waflow-2:
    # ... same config
  waflow-3:
    # ... same config

  nginx:
    depends_on:
      - waflow-1
      - waflow-2
      - waflow-3

# Update upstream in nginx.conf:
upstream waflow_backend {
  server waflow-1:3000;
  server waflow-2:3000;
  server waflow-3:3000;
}
```

### 12.2 Database optimization
```bash
# Create appropriate indexes for your queries
docker compose -f docker-compose.staging.yml exec mysql mysql -uwaflow -pwaflowpassword waflow << 'EOF'
CREATE INDEX idx_conversations_tenant_date ON conversations(tenantId, createdAt);
CREATE INDEX idx_customers_tenant ON customers(tenantId);
EOF
```

### 12.3 Redis cluster (for high-volume message queue)
Replace single Redis with Redis Cluster for 5K+ concurrent users.

### 12.4 Monitor and adjust
- Watch Prometheus metrics during peak hours
- Identify bottlenecks
- Scale specific components (increase worker_concurrency, database connections, etc.)

---

## Deployment Checklist

- [ ] Server prepared with Docker and Docker Compose
- [ ] Application cloned and configured
- [ ] SSL/TLS certificates installed
- [ ] Environment variables configured correctly
- [ ] Database migrations applied
- [ ] Seed data loaded
- [ ] Application health check passes
- [ ] Frontend accessible via HTTPS
- [ ] Prometheus collecting metrics
- [ ] Grafana dashboards created
- [ ] Backup script scheduled
- [ ] Load testing passed (5K concurrent users)
- [ ] Security headers verified
- [ ] Monitoring alerts configured
- [ ] Runbooks created for common issues
- [ ] Team trained on deployment process

---

## Support and Troubleshooting

For issues, check:
1. Service logs: `docker compose logs -f`
2. Prometheus metrics: `https://staging.yourdomain.com:9090`
3. Grafana dashboards: `https://staging.yourdomain.com:3001`
4. Health endpoint: `https://staging.yourdomain.com/health`

---

## Next Steps (Step 2)

After staging is stable for 1 week:
1. Run comprehensive load testing (Step 2)
2. Identify and fix performance bottlenecks
3. Create operational documentation (Step 3)
4. Set up production infrastructure
5. Plan soft launch to 100 beta users
