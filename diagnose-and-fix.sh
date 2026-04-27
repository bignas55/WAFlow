#!/bin/bash

# WAFlow Docker Diagnostic & Fix Script
# This script diagnoses and fixes container restart issues

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFlow Docker Diagnostics & Container Restart Fix            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 1. Check current directory
echo "Step 1: Verifying project structure..."
if [ ! -f "docker-compose.1k-users.yml" ]; then
  echo "❌ ERROR: docker-compose.1k-users.yml not found. Run from v2 directory."
  exit 1
fi
echo "✅ Found docker-compose.1k-users.yml"

# 2. Check if dist folder exists
echo ""
echo "Step 2: Checking build artifacts..."
if [ ! -d "dist/server" ]; then
  echo "⚠️  dist/server not found. Running build..."
  npm run build:server
else
  echo "✅ Found dist/server with $(find dist/server -type f | wc -l) files"
fi

# 3. Stop all containers
echo ""
echo "Step 3: Stopping containers..."
docker-compose -f docker-compose.1k-users.yml stop waflow-1 waflow-2 waflow-3
sleep 5
echo "✅ Containers stopped"

# 4. Check container logs for errors
echo ""
echo "Step 4: Checking error logs..."
echo "━━━ Last 20 lines of waflow-1 logs ━━━"
docker-compose -f docker-compose.1k-users.yml logs waflow-1 | tail -20 || true
echo ""

# 5. Verify MySQL is healthy
echo "Step 5: Verifying database..."
docker-compose -f docker-compose.1k-users.yml ps mysql | grep healthy > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ MySQL is healthy"
else
  echo "⚠️  MySQL status unknown, continuing anyway..."
fi

# 6. Verify Redis is healthy
echo ""
echo "Step 6: Verifying cache..."
docker-compose -f docker-compose.1k-users.yml ps redis | grep healthy > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Redis is healthy"
else
  echo "⚠️  Redis status unknown, continuing anyway..."
fi

# 7. Remove and recreate app containers
echo ""
echo "Step 7: Removing and recreating application containers..."
docker-compose -f docker-compose.1k-users.yml down
sleep 5

# 8. Start everything fresh
echo ""
echo "Step 8: Starting all services..."
docker-compose -f docker-compose.1k-users.yml up -d
sleep 10
echo "✅ Containers started"

# 9. Check final status
echo ""
echo "Step 9: Final status check..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker-compose -f docker-compose.1k-users.yml ps
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 10. Wait for containers to stabilize
echo ""
echo "Step 10: Waiting for containers to become healthy (up to 60s)..."
counter=0
while [ $counter -lt 12 ]; do
  healthy_count=$(docker-compose -f docker-compose.1k-users.yml ps | grep -c "Up\|healthy" || true)
  total_count=7

  if [ $healthy_count -ge 5 ]; then
    echo "✅ Most services are running"
    break
  fi

  echo "   Waiting... ($((counter * 5))s elapsed, found $healthy_count/$total_count services)"
  sleep 5
  counter=$((counter + 1))
done

# 11. Final verification
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Diagnostic Complete                                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"

# Check what's actually running
waflow1=$(docker-compose -f docker-compose.1k-users.yml ps waflow-1 2>/dev/null | tail -1 || echo "")
if echo "$waflow1" | grep -q "Up"; then
  echo "✅ waflow-1 is UP"
else
  echo "❌ waflow-1 is NOT UP"
  echo "   Run: docker-compose -f docker-compose.1k-users.yml logs waflow-1"
fi

# Test health endpoint
echo ""
echo "Testing health endpoint..."
if curl -s -m 5 http://localhost:3000/health > /dev/null 2>&1; then
  echo "✅ Health endpoint responding"
else
  echo "⚠️  Health endpoint not responding yet (containers might still be starting)"
  echo "   Run: curl http://localhost:3000/health"
fi

# Test admin access
echo ""
echo "Testing admin access..."
if curl -s -m 5 http://localhost/admin > /dev/null 2>&1; then
  echo "✅ Admin interface accessible at http://localhost"
else
  echo "⚠️  Admin interface not responding yet"
  echo "   Access at: http://localhost"
fi

echo ""
echo "Next steps:"
echo "1. Wait 30 seconds for containers to fully start"
echo "2. Check status: docker-compose -f docker-compose.1k-users.yml ps"
echo "3. View logs: docker-compose -f docker-compose.1k-users.yml logs -f waflow-1"
echo "4. Access admin: http://localhost (admin@waflow.com / admin123)"
