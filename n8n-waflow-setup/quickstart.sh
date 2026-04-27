#!/bin/bash

# WAFlow n8n Multi-Tenant SaaS — Quick Start Script
# This script sets everything up and starts the platform

set -e

echo "=========================================="
echo "WAFlow n8n Multi-Tenant SaaS"
echo "Quick Start Setup"
echo "=========================================="
echo ""

# Check Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker Desktop first."
    echo "   https://www.docker.com/products/docker-desktop"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose."
    exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.template .env
    echo "✓ Created .env file"
    echo "   Edit it to configure your API keys!"
else
    echo "✓ .env file already exists"
fi

echo ""
echo "📦 Starting services with Docker Compose..."
echo ""

# Stop any existing containers
docker-compose down 2>/dev/null || true

# Build and start
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check MySQL
echo "🗄️  Checking MySQL..."
until docker-compose exec mysql mysqladmin ping -u waflow -pwaflow123 &> /dev/null; do
    echo "   Waiting for MySQL..."
    sleep 2
done
echo "✓ MySQL is ready"

# Check n8n
echo "🚀 Checking n8n..."
until curl -s http://localhost:5678 &> /dev/null; do
    echo "   Waiting for n8n..."
    sleep 2
done
echo "✓ n8n is ready"

echo ""
echo "=========================================="
echo "✅ SETUP COMPLETE!"
echo "=========================================="
echo ""
echo "📍 n8n URL: http://localhost:5678"
echo ""
echo "🔑 Default Admin Setup:"
echo "   On first login, create your admin user:"
echo "   - Email: admin@localhost (or any email)"
echo "   - Password: Choose a strong password"
echo ""
echo "📊 Database:"
echo "   - Host: localhost:3306"
echo "   - User: waflow"
echo "   - Password: waflow123"
echo "   - Database: waflow_n8n"
echo ""
echo "📚 Next Steps:"
echo "   1. Open http://localhost:5678 in your browser"
echo "   2. Create your admin account"
echo "   3. Import workflow JSON files:"
echo "      - workflow-1-webhook-receiver.json"
echo "      - workflow-2-template-ai.json"
echo "   4. Configure bot_config for your tenant:"
echo "      - Add Groq/OpenAI API key"
echo "      - Set WhatsApp credentials"
echo "   5. Test with: ./test-webhook.sh"
echo ""
echo "🔗 Useful Commands:"
echo "   docker-compose logs -f n8n        # View n8n logs"
echo "   docker-compose logs -f mysql      # View MySQL logs"
echo "   docker-compose ps                 # View container status"
echo "   docker-compose down               # Stop all services"
echo ""
echo "📖 Full Documentation:"
echo "   See SETUP_GUIDE.md for detailed instructions"
echo ""
