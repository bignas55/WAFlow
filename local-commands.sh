#!/bin/bash

# WAFlow Local Development - Helper Commands
# Run: source local-commands.sh

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

COMPOSE="docker compose -f docker-compose.local.yml"

# Status
alias waflow-status="$COMPOSE ps"

# Logs
alias waflow-logs="$COMPOSE logs -f waflow"
alias waflow-logs-mysql="$COMPOSE logs -f mysql"
alias waflow-logs-redis="$COMPOSE logs -f redis"

# Database
alias waflow-mysql="$COMPOSE exec mysql mysql -uwaflow -pwaflowpassword waflow"
alias waflow-redis="$COMPOSE exec redis redis-cli"

# Services
alias waflow-stop="./stop-local.sh"
alias waflow-start="./start-local.sh"
alias waflow-restart="$COMPOSE restart"

# Development
alias waflow-shell="$COMPOSE exec waflow bash"
alias waflow-seed="$COMPOSE exec -T waflow npm run db:seed"
alias waflow-migrate="$COMPOSE exec -T waflow npx drizzle-kit migrate:mysql"

# Utilities
alias waflow-health="curl http://localhost:3000/health"
alias waflow-stats="docker stats"

# Print help
show_waflow_commands() {
    echo -e "${BLUE}WAFlow Local Development Commands:${NC}"
    echo ""
    echo -e "${GREEN}Status & Monitoring:${NC}"
    echo "  waflow-status              Show service status"
    echo "  waflow-logs                View app logs"
    echo "  waflow-logs-mysql          View MySQL logs"
    echo "  waflow-logs-redis          View Redis logs"
    echo "  waflow-stats               View Docker resource usage"
    echo ""
    echo -e "${GREEN}Services:${NC}"
    echo "  waflow-start               Start all services"
    echo "  waflow-stop                Stop all services"
    echo "  waflow-restart             Restart all services"
    echo ""
    echo -e "${GREEN}Database:${NC}"
    echo "  waflow-mysql               Connect to MySQL CLI"
    echo "  waflow-redis               Connect to Redis CLI"
    echo "  waflow-seed                Seed database"
    echo "  waflow-migrate             Run database migrations"
    echo ""
    echo -e "${GREEN}Development:${NC}"
    echo "  waflow-shell               Access app container shell"
    echo "  waflow-health              Check app health"
    echo ""
    echo "Example: waflow-logs        (view live logs)"
}

# Show commands on load
show_waflow_commands
