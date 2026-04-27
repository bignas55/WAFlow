#!/bin/bash

# ============================================================================
# BibleGuide Bot - Complete Setup & Fix Script
# Run this ONCE to set up everything
# ============================================================================

set -e  # Exit on any error

echo "🚀 Starting BibleGuide Bot Complete Setup..."
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}⚠️  package.json not found. Are you in the v2 directory?${NC}"
    echo "Please run: cd ~/Documents/v2"
    exit 1
fi

echo -e "${BLUE}📍 Directory: $(pwd)${NC}"
echo ""

# Step 2: Install dependencies
echo -e "${BLUE}Step 1/6: Installing dependencies...${NC}"
pnpm install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 3: Generate migrations
echo -e "${BLUE}Step 2/6: Generating database migrations...${NC}"
pnpm drizzle:generate
echo -e "${GREEN}✅ Migrations generated${NC}"
echo ""

# Step 4: Run migrations
echo -e "${BLUE}Step 3/6: Running database migrations...${NC}"
pnpm drizzle:migrate
echo -e "${GREEN}✅ Database initialized${NC}"
echo ""

# Step 5: Seed database
echo -e "${BLUE}Step 4/6: Seeding database with default data...${NC}"
pnpm db:seed
echo -e "${GREEN}✅ Database seeded${NC}"
echo ""

# Step 6: Apply BibleGuide fix
echo -e "${BLUE}Step 5/6: Applying BibleGuide configuration...${NC}"
node apply-bibleguide-fix.js
echo ""

# Step 7: Show next steps
echo -e "${GREEN}=============================================="
echo "🎉 SETUP COMPLETE!"
echo "=============================================${NC}"
echo ""
echo -e "${BLUE}📝 Next Steps:${NC}"
echo "1. Restart your bot application:"
echo "   npm run dev"
echo ""
echo "2. Send 'hello' to your bot on WhatsApp"
echo ""
echo "3. You should see the BibleGuide age group greeting:"
echo "   👋 Welcome to *BibleGuide* 📖🙏"
echo ""
echo -e "${YELLOW}⚠️  Important: If your bot is already running, stop it first (Ctrl+C)${NC}"
echo ""
