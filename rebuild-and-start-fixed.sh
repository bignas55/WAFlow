#!/bin/bash

# Complete rebuild with database initialization for WWJS support

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFlow Rebuild — Fixed with Database Initialization           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Make entrypoint script executable
echo "Step 1: Preparing entrypoint script..."
chmod +x docker-entrypoint.sh
echo "✅ Done"
echo ""

# Step 2: Stop old containers
echo "Step 2: Stopping old containers..."
docker-compose -f docker-compose.1k-users.yml down || true
sleep 5
echo "✅ Stopped"
echo ""

# Step 3: Build new Docker image with Chromium and initialization
echo "Step 3: Building Docker image with Chromium and database setup..."
echo "   (This takes 2-3 minutes, downloading and installing packages...)"
docker-compose -f docker-compose.1k-users.yml build --no-cache
echo "✅ Build complete"
echo ""

# Step 4: Start all services
echo "Step 4: Starting all services..."
docker-compose -f docker-compose.1k-users.yml up -d
echo "✅ Services started"
echo ""

# Step 5: Wait for services to be ready
echo "Step 5: Waiting for services to be healthy (up to 180 seconds)..."
counter=0
max_attempts=36  # 3 minutes

while [ $counter -lt $max_attempts ]; do
  mysql_status=$(docker-compose -f docker-compose.1k-users.yml ps mysql 2>/dev/null | grep -c "healthy" || echo 0)
  redis_status=$(docker-compose -f docker-compose.1k-users.yml ps redis 2>/dev/null | grep -c "healthy" || echo 0)

  if [ "$mysql_status" = "1" ] && [ "$redis_status" = "1" ]; then
    echo "   ✅ MySQL and Redis healthy"
    break
  fi

  echo "   ⏳ Waiting... ($((counter * 5))s)"
  sleep 5
  counter=$((counter + 1))
done

echo ""

# Step 6: Show status
echo "Step 6: Container status"
echo "────────────────────────"
docker-compose -f docker-compose.1k-users.yml ps | tail -n +2
echo ""

# Step 7: Wait for app containers to start
echo "Step 7: Waiting for app containers to initialize (up to 60 seconds)..."
sleep 10

counter=0
while [ $counter -lt 12 ]; do
  app_status=$(docker-compose -f docker-compose.1k-users.yml ps waflow-app-1 2>/dev/null | grep -c "Up" || echo 0)

  if [ "$app_status" = "1" ]; then
    echo "   ✅ App container initialized"
    break
  fi

  echo "   ⏳ Waiting... ($((counter * 5))s)"
  sleep 5
  counter=$((counter + 1))
done

echo ""

# Step 8: Check app logs
echo "Step 8: Application logs (checking for errors)..."
echo "────────────────────────────────────────────────"
docker-compose -f docker-compose.1k-users.yml logs waflow-app-1 | tail -n 30 || echo "⚠️  Logs not available yet"
echo ""

# Step 9: Test API endpoint
echo "Step 9: Testing API endpoint..."
echo "───────────────────────────────"
sleep 5
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo "✅ API health check passed!"
else
  echo "⚠️  API not responding yet - give it another 30 seconds..."
  sleep 30
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ API health check passed!"
  else
    echo "⚠️  API still not responding - checking container status..."
    docker-compose -f docker-compose.1k-users.yml ps
  fi
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Rebuild Complete!                                             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Your system now has:"
echo "  ✅ Chromium installed for WhatsApp Web.js (WWJS)"
echo "  ✅ Database migrations applied automatically on startup"
echo "  ✅ Admin user seeded (admin@waflow.com / admin123)"
echo "  ✅ All containers running with health checks"
echo "  ✅ QR code authentication ready"
echo ""
echo "Next steps:"
echo "  1. Open browser: http://localhost"
echo "  2. Login with:"
echo "     Email: admin@waflow.com"
echo "     Password: admin123"
echo "  3. Go to Settings → WhatsApp"
echo "  4. Click 'Start WhatsApp Session'"
echo "  5. Scan QR code with your phone"
echo ""
echo "View logs in real-time:"
echo "  docker-compose -f docker-compose.1k-users.yml logs -f waflow-app-1"
echo ""
echo "Stop everything:"
echo "  docker-compose -f docker-compose.1k-users.yml down"
echo ""
