#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Checking Container Logs for Errors                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "waflow-app-1 logs (last 100 lines):"
echo "────────────────────────────────────"
docker-compose -f docker-compose.1k-users.yml logs waflow-app-1 --tail 100 2>&1 | head -100
echo ""
echo ""

echo "MySQL health status:"
echo "───────────────────"
docker-compose -f docker-compose.1k-users.yml ps mysql 2>&1
echo ""
echo ""

echo "Checking if MySQL is accepting connections:"
echo "────────────────────────────────────────────"
docker-compose -f docker-compose.1k-users.yml exec mysql mysqladmin ping -h localhost -u waflow -pwaflowpassword 2>&1 || echo "⚠️  Connection failed - trying with root"
docker-compose -f docker-compose.1k-users.yml exec mysql mysqladmin ping -h localhost -u root -prootpass 2>&1 || echo "⚠️  Root connection also failed"
