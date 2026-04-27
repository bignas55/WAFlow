#!/bin/bash

#####################################################################################################
# WAFlow Background Server Setup
# Runs WAFlow 24/7 on macOS with auto-restart and public domain access
#####################################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
WAFLOW_DIR="$HOME/waflow-staging"
PLIST_SOURCE="com.waflow.server.plist"
PLIST_TARGET="$HOME/Library/LaunchAgents/com.waflow.server.plist"
WAFLOW_DIR_ESCAPED=$(echo "$WAFLOW_DIR" | sed 's/[\/&]/\\&/g')

# Functions
print_header() {
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
}

log_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites"
    
    if [ ! -d "$WAFLOW_DIR" ]; then
        log_error "WAFlow directory not found: $WAFLOW_DIR"
        echo "Update WAFLOW_DIR in this script to match your setup"
        exit 1
    fi
    log_success "WAFlow directory found: $WAFLOW_DIR"
    
    if [ ! -f "$WAFLOW_DIR/docker-compose.local.yml" ]; then
        log_error "docker-compose.local.yml not found in $WAFLOW_DIR"
        exit 1
    fi
    log_success "Docker Compose configuration found"
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    log_success "Docker is installed"
}

# Create LaunchAgent
setup_launchagent() {
    log_step "Setting up macOS Launch Agent"
    
    # Update plist with correct directory
    mkdir -p "$HOME/Library/LaunchAgents"
    
    if [ -f "$PLIST_SOURCE" ]; then
        # Copy and update plist with correct paths
        cp "$PLIST_SOURCE" "$PLIST_TARGET"
        
        # Update directory path in plist
        sed -i '' "s|/Users/nathi/waflow-staging|$WAFLOW_DIR_ESCAPED|g" "$PLIST_TARGET"
        sed -i '' "s|/Users/nathi|$HOME|g" "$PLIST_TARGET"
        
        log_success "LaunchAgent installed at: $PLIST_TARGET"
    else
        log_error "LaunchAgent template not found: $PLIST_SOURCE"
        exit 1
    fi
}

# Load LaunchAgent
load_launchagent() {
    log_step "Loading LaunchAgent"
    
    # Unload if already loaded
    if launchctl list | grep -q com.waflow.server; then
        log_warning "Unloading existing LaunchAgent..."
        launchctl unload "$PLIST_TARGET" 2>/dev/null || true
    fi
    
    # Load new LaunchAgent
    launchctl load "$PLIST_TARGET"
    log_success "LaunchAgent loaded"
    
    # Verify
    if launchctl list | grep -q com.waflow.server; then
        log_success "LaunchAgent is running"
    else
        log_error "Failed to load LaunchAgent"
        exit 1
    fi
}

# Setup public access options
setup_public_access() {
    print_header "Public Access Options"
    
    echo ""
    echo "Choose how to expose WAFlow to the internet:"
    echo ""
    echo "1) Cloudflare Tunnel (Recommended - free, no setup required)"
    echo "2) ngrok (Free tier available, easy setup)"
    echo "3) Skip for now (use local only)"
    echo ""
    read -p "Enter your choice (1-3): " choice
    
    case $choice in
        1)
            setup_cloudflare_tunnel
            ;;
        2)
            setup_ngrok
            ;;
        3)
            log_warning "Skipping public access setup"
            log_warning "To access remotely later, run: ./setup-public-access.sh"
            ;;
        *)
            log_error "Invalid choice"
            exit 1
            ;;
    esac
}

setup_cloudflare_tunnel() {
    log_step "Setting up Cloudflare Tunnel"
    
    echo ""
    echo "Cloudflare Tunnel provides:"
    echo "✓ Free custom domain"
    echo "✓ No open ports needed"
    echo "✓ Automatic HTTPS"
    echo "✓ Zero trust security"
    echo ""
    
    # Check if cloudflared is installed
    if ! command -v cloudflared &> /dev/null; then
        log_step "Installing cloudflared..."
        brew install cloudflare/cloudflare/cloudflared
        log_success "cloudflared installed"
    else
        log_success "cloudflared is already installed"
    fi
    
    # Create startup script for tunnel
    cat > "$WAFLOW_DIR/start-tunnel.sh" << 'TUNNEL'
#!/bin/bash
# Start Cloudflare tunnel for WAFlow

# Check if logged in
cloudflared tunnel login

# Create or list tunnels
TUNNEL_NAME="waflow-tunnel"

# Check if tunnel exists
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
else
    # Create new tunnel
    echo "Creating tunnel: $TUNNEL_NAME"
    cloudflared tunnel create "$TUNNEL_NAME"
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
fi

echo "Tunnel ID: $TUNNEL_ID"
echo ""
echo "Next steps:"
echo "1. Run: cloudflared tunnel route dns $TUNNEL_NAME"
echo "2. Choose or create a subdomain (e.g., waflow.yourdomain.com)"
echo "3. Then run: cloudflared tunnel run waflow-tunnel"
echo ""
echo "Then update config.yml with:"
echo "  tunnels:"
echo "    waflow-tunnel:"
echo "      service: http://localhost:3000"
echo "      ingress:"
echo "        - hostname: waflow.yourdomain.com"
echo "          service: http://localhost:3000"
TUNNEL

chmod +x "$WAFLOW_DIR/start-tunnel.sh"
    
    log_success "Cloudflare Tunnel setup script created"
    log_warning "Run: $WAFLOW_DIR/start-tunnel.sh"
}

