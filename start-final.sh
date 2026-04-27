#!/bin/bash
set -e

cd ~/Documents/v2

echo "🧹 Cleaning up old containers..."
docker compose -f docker-compose.staging.yml down -v 2>/dev/null || true
docker stop waflow-mysql waflow-redis 2>/dev/null || true
docker rm waflow-mysql waflow-redis 2>/dev/null || true

sleep 2

echo "🐳 Building Docker image with Alpine (this takes 5-10 min)..."
docker compose -f docker-compose.staging.yml build --no-cache

echo "🚀 Starting services..."
docker compose -f docker-compose.staging.yml up -d

echo "⏳ Waiting 30 seconds for services..."
sleep 30

echo "🗄️  Running migrations..."
docker compose -f docker-compose.staging.yml exec -T waflow pnpm drizzle:migrate

echo "🌱 Seeding database..."
docker compose -f docker-compose.staging.yml exec -T waflow pnpm db:seed

echo ""
echo "✅ WAFlow is running!"
echo ""
docker compose -f docker-compose.staging.yml ps
echo ""
echo "🌐 Open: http://localhost"
echo "📧 Email: admin@waflow.com"
echo "🔑 Password: admin123"
echo ""
