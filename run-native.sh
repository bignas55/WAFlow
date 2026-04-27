#!/bin/bash
set -e

cd ~/Documents/v2

echo "🧹 Cleaning up old containers..."
docker stop waflow-mysql waflow-redis 2>/dev/null || true
docker rm waflow-mysql waflow-redis 2>/dev/null || true

sleep 2

echo "🚀 Starting MySQL and Redis in Docker..."
docker run -d \
  --name waflow-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=waflow \
  -e MYSQL_USER=waflow \
  -e MYSQL_PASSWORD=waflowpassword \
  -p 3306:3306 \
  mysql:8.0

docker run -d \
  --name waflow-redis \
  -p 6379:6379 \
  redis:7.0

echo "⏳ Waiting 20 seconds for services..."
sleep 20

echo "📦 Installing dependencies..."
pnpm install

echo "🔨 Building app..."
pnpm run build

echo "🗄️  Running migrations..."
pnpm drizzle:migrate

echo "🌱 Seeding database..."
pnpm db:seed

echo ""
echo "✅ Ready to start!"
echo ""
echo "🌐 App will be at: http://localhost:5173"
echo "📧 Email: admin@waflow.com"
echo "🔑 Password: admin123"
echo ""
echo "🚀 Starting app..."
pnpm dev
