#!/bin/bash

#####################################################################################################
# WAFlow Staging SSL/TLS Certificate Setup Script
# Handles both Let's Encrypt (production) and self-signed (testing) certificates
#####################################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}===========================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}===========================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check if running as root (required for Let's Encrypt)
    if [ "$EUID" -ne 0 ] && [ "$1" = "letsencrypt" ]; then
        print_error "This script must be run as root for Let's Encrypt setup"
        exit 1
    fi

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_success "Docker is installed"

    # Check if OpenSSL is installed
    if ! command -v openssl &> /dev/null; then
        print_error "OpenSSL is not installed"
        exit 1
    fi
    print_success "OpenSSL is installed"
}

# Setup directory structure
setup_directories() {
    print_header "Setting Up Directories"

    mkdir -p ssl/certs
    mkdir -p ssl/private
    print_success "Created SSL directories"
}

# Self-signed certificate (for testing)
setup_self_signed() {
    print_header "Generating Self-Signed Certificate (Testing Only)"

    DOMAIN=${1:-staging.yourdomain.com}

    print_info "Generating certificate for domain: $DOMAIN"

    openssl req -x509 -newkey rsa:4096 -keyout ssl/certs/privkey.pem \
        -out ssl/certs/fullchain.pem -days 365 -nodes \
        -subj "/C=ZA/ST=Gauteng/L=Johannesburg/O=WAFlow/CN=$DOMAIN"

    print_success "Self-signed certificate generated"
    print_warning "Self-signed certificates are NOT suitable for production"
    print_info "Certificate valid for 365 days"
    print_info "Location: ssl/certs/fullchain.pem and ssl/certs/privkey.pem"
}

