#!/bin/bash

# Diagnostic script for WAFlow Docker deployment

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFlow Deployment Diagnostic                                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "Step 1: Container Status"
echo "────────────────────────"
docker-compose -f docker-compose.1k-users.yml ps
echo ""

echo "Step 2: MySQL Health Check"
echo "──────────────────────────"
docker-compose -f docker-compose.1k-users.yml exec mysql mysqladmin ping -h localhost || echo "⚠️  MySQL not responding"
echo ""

echo "Step 3: App Container Error Logs (last 100 lines)"
echo "─────────────────────────────────────────────────"
echo "🔍 Checking waflow-app-1 logs..."
docker-compose -f docker-compose.1k-users.yml logs waflow-app-1 --tail 100
echo ""

echo "Step 4: Check if Chromium is installed in container"
echo "───────────────────────────────────────────────────"
docker-compose -f docker-compose.1k-users.yml exec waflow-app-1 chromium-browser --version || echo "⚠️  Chromium not found"
echo ""

echo "Step 5: Check if Node modules exist"
echo "──────────────────────────────────"
docker-compose -f docker-compose.1k-users.yml exec waflow-app-1 ls -la /app/dist/ | head -20 || echo "⚠️  dist directory not accessible"
echo ""

echo "Step 6: Network connectivity test"
echo "─────────────────────────────────"
docker-compose -f docker-compose.1k-users.yml exec waflow-app-1 ping -c 2 mysql || echo "⚠️  Cannot reach MySQL"
docker-compose -f docker-compose.1k-users.yml exec waflow-app-1 ping -c 2 redis || echo "⚠️  Cannot reach Redis"
echo ""

echo "Done."
