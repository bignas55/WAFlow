#!/bin/bash
set -e

echo "🚀 Starting WAFlow setup on Mac..."

# Stop any existing containers
echo "Stopping existing Docker containers..."
docker stop waflow-mysql waflow-redis 2>/dev/null || true
docker rm waflow-mysql waflow-redis 2>/dev/null || true

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
echo "Waiting 20 seconds for services to start..."
sleep 20

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Run migrations
echo "Running database migrations..."
pnpm drizzle:migrate

# Seed database
echo "Seeding database..."
pnpm db:seed

# Start dev server
echo "✅ Setup complete! Starting dev server..."
echo ""
echo "🌐 App will be available at: http://localhost:5173"
echo "📧 Login: admin@waflow.com"
echo "🔑 Password: admin123"
echo ""
pnpm dev
