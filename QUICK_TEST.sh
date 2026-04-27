#!/bin/bash

# Quick 60-second WAFlow Test

echo "Waiting 5 seconds for containers to stabilize..."
sleep 5

echo ""
echo "TEST 1: Container Status"
docker-compose -f docker-compose.1k-users.yml ps | grep -E "NAME|waflow-app|nginx|mysql|redis"

echo ""
echo "TEST 2: Health Endpoint"
curl -s http://localhost:3000/health && echo "" || echo "❌ Not responding"

echo ""
echo "TEST 3: Load Balancer"
curl -s -I http://localhost | head -1

echo ""
echo "TEST 4: Database Check"
docker-compose -f docker-compose.1k-users.yml exec mysql mysql -u waflow -pwaflowpassword -e "SELECT COUNT(*) as tables FROM information_schema.tables WHERE table_schema='waflow';" 2>/dev/null || echo "DB checking..."

echo ""
echo "TEST 5: Redis Cache"
redis-cli ping 2>/dev/null || echo "Redis checking..."

echo ""
echo "═════════════════════════════════════════════════════════"
echo "✅ If you see 'Up' status above, system is running!"
echo "═════════════════════════════════════════════════════════"
echo ""
echo "Access admin dashboard:"
echo "  URL: http://localhost"
echo "  Email: admin@waflow.com"
echo "  Password: admin123"
