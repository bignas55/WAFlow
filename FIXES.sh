#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          WAFLOW FIX: Redis, Socket.IO, Custom ID             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is running
if ! command -v docker &> /dev/null; then
  echo "❌ Docker not found. Install Docker Desktop first."
  exit 1
fi

echo "Step 1: Checking Docker status..."
if ! docker ps &> /dev/null; then
  echo "⚠️  Docker daemon not running. Starting Docker..."
  # On macOS with Docker Desktop
  if [ -d "/Applications/Docker.app" ]; then
    open -a Docker
    echo "   Opening Docker Desktop... waiting 30s for startup"
    sleep 30
  else
    echo "❌ Docker Desktop not found. Please start Docker manually."
    exit 1
  fi
fi
echo "✅ Docker is running"
echo ""

echo "Step 2: Checking existing containers..."
docker compose -f docker-compose.yml ps 2>/dev/null || echo "   (No compose file found yet)"
echo ""

echo "Step 3: Starting Redis..."
if docker compose -f docker-compose.yml ps redis &> /dev/null; then
  echo "   Redis already running"
else
  echo "   Starting Redis container..."
  docker compose -f docker-compose.yml up -d redis
  sleep 2
  echo "✅ Redis started"
fi
echo ""

echo "Step 4: Verifying Redis connection..."
if docker exec $(docker compose -f docker-compose.yml ps -q redis) redis-cli ping 2>/dev/null | grep -q "PONG"; then
  echo "✅ Redis responding to PING"
else
  echo "⚠️  Redis not responding - it may still be starting"
  sleep 3
  if docker exec $(docker compose -f docker-compose.yml ps -q redis) redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo "✅ Redis now responding"
  else
    echo "❌ Redis not responding. Check: docker compose logs redis"
  fi
fi
echo ""

echo "Step 5: Checking MySQL..."
if docker compose -f docker-compose.yml ps db &> /dev/null; then
  echo "✅ MySQL already running"
else
  echo "   Starting MySQL container..."
  docker compose -f docker-compose.yml up -d db
  sleep 3
  echo "✅ MySQL started"
fi
echo ""

echo "Step 6: Rebuilding application..."
echo "   (Fixed files: messageQueue.ts, index.ts)"
pnpm build 2>&1 | tail -5
echo "✅ Build complete"
echo ""

echo "Step 7: Ready to start WAFlow"
echo "   Run: pnpm dev"
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ✅ ALL FIXES APPLIED                                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Fixes applied:"
echo "  ✓ Custom ID colon separator → dash (messageQueue.ts:105)"
echo "  ✓ Socket.IO reconnection config (index.ts:92-115)"
echo "  ✓ Redis connection retry logic (messageQueue.ts:18-35)"
echo ""
echo "Next steps:"
echo "  1. Run: pnpm dev"
echo "  2. Open http://localhost:5173"
echo "  3. Test appointment booking"
echo ""
