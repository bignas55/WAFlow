#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  WAFlow — One-Click Deployment Script
#  Run from your LOCAL machine (not the server)
#  Usage: bash deploy/deploy.sh user@your-server-ip
# ═══════════════════════════════════════════════════════════════

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

SERVER=${1:-""}
APP_DIR="/var/www/waflow"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$SERVER" ]; then
  err "Usage: bash deploy/deploy.sh user@your-server-ip\nExample: bash deploy/deploy.sh root@123.456.789.0"
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║       WAFlow Deployment              ║"
echo "╚══════════════════════════════════════╝"
echo "  Server:  $SERVER"
echo "  Source:  $PROJECT_ROOT"
echo "  Target:  $APP_DIR"
echo ""

# ── 1. Build client locally ───────────────────────────────────
info "Building frontend..."
cd "$PROJECT_ROOT"
pnpm run build:client 2>/dev/null || npx vite build --outDir dist/client
log "Frontend built → dist/client"

# ── 2. Sync files to server ───────────────────────────────────
info "Uploading files to server..."
rsync -azP --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.wwebjs_auth' \
  --exclude='uploads' \
  --exclude='.env' \
  --exclude='dist' \
  "$PROJECT_ROOT/" "$SERVER:$APP_DIR/source/"

# Upload built client
rsync -azP "$PROJECT_ROOT/dist/" "$SERVER:$APP_DIR/dist/"
log "Files uploaded"

# ── 3. Remote setup & restart ─────────────────────────────────
info "Running remote setup..."
ssh "$SERVER" bash <<'REMOTE'
set -e
APP_DIR="/var/www/waflow"
cd "$APP_DIR/source"

echo "[→] Installing dependencies..."
pnpm install --frozen-lockfile --prod 2>/dev/null || npm install --omit=dev

echo "[→] Running database migrations..."
node run-migrations.cjs

echo "[→] Setting up PM2..."
cp "$APP_DIR/source/deploy/ecosystem.config.cjs" "$APP_DIR/ecosystem.config.cjs" 2>/dev/null || true

# Start or reload
if pm2 describe waflow > /dev/null 2>&1; then
  pm2 reload waflow --update-env
  echo "[✓] WAFlow reloaded"
else
  pm2 start "$APP_DIR/ecosystem.config.cjs"
  pm2 save
  echo "[✓] WAFlow started"
fi

echo "[→] Copying nginx config..."
cp "$APP_DIR/source/deploy/nginx/waflow.conf" /etc/nginx/sites-available/waflow 2>/dev/null || true
ln -sf /etc/nginx/sites-available/waflow /etc/nginx/sites-enabled/waflow 2>/dev/null || true
nginx -t && systemctl reload nginx

echo ""
echo "✅ Deployment complete!"
REMOTE

log ""
log "🚀 WAFlow deployed successfully!"
echo ""
echo "  App URL:  http://$SERVER"
echo "  PM2 logs: ssh $SERVER 'pm2 logs waflow'"
echo "  Status:   ssh $SERVER 'pm2 status'"
echo ""
warn "If first deploy: make sure /var/www/waflow/source/.env is configured on the server!"
echo ""
