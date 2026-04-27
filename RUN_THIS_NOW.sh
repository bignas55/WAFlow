#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFLOW DOCKER BUILD - FINAL FIX                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd ~/Documents/v2

echo "Step 1: Stopping containers..."
docker-compose -f docker-compose.1k-users.yml down 2>/dev/null || true

echo "Step 2: Removing old images..."
docker rmi -f v2-waflow-1:latest v2-waflow-2:latest v2-waflow-3:latest 2>/dev/null || true

echo "Step 3: Building new images..."
echo "(Watch for 'Build successful, index.js found' in output)"
echo ""
docker-compose -f docker-compose.1k-users.yml build --no-cache

echo ""
echo "✅ Images built successfully"
echo ""

echo "Step 4: Starting containers..."
docker-compose -f docker-compose.1k-users.yml up -d

echo "Step 5: Waiting for services to start..."
sleep 15

echo ""
echo "Container Status:"
docker-compose -f docker-compose.1k-users.yml ps

echo ""
echo "Checking if app is responding..."
sleep 5

if curl -s http://localhost:3000/health >/dev/null 2>&1; then
  echo "✅ API is responding!"
  echo ""
  echo "🎉 SUCCESS! Open your browser:"
  echo "   http://localhost"
  echo ""
  echo "Login with:"
  echo "   Email: admin@waflow.com"
  echo "   Password: admin123"
else
  echo "⏳ App still initializing, checking logs..."
  docker-compose -f docker-compose.1k-users.yml logs waflow-app-1 | tail -30
fi

echo ""
echo "To view logs:"
echo "  docker-compose -f docker-compose.1k-users.yml logs -f waflow-app-1"
echo ""
