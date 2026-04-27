#!/usr/bin/env bash
# WAFlow Setup Script
# Run: chmod +x setup.sh && ./setup.sh

set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     WAFlow — Setup Script            ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()    { echo -e "${GREEN}✓${NC} $1"; }
warn()   { echo -e "${YELLOW}⚠${NC}  $1"; }
error()  { echo -e "${RED}✗${NC} $1"; exit 1; }
step()   { echo -e "\n${YELLOW}▶ $1${NC}"; }

# Check Node.js
step "Checking prerequisites"
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Install from https://nodejs.org (v20+)"
fi
NODE_VER=$(node -v)
log "Node.js $NODE_VER found"

# Check npm
if ! command -v npm &>/dev/null; then
  error "npm not found"
fi
log "npm $(npm -v) found"

# Check MySQL
if ! command -v mysql &>/dev/null; then
  warn "mysql CLI not found. Make sure MySQL 8 is running before continuing."
else
  log "MySQL CLI found"
fi

# Check Ollama
step "Checking Ollama"
if ! command -v ollama &>/dev/null; then
  warn "Ollama not found. Run ./ollama-setup.sh first, or install from https://ollama.com"
  warn "Continuing without Ollama — AI features won't work until it's installed."
else
  log "Ollama found: $(ollama --version 2>/dev/null || echo 'version unknown')"
  # Check if running
  if curl -s http://localhost:11434/api/tags &>/dev/null; then
    log "Ollama is running"
    MODELS=$(curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | head -5)
    if [ -z "$MODELS" ]; then
      warn "No models downloaded yet. Run: ollama pull llama3.2"
    else
      log "Available models: $MODELS"
    fi
  else
    warn "Ollama is installed but not running. Start with: ollama serve"
  fi
fi

# Create .env
step "Environment configuration"
if [ ! -f .env ]; then
  cp .env.example .env
  log "Created .env from .env.example"
  echo ""
  echo "  Please edit .env with your database credentials:"
  echo "  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD"
  echo ""
  read -p "  Press Enter after editing .env to continue..."
else
  log ".env already exists"
fi

# Load env vars
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep -v '^$' | xargs) 2>/dev/null || true
fi

# Create database
step "Setting up database"
DB_NAME=${DB_NAME:-waflow}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-root}

if command -v mysql &>/dev/null; then
  if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null; then
    log "Database '$DB_NAME' ready"
  else
    warn "Could not create database automatically. Create it manually:"
    echo "  mysql -u root -p -e \"CREATE DATABASE $DB_NAME;\""
  fi
else
  warn "Please create the database manually: CREATE DATABASE $DB_NAME;"
fi

# Install dependencies
step "Installing dependencies"
npm install
log "Dependencies installed"

# Run migrations
step "Running database migrations"
npm run drizzle:migrate
log "Migrations complete"

# Seed database
step "Seeding database"
npm run db:seed
log "Database seeded with demo data"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅  WAFlow setup complete!                              ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  Start the dev server:  npm run dev                      ║"
echo "║  Open:                  http://localhost:5173            ║"
echo "║  Login:                 admin@waflow.com / admin123      ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
