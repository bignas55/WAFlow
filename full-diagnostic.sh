#!/bin/bash

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  FULL DIAGNOSTIC - Find and Report the Build Problem"
echo "═══════════════════════════════════════════════════════════════"
echo ""

cd /Users/nathi/Documents/v2

# Step 1: Stop containers
echo "Step 1: Stopping old containers..."
docker-compose -f docker-compose.1k-users.yml down 2>/dev/null || true
sleep 3

# Step 2: Remove old images to force rebuild
echo "Step 2: Removing old images..."
docker rmi -f v2-waflow-1:latest v2-waflow-2:latest v2-waflow-3:latest 2>/dev/null || true

# Step 3: Rebuild
echo "Step 3: Building Docker image..."
echo ""
docker-compose -f docker-compose.1k-users.yml build --no-cache 2>&1 | tee /tmp/docker-build.log
BUILD_EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "BUILD STATUS: Exit Code = $BUILD_EXIT_CODE"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [ $BUILD_EXIT_CODE -ne 0 ]; then
  echo "❌ BUILD FAILED!"
  echo ""
  echo "Errors from build log:"
  grep -i "error\|fail\|cannot find" /tmp/docker-build.log | tail -20 || echo "No error patterns found"
  exit 1
fi

echo "✅ BUILD SUCCEEDED!"
echo ""

# Step 4: Start services
echo "Step 4: Starting services..."
docker-compose -f docker-compose.1k-users.yml up -d

# Step 5: Wait for MySQL
echo "Step 5: Waiting for MySQL..."
sleep 15

# Step 6: Check if app starts
echo "Step 6: Checking app startup logs (waiting 30s)..."
sleep 10

echo ""
echo "App container logs:"
echo "───────────────────"
docker-compose -f docker-compose.1k-users.yml logs waflow-app-1 --tail 100 2>&1 | tail -50

echo ""
echo "Container status:"
echo "────────────────"
docker-compose -f docker-compose.1k-users.yml ps

echo ""
echo "Testing API:"
echo "───────────"
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo "✅ API is responding!"
  curl -s http://localhost:3000/health | head -c 200
else
  echo "⚠️  API not responding yet, waiting 30s..."
  sleep 30
  if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ API is now responding!"
  else
    echo "❌ API still not responding"
  fi
fi
