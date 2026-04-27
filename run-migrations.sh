#!/bin/bash
set -e

cd ~/Documents/v2

# Load environment variables from .env.local
export $(cat .env.local | grep -v '^#' | xargs)

echo "Database URL: $DATABASE_URL"
echo "Redis URL: $REDIS_URL"
echo ""

# Wait for MySQL to be ready
echo "Checking MySQL connection..."
until nc -z localhost 3307; do
  echo "Waiting for MySQL on 3307..."
  sleep 2
done

echo "✅ MySQL is ready"
echo ""

echo "🗄️  Running migrations..."
pnpm drizzle:migrate

echo "✅ Migrations complete"
echo ""

echo "🌱 Seeding database..."
pnpm db:seed

echo "✅ Seed complete"
echo ""
echo "✅ SETUP COMPLETE!"
echo ""
echo "🌐 App: http://localhost:5173"
echo "📧 Email: admin@waflow.com"
echo "🔑 Password: admin123"
echo ""
echo "🚀 Starting dev server..."
echo ""

pnpm dev
