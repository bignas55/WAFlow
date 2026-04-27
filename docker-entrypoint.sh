#!/bin/sh

# Docker entrypoint script for WAFlow application
# Handles database initialization before starting the app

echo "🚀 WAFlow Docker Entrypoint Starting..."

cd /app

# Create .env file if it doesn't exist (seed.ts needs it)
if [ ! -f .env ]; then
  echo "Creating .env file..."
  touch .env
fi

# Install mysql-client for connectivity checks
echo "Installing mysql-client..."
apk add --no-cache mysql-client 2>/dev/null || true

# Wait for MySQL to be ready
echo "⏳ Waiting for MySQL to be ready (${DATABASE_URL})..."
MAX_ATTEMPTS=60
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  # Use mysql command to check connectivity
  mysql -h mysql -u waflow -pwaflowpassword -e "SELECT 1" >/dev/null 2>&1

  if [ $? -eq 0 ]; then
    echo "✅ MySQL is ready!"
    break
  fi

  ATTEMPT=$((ATTEMPT + 1))
  if [ $((ATTEMPT % 5)) -eq 0 ]; then
    echo "   Waiting... ($ATTEMPT/60 attempts) MySQL not ready yet"
  fi
  sleep 1
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
  echo "❌ MySQL did not become ready after ${MAX_ATTEMPTS}s"
  echo "Attempting to continue anyway..."
fi

# Small delay for MySQL to be fully ready
sleep 3

echo ""
echo "📦 Running database migrations..."
if pnpm drizzle:migrate; then
  echo "✅ Migrations completed"
else
  echo "⚠️  Migrations completed with status $?"
fi

echo ""
echo "🌱 Seeding database..."
if pnpm db:seed; then
  echo "✅ Database seeded"
else
  echo "⚠️  Seed completed with status $?"
fi

echo ""
echo "✅ Initialization complete!"
echo ""

# Start the application
echo "🎯 Starting WAFlow application on port ${PORT:-3000}..."
exec node dist/server/index.js
