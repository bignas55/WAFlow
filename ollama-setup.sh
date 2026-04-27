#!/usr/bin/env bash
# WAFlow — Ollama Setup Script
# Installs Ollama and downloads a recommended model
# Run: chmod +x ollama-setup.sh && ./ollama-setup.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log()   { echo -e "${GREEN}✓${NC} $1"; }
info()  { echo -e "${BLUE}ℹ${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }
step()  { echo -e "\n${YELLOW}▶ $1${NC}"; }

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     WAFlow — Ollama Setup            ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"
info "Detected: $OS / $ARCH"

# Install Ollama if not present
step "Installing Ollama"
if command -v ollama &>/dev/null; then
  log "Ollama already installed: $(ollama --version 2>/dev/null || echo 'version unknown')"
else
  case "$OS" in
    Linux)
      info "Installing Ollama for Linux..."
      curl -fsSL https://ollama.com/install.sh | sh
      log "Ollama installed"
      ;;
    Darwin)
      if command -v brew &>/dev/null; then
        info "Installing Ollama via Homebrew..."
        brew install ollama
        log "Ollama installed via Homebrew"
      else
        warn "Homebrew not found. Please download Ollama from https://ollama.com"
        warn "After installing, re-run this script."
        exit 0
      fi
      ;;
    MINGW*|CYGWIN*|MSYS*)
      warn "Windows detected. Please download and install Ollama from https://ollama.com"
      warn "After installing, re-run this script."
      exit 0
      ;;
    *)
      error "Unsupported OS: $OS. Install Ollama manually from https://ollama.com"
      ;;
  esac
fi

# Start Ollama server if not running
step "Starting Ollama server"
if curl -s http://localhost:11434/api/tags &>/dev/null; then
  log "Ollama server is already running"
else
  info "Starting Ollama in the background..."
  ollama serve &>/tmp/ollama.log &
  OLLAMA_PID=$!
  echo "  Waiting for server to start..."
  for i in {1..15}; do
    if curl -s http://localhost:11434/api/tags &>/dev/null; then
      break
    fi
    sleep 1
  done
  if curl -s http://localhost:11434/api/tags &>/dev/null; then
    log "Ollama server started (PID: $OLLAMA_PID)"
  else
    warn "Ollama may not have started. Check: tail -f /tmp/ollama.log"
  fi
fi

# Model selection
step "Selecting AI model"
echo ""
echo "  Available models for WAFlow:"
echo ""
echo "  1) llama3.2      — 2.0GB  Fast       General purpose (RECOMMENDED)"
echo "  2) llama3.2:1b   — 1.3GB  Very Fast  Best for low-memory machines"
echo "  3) mistral       — 4.1GB  Medium     High quality responses"
echo "  4) phi3.5        — 2.2GB  Fast       Efficient & capable"
echo "  5) qwen2.5:3b    — 1.9GB  Fast       Best multilingual support"
echo "  6) gemma2:2b     — 1.6GB  Very Fast  Google's lightweight model"
echo "  7) custom        — Enter your own model name"
echo ""
read -p "  Choose model (1-7) [default: 1]: " CHOICE

case "${CHOICE:-1}" in
  1) MODEL="llama3.2" ;;
  2) MODEL="llama3.2:1b" ;;
  3) MODEL="mistral" ;;
  4) MODEL="phi3.5" ;;
  5) MODEL="qwen2.5:3b" ;;
  6) MODEL="gemma2:2b" ;;
  7)
    read -p "  Enter model name: " MODEL
    ;;
  *) MODEL="llama3.2" ;;
esac

# Check if already downloaded
ALREADY_HAVE=$(curl -s http://localhost:11434/api/tags | grep -o "\"name\":\"${MODEL}[^\"]*\"" | head -1 || true)
if [ -n "$ALREADY_HAVE" ]; then
  log "Model '$MODEL' is already downloaded"
else
  step "Downloading model: $MODEL"
  info "This may take a few minutes depending on your connection..."
  ollama pull "$MODEL"
  log "Model '$MODEL' downloaded successfully"
fi

# Update .env if it exists
if [ -f .env ]; then
  step "Updating .env with selected model"
  # Update AI_MODEL in .env
  if grep -q "^AI_MODEL=" .env; then
    sed -i.bak "s/^AI_MODEL=.*/AI_MODEL=$MODEL/" .env
    rm -f .env.bak
    log "Updated AI_MODEL=$MODEL in .env"
  fi
fi

# Test the model
step "Testing model"
info "Running a quick test..."
TEST_RESPONSE=$(ollama run "$MODEL" "Reply with exactly: WAFLOW_OK" 2>/dev/null | head -1 || echo "test failed")
if echo "$TEST_RESPONSE" | grep -qi "WAFLOW_OK\|ok"; then
  log "Model is working correctly"
else
  warn "Model test inconclusive (response: '$TEST_RESPONSE') — this may be fine"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅  Ollama setup complete!                                  ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Model:      $MODEL"
printf "║  API URL:    %-44s ║\n" "http://localhost:11434/v1"
echo "║                                                              ║"
echo "║  Now run:    ./setup.sh                                      ║"
echo "║                                                              ║"
echo "║  To switch models later:                                     ║"
echo "║    ollama pull <model>                                       ║"
echo "║    Update in WAFlow → Configuration → AI & Model            ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
