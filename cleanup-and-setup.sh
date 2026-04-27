#!/bin/bash
set -e

echo "🧹 Cleaning up old containers..."

# Kill and remove ALL waflow containers
docker ps -a | grep waflow | awk '{print $1}' | xargs -r docker rm -f

# Kill and remove docker-compose containers
docker ps -a | grep "v2_\|v2-" | awk '{print $1}' | xargs -r docker rm -f

# Wait a moment
sleep 2

echo "🚀 Starting fresh setup..."

# Start MySQL
echo "Starting MySQL..."
docker run -d \
  --name waflow-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=waflow \
  -e MYSQL_USER=waflow \
  -e MYSQL_PASSWORD=waflowpassword \
  -p 3307:3306 \
  mysql:8.0

# Start Redis
echo "Starting Redis..."
docker run -d \
  --name waflow-redis \
  -p 6380:6379 \
  redis:7.0

# Wait for services
echo "⏳ Waiting 25 seconds for services..."
sleep 25

# Check MySQL is ready
echo "🔍 Checking MySQL..."
docker exec waflow-mysql mysqladmin ping -uroot -prootpass

# Install dependencies
echo "📦 Installing dependencies..."
cd ~/Documents/v2
pnpm install

# Run migrations
echo "🗄️  Running migrations..."
pnpm drizzle:migrate

# Seed database
echo "🌱 Seeding database..."
pnpm db:seed

# Done
echo ""
echo "✅ SETUP COMPLETE!"
echo ""
echo "🌐 App: http://localhost:5173"
echo "📧 Email: admin@waflow.com"
echo "🔑 Password: admin123"
echo ""
echo "Starting dev server..."
echo ""

pnpm dev
