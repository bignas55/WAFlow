#!/bin/bash

#####################################################################################################
# WAFlow Staging Health Check and Monitoring Script
# Performs comprehensive health checks and generates monitoring reports
#####################################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.staging.yml"
DOMAIN="${DOMAIN:-staging.yourdomain.com}"
CHECK_INTERVAL="${CHECK_INTERVAL:-60}"
LOG_FILE="health-check.log"

# Functions
print_header() {
    echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
}

print_ok() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check Docker services
check_docker_services() {
    print_header "Docker Services Status"

    SERVICES=("mysql" "redis" "waflow" "nginx" "prometheus" "grafana")
    FAILED=0

    for service in "${SERVICES[@]}"; do
        STATUS=$(docker compose -f "$DOCKER_COMPOSE_FILE" ps $service 2>/dev/null | grep -c "Up" || echo 0)

        if [ "$STATUS" -eq 1 ]; then
            print_ok "$service is running"
            log "✓ $service is running"
        else
            print_error "$service is NOT running"
            log "✗ $service is NOT running"
            FAILED=$((FAILED + 1))
        fi
    done

    return $FAILED
}

# Check database connectivity
check_database() {
    print_header "Database Connectivity"

    # Test MySQL connection
    MYSQL_STATUS=$(docker compose -f "$DOCKER_COMPOSE_FILE" exec -T mysql \
        mysqladmin ping -h localhost 2>/dev/null | grep -c "mysqld is alive" || echo 0)

    if [ "$MYSQL_STATUS" -eq 1 ]; then
        print_ok "MySQL is responding"
        log "✓ MySQL is responding"

        # Check database size
        DB_SIZE=$(docker compose -f "$DOCKER_COMPOSE_FILE" exec -T mysql \
            mysql -uwaflow -pwaflowpassword waflow -e "SELECT ROUND(SUM(DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb FROM INFORMATION_SCHEMA.TABLES;" 2>/dev/null | tail -1 || echo "N/A")

        print_info "Database size: ${DB_SIZE} MB"
        log "Database size: ${DB_SIZE} MB"

        # Check table counts
        TABLE_COUNT=$(docker compose -f "$DOCKER_COMPOSE_FILE" exec -T mysql \
            mysql -uwaflow -pwaflowpassword waflow -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES;" 2>/dev/null | tail -1 || echo "N/A")

        print_info "Table count: $TABLE_COUNT"
        log "Table count: $TABLE_COUNT"
    else
        print_error "MySQL is NOT responding"
        log "✗ MySQL is NOT responding"
        return 1
    fi

    return 0
}

# Check Redis connectivity
check_redis() {
    print_header "Redis Connectivity"

    REDIS_STATUS=$(docker compose -f "$DOCKER_COMPOSE_FILE" exec -T redis \
        redis-cli ping 2>/dev/null | grep -c "PONG" || echo 0)

    if [ "$REDIS_STATUS" -eq 1 ]; then
        print_ok "Redis is responding"
        log "✓ Redis is responding"

        # Check memory usage
        MEMORY=$(docker compose -f "$DOCKER_COMPOSE_FILE" exec -T redis \
            redis-cli info memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 || echo "N/A")

        print_info "Redis memory usage: $MEMORY"
        log "Redis memory usage: $MEMORY"

        # Check connected clients
        CLIENTS=$(docker compose -f "$DOCKER_COMPOSE_FILE" exec -T redis \
            redis-cli info clients 2>/dev/null | grep "connected_clients" | cut -d: -f2 || echo "N/A")

        print_info "Connected clients: $CLIENTS"
        log "Connected clients: $CLIENTS"
    else
        print_error "Redis is NOT responding"
        log "✗ Redis is NOT responding"
        return 1
    fi

    return 0
}

# Check application health
check_application_health() {
    print_header "Application Health"

    HEALTH_RESPONSE=$(curl -sk https://localhost/health 2>/dev/null || curl -s http://localhost:3000/health 2>/dev/null || echo "")

    if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
        print_ok "Application is healthy"
        log "✓ Application is healthy"
    else
        print_warn "Application health check inconclusive"
        log "⚠ Application health check inconclusive"
    fi

    # Check API responsiveness
    API_RESPONSE=$(curl -sk -X POST https://localhost/api/trpc/auth.login \
        -H "Content-Type: application/json" \
        -d '{"email":"test@test.com","password":"test"}' \
        2>/dev/null | grep -c "error" || echo 0)

    if [ "$API_RESPONSE" -eq 1 ]; then
        print_ok "API is responding"
        log "✓ API is responding"
    else
        print_warn "API response unclear"
        log "⚠ API response unclear"
    fi
}

# Check Nginx
check_nginx() {
    print_header "Nginx Reverse Proxy"

    NGINX_PROCESSES=$(docker compose -f "$DOCKER_COMPOSE_FILE" exec -T nginx \
        ps aux | grep -c "[n]ginx: master" || echo 0)

    if [ "$NGINX_PROCESSES" -gt 0 ]; then
        print_ok "Nginx is running"
        log "✓ Nginx is running"

        # Check certificate
        CERT_EXPIRY=$(openssl x509 -in ssl/certs/fullchain.pem -noout -dates 2>/dev/null | grep notAfter | cut -d= -f2 || echo "N/A")
        print_info "Certificate expires: $CERT_EXPIRY"
        log "Certificate expires: $CERT_EXPIRY"
    else
        print_error "Nginx is NOT running properly"
        log "✗ Nginx is NOT running properly"
        return 1
    fi

    return 0
}

# Check disk space
check_disk_space() {
    print_header "Disk Space"

    DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
    DISK_AVAILABLE=$(df -h . | awk 'NR==2 {print $4}')

    print_info "Disk usage: $DISK_USAGE%"
    print_info "Disk available: $DISK_AVAILABLE"

    if [ "$DISK_USAGE" -gt 90 ]; then
        print_error "Disk usage is critical (>90%)"
        log "✗ Disk usage is critical (>90%)"
        return 1
    elif [ "$DISK_USAGE" -gt 80 ]; then
        print_warn "Disk usage is high (>80%)"
        log "⚠ Disk usage is high (>80%)"
    else
        print_ok "Disk usage is normal"
        log "✓ Disk usage is normal"
    fi

    return 0
}

# Check Docker resource usage
check_resource_usage() {
    print_header "Docker Resource Usage"

    print_info "Container resource stats:"
    docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}\t{{.CPUPerc}}" 2>/dev/null | while read line; do
        print_info "$line"
        log "Resource usage: $line"
    done
}

# Check logs for errors
check_logs_for_errors() {
    print_header "Recent Errors in Logs"

    ERROR_COUNT=$(docker compose -f "$DOCKER_COMPOSE_FILE" logs --tail=1000 waffle 2>/dev/null | grep -i "error" | wc -l || echo 0)

    if [ "$ERROR_COUNT" -gt 0 ]; then
        print_warn "Found $ERROR_COUNT error messages in recent logs"
        log "⚠ Found $ERROR_COUNT error messages in recent logs"

        print_info "Sample errors (last 5):"
        docker compose -f "$DOCKER_COMPOSE_FILE" logs --tail=1000 waflow 2>/dev/null | grep -i "error" | tail -5
    else
        print_ok "No recent errors found"
        log "✓ No recent errors found"
    fi

    return 0
}

# Check backups
check_backups() {
    print_header "Backup Status"

    if [ -d "/backups/waflow" ]; then
        LATEST_BACKUP=$(ls -t /backups/waflow/mysql_*.sql.gz 2>/dev/null | head -1 || echo "None")

        if [ "$LATEST_BACKUP" != "None" ]; then
            BACKUP_AGE=$(( ($(date +%s) - $(stat -f%m "$LATEST_BACKUP" 2>/dev/null || stat -c%Y "$LATEST_BACKUP")) ) / 3600 ))
            print_info "Latest backup: $(basename $LATEST_BACKUP)"
            print_info "Backup age: $BACKUP_AGE hours"

            if [ "$BACKUP_AGE" -gt 25 ]; then
                print_warn "Backup is older than 24 hours"
                log "⚠ Backup is older than 24 hours"
            else
                print_ok "Recent backup exists"
                log "✓ Recent backup exists"
            fi
        else
            print_error "No backups found"
            log "✗ No backups found"
            return 1
        fi
    else
        print_warn "Backup directory not found"
        log "⚠ Backup directory not found"
    fi

    return 0
}

