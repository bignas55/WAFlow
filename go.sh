#!/bin/bash
set -e

cd ~/Documents/v2

# Kill everything first
echo "Stopping all containers..."
docker stop waflow-mysql waflow-redis 2>/dev/null || true
docker rm waflow-mysql waflow-redis 2>/dev/null || true

sleep 2

# Start MySQL
echo "Starting MySQL..."
docker run -d \
  --name waflow-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=waflow \
  -e MYSQL_USER=waflow \
  -e MYSQL_PASSWORD=waflowpassword \
  -p 3306:3306 \
  mysql:8.0

# Start Redis
echo "Starting Redis..."
docker run -d \
  --name waflow-redis \
  -p 6379:6379 \
  redis:7.0

echo "Waiting 20 seconds..."
sleep 20

echo "Building..."
pnpm install
pnpm run build

echo "Applying schema..."
pnpm exec drizzle-kit push

echo "Seeding..."
pnpm db:seed

echo ""
echo "✅ App ready at http://localhost:5173"
echo "Email: admin@waflow.com"
echo "Password: admin123"
echo ""

pnpm dev
