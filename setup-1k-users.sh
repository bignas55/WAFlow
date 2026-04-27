#!/bin/bash
set -e

cd ~/Documents/v2

echo "🧹 Cleaning up old containers..."
docker stop waflow-mysql waflow-redis waflow-app-1 waflow-app-2 waflow-app-3 waflow-lb-1k 2>/dev/null || true
docker rm waflow-mysql waflow-redis waflow-app-1 waflow-app-2 waflow-app-3 waflow-lb-1k 2>/dev/null || true

sleep 2

echo "🔨 Building app locally..."
pnpm install
pnpm run build

echo "🚀 Starting 1K users setup (3 app instances + load balancer)..."
docker compose -f docker-compose.1k-users.yml up -d

echo "⏳ Waiting 40 seconds for services to be ready..."
sleep 40

echo "🗄️  Applying database schema..."
docker compose -f docker-compose.1k-users.yml exec -T waflow-1 pnpm exec drizzle-kit push

echo "🌱 Seeding database..."
docker compose -f docker-compose.1k-users.yml exec -T waflow-1 pnpm db:seed

echo ""
echo "✅ WAFlow optimized for 1,000 concurrent users!"
echo ""
echo "Architecture:"
echo "  • 3 Node.js app instances (load balanced)"
echo "  • MySQL with 4GB buffer pool"
echo "  • Redis with 4GB memory"
echo "  • Nginx load balancer"
echo ""
echo "Access:"
echo "  🌐 App: http://localhost"
echo "  📊 App 1: http://localhost:3000"
echo "  📊 App 2: http://localhost:3001"
echo "  📊 App 3: http://localhost:3002"
echo ""
echo "Login:"
echo "  📧 Email: admin@waflow.com"
echo "  🔑 Password: admin123"
echo ""
echo "Monitor:"
docker compose -f docker-compose.1k-users.yml ps
echo ""
