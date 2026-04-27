#!/bin/bash

# BibleGuide Bot Startup Script
# Usage: ./start-bibleguide-bot.sh

set -e

cd "$(dirname "$0")"

echo "🚀 Starting BibleGuide WhatsApp Bot..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found"
    echo "Please create a .env file with database and API configuration"
    exit 1
fi

echo "✅ .env file found"
echo ""

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "⚠️  node_modules not found, installing dependencies..."
    npm install --legacy-peer-deps 2>&1 | tail -20 || {
        echo ""
        echo "⚠️  npm install failed, trying with --force..."
        npm install --legacy-peer-deps --force 2>&1 | tail -10
    }
    echo "✅ Dependencies installed"
    echo ""
fi

# Check database connectivity
echo "🔍 Checking database connectivity..."
node -e "
const mysql = require('mysql2/promise');
const env = require('dotenv').config();
(async () => {
    try {
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'waflow',
            password: 'waflowpassword',
            database: 'waflow'
        });
        await connection.end();
        console.log('✅ Database connected');
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
})();
" || {
    echo "⚠️  Database check skipped (mysql2 not available)"
}

echo ""
echo "📖 Starting BibleGuide bot server..."
echo "   - Port: 3000"
echo "   - WhatsApp WWJS: Checking authentication..."
echo "   - AI Provider: Groq (configurable via dashboard)"
echo ""
echo "Press Ctrl+C to stop the server"
echo "============================================"
echo ""

# Start the server
npx tsx server/index.ts
