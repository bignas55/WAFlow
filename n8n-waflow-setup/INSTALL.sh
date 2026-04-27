#!/bin/bash

###############################################################################
# WAFlow n8n Multi-Tenant SaaS Platform
# Complete Installation Script
#
# This script does everything needed to get your platform running:
# 1. Checks prerequisites
# 2. Creates .env file
# 3. Starts Docker containers
# 4. Initializes database
# 5. Displays instructions
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
cat << "EOF"
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║        WAFlow n8n Multi-Tenant WhatsApp SaaS Platform                   ║
║                                                                          ║
║              Complete Installation & Setup Script                       ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}\n"

# =============================================================================
# 1. Check Prerequisites
# =============================================================================

echo -e "${YELLOW}[1/5] Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found${NC}"
    echo "Please install Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
fi
echo -e "${GREEN}✓ Docker found: $(docker --version)${NC}"

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose not found${NC}"
    echo "Please install Docker Compose"
    exit 1
fi
echo -e "${GREEN}✓ Docker Compose found: $(docker-compose --version)${NC}"

# Check disk space
DISK_SPACE=$(df /var/lib/docker 2>/dev/null | awk 'NR==2 {print $4}' || echo "unknown")
if [ "$DISK_SPACE" != "unknown" ]; then
    echo -e "${GREEN}✓ Available disk space: $((DISK_SPACE / 1024 / 1024)) GB${NC}"
fi

# =============================================================================
# 2. Create .env File
# =============================================================================

echo -e "\n${YELLOW}[2/5] Setting up environment configuration...${NC}"

if [ -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file already exists${NC}"
    read -p "Overwrite? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}✓ Keeping existing .env file${NC}"
    else
        cp .env.template .env
        echo -e "${GREEN}✓ Created new .env file from template${NC}"
    fi
else
    cp .env.template .env
    echo -e "${GREEN}✓ Created .env file from template${NC}"
fi

# Prompt for Groq API key (critical for AI)
echo ""
echo -e "${BLUE}Configure AI Provider:${NC}"
read -p "Enter your Groq API key (get at https://console.groq.com): " GROQ_KEY
if [ ! -z "$GROQ_KEY" ]; then
    sed -i.bak "s/GROQ_API_KEY=.*/GROQ_API_KEY=$GROQ_KEY/" .env
    echo -e "${GREEN}✓ Groq API key configured${NC}"
else
    echo -e "${YELLOW}⚠️  Skipping Groq key - you'll need to add it later${NC}"
fi

# =============================================================================
# 3. Start Docker Containers
# =============================================================================

echo -e "\n${YELLOW}[3/5] Starting Docker containers...${NC}"

# Stop any existing containers
docker-compose down 2>/dev/null || true

# Pull latest images
echo "Pulling Docker images (first time may take a few minutes)..."
docker-compose pull

# Start containers
echo "Starting MySQL and n8n..."
docker-compose up -d

# =============================================================================
# 4. Wait for Services to Be Ready
# =============================================================================

echo -e "\n${YELLOW}[4/5] Waiting for services to be ready...${NC}"

# Wait for MySQL
echo "Waiting for MySQL to start..."
for i in {1..30}; do
    if docker-compose exec mysql mysqladmin ping -u waflow -pwaflow123 &> /dev/null; then
        echo -e "${GREEN}✓ MySQL is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ MySQL failed to start${NC}"
        echo "Check logs: docker-compose logs mysql"
        exit 1
    fi
    echo "  Attempt $i/30..."
    sleep 2
done

# Wait for n8n
echo "Waiting for n8n to start..."
for i in {1..30}; do
    if curl -s http://localhost:5678 &> /dev/null; then
        echo -e "${GREEN}✓ n8n is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ n8n failed to start${NC}"
        echo "Check logs: docker-compose logs n8n"
        exit 1
    fi
    echo "  Attempt $i/30..."
    sleep 2
done

# =============================================================================
# 5. Display Next Steps
# =============================================================================

echo -e "\n${YELLOW}[5/5] Installation complete!${NC}"

echo -e "\n${GREEN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ WAFlow n8n Multi-Tenant SaaS Platform is Ready!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"

echo -e "\n${BLUE}📍 Access Points:${NC}"
echo -e "   n8n Admin Dashboard: ${YELLOW}http://localhost:5678${NC}"
echo -e "   MySQL Database:      ${YELLOW}localhost:3306${NC}"
echo -e "   Webhook Receiver:    ${YELLOW}http://localhost:5678/webhook/whatsapp/2${NC}"

echo -e "\n${BLUE}🔑 Default Credentials:${NC}"
echo -e "   Database User:    ${YELLOW}waflow${NC}"
echo -e "   Database Pass:    ${YELLOW}waflow123${NC}"
echo -e "   Admin User:       Create on first n8n login"

echo -e "\n${BLUE}📚 Documentation:${NC}"
echo -e "   Quick Start:      ${YELLOW}README.md${NC}"
echo -e "   Setup Guide:      ${YELLOW}SETUP_GUIDE.md${NC}"
echo -e "   API Testing:      ${YELLOW}API_TESTING.md${NC}"
echo -e "   Deployment:       ${YELLOW}DEPLOYMENT.md${NC}"

echo -e "\n${BLUE}🚀 Next Steps:${NC}"
echo -e "   1. Open ${YELLOW}http://localhost:5678${NC} in your browser"
echo -e "   2. Create your admin account (first login only)"
echo -e "   3. Import workflow JSON files in n8n UI:"
echo -e "      ${YELLOW}workflow-1-webhook-receiver.json${NC}"
echo -e "      ${YELLOW}workflow-2-template-ai.json${NC}"
echo -e "   4. Test with: ${YELLOW}./test-webhook.sh${NC}"
echo -e "   5. Read SETUP_GUIDE.md for detailed instructions"

echo -e "\n${BLUE}💡 Useful Commands:${NC}"
echo -e "   View logs:         ${YELLOW}docker-compose logs -f n8n${NC}"
echo -e "   Database shell:    ${YELLOW}docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n${NC}"
echo -e "   Stop services:     ${YELLOW}docker-compose stop${NC}"
echo -e "   Restart services:  ${YELLOW}docker-compose restart${NC}"

echo -e "\n${BLUE}📊 Container Status:${NC}"
docker-compose ps

echo -e "\n${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}Installation complete! Open http://localhost:5678 now!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}\n"

# Make test script executable
chmod +x test-webhook.sh 2>/dev/null || true

echo -e "${BLUE}Need help? Check the documentation files above.${NC}\n"
