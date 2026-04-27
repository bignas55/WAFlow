#!/bin/bash
set -e

cd ~/Documents/v2

echo "🧹 Stopping and removing old containers..."
docker stop waflow-mysql waflow-redis 2>/dev/null || true
docker rm waflow-mysql waflow-redis 2>/dev/null || true
docker compose -f docker-compose.staging.yml down -v 2>/dev/null || true

sleep 2

echo "🔨 Building Docker image (this may take 5-10 minutes on first run)..."
docker compose -f docker-compose.staging.yml build

echo "🚀 Starting services..."
docker compose -f docker-compose.staging.yml up -d

echo "⏳ Waiting 30 seconds for services to be healthy..."
sleep 30

echo "🗄️  Running database migrations..."
docker compose -f docker-compose.staging.yml exec -T waflow pnpm drizzle:migrate

echo "🌱 Seeding database..."
docker compose -f docker-compose.staging.yml exec -T waflow pnpm db:seed

echo ""
echo "✅ SETUP COMPLETE!"
echo ""
echo "App services running:"
docker compose -f docker-compose.staging.yml ps
echo ""
echo "🌐 App: http://localhost"
echo "📧 Email: admin@waflow.com"
echo "🔑 Password: admin123"
echo ""
echo "💡 View logs:"
echo "  docker compose -f docker-compose.staging.yml logs -f waflow"
echo ""
