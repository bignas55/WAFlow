#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Stopping WAFlow local services...${NC}"

docker compose -f docker-compose.local.yml down

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ WAFlow local server stopped${NC}"
    echo ""
    echo "To restart: ./start-local.sh"
    echo "To delete data: docker volume rm waflow-mysql-local waflow-redis-local"
else
    echo -e "${RED}✗ Failed to stop services${NC}"
    exit 1
fi
