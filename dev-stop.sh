#!/bin/bash

# WAFlow Development Mode — Stop everything gracefully

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFlow Development Mode — Stopping...                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "⏳ Stopping Docker services..."
docker-compose -f docker-compose.1k-users.yml down

echo ""
echo "✅ All services stopped"
echo ""
echo "To start again, run:"
echo "  ./dev-start.sh"
echo ""
echo "To completely reset (deletes data):"
echo "  docker-compose -f docker-compose.1k-users.yml down -v"
echo ""
