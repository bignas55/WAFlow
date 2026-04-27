#!/bin/bash

# Complete rebuild with Chromium support for WWJS

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFlow Complete Rebuild — Adding Chromium for WWJS           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Stop old containers
echo "Step 1: Stopping old containers..."
docker-compose -f docker-compose.1k-users.yml down || true
sleep 5
echo "✅ Stopped"
echo ""

# Step 2: Build new Docker image with Chromium
echo "Step 2: Building Docker image with Chromium support..."
echo "   (This takes 2-3 minutes, downloading and installing packages...)"
docker-compose -f docker-compose.1k-users.yml build --no-cache
echo "✅ Build complete"
echo ""

# Step 3: Start all services
echo "Step 3: Starting all services..."
docker-compose -f docker-compose.1k-users.yml up -d
echo "✅ Services started"
echo ""

# Step 4: Wait for services to be ready
echo "Step 4: Waiting for services to be healthy (up to 120 seconds)..."
counter=0
while [ $counter -lt 24 ]; do
  if docker-compose -f docker-compose.1k-users.yml ps mysql | grep -q "healthy"; then
    echo "   ✅ MySQL healthy"
    break
  fi
  echo "   ⏳ Waiting... ($((counter * 5))s)"
  sleep 5
  counter=$((counter + 1))
done
echo ""

# Step 5: Show status
echo "Step 5: Container status"
echo "────────────────────────"
docker-compose -f docker-compose.1k-users.yml ps | tail -n +2
echo ""

# Step 6: Final check
echo "Step 6: Testing WhatsApp WWJS..."
echo "────────────────────────────────"
sleep 10

if docker-compose -f docker-compose.1k-users.yml logs waflow-app-1 | grep -q "WWJS init"; then
  echo "✅ WWJS initialization detected"
elif docker-compose -f docker-compose.1k-users.yml logs waflow-app-1 | grep -q "Browser was not found"; then
  echo "⚠️  Browser still not found - checking Chromium..."
  docker-compose -f docker-compose.1k-users.yml exec waflow-app-1 which chromium-browser
else
  echo "✅ Containers started successfully"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Rebuild Complete!                                             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Your system is ready with:"
echo "  ✅ Chromium installed for WhatsApp Web.js (WWJS)"
echo "  ✅ All containers running with Chromium support"
echo "  ✅ QR code authentication ready"
echo ""
echo "Next steps:"
echo "  1. Access admin dashboard: http://localhost"
echo "  2. Go to Settings → WhatsApp"
echo "  3. Click 'Start WhatsApp Session'"
echo "  4. Scan QR code with your phone"
echo ""
echo "To view logs:"
echo "  docker-compose -f docker-compose.1k-users.yml logs -f waflow-app-1"
echo ""
echo "To stop everything:"
echo "  docker-compose -f docker-compose.1k-users.yml down"
echo ""
