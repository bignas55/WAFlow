#!/bin/bash
set -e

cd ~/Documents/v2

echo "✅ Database config updated to use localhost:3307"
echo ""
echo "🗄️  Running migrations..."
pnpm drizzle:migrate

echo "🌱 Seeding database..."
pnpm db:seed

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
