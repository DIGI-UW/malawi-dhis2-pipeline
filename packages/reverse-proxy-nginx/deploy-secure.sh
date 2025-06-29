#!/bin/bash

# Secure Deployment Script for Nginx Reverse Proxy
# This script helps deploy the reverse proxy with proper DNS and SSL verification

set -e

# Configuration
DOMAIN_NAME="mwdhis2.info"
SUBDOMAINS=("dhis2.mwdhis2.info" "openfn.mwdhis2.info" "sftp.mwdhis2.info")
REQUIRED_PORTS=(80 443)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root or with sudo
check_privileges() {
    if [[ $EUID -ne 0 ]] && ! sudo -n true 2>/dev/null; then
        log_error "This script requires root privileges for port checks and firewall configuration"
        log_info "Please run with sudo or as root"
        exit 1
    fi
}

# Check DNS resolution
check_dns() {
    log_info "Checking DNS resolution..."
    
    local failed_domains=()
    
    # Check main domain
    if ! nslookup "$DOMAIN_NAME" >/dev/null 2>&1; then
        failed_domains+=("$DOMAIN_NAME")
    fi
    
    # Check subdomains
    for subdomain in "${SUBDOMAINS[@]}"; do
        if ! nslookup "$subdomain" >/dev/null 2>&1; then
            failed_domains+=("$subdomain")
        fi
    done
    
    if [[ ${#failed_domains[@]} -gt 0 ]]; then
        log_error "The following domains do not resolve:"
        for domain in "${failed_domains[@]}"; do
            log_error "  - $domain"
        done
        log_warning "Please configure DNS records before proceeding"
        return 1
    fi
    
    log_success "All domains resolve correctly"
    return 0
}

# Check port availability
check_ports() {
    log_info "Checking port availability..."
    
    local blocked_ports=()
    
    for port in "${REQUIRED_PORTS[@]}"; do
        if ss -tuln | grep -q ":$port "; then
            blocked_ports+=("$port")
        fi
    done
    
    if [[ ${#blocked_ports[@]} -gt 0 ]]; then
        log_warning "The following ports are already in use:"
        for port in "${blocked_ports[@]}"; do
            log_warning "  - Port $port"
        done
        log_info "This may be okay if nginx is already running"
    else
        log_success "Required ports are available"
    fi
}

# Configure firewall
configure_firewall() {
    log_info "Configuring firewall..."
    
    if command -v ufw >/dev/null 2>&1; then
        for port in "${REQUIRED_PORTS[@]}"; do
            if sudo ufw status | grep -q "$port"; then
                log_info "Port $port already allowed in UFW"
            else
                sudo ufw allow "$port" >/dev/null 2>&1
                log_success "Allowed port $port in UFW"
            fi
        done
    elif command -v firewall-cmd >/dev/null 2>&1; then
        for port in "${REQUIRED_PORTS[@]}"; do
            if sudo firewall-cmd --list-ports | grep -q "$port"; then
                log_info "Port $port already allowed in firewalld"
            else
                sudo firewall-cmd --permanent --add-port="$port/tcp" >/dev/null 2>&1
                log_success "Allowed port $port in firewalld"
            fi
        done
        sudo firewall-cmd --reload >/dev/null 2>&1
    else
        log_warning "No supported firewall detected (ufw/firewalld). Please ensure ports 80 and 443 are open"
    fi
}

# Check Docker
check_docker() {
    log_info "Checking Docker installation..."
    
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker is not installed"
        return 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running or accessible"
        return 1
    fi
    
    if ! docker node ls >/dev/null 2>&1; then
        log_error "Docker Swarm is not initialized"
        log_info "Initialize Docker Swarm with: docker swarm init"
        return 1
    fi
    
    log_success "Docker and Docker Swarm are ready"
    return 0
}

# Deploy reverse proxy
deploy_reverse_proxy() {
    log_info "Deploying reverse proxy..."
    
    # Get script directory
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    # Check if we're in the right directory
    if [[ ! -f "$SCRIPT_DIR/swarm.sh" ]]; then
        log_error "swarm.sh not found in $SCRIPT_DIR"
        log_info "Please run this script from the reverse-proxy-nginx package directory"
        return 1
    fi
    
    # Deploy the service
    if bash "$SCRIPT_DIR/swarm.sh" init; then
        log_success "Reverse proxy deployed successfully"
    else
        log_error "Failed to deploy reverse proxy"
        return 1
    fi
}

# Check deployment status
check_deployment() {
    log_info "Checking deployment status..."
    
    # Wait for service to be ready
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        if docker service ls --filter name=reverse-proxy_reverse-proxy-nginx --format "{{.Replicas}}" | grep -q "1/1"; then
            log_success "Service is running"
            break
        fi
        
        attempt=$((attempt + 1))
        log_info "Waiting for service to start... ($attempt/$max_attempts)"
        sleep 10
    done
    
    if [[ $attempt -eq $max_attempts ]]; then
        log_error "Service failed to start within expected time"
        log_info "Check logs with: docker service logs reverse-proxy_reverse-proxy-nginx"
        return 1
    fi
}

# Test endpoints
test_endpoints() {
    log_info "Testing endpoints..."
    
    # Wait a bit for SSL certificates to be generated
    log_info "Waiting for SSL certificate generation..."
    sleep 30
    
    local failed_tests=()
    
    # Test main domain (should redirect to HTTPS)
    if curl -s -o /dev/null -w "%{http_code}" "http://$DOMAIN_NAME" | grep -q "301"; then
        log_success "HTTP redirect working for $DOMAIN_NAME"
    else
        failed_tests+=("$DOMAIN_NAME HTTP redirect")
    fi
    
    # Test subdomains
    for subdomain in "${SUBDOMAINS[@]}"; do
        # Test HTTP redirect
        if curl -s -o /dev/null -w "%{http_code}" "http://$subdomain" | grep -q "301"; then
            log_success "HTTP redirect working for $subdomain"
        else
            failed_tests+=("$subdomain HTTP redirect")
        fi
        
        # Test HTTPS (may fail initially due to certificate generation)
        if curl -s -k -o /dev/null -w "%{http_code}" "https://$subdomain" | grep -q -E "200|302|301"; then
            log_success "HTTPS working for $subdomain"
        else
            log_warning "HTTPS not yet working for $subdomain (certificates may still be generating)"
        fi
    done
    
    if [[ ${#failed_tests[@]} -gt 0 ]]; then
        log_warning "Some tests failed:"
        for test in "${failed_tests[@]}"; do
            log_warning "  - $test"
        done
        log_info "This may be temporary if certificates are still being generated"
    fi
}

# Display deployment information
show_deployment_info() {
    log_info "Deployment Information:"
    echo "  Main Domain: https://$DOMAIN_NAME"
    echo "  DHIS2: https://dhis2.$DOMAIN_NAME"
    echo "  OpenFN: https://openfn.$DOMAIN_NAME"
    echo "  SFTP Management: https://sftp.$DOMAIN_NAME"
    echo ""
    log_info "Useful Commands:"
    echo "  Check service status: docker service ls"
    echo "  View logs: docker service logs reverse-proxy_reverse-proxy-nginx"
    echo "  Test SSL: curl -I https://dhis2.$DOMAIN_NAME"
    echo ""
    log_info "Certificate Information:"
    echo "  Using Let's Encrypt staging certificates (STAGING=true)"
    echo "  To switch to production certificates:"
    echo "    1. Edit package-metadata.json and set STAGING=false"
    echo "    2. Run: ./instant package destroy reverse-proxy-nginx"
    echo "    3. Run: ./instant package init reverse-proxy-nginx"
}

# Main function
main() {
    log_info "Starting secure deployment of Nginx Reverse Proxy"
    log_info "Domain: $DOMAIN_NAME"
    log_info "Subdomains: ${SUBDOMAINS[*]}"
    echo ""
    
    # Run checks
    check_privileges
    check_docker || exit 1
    check_dns || {
        log_error "DNS check failed. Please configure DNS records and try again."
        exit 1
    }
    check_ports
    configure_firewall
    
    echo ""
    log_info "Pre-deployment checks complete"
    
    # Ask for confirmation
    read -p "Proceed with deployment? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Deployment cancelled"
        exit 0
    fi
    
    # Deploy
    deploy_reverse_proxy || exit 1
    check_deployment || exit 1
    test_endpoints
    
    echo ""
    show_deployment_info
    log_success "Deployment completed!"
}

# Run main function
main "$@"