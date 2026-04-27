#!/bin/bash

# WAFlow Docker Setup — Sets required environment variables and starts containers

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WAFlow Docker Setup — Development Environment                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.1k-users.yml" ]; then
  echo "❌ ERROR: docker-compose.1k-users.yml not found."
  echo "   Please run this script from ~/Documents/v2"
  exit 1
fi

# ─────────────────────────────────────────────────────────────────────
# Generate or use existing secrets
# ─────────────────────────────────────────────────────────────────────

echo "Step 1: Setting up security keys..."

# JWT Secret (64-character random string)
if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET=$(openssl rand -base64 48 | head -c 64)
  echo "✅ Generated JWT_SECRET"
else
  echo "✅ Using existing JWT_SECRET"
fi

# Encryption Key (32-byte hex)
if [ -z "$ENCRYPTION_KEY" ]; then
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  echo "✅ Generated ENCRYPTION_KEY"
else
  echo "✅ Using existing ENCRYPTION_KEY"
fi

# ─────────────────────────────────────────────────────────────────────
# Set AI configuration
# ─────────────────────────────────────────────────────────────────────

echo ""
echo "Step 2: Setting AI configuration..."

# For development, we'll use Ollama (local LLM)
# To use OpenAI instead, set these manually before running this script:
#   export AI_API_URL="https://api.openai.com/v1"
#   export AI_API_KEY="sk-xxx"
#   export AI_MODEL="gpt-3.5-turbo"

if [ -z "$AI_API_URL" ]; then
  # Default to Ollama (local)
  AI_API_URL="http://host.docker.internal:11434/v1"
  echo "✅ Using Ollama (local LLM) at http://host.docker.internal:11434/v1"
fi

if [ -z "$AI_API_KEY" ]; then
  AI_API_KEY="ollama"
  echo "✅ Using Ollama API key"
fi

if [ -z "$AI_MODEL" ]; then
  AI_MODEL="llama2"
  echo "✅ Using llama2 model"
fi

# ─────────────────────────────────────────────────────────────────────
# Stop existing containers
# ─────────────────────────────────────────────────────────────────────

echo ""
echo "Step 3: Stopping existing containers..."
docker-compose -f docker-compose.1k-users.yml down 2>/dev/null || true
sleep 3
echo "✅ Stopped"

# ─────────────────────────────────────────────────────────────────────
# Export environment variables for docker-compose
# ─────────────────────────────────────────────────────────────────────

echo ""
echo "Step 4: Exporting environment variables..."
export JWT_SECRET
export ENCRYPTION_KEY
export AI_API_URL
export AI_API_KEY
export AI_MODEL

echo "✅ Environment variables set:"
echo "   JWT_SECRET: ${JWT_SECRET:0:16}... (64 chars)"
echo "   ENCRYPTION_KEY: ${ENCRYPTION_KEY:0:16}... (64 chars)"
echo "   AI_API_URL: $AI_API_URL"
echo "   AI_API_KEY: $AI_API_KEY"
echo "   AI_MODEL: $AI_MODEL"

# ─────────────────────────────────────────────────────────────────────
# Start containers
# ─────────────────────────────────────────────────────────────────────

echo ""
echo "Step 5: Starting Docker containers..."
docker-compose -f docker-compose.1k-users.yml up -d

echo "✅ Containers started"

# ─────────────────────────────────────────────────────────────────────
# Wait for services to be ready
# ─────────────────────────────────────────────────────────────────────

echo ""
echo "Step 6: Waiting for services to be healthy (up to 60s)..."

counter=0
while [ $counter -lt 12 ]; do
  echo "   Checking... ($((counter * 5))s elapsed)"

  # Check if MySQL is healthy
  if docker-compose -f docker-compose.1k-users.yml ps mysql 2>/dev/null | grep -q "healthy"; then
    echo "   ✅ MySQL healthy"
    break
  fi

  sleep 5
  counter=$((counter + 1))
done

# ─────────────────────────────────────────────────────────────────────
# Final status
# ─────────────────────────────────────────────────────────────────────

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Status                                                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"

docker-compose -f docker-compose.1k-users.yml ps

echo ""
echo "Next steps:"
echo "───────────"
echo ""
echo "1. Check that all services are running:"
echo "   docker-compose -f docker-compose.1k-users.yml ps"
echo ""
echo "2. Run database migrations:"
echo "   npm run drizzle:migrate"
echo ""
echo "3. Seed the database:"
echo "   npm run db:seed"
echo ""
echo "4. Access admin dashboard:"
echo "   http://localhost"
echo "   Email: admin@waflow.com"
echo "   Password: admin123 (change immediately!)"
echo ""
echo "5. If containers aren't starting, check logs:"
echo "   docker-compose -f docker-compose.1k-users.yml logs waflow-1"
echo ""

# ─────────────────────────────────────────────────────────────────────
# Save configuration for future runs
# ─────────────────────────────────────────────────────────────────────

echo ""
echo "Configuration saved. To use same settings next time, add to ~/.bash_profile:"
echo "───────────────────────────────────────────────────────────────────────────"
echo ""
echo "export JWT_SECRET='$JWT_SECRET'"
echo "export ENCRYPTION_KEY='$ENCRYPTION_KEY'"
echo "export AI_API_URL='$AI_API_URL'"
echo "export AI_API_KEY='$AI_API_KEY'"
echo "export AI_MODEL='$AI_MODEL'"
echo ""
