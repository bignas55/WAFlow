#!/bin/bash

#####################################################################################################
# WAFlow Staging Deployment Automation Script
# Automates the entire staging deployment process
#####################################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DOMAIN="${DOMAIN:-staging.yourdomain.com}"
EMAIL="${EMAIL:-admin@example.com}"
DEPLOYMENT_DIR="${DEPLOYMENT_DIR:-.}"
DOCKER_COMPOSE_FILE="docker-compose.staging.yml"

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

check_prerequisites() {
    log_step "Checking prerequisites"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    log_success "Docker is installed"

    # Check Docker Compose
    if ! command -v docker compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    log_success "Docker Compose is installed"

    # Check if running from correct directory
    if [ ! -f "$DOCKER_COMPOSE_FILE" ]; then
        log_error "docker-compose.staging.yml not found in current directory"
        exit 1
    fi
    log_success "Staging configuration files found"
}

generate_secrets() {
    log_step "Generating secrets"

    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || openssl rand -hex 32)
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || openssl rand -hex 32)

    log_success "Generated JWT_SECRET"
    log_success "Generated ENCRYPTION_KEY"
}

update_env_file() {
    log_step "Updating .env file"

    if [ ! -f ".env" ]; then
        log_warning ".env file not found, copying from .env.staging"
        cp .env.staging .env
    fi

    # Update secrets
    sed -i.bak "s/your_staging_jwt_secret_here_generate_with_crypto/$JWT_SECRET/" .env
    sed -i.bak "s/your_staging_encryption_key_here_32_bytes_hex/$ENCRYPTION_KEY/" .env

    # Update domain
    sed -i.bak "s/staging.yourdomain.com/$DOMAIN/" .env
    sed -i.bak "s/your-staging-email@example.com/$EMAIL/" .env

    # Update Nginx config
    sed -i.bak "s/staging.yourdomain.com/$DOMAIN/" nginx.conf

    log_success "Environment variables updated"

    # Remind user to update manual values
    log_warning "Please review and update these values in .env:"
    log_warning "  - AI_API_URL"
    log_warning "  - AI_API_KEY"
    log_warning "  - GRAFANA_PASSWORD"
    log_warning "  - Google Calendar credentials (optional)"
}

create_directories() {
    log_step "Creating required directories"

    mkdir -p ssl/certs
    mkdir -p nginx-logs
    mkdir -p uploads
    mkdir -p .wwebjs_auth

    log_success "Directories created"
}

setup_ssl() {
    log_step "Setting up SSL/TLS certificates"

    if [ -f "ssl/certs/fullchain.pem" ] && [ -f "ssl/certs/privkey.pem" ]; then
        log_warning "SSL certificates already exist, skipping..."
        return
    fi

    if [ "$USE_LETSENCRYPT" = "true" ]; then
        log_warning "Let's Encrypt setup requires manual execution as root"
        log_warning "Run: sudo bash setup-ssl.sh letsencrypt $DOMAIN $EMAIL"
        log_warning "Using self-signed certificate for now..."
    fi

    # Generate self-signed certificate
    openssl req -x509 -newkey rsa:4096 -keyout ssl/certs/privkey.pem \
        -out ssl/certs/fullchain.pem -days 365 -nodes \
        -subj "/C=ZA/ST=Gauteng/L=Johannesburg/O=WAFlow/CN=$DOMAIN" \
        2>/dev/null

    log_success "SSL certificates generated"
}

build_image() {
    log_step "Building Docker image"

    docker compose -f "$DOCKER_COMPOSE_FILE" build --no-cache || {
        log_error "Failed to build Docker image"
        exit 1
    }

    log_success "Docker image built"
}

start_services() {
    log_step "Starting services"

    docker compose -f "$DOCKER_COMPOSE_FILE" up -d || {
        log_error "Failed to start services"
        exit 1
    }

    log_success "Services started"
}

wait_for_health() {
    log_step "Waiting for services to be healthy (up to 2 minutes)"

    TIMEOUT=120
    ELAPSED=0
    INTERVAL=5

    while [ $ELAPSED -lt $TIMEOUT ]; do
        MYSQL_STATUS=$(docker compose -f "$DOCKER_COMPOSE_FILE" exec -T mysql \
            mysqladmin ping -h localhost 2>/dev/null | grep -c "mysqld is alive" || echo 0)

        REDIS_STATUS=$(docker compose -f "$DOCKER_COMPOSE_FILE" exec -T redis \
            redis-cli ping 2>/dev/null | grep -c "PONG" || echo 0)

        APP_STATUS=$(docker compose -f "$DOCKER_COMPOSE_FILE" ps waflow | grep -c "Up" || echo 0)

        if [ "$MYSQL_STATUS" -eq 1 ] && [ "$REDIS_STATUS" -eq 1 ] && [ "$APP_STATUS" -eq 1 ]; then
            log_success "All services are healthy"
            return 0
        fi

        sleep $INTERVAL
        ELAPSED=$((ELAPSED + INTERVAL))
        echo -ne "  Waiting... ${ELAPSED}s / ${TIMEOUT}s\r"
    done

    log_warning "Services did not become healthy within timeout"
    log_step "Checking service logs:"
    docker compose -f "$DOCKER_COMPOSE_FILE" logs --tail=20
}

