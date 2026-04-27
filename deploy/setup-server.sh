#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  WAFlow — Fresh Ubuntu Server Setup
#  Run ONCE on a brand-new Ubuntu 22.04/24.04 VPS
#  Usage: bash setup-server.sh
# ═══════════════════════════════════════════════════════════════

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    WAFlow Server Setup — Ubuntu      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── System update ─────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ── Node.js 20 ────────────────────────────────────────────────
log "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v && npm -v

# ── pnpm ──────────────────────────────────────────────────────
log "Installing pnpm..."
npm install -g pnpm@9 pm2

# ── MySQL 8 ───────────────────────────────────────────────────
log "Installing MySQL 8..."
apt-get install -y mysql-server
systemctl enable mysql
systemctl start mysql

# Secure MySQL and create waflow DB
MYSQL_ROOT_PASS=$(openssl rand -base64 20)
mysql -u root <<EOF
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASS}';
CREATE DATABASE IF NOT EXISTS waflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'waflow'@'localhost' IDENTIFIED BY '${MYSQL_ROOT_PASS}';
GRANT ALL PRIVILEGES ON waflow.* TO 'waflow'@'localhost';
FLUSH PRIVILEGES;
EOF

log "MySQL configured."
warn "Save these credentials:"
echo "  DB User:     waflow"
echo "  DB Password: ${MYSQL_ROOT_PASS}"
echo "  Database:    waflow"
echo ""
echo "DATABASE_URL=mysql://waflow:${MYSQL_ROOT_PASS}@localhost:3306/waflow" > /root/waflow-db-credentials.txt
warn "Credentials saved to /root/waflow-db-credentials.txt"

# ── Nginx ─────────────────────────────────────────────────────
log "Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# ── Certbot (Let's Encrypt SSL) ───────────────────────────────
log "Installing Certbot..."
apt-get install -y certbot python3-certbot-nginx

# ── Firewall ──────────────────────────────────────────────────
log "Configuring UFW firewall..."
ufw --force enable
ufw allow ssh
ufw allow 'Nginx Full'
ufw allow 3306/tcp  # MySQL (restrict to private network in production)

# ── Chromium (for whatsapp-web.js) ────────────────────────────
log "Installing Chromium for WhatsApp Web..."
apt-get install -y chromium-browser fonts-liberation libgbm1 libasound2

# ── Ollama (local AI — runs Gemma 4 with no cloud dependency) ─
log "Installing Ollama..."
curl -fsSL https://ollama.com/install.sh | sh
systemctl enable ollama
systemctl start ollama
sleep 5  # let the service fully start

log "Pulling Gemma 4 model (9.6 GB — this will take a few minutes)..."
ollama pull gemma4:latest
log "Gemma 4 ready at http://localhost:11434"
warn "To use a different model later: ollama pull <model-name>"

# ── Create waflow user ────────────────────────────────────────
if ! id "waflow" &>/dev/null; then
  log "Creating waflow system user..."
  useradd -m -s /bin/bash waflow
fi

# ── App directory ─────────────────────────────────────────────
log "Creating app directory..."
mkdir -p /var/www/waflow
chown -R waflow:waflow /var/www/waflow

log ""
log "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "  1. Copy your project to the server:  bash deploy/deploy.sh user@your-server-ip"
echo "  2. Set your domain in /etc/nginx/sites-available/waflow"
echo "  3. Run: certbot --nginx -d yourdomain.com"
echo "  4. Make sure .env on the server has:"
echo "       ENCRYPTION_KEY=<64-char hex>  (node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"
echo "       JWT_SECRET=<random string>     (openssl rand -base64 48)"
echo "       DATABASE_URL=mysql://waflow:<password>@localhost:3306/waflow"
echo "       AI_API_URL=http://localhost:11434/v1"
echo "       AI_MODEL=gemma4:latest"
echo "       AI_API_KEY=ollama"
echo ""
