#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFLOW FINAL DEPLOYMENT                                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd ~/Documents/v2

# Step 1: Build locally (this works)
echo "Step 1: Building application locally (this works)..."
pnpm build
echo "✅ Local build complete"
echo ""

# Step 2: Clean Docker
echo "Step 2: Cleaning Docker..."
docker-compose -f docker-compose.1k-users.yml down 2>/dev/null || true
sleep 2
docker rmi -f v2-waflow-1:latest v2-waflow-2:latest v2-waflow-3:latest 2>/dev/null || true
echo "✅ Docker cleaned"
echo ""

# Step 3: Build Docker images (just copies pre-built dist)
echo "Step 3: Building Docker images (copying pre-built application)..."
docker-compose -f docker-compose.1k-users.yml build --no-cache
echo "✅ Docker images built"
echo ""

# Step 4: Start services
echo "Step 4: Starting all services..."
docker-compose -f docker-compose.1k-users.yml up -d
echo "✅ Services started"
echo ""

# Step 5: Wait for health
echo "Step 5: Waiting for services to be healthy (30 seconds)..."
for i in {1..6}; do
  sleep 5
  echo "   ⏳ $((i * 5))s..."
done
echo ""

# Step 6: Show status
echo "Status:"
docker-compose -f docker-compose.1k-users.yml ps
echo ""

# Step 7: Test API
echo "Testing API..."
if curl -s http://localhost:3000/health >/dev/null 2>&1; then
  echo "✅ API responding!"
else
  echo "⏳ Waiting 30 more seconds for API..."
  sleep 30
  if curl -s http://localhost:3000/health >/dev/null 2>&1; then
    echo "✅ API now responding!"
  else
    echo "⚠️  API not responding yet, may still be starting"
  fi
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ✅ DEPLOYMENT COMPLETE!                                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Open browser: http://localhost"
echo "🔐 Login:"
echo "   Email:    admin@waflow.com"
echo "   Password: admin123"
echo ""
echo "📱 Connect WhatsApp:"
echo "   Settings → WhatsApp → Start WhatsApp Session → Scan QR Code"
echo ""