setup_ngrok() {
    log_step "Setting up ngrok"
    
    echo ""
    echo "ngrok provides:"
    echo "✓ Public URL for local server"
    echo "✓ Free tier (limited)"
    echo "✓ Paid tier for custom domain"
    echo ""
    
    # Check if ngrok is installed
    if ! command -v ngrok &> /dev/null; then
        log_step "Installing ngrok..."
        
        # Download and install ngrok
        curl -L https://ngrok-agent.s3.amazonaws.com/ngrok-v3-stable-darwin-amd64.zip -o /tmp/ngrok.zip
        unzip -o /tmp/ngrok.zip -d /usr/local/bin
        rm /tmp/ngrok.zip
        
        log_success "ngrok installed"
    else
        log_success "ngrok is already installed"
    fi
    
    # Create ngrok startup script
    cat > "$WAFLOW_DIR/start-ngrok.sh" << 'NGROK'
#!/bin/bash
# Start ngrok tunnel for WAFlow

# Prompt for auth token if not set
if [ -z "$(ngrok config get authtoken)" ]; then
    echo "ngrok auth token not set"
    echo "1. Sign up at: https://ngrok.com (free)"
    echo "2. Get your auth token"
    read -p "Enter your ngrok auth token: " TOKEN
    ngrok config add-authtoken "$TOKEN"
fi

echo ""
echo "Starting ngrok tunnel to http://localhost:3000"
echo ""
echo "Your public URL will be displayed below:"
echo ""

ngrok http 3000 --domain yourdomain.ngrok.io

echo ""
echo "Use this URL to access WAFlow from anywhere!"
echo "Log the URL for reference"
NGROK

chmod +x "$WAFLOW_DIR/start-ngrok.sh"
    
    log_success "ngrok setup script created"
    log_warning "Run: $WAFLOW_DIR/start-ngrok.sh"
}

# Setup monitoring
setup_monitoring() {
    log_step "Setting up monitoring and logging"
    
    # Create log directory
    mkdir -p "$WAFLOW_DIR/logs"
    
    # Create monitoring script
    cat > "$WAFLOW_DIR/check-status.sh" << 'MONITOR'
#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "WAFlow Background Server Status"
echo "=============================="
echo ""

# Check LaunchAgent status
if launchctl list | grep -q com.waflow.server; then
    echo -e "${GREEN}✓ LaunchAgent is running${NC}"
else
    echo -e "${RED}✗ LaunchAgent is NOT running${NC}"
fi

# Check Docker status
if docker ps | grep -q waflow-app-local; then
    echo -e "${GREEN}✓ WAFlow container is running${NC}"
else
    echo -e "${YELLOW}⚠ WAFlow container is not running${NC}"
fi

# Check Docker services
echo ""
echo "Docker Services:"
docker compose -f docker-compose.local.yml ps 2>/dev/null || echo "  Docker Compose not accessible"

# Check application health
echo ""
HEALTH=$(curl -s http://localhost:3000/health 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q "ok"; then
    echo -e "${GREEN}✓ Application is healthy${NC}"
else
    echo -e "${RED}✗ Application health check failed${NC}"
fi

# Show recent logs
echo ""
echo "Recent Logs (last 20 lines):"
echo "============================"
if [ -f /var/log/waflow.log ]; then
    tail -20 /var/log/waflow.log
else
    echo "Log file not found"
fi
MONITOR

chmod +x "$WAFLOW_DIR/check-status.sh"
    
    log_success "Monitoring script created: check-status.sh"
}

# Print summary
print_summary() {
    print_header "Background Server Setup Complete! 🚀"
    
    echo ""
    echo -e "${GREEN}WAFlow is now running in the background!${NC}"
    echo ""
    echo "📋 What was configured:"
    echo "  ✓ LaunchAgent for auto-startup on boot"
    echo "  ✓ Automatic restart if service crashes"
    echo "  ✓ Logging to /var/log/waflow.log"
    echo "  ✓ Monitoring script"
    echo ""
    echo "🔧 Useful Commands:"
    echo ""
    echo "  # Check status"
    echo "  $WAFLOW_DIR/check-status.sh"
    echo ""
    echo "  # View logs"
    echo "  tail -f /var/log/waflow.log"
    echo ""
    echo "  # Stop service"
    echo "  launchctl unload ~/Library/LaunchAgents/com.waflow.server.plist"
    echo ""
    echo "  # Start service"
    echo "  launchctl load ~/Library/LaunchAgents/com.waflow.server.plist"
    echo ""
    echo "🌐 Public Access:"
    echo "  Configure using Cloudflare Tunnel or ngrok"
    echo "  See instructions above or run: ./setup-public-access.sh"
    echo ""
    echo "✅ Next Steps:"
    echo "  1. Restart your Mac to verify auto-startup"
    echo "  2. Check status: $WAFLOW_DIR/check-status.sh"
    echo "  3. Set up public access (Cloudflare or ngrok)"
    echo "  4. Test access from another device"
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
}

# Main flow
main() {
    print_header "WAFlow 24/7 Background Server Setup"
    
    check_prerequisites
    setup_launchagent
    load_launchagent
    setup_monitoring
    setup_public_access
    print_summary
}

main
