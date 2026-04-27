#!/bin/bash

# WAFlow Diagnostic Tool — Debug container startup issues

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFlow Container Diagnostic                                  ║"
echo "║  Checking: Containers, Logs, Ports, Environment              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ─────────────────────────────────────────────────────────────────────
# 1. Container Status
# ─────────────────────────────────────────────────────────────────────

echo "STEP 1: Container Status"
echo "───────────────────────"
docker-compose -f docker-compose.1k-users.yml ps
echo ""

# ─────────────────────────────────────────────────────────────────────
# 2. Check app container logs
# ─────────────────────────────────────────────────────────────────────

echo "STEP 2: WAFlow App-1 Logs (Last 50 lines)"
echo "─────────────────────────────────────────"
docker-compose -f docker-compose.1k-users.yml logs waflow-app-1 | tail -50
echo ""

# ─────────────────────────────────────────────────────────────────────
# 3. Check Nginx logs
# ─────────────────────────────────────────────────────────────────────

echo "STEP 3: Nginx Load Balancer Logs"
echo "────────────────────────────────"
docker-compose -f docker-compose.1k-users.yml logs waflow-lb-1k | tail -20
echo ""

# ─────────────────────────────────────────────────────────────────────
# 4. Check MySQL logs
# ─────────────────────────────────────────────────────────────────────

echo "STEP 4: MySQL Logs (Health Check)"
echo "────────────────────────────────"
docker-compose -f docker-compose.1k-users.yml logs waflow-mysql-1k | tail -10
echo ""

# ─────────────────────────────────────────────────────────────────────
# 5. Check if MySQL is actually running
# ─────────────────────────────────────────────────────────────────────

echo "STEP 5: Database Connectivity Test"
echo "───────────────────────────────────"
docker-compose -f docker-compose.1k-users.yml exec mysql mysql -u waflow -pwaflowpassword -e "SELECT 'Database is accessible!' as status;" || echo "❌ Database connection failed"
echo ""

# ─────────────────────────────────────────────────────────────────────
# 6. Check ports
# ─────────────────────────────────────────────────────────────────────

echo "STEP 6: Port Status"
echo "──────────────────"
echo "Port 3000 (App):"
lsof -i :3000 || echo "  Not in use"

echo ""
echo "Port 80 (Nginx):"
lsof -i :80 || echo "  Not in use"

echo ""
echo "Port 3306 (MySQL):"
lsof -i :3306 || echo "  Not in use"

echo ""
echo "Port 6379 (Redis):"
lsof -i :6379 || echo "  Not in use"

echo ""

# ─────────────────────────────────────────────────────────────────────
# 7. Environment variables check
# ─────────────────────────────────────────────────────────────────────

echo "STEP 7: Environment Variables"
echo "─────────────────────────────"
echo "NODE_ENV: $NODE_ENV"
echo "DATABASE_URL: ${DATABASE_URL:0:20}..."
echo "JWT_SECRET: ${JWT_SECRET:0:20}..."
echo "ENCRYPTION_KEY: ${ENCRYPTION_KEY:0:20}..."
echo "AI_API_URL: $AI_API_URL"
echo "AI_MODEL: $AI_MODEL"
echo ""

# ─────────────────────────────────────────────────────────────────────
# 8. Summary & Recommendations
# ─────────────────────────────────────────────────────────────────────

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Diagnostic Summary                                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if MySQL is healthy
if docker-compose -f docker-compose.1k-users.yml ps mysql | grep -q "healthy"; then
  echo "✅ MySQL: HEALTHY"
else
  echo "❌ MySQL: NOT HEALTHY"
fi

# Check if Redis is healthy
if docker-compose -f docker-compose.1k-users.yml ps redis | grep -q "healthy"; then
  echo "✅ Redis: HEALTHY"
else
  echo "❌ Redis: NOT HEALTHY"
fi

# Check if app is running
if docker-compose -f docker-compose.1k-users.yml ps waflow-app-1 | grep -q "Up"; then
  echo "✅ App Container 1: UP"
else
  echo "⚠️  App Container 1: RESTARTING or DOWN"
  echo "   → Check logs above for errors"
fi

echo ""
echo "Next steps:"
echo "───────────"
echo "1. If MySQL/Redis not healthy, wait 30 seconds and rerun this script"
echo "2. If app containers restarting, check the error log in STEP 2"
echo "3. Look for 'Error:', 'ENOENT', 'Cannot find', or 'connection refused'"
echo "4. Common issues:"
echo "   - Port 3000 already in use: kill the process with 'kill -9 <PID>'"
echo "   - Database not ready: wait and retry"
echo "   - Environment variables not set: rerun setup-docker.sh"
echo ""