initialize_database() {
    log_step "Initializing database"

    # Wait a bit for MySQL to fully start
    sleep 10

    # Run migrations
    log_step "Running database migrations"
    docker compose -f "$DOCKER_COMPOSE_FILE" exec -T waflow \
        npx drizzle-kit migrate:mysql 2>/dev/null || {
        log_warning "Migration may have already run"
    }

    # Seed data
    log_step "Seeding database with default data"
    docker compose -f "$DOCKER_COMPOSE_FILE" exec -T waflow \
        npm run db:seed 2>/dev/null || {
        log_warning "Seed may have already run"
    }

    log_success "Database initialized"
}

verify_deployment() {
    log_step "Verifying deployment"

    # Wait for app to be ready
    sleep 5

    # Check health endpoint
    HEALTH_RESPONSE=$(curl -sk https://localhost/health 2>/dev/null || echo "")

    if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
        log_success "Application is healthy"
    else
        log_warning "Health check failed or unavailable yet"
    fi

    # Show service status
    log_step "Service Status:"
    docker compose -f "$DOCKER_COMPOSE_FILE" ps

    log_success "Deployment verification complete"
}

print_summary() {
    log_step "Deployment Summary"

    echo ""
    echo "═════════════════════════════════════════════════════════════════════════════════"
    echo -e "${GREEN}WAFlow Staging Deployment Complete!${NC}"
    echo "═════════════════════════════════════════════════════════════════════════════════"
    echo ""
    echo "📋 Services running:"
    echo "   • MySQL 8.0 (port 3307)"
    echo "   • Redis 7.0 (port 6380)"
    echo "   • WAFlow Application (port 3000)"
    echo "   • Nginx Reverse Proxy (ports 80, 443)"
    echo "   • Prometheus (port 9090)"
    echo "   • Grafana (port 3001)"
    echo ""
    echo "🌐 Access Points (update DNS to your server IP):"
    echo "   • Application: https://$DOMAIN"
    echo "   • Prometheus: https://$DOMAIN:9090"
    echo "   • Grafana: https://$DOMAIN:3001"
    echo ""
    echo "📊 Default Credentials:"
    echo "   • Application:"
    echo "     - Email: admin@waflow.com"
    echo "     - Password: admin123"
    echo "   • Grafana:"
    echo "     - Username: admin"
    echo "     - Password: (from .env GRAFANA_PASSWORD)"
    echo ""
    echo "📝 Important Next Steps:"
    echo "   1. Update .env file with your actual values:"
    echo "      - AI_API_KEY (Groq, OpenAI, or Ollama)"
    echo "      - GRAFANA_PASSWORD"
    echo "      - Google Calendar credentials (if using)"
    echo ""
    echo "   2. Set up SSL/TLS certificate:"
    echo "      - For Let's Encrypt (production):"
    echo "        sudo bash setup-ssl.sh letsencrypt $DOMAIN $EMAIL"
    echo "      - For self-signed (testing):"
    echo "        bash setup-ssl.sh self-signed $DOMAIN"
    echo ""
    echo "   3. Configure your domain DNS:"
    echo "      - A record pointing to $(hostname -I | awk '{print $1}')"
    echo ""
    echo "   4. Monitor deployment:"
    echo "      docker compose -f $DOCKER_COMPOSE_FILE logs -f waflow"
    echo ""
    echo "   5. Run load testing when ready:"
    echo "      npm install -g artillery"
    echo "      artillery run load-test.yml"
    echo ""
    echo "═════════════════════════════════════════════════════════════════════════════════"
    echo ""
}

show_help() {
    echo "WAFlow Staging Deployment Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -d, --domain DOMAIN         Set deployment domain (default: staging.yourdomain.com)"
    echo "  -e, --email EMAIL           Set notification email (default: admin@example.com)"
    echo "  -l, --letsencrypt           Use Let's Encrypt instead of self-signed cert"
    echo "  -h, --help                  Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --domain staging.example.com --email admin@example.com"
    echo "  $0 -d staging.example.com -e admin@example.com -l"
    echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--domain)
            DOMAIN="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        -l|--letsencrypt)
            USE_LETSENCRYPT=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main deployment flow
main() {
    log_step "Starting WAFlow Staging Deployment"
    echo "Domain: $DOMAIN"
    echo "Email: $EMAIL"
    echo ""

    check_prerequisites
    generate_secrets
    create_directories
    update_env_file
    setup_ssl
    build_image
    start_services
    wait_for_health
    initialize_database
    verify_deployment
    print_summary
}

# Run main function
main
