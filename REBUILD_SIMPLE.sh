#!/bin/bash
cd ~/Documents/v2
docker-compose -f docker-compose.1k-users.yml down
sleep 2
docker rmi -f v2-waflow-1 v2-waflow-2 v2-waflow-3 2>/dev/null || true
docker-compose -f docker-compose.1k-users.yml build --no-cache
