#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFLOW - BUILD AND DEPLOY                                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

cd ~/Documents/v2

echo "Step 1: Cleaning up old containers and images..."
docker-compose -f docker-compose.1k-users.yml down 2>/dev/null || true
sleep 2
docker rmi -f v2-waflow-1:latest v2-waflow-2:latest v2-waflow-3:latest 2>/dev/null || true

echo "✅ Cleaned"
echo ""

echo "Step 2: Building Docker images (this takes 1-2 minutes)..."
echo ""
docker-compose -f docker-compose.1k-users.yml build --no-cache

echo ""
echo "✅ Build complete"
echo ""

echo "Step 3: Starting all services..."
docker-compose -f docker-compose.1k-users.yml up -d

echo "✅ Services started"
echo ""

echo "Step 4: Waiting for services to be healthy (30 seconds)..."
for i in {1..6}; do
  sleep 5
  echo "   ⏳ $((i * 5))s..."
done

echo ""
echo "Step 5: Container status:"
echo "──────────────────────"
docker-compose -f docker-compose.1k-users.yml ps

echo ""
echo "Step 6: Waiting for API to respond..."
for i in {1..6}; do
  if curl -s http://localhost:3000/health >/dev/null 2>&1; then
    echo "   ✅ API is responding!"
    break
  fi
  sleep 5
  echo "   ⏳ Waiting... (attempt $i/6)"
done

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ✅ WAFLOW IS READY!                                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Open your browser:"
echo "   http://localhost"
echo ""
echo "🔐 Login credentials:"
echo "   Email:    admin@waflow.com"
echo "   Password: admin123"
echo ""
echo "📱 To connect WhatsApp:"
echo "   1. Login to the dashboard"
echo "   2. Go to Settings → WhatsApp"
echo "   3. Click 'Start WhatsApp Session'"
echo "   4. Scan QR code with your phone"
echo ""
echo "📊 System supports 1,000+ concurrent users:"
echo "   • 3 load-balanced Node.js instances"
echo "   • MySQL 8.0 optimized for 1K connections"
echo "   • Redis message queue"
echo ""
echo "📝 View logs:"
echo "   docker-compose -f docker-compose.1k-users.yml logs -f waflow-app-1"
echo ""
echo "🛑 Stop everything:"
echo "   docker-compose -f docker-compose.1k-users.yml down"
echo ""
