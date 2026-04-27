#!/bin/bash

# WAFlow Quick Test Suite

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFlow System Tests                                           ║"
echo "║  Testing: Containers, API, Database, Cache                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to test
test_cmd() {
  local name=$1
  local cmd=$2
  local expected=$3

  echo "TEST: $name"
  echo "Command: $cmd"

  if eval "$cmd" 2>/dev/null | grep -q "$expected"; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAILED${NC}"
    ((FAILED++))
  fi
  echo ""
}

# ─────────────────────────────────────────────────────────────────────
# TEST 1: Container Status
# ─────────────────────────────────────────────────────────────────────

echo "═══ TEST 1: Container Status ═══"
echo ""

RUNNING=$(docker-compose -f docker-compose.1k-users.yml ps | grep -c "Up\|Restarting" || echo "0")
echo "Containers running/restarting: $RUNNING / 7"
docker-compose -f docker-compose.1k-users.yml ps | tail -n +2
echo ""

# ─────────────────────────────────────────────────────────────────────
# TEST 2: Health Endpoint
# ─────────────────────────────────────────────────────────────────────

echo "═══ TEST 2: Health Endpoint ═══"
echo ""
test_cmd "Health Check" "curl -s http://localhost:3000/health" "ok\|status"

# ─────────────────────────────────────────────────────────────────────
# TEST 3: Load Balancer
# ─────────────────────────────────────────────────────────────────────

echo "═══ TEST 3: Load Balancer ═══"
echo ""
test_cmd "Nginx Response" "curl -s -I http://localhost" "HTTP\|200\|302"

# ─────────────────────────────────────────────────────────────────────
# TEST 4: Database
# ─────────────────────────────────────────────────────────────────────

echo "═══ TEST 4: Database ═══"
echo ""
test_cmd "Database Tables" "docker-compose -f docker-compose.1k-users.yml exec mysql mysql -u waflow -pwaflowpassword -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=\\'waflow\\';'" "46\|[0-9]"

# ─────────────────────────────────────────────────────────────────────
# TEST 5: Redis
# ─────────────────────────────────────────────────────────────────────

echo "═══ TEST 5: Redis Cache ═══"
echo ""
test_cmd "Redis Ping" "redis-cli ping" "PONG"

# ─────────────────────────────────────────────────────────────────────
# TEST 6: Admin Login
# ─────────────────────────────────────────────────────────────────────

echo "═══ TEST 6: Admin Account ═══"
echo ""
test_cmd "Admin User Exists" "docker-compose -f docker-compose.1k-users.yml exec mysql mysql -u waflow -pwaflowpassword -e 'SELECT email FROM waflow.users WHERE email=\\'admin@waflow.com\\';'" "admin@waflow.com"

# ─────────────────────────────────────────────────────────────────────
# TEST 7: Database Tables
# ─────────────────────────────────────────────────────────────────────

echo "═══ TEST 7: Core Tables ═══"
echo ""
test_cmd "Users Table" "docker-compose -f docker-compose.1k-users.yml exec mysql mysql -u waflow -pwaflowpassword -e 'SELECT COUNT(*) FROM waflow.users;'" "[0-9]"
test_cmd "Conversations Table" "docker-compose -f docker-compose.1k-users.yml exec mysql -u waflow -pwaflowpassword -e 'SELECT COUNT(*) FROM waflow.conversations;'" "[0-9]"
test_cmd "Templates Table" "docker-compose -f docker-compose.1k-users.yml exec mysql -u waflow -pwaflowpassword -e 'SELECT COUNT(*) FROM waflow.templates;'" "[0-9]"

# ─────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  TEST SUMMARY                                                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Tests Passed:  ${GREEN}$PASSED${NC}"
echo -e "Tests Failed:  ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
  echo ""
  echo "Your WAFlow deployment is working!"
  echo ""
  echo "Next steps:"
  echo "1. Open http://localhost in your browser"
  echo "2. Login: admin@waflow.com / admin123"
  echo "3. Go to Settings → WhatsApp to scan QR code"
  echo ""
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo ""
  echo "Common issues:"
  echo "1. App containers still starting — wait 30 seconds and retry"
  echo "2. Nginx not responding — check: docker-compose logs nginx"
  echo "3. Database issues — check: docker-compose logs mysql"
  echo "4. Port conflicts — run: lsof -i :3000"
  echo ""
  echo "Full logs:"
  echo "  docker-compose logs -f waflow-1"
fi

echo ""
