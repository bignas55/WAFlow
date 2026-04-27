#!/bin/bash

echo "════════════════════════════════════════════════════════════════"
echo "  Checking Current System Status"
echo "════════════════════════════════════════════════════════════════"
echo ""

echo "1. Docker Containers Running?"
echo "─────────────────────────────"
docker-compose -f docker-compose.1k-users.yml ps 2>&1 || echo "Docker compose not running or error"
echo ""

echo "2. Local Processes on Port 3000 & 5173?"
echo "────────────────────────────────────────"
lsof -i :3000 2>/dev/null || echo "No process on port 3000"
lsof -i :5173 2>/dev/null || echo "No process on port 5173"
echo ""

echo "3. Check MySQL Status?"
echo "──────────────────────"
mysql -h 127.0.0.1 -u waflow -pwaflowpassword -e "SELECT 1" 2>&1 || echo "MySQL not accessible locally"
echo ""

echo "4. Node Processes?"
echo "──────────────────"
ps aux | grep -E "node|pnpm|vite" | grep -v grep || echo "No node/pnpm/vite processes found"