# Generate performance metrics
generate_metrics_summary() {
    print_header "Performance Metrics Summary"

    print_info "Getting metrics from Prometheus..."

    # These queries would need a proper Prometheus connection
    # For now, we'll show placeholder metrics

    print_info "Request rate (requests/sec): Retrieving..."
    print_info "Response time (p95): Retrieving..."
    print_info "Error rate: Retrieving..."
    print_info "Active connections: Retrieving..."

    log "Generated metrics summary"
}

# Send alerts
send_alert() {
    local severity=$1
    local message=$2

    print_warn "Alert ($severity): $message"
    log "Alert ($severity): $message"

    # TODO: Implement alerting (email, Slack, PagerDuty, etc.)
}

# Generate report
generate_report() {
    print_header "Health Check Report"

    echo "Generated: $(date)"
    echo "Domain: $DOMAIN"
    echo "Log file: $LOG_FILE"
    echo ""
    echo "View full log:"
    echo "  tail -f $LOG_FILE"
}

# Main function
main() {
    print_header "WAFlow Staging Health Check"

    # Clear old log entries (keep last 1000)
    if [ -f "$LOG_FILE" ]; then
        tail -1000 "$LOG_FILE" > "$LOG_FILE.tmp"
        mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi

    FAILED=0

    # Run all checks
    check_docker_services || FAILED=$((FAILED + 1))
    check_database || FAILED=$((FAILED + 1))
    check_redis || FAILED=$((FAILED + 1))
    check_application_health || FAILED=$((FAILED + 1))
    check_nginx || FAILED=$((FAILED + 1))
    check_disk_space || FAILED=$((FAILED + 1))
    check_resource_usage
    check_logs_for_errors
    check_backups || FAILED=$((FAILED + 1))
    generate_metrics_summary
    generate_report

    echo ""
    if [ "$FAILED" -eq 0 ]; then
        print_ok "All checks passed!"
        log "All health checks passed"
        return 0
    else
        print_error "$FAILED check(s) failed"
        log "$FAILED check(s) failed"
        return 1
    fi
}

# Run continuously if --watch flag provided
if [ "$1" = "--watch" ]; then
    print_info "Starting continuous monitoring (interval: ${CHECK_INTERVAL}s)"
    while true; do
        main
        echo ""
        echo "Next check in ${CHECK_INTERVAL}s... (Ctrl+C to stop)"
        sleep "$CHECK_INTERVAL"
    done
else
    main
fi
