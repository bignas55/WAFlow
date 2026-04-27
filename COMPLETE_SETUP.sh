#!/bin/bash

# ============================================================================
# Complete BibleGuide Setup - Run Everything In One Command
# ============================================================================

echo "🚀 Starting Complete BibleGuide Setup..."
echo ""

cd "$(dirname "$0")" || exit

# Step 1: Run migrations
echo "📝 Step 1: Creating database tables..."
node run-migrations-direct.js
if [ $? -ne 0 ]; then
  echo "❌ Migration failed"
  exit 1
fi

echo ""

# Step 2: Apply BibleGuide fix
echo "📝 Step 2: Applying BibleGuide configuration..."
node apply-bibleguide-fix.js
if [ $? -ne 0 ]; then
  echo "❌ BibleGuide fix failed"
  exit 1
fi

echo ""
echo "🎉 COMPLETE! Everything is ready!"
echo ""
echo "📝 Next Steps:"
echo "1. Restart your bot: npm run dev"
echo "2. Send 'hello' to your bot on WhatsApp"
echo "3. You should see the BibleGuide age group greeting!"
echo ""
