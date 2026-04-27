#!/bin/bash
set -e

cd ~/Documents/v2

# Load environment
export $(cat .env.local | grep -v '^#' | xargs)

echo "✅ Database migrations cleaned"
echo ""

# Wait for MySQL to be ready
echo "🔍 Checking MySQL connection..."
until nc -z localhost 3307; do
  echo "Waiting for MySQL on 3307..."
  sleep 2
done

echo "✅ MySQL is ready"
echo ""

echo "🗄️  Applying schema directly (skipping migrations)..."
# Use drizzle-kit push which skips migrations and applies schema directly
pnpm exec drizzle-kit push

echo "✅ Schema applied"
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
