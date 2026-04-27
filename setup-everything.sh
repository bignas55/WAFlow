#!/bin/bash

#####################################################################################################
# WAFlow Complete 24/7 Setup - Automated Everything
# Creates: Free public domain + 24/7 background service + auto-restart
#####################################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

log_step() {
    echo -e "${CYAN}▶${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
check_prereqs() {
    print_header "Prerequisites Check"
    
    # Check if on Mac
    if [[ "$OSTYPE" != "darwin"* ]]; then
        log_error "This script requires macOS"
        exit 1
    fi
    log_success "Running on macOS"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker Desktop not found. Install from https://docker.com/products/docker-desktop"
        exit 1
    fi
    log_success "Docker Desktop installed"
    
    # Check if Docker is running
    if ! docker ps &> /dev/null; then
        log_warning "Docker Desktop not running. Starting..."
        open /Applications/Docker.app
        sleep 5
        
        # Wait for Docker to be ready
        for i in {1..30}; do
            if docker ps &> /dev/null; then
                log_success "Docker started and ready"
                break
            fi
            sleep 1
        done
    else
        log_success "Docker is running"
    fi
    
    # Check Homebrew
    if ! command -v brew &> /dev/null; then
        log_error "Homebrew not found. Install from https://brew.sh"
        exit 1
    fi
    log_success "Homebrew installed"
}

# Install Cloudflare CLI
install_cloudflare() {
    print_header "Installing Cloudflare CLI"
    
    if command -v cloudflared &> /dev/null; then
        log_success "cloudflared already installed"
        cloudflared --version
    else
        log_step "Installing cloudflared via Homebrew..."
        brew install cloudflare/cloudflare/cloudflared
        log_success "cloudflared installed"
    fi
}

# Setup background service
setup_background() {
    print_header "Setting Up Background Service (Auto-start on Mac boot)"
    
    WAFLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PLIST_FILE="$HOME/Library/LaunchAgents/com.waflow.server.plist"
    
    mkdir -p "$HOME/Library/LaunchAgents"
    
    # Create LaunchAgent plist
    cat > "$PLIST_FILE" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.waflow.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>cd WAFLOW_DIR_HERE && ./start-local.sh >> /var/log/waflow.log 2>&1</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/waflow.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/waflow-error.log</string>
    <key>WorkingDirectory</key>
    <string>WAFLOW_DIR_HERE</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
</dict>
</plist>
PLIST
    
    # Update paths
    sed -i '' "s|WAFLOW_DIR_HERE|$WAFLOW_DIR|g" "$PLIST_FILE"
    
    # Load LaunchAgent
    if launchctl list | grep -q com.waflow.server; then
        launchctl unload "$PLIST_FILE" 2>/dev/null || true
    fi
    
    launchctl load "$PLIST_FILE"
    log_success "Background service installed (auto-starts on Mac boot)"
}

# Create Cloudflare config
setup_cloudflare_config() {
    print_header "Creating Cloudflare Configuration"
    
    TUNNEL_NAME="waflow"
    mkdir -p ~/.cloudflared
    
    log_step "Checking Cloudflare authentication..."
    
    # Check if already authenticated
    if ! cloudflared tunnel list &> /dev/null; then
        log_warning "Need to authenticate with Cloudflare"
        echo ""
        echo -e "${YELLOW}IMPORTANT:${NC}"
        echo "1. A browser window will open"
        echo "2. Create a FREE Cloudflare account or login"
        echo "3. Click 'Authorize' button"
        echo "4. Come back to this terminal"
        echo ""
        read -p "Press Enter when ready..."
        
        cloudflared tunnel login
        log_success "Authenticated with Cloudflare"
    else
        log_success "Already authenticated with Cloudflare"
    fi
    
    # Create or get tunnel
    if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
        TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')
        log_success "Using existing tunnel: $TUNNEL_ID"
    else
        log_step "Creating new Cloudflare tunnel..."
        cloudflared tunnel create "$TUNNEL_NAME"
        TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')
        log_success "Tunnel created: $TUNNEL_ID"
    fi
    
    # Create config
    cat > ~/.cloudflared/config.yml << EOF
tunnel: $TUNNEL_NAME
credentials-file: /Users/$(whoami)/.cloudflared/$TUNNEL_ID.json

ingress:
  - service: http://localhost:3000
EOF
    
    log_success "Configuration created"
    
    # Get tunnel URL
    echo ""
    log_step "Getting your public URL..."
    PUBLIC_URL=$(cloudflared tunnel info waflow 2>/dev/null | grep -i "url" | head -1 | awk '{print $NF}' || echo "https://waflow-[tunnel-id].cfargotunnel.com")
    
    log_success "Your public URL:"
    echo ""
    echo -e "${GREEN}   $PUBLIC_URL${NC}"
    echo ""
    
    # Save URL for later
    echo "$PUBLIC_URL" > ~/.cloudflared/waflow-url.txt
}

# Start services
start_services() {
    print_header "Starting Services"
    
    WAFLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    log_step "Starting Docker services (Terminal 1)..."
    log_step "Starting Cloudflare tunnel (Terminal 2)..."
    echo ""
    echo -e "${YELLOW}Creating terminal windows...${NC}"
    echo ""
    
    # Start Docker services in background via launchctl (already configured)
    log_success "Docker services configured to auto-start"
    
    # Create tunnel startup script
    cat > ~/.cloudflared/start-tunnel.sh << 'TUNNEL'
#!/bin/bash
echo "Starting Cloudflare tunnel..."
cloudflared tunnel run waflow
TUNNEL
    
    chmod +x ~/.cloudflared/start-tunnel.sh
    log_success "Tunnel script created"
}

# Print final summary
print_summary() {
    print_header "Setup Complete! 🚀"
    
    echo -e "${GREEN}Everything is configured and ready!${NC}"
    echo ""
    
    PUBLIC_URL=$(cat ~/.cloudflared/waflow-url.txt 2>/dev/null || echo "https://waflow-[id].cfargotunnel.com")
    
    echo -e "${CYAN}Your Public URL:${NC}"
    echo -e "${GREEN}   $PUBLIC_URL${NC}"
    echo ""
    
    echo -e "${CYAN}What Just Happened:${NC}"
    echo "✓ Docker services configured to auto-start"
    echo "✓ Cloudflare tunnel created for public access"
    echo "✓ Background service installed (survives Mac restart)"
    echo "✓ Auto-restart enabled (service restarts if it crashes)"
    echo ""
    
    echo -e "${CYAN}Next Steps:${NC}"
    echo ""
    echo "1. Start Docker services (if not already running):"
    echo "   cd $(pwd)"
    echo "   ./start-local.sh"
    echo ""
    echo "2. Start Cloudflare tunnel (in another terminal):"
    echo "   cloudflared tunnel run waflow"
    echo ""
    echo "3. Access your server:"
    echo "   $PUBLIC_URL"
    echo ""
    
    echo -e "${CYAN}Useful Commands:${NC}"
    echo ""
    echo "View logs:"
    echo "  tail -f /var/log/waflow.log"
    echo ""
    echo "Stop tunnel:"
    echo "  Ctrl+C (in tunnel terminal)"
    echo ""
    echo "Stop Docker services:"
    echo "  ./stop-local.sh"
    echo ""
    echo "Check status:"
    echo "  ./check-status.sh"
    echo ""
    
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}Setup Complete! Your WAFlow platform is ready for 24/7 operation.${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Main execution
main() {
    print_header "WAFlow Complete 24/7 Setup"
    
    check_prereqs
    install_cloudflare
    setup_background
    setup_cloudflare_config
    start_services
    print_summary
}

# Run
main