# Let's Encrypt certificate (for production)
setup_letsencrypt() {
    print_header "Setting Up Let's Encrypt Certificate (Production)"

    DOMAIN=$1
    EMAIL=$2

    if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
        print_error "Usage: $0 letsencrypt <domain> <email>"
        exit 1
    fi

    print_info "Installing Certbot..."
    apt-get update -qq
    apt-get install -y certbot python3-certbot-nginx > /dev/null 2>&1
    print_success "Certbot installed"

    print_info "Requesting certificate for: $DOMAIN"
    print_info "Notification email: $EMAIL"

    certbot certonly --standalone \
        -d "$DOMAIN" \
        -d "www.$DOMAIN" \
        --email "$EMAIL" \
        --agree-tos \
        --non-interactive \
        --preferred-challenges http

    if [ $? -eq 0 ]; then
        print_success "Certificate obtained from Let's Encrypt"

        print_info "Copying certificates to application directory..."
        sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem ssl/certs/
        sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem ssl/certs/
        sudo chown $(whoami):$(whoami) ssl/certs/*

        print_success "Certificates copied to ssl/certs/"

        print_info "Setting up auto-renewal..."
        systemctl enable certbot.timer
        systemctl start certbot.timer
        print_success "Auto-renewal configured"

        print_info "Verifying renewal works..."
        certbot renew --dry-run
        print_success "Renewal verification passed"
    else
        print_error "Failed to obtain certificate"
        exit 1
    fi
}

# Verify certificate
verify_certificate() {
    print_header "Verifying Certificate"

    if [ ! -f ssl/certs/fullchain.pem ]; then
        print_error "Certificate file not found: ssl/certs/fullchain.pem"
        return 1
    fi

    if [ ! -f ssl/certs/privkey.pem ]; then
        print_error "Private key file not found: ssl/certs/privkey.pem"
        return 1
    fi

    print_info "Certificate Information:"
    openssl x509 -in ssl/certs/fullchain.pem -text -noout | grep -E "Subject:|Issuer:|Not Before|Not After"

    print_info "Verifying certificate and key match..."
    CERT_MODULUS=$(openssl x509 -noout -modulus -in ssl/certs/fullchain.pem | openssl md5)
    KEY_MODULUS=$(openssl rsa -noout -modulus -in ssl/certs/privkey.pem | openssl md5)

    if [ "$CERT_MODULUS" = "$KEY_MODULUS" ]; then
        print_success "Certificate and key match"
    else
        print_error "Certificate and key do NOT match"
        return 1
    fi

    print_info "Checking certificate validity..."
    openssl x509 -in ssl/certs/fullchain.pem -noout -dates

    EXPIRY=$(openssl x509 -in ssl/certs/fullchain.pem -noout -dates | grep notAfter | cut -d= -f2)
    print_success "Certificate is valid until: $EXPIRY"
}

# Update Nginx configuration
update_nginx_config() {
    print_header "Updating Nginx Configuration"

    DOMAIN=$1

    if [ -z "$DOMAIN" ]; then
        DOMAIN="staging.yourdomain.com"
    fi

    print_info "Updating nginx.conf with domain: $DOMAIN"

    if [ -f nginx.conf ]; then
        sed -i "s/staging.yourdomain.com/$DOMAIN/g" nginx.conf
        print_success "Nginx configuration updated"
    else
        print_warning "nginx.conf not found"
    fi
}

# Setup certificate auto-renewal reminders
setup_renewal_monitoring() {
    print_header "Setting Up Certificate Renewal Monitoring"

    # Create script to check expiry and alert
    cat > check-ssl-expiry.sh << 'EOF'
#!/bin/bash

CERT_FILE="ssl/certs/fullchain.pem"
EXPIRY_DAYS=30

if [ ! -f "$CERT_FILE" ]; then
    echo "Certificate file not found: $CERT_FILE"
    exit 1
fi

EXPIRY_DATE=$(openssl x509 -in "$CERT_FILE" -noout -dates | grep notAfter | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

if [ $DAYS_LEFT -lt 0 ]; then
    echo "⚠ Certificate has EXPIRED!"
    exit 1
elif [ $DAYS_LEFT -lt $EXPIRY_DAYS ]; then
    echo "⚠ Certificate expires in $DAYS_LEFT days"
    exit 1
else
    echo "✓ Certificate valid for $DAYS_LEFT days"
    exit 0
fi
EOF

    chmod +x check-ssl-expiry.sh
    print_success "Created SSL expiry check script"

    # Add to crontab (weekly check)
    (crontab -l 2>/dev/null || echo "") | grep -q "check-ssl-expiry.sh" || \
        (crontab -l 2>/dev/null || echo ""; echo "0 3 * * 0 cd $(pwd) && bash check-ssl-expiry.sh") | crontab -

    print_success "Added weekly SSL expiry check to crontab"
}

# Main script
main() {
    print_header "WAFlow SSL/TLS Setup"

    if [ $# -eq 0 ]; then
        echo "Usage: $0 <option> [arguments]"
        echo ""
        echo "Options:"
        echo "  self-signed [domain]          Generate self-signed certificate (testing)"
        echo "  letsencrypt <domain> <email>  Setup Let's Encrypt certificate (production)"
        echo "  verify                        Verify existing certificate"
        echo "  check-expiry                  Check certificate expiry date"
        echo ""
        echo "Examples:"
        echo "  $0 self-signed staging.example.com"
        echo "  $0 letsencrypt staging.example.com admin@example.com"
        echo ""
        exit 0
    fi

    OPTION=$1

    case $OPTION in
        self-signed)
            check_prerequisites
            setup_directories
            setup_self_signed "$2"
            verify_certificate
            update_nginx_config "$2"
            setup_renewal_monitoring
            print_success "Self-signed certificate setup complete!"
            ;;
        letsencrypt)
            check_prerequisites "letsencrypt"
            setup_directories
            setup_letsencrypt "$2" "$3"
            verify_certificate
            update_nginx_config "$2"
            setup_renewal_monitoring
            print_success "Let's Encrypt certificate setup complete!"
            ;;
        verify)
            verify_certificate
            ;;
        check-expiry)
            bash check-ssl-expiry.sh
            ;;
        *)
            print_error "Unknown option: $OPTION"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
