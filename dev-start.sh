#!/bin/bash

# WAFlow Development Mode — Start everything for local development

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFlow Development Mode — Starting...                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Step 1: Check if Docker containers are running
echo -e "${BLUE}Step 1: Checking Docker services...${NC}"
if docker-compose -f docker-compose.1k-users.yml ps | grep -q "mysql.*healthy"; then
  echo "✅ MySQL already running"
else
  echo "⏳ Starting Docker services (MySQL, Redis, Nginx)..."
  docker-compose -f docker-compose.1k-users.yml up -d

  echo "⏳ Waiting for MySQL to be healthy..."
  sleep 15
fi

echo "✅ Docker services ready"
echo ""

# Step 2: Check if node_modules exists
echo -e "${BLUE}Step 2: Checking dependencies...${NC}"
if [ ! -d "node_modules" ]; then
  echo "⏳ Installing dependencies..."
  pnpm install
  echo "✅ Dependencies installed"
else
  echo "✅ Dependencies already installed"
fi
echo ""

# Step 3: Run migrations if needed
echo -e "${BLUE}Step 3: Running database migrations...${NC}"
if [ ! -d "drizzle/migrations/meta" ]; then
  echo "⏳ Generating migrations..."
  pnpm drizzle:generate
  pnpm drizzle:migrate
  echo "✅ Migrations complete"
else
  echo "✅ Migrations already applied"
fi
echo ""

# Step 4: Start development server
echo -e "${BLUE}Step 4: Starting development server...${NC}"
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ✅ Ready for Development!                                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Frontend:${NC}        http://localhost:5173 (hot reload)"
echo -e "${GREEN}API:${NC}             http://localhost:3000"
echo -e "${GREEN}Admin (prod):${NC}    http://localhost"
echo ""
echo "Database:       MySQL (Docker)"
echo "Cache:          Redis (Docker)"
echo "Load Balancer:  Nginx (Docker)"
echo ""
echo "Stop with: Ctrl+C"
echo "Stop Docker: docker-compose -f docker-compose.1k-users.yml down"
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo ""

# Start development
pnpm dev
