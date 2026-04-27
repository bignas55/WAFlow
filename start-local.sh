#!/bin/bash

#####################################################################################################
# WAFlow Local Development Server Launcher
# Runs WAFlow locally on Mac with Docker
#####################################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
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

print_header() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Check prerequisites
check_docker() {
    log_step "Checking Docker"
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        echo "Install Docker Desktop for Mac: https://www.docker.com/products/docker-desktop"
        exit 1
    fi
    log_success "Docker is installed"

    if ! docker ps &> /dev/null; then
        log_error "Docker daemon is not running"
        echo "Start Docker Desktop from Applications folder"
        exit 1
    fi
    log_success "Docker daemon is running"
}

# Setup environment
setup_env() {
    log_step "Setting up environment"

    if [ ! -f ".env.local" ]; then
        log_error ".env.local not found"
        exit 1
    fi
    
    # Copy .env.local to .env for Docker
    cp .env.local .env
    log_success "Environment configured (.env.local → .env)"
}

# Create directories
create_directories() {
    log_step "Creating required directories"
    
    mkdir -p uploads
    mkdir -p .wwebjs_auth
    
    log_success "Directories created"
}

# Build image
build_image() {
    log_step "Building Docker image (first run only, ~2-3 minutes)"
    
    docker compose -f docker-compose.local.yml build --no-cache || {
        log_error "Failed to build Docker image"
        exit 1
    }
    
    log_success "Docker image built"
}

# Start services
start_services() {
    log_step "Starting services"
    
    docker compose -f docker-compose.local.yml down 2>/dev/null || true
    docker compose -f docker-compose.local.yml up -d
    
    log_success "Services starting..."
}

# Wait for health
wait_for_health() {
    log_step "Waiting for services to be healthy (up to 2 minutes)"
    
    TIMEOUT=120
    ELAPSED=0
    
    while [ $ELAPSED -lt $TIMEOUT ]; do
        MYSQL_OK=$(docker compose -f docker-compose.local.yml exec -T mysql \
            mysqladmin ping -h localhost 2>/dev/null | grep -c "mysqld is alive" || echo 0)
        
        REDIS_OK=$(docker compose -f docker-compose.local.yml exec -T redis \
            redis-cli ping 2>/dev/null | grep -c "PONG" || echo 0)
        
        APP_OK=$(docker compose -f docker-compose.local.yml ps waflow | grep -c "Up" || echo 0)
        
        if [ "$MYSQL_OK" -eq 1 ] && [ "$REDIS_OK" -eq 1 ] && [ "$APP_OK" -eq 1 ]; then
            log_success "All services are healthy!"
            sleep 5  # Extra time for app initialization
            return 0
        fi
        
        sleep 5
        ELAPSED=$((ELAPSED + 5))
        echo -ne "  Waiting... ${ELAPSED}s\r"
    done
    
    log_warning "Services did not become fully healthy within timeout"
    log_step "Checking service status:"
    docker compose -f docker-compose.local.yml ps
}

# Initialize database
init_database() {
    log_step "Initializing database"
    
    # Wait for MySQL to fully start
    sleep 5
    
    log_step "Running migrations..."
    docker compose -f docker-compose.local.yml exec -T waflow \
        npx drizzle-kit migrate:mysql 2>/dev/null || {
        log_warning "Migrations may have already run"
    }
    
    log_step "Seeding database..."
    docker compose -f docker-compose.local.yml exec -T waflow \
        npm run db:seed 2>/dev/null || {
        log_warning "Seed may have already run"
    }
    
    log_success "Database initialized"
}

# Verify setup
verify_setup() {
    log_step "Verifying setup"
    
    sleep 3
    
    # Check health
    HEALTH=$(curl -s http://localhost:3000/health 2>/dev/null || echo "")
    
    if echo "$HEALTH" | grep -q "ok"; then
        log_success "Application is healthy"
    else
        log_warning "Health check inconclusive, checking containers..."
        docker compose -f docker-compose.local.yml ps
    fi
}

# Print summary
print_summary() {
    print_header "WAFlow Local Server Started! 🚀"
    
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}✓ All services running${NC}"
    echo ""
    echo "📱 Access Your Application:"
    echo "   Web UI:        http://localhost:5173"
    echo "   API:           http://localhost:3000"
    echo "   Health:        http://localhost:3000/health"
    echo ""
    echo "🗄️  Database:"
    echo "   Host:          localhost:3306"
    echo "   Database:      waflow"
    echo "   User:          waflow"
    echo "   Password:      waflowpassword"
    echo ""
    echo "💾 Redis:"
    echo "   Host:          localhost:6379"
    echo ""
    echo "📊 Useful Commands:"
    echo "   View logs:     docker compose -f docker-compose.local.yml logs -f waflow"
    echo "   MySQL CLI:     docker compose -f docker-compose.local.yml exec mysql mysql -uwaflow -pwaflowpassword waflow"
    echo "   Stop services: docker compose -f docker-compose.local.yml down"
    echo "   Restart:       docker compose -f docker-compose.local.yml restart"
    echo ""
    echo "🔐 Default Login:"
    echo "   Email:         admin@waflow.com"
    echo "   Password:      admin123"
    echo "   ⚠️  CHANGE IMMEDIATELY in Settings → Profile"
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "📝 Next Steps:"
    echo "   1. Open http://localhost:5173 in your browser"
    echo "   2. Login with admin@waflow.com / admin123"
    echo "   3. Change password immediately"
    echo "   4. Configure AI provider (Settings → Configuration)"
    echo "   5. Test sending messages"
    echo ""
}

# Main function
main() {
    print_header "WAFlow Local Development Server"
    
    check_docker
    setup_env
    create_directories
    build_image
    start_services
    wait_for_health
    init_database
    verify_setup
    print_summary
}

# Run
main
