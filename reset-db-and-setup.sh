#!/bin/bash
set -e

cd ~/Documents/v2

# Load environment
export $(cat .env.local | grep -v '^#' | xargs)

echo "🧹 Stopping containers..."
docker stop waflow-mysql waflow-redis 2>/dev/null || true
docker rm waflow-mysql waflow-redis 2>/dev/null || true

sleep 2

echo "🚀 Starting fresh MySQL and Redis..."
docker run -d \
  --name waflow-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=waflow \
  -e MYSQL_USER=waflow \
  -e MYSQL_PASSWORD=waflowpassword \
  -p 3307:3306 \
  mysql:8.0

docker run -d \
  --name waflow-redis \
  -p 6380:6379 \
  redis:7.0

echo "⏳ Waiting 25 seconds for services..."
sleep 25

# Verify MySQL is ready
echo "🔍 Verifying MySQL..."
until docker exec waflow-mysql mysqladmin ping -uroot -prootpass; do
  echo "Waiting for MySQL..."
  sleep 2
done

echo "✅ MySQL is ready"
echo ""

echo "🗄️  Running migrations on clean database..."
pnpm drizzle:migrate

echo "✅ Migrations complete"
echo ""

echo "🌱 Seeding database..."
pnpm db:seed

echo "✅ Seed complete"
echo ""
echo "✅ SETUP COMPLETE!"
echo ""
echo "🌐 App: http://localhost:5173"
echo "📧 Email: admin@waflow.com"
echo "🔑 Password: admin123"
echo ""
echo "🚀 Starting dev server..."
echo ""

pnpm dev
