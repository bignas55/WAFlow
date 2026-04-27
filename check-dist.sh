#!/bin/bash

echo "Checking what's in the container after build..."
docker-compose -f docker-compose.1k-users.yml exec waflow-app-1 ls -la /app/dist/ 2>&1 | head -50
echo ""
echo "Checking if dist directory exists:"
docker-compose -f docker-compose.1k-users.yml exec waflow-app-1 ls -la /app/ | grep dist
