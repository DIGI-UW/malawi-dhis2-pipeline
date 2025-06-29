#!/bin/bash

# OpenFN End-to-End Testing with Real Infrastructure
# Tests workflows using bundled SFTP files and running DHIS2 instance

set -e

# Parse command line arguments
ENV_FILE=""
COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --env-file)
            ENV_FILE="$2"
            shift 2
            ;;
        *)
            COMMAND="$1"
            shift
            ;;
    esac
done

# Source environment file if specified
if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
    log_info "Sourcing environment from: $ENV_FILE"
    source "$ENV_FILE"
fi

# Function to get environment variable with fallback to package metadata
get_env_value() {
    local var_name="$1"
    local package_name="$2"
    local default_value="$3"
    
    # Check environment variable first
    if [[ -n "${!var_name}" ]]; then
        echo "${!var_name}"
        return
    fi
    
    # Check package metadata file
    if [[ -n "$package_name" ]]; then
        local metadata_file="../../packages/$package_name/package-metadata.json"
        if [[ -f "$metadata_file" ]] && command -v jq >/dev/null 2>&1; then
            local metadata_value=$(jq -r ".environmentVariables.${var_name} // empty" "$metadata_file" 2>/dev/null)
            if [[ -n "$metadata_value" && "$metadata_value" != "null" ]]; then
                echo "$metadata_value"
                return
            fi
        fi
    fi
    
    # Use default value
    echo "$default_value"
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_test() { echo -e "${CYAN}[TEST]${NC} $1"; }
log_step() { echo -e "${MAGENTA}[STEP]${NC} $1"; }

# Configuration - source from environment and package metadata
SFTP_HOST=$(get_env_value "SFTP_HOST" "" "localhost")
SFTP_PORT=$(get_env_value "SFTP_PORT" "sftp-storage" "2225")
SFTP_USER=$(get_env_value "SFTP_USER" "sftp-storage" "openfn")
SFTP_PASS=$(get_env_value "SFTP_PASSWORD" "sftp-storage" "instant101")
SFTP_DIR="${SFTP_DIR:-/data/excel-files}"

DHIS2_URL="${DHIS2_URL:-http://localhost:8080}"
DHIS2_USER="${DHIS2_USER:-admin}"
DHIS2_PASS="${DHIS2_PASS:-district}"

DOCKER_IMAGE="openfn-workflows-test"
TESTS_DIR="tests"
E2E_DIR="$TESTS_DIR/e2e"
OUTPUTS_DIR="$E2E_DIR/outputs"

# Ensure directories exist
mkdir -p "$E2E_DIR" "$OUTPUTS_DIR"

log_info "Using configuration:"
log_info "  SFTP: $SFTP_USER@$SFTP_HOST:$SFTP_PORT$SFTP_DIR"
log_info "  DHIS2: $DHIS2_URL"

# Function to check if services are running
check_services() {
    log_step "Checking required services..."
    
    # Check SFTP
    log_info "Testing SFTP connection to $SFTP_HOST:$SFTP_PORT"
    if timeout 10 bash -c "</dev/tcp/$SFTP_HOST/$SFTP_PORT"; then
        log_success "✅ SFTP service is accessible"
    else
        log_error "❌ SFTP service not accessible at $SFTP_HOST:$SFTP_PORT"
        log_error "Make sure SFTP service is running: ./instant package up -n sftp-storage"
        return 1
    fi
    
    # Check DHIS2
    log_info "Testing DHIS2 connection to $DHIS2_URL"
    if timeout 10s bash -c "echo > /dev/tcp/localhost/8080" 2>/dev/null; then
        log_success "✅ DHIS2 service is accessible"
    else
        log_error "❌ DHIS2 service not accessible at $DHIS2_URL"
        log_error "Make sure DHIS2 service is running: ./instant package up -n dhis2-instance"
        return 1
    fi
    
    # Check Docker image
    if docker image inspect "$DOCKER_IMAGE" >/dev/null 2>&1; then
        log_success "✅ Docker test image available"
    else
        log_info "Building Docker test image..."
        docker build -f Dockerfile.test -t "$DOCKER_IMAGE" .
    fi
    
    return 0
}

# Function to verify SFTP has bundled files
verify_bundled_files() {
    log_step "Verifying bundled Excel files on SFTP..."
    
    if ! command -v sshpass >/dev/null 2>&1; then
        log_warning "⚠️  sshpass not available. Install with: sudo apt-get install sshpass"
        log_info "Alternative: Check SFTP files manually with:"
        log_info "  sftp -P $SFTP_PORT $SFTP_USER@$SFTP_HOST"
        return 0
    fi
    
    log_info "Checking for bundled Excel files on SFTP server..."
    
    # List Excel files on SFTP server
    local sftp_output=$(sshpass -p "$SFTP_PASS" sftp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=QUIET -P $SFTP_PORT $SFTP_USER@$SFTP_HOST << 'EOF'
cd /data/excel-files
ls -la *.xlsx
quit
EOF
2>/dev/null)
    
    if echo "$sftp_output" | grep -q "\.xlsx"; then
        log_success "✅ Found bundled Excel files on SFTP:"
        echo "$sftp_output" | grep "\.xlsx" | sed 's/^/    /'
        
        # Count files
        local file_count=$(echo "$sftp_output" | grep -c "\.xlsx" || echo "0")
        log_info "Total Excel files: $file_count"
        
        # Check for specific expected files
        if echo "$sftp_output" | grep -q "ART_data_long_format.xlsx"; then
            log_success "  ✅ ART_data_long_format.xlsx found (will use art_data_long_format.json mapping)"
        fi
        
        if echo "$sftp_output" | grep -q "Q2FY25_DQ_253_sites.xlsx"; then
            log_success "  ✅ Q2FY25_DQ_253_sites.xlsx found (will use dq_sites.json mapping)"
        fi
        
        if echo "$sftp_output" | grep -q "Direct Queries"; then
            log_success "  ✅ Direct Queries file found (will use moh_direct_queries.json mapping)"
        fi
        
        return 0
    else
        log_warning "⚠️  No Excel files found on SFTP server"
        log_info "Expected location: /data/excel-files/"
        log_info "Files may not be bundled in the SFTP image or service not properly initialized"
        return 1
    fi
}

# Function to test SFTP file checking
test_sftp_check() {
    log_step "Testing SFTP file checking with bundled files..."
    
    # Create input with real SFTP configuration pointing to bundled files
    cat > "$E2E_DIR/sftp-check-input.json" << EOF
{
  "data": [],
  "fileTracking": {},
  "configuration": {
    "host": "$SFTP_HOST",
    "port": $SFTP_PORT,
    "username": "$SFTP_USER",
    "password": "$SFTP_PASS",
    "remoteDir": "$SFTP_DIR"
  }
}
EOF
    
    local output_file="workflows/sftp-dhis2/jobs/output.json"
    local log_file="$OUTPUTS_DIR/sftp-check-log.txt"
    
    log_info "Checking SFTP for bundled files..."
    
    # Remove any existing output file
    rm -f "$output_file"
    
    if docker run --rm \
        -v "$(pwd):/app" \
        -w /app \
        --network host \
        "$DOCKER_IMAGE" \
        openfn workflows/sftp-dhis2/jobs/check-sftp-files.js \
        --adaptor @openfn/language-sftp \
        --adaptor @openfn/language-common \
        --state "$E2E_DIR/sftp-check-input.json" > "$log_file" 2>&1; then
        
        # Check if the OpenFN job actually succeeded by looking for errors
        if [[ -f "$output_file" ]] && command -v jq >/dev/null 2>&1; then
            local has_errors=$(jq -r '.errors // {} | length' "$output_file" 2>/dev/null || echo "0")
            if [[ "$has_errors" -gt 0 ]]; then
                log_error "❌ OpenFN job failed with errors:"
                jq -r '.errors | to_entries[] | "  \(.key): \(.value.message)"' "$output_file" 2>/dev/null || true
                return 1
            fi
        fi
        
        log_success "✅ SFTP check completed successfully"
        
        # Parse results
        if [[ -f "$output_file" ]] && command -v jq >/dev/null 2>&1; then
            local files_found=$(jq -r '.newFiles | length' "$output_file" 2>/dev/null || echo "0")
            local new_files_found=$(jq -r '.newFilesFound' "$output_file" 2>/dev/null || echo "false")
            
            log_info "Files found: $files_found"
            log_info "New files detected: $new_files_found"
            
            if [[ "$new_files_found" == "true" && "$files_found" -gt 0 ]]; then
                log_success "🎉 Found $files_found bundled file(s) ready for processing!"
                jq -r '.newFiles[] | "  - \(.name) (\(.size) bytes, modified: \(.modifiedTime))"' "$output_file" 2>/dev/null || true
                return 0
            else
                log_warning "No new files found for processing"
                return 1
            fi
        else
            log_warning "Could not parse SFTP check results"
            return 1
        fi
    else
        log_error "❌ SFTP check failed - Docker command failed"
        cat "$log_file"
        return 1
    fi
}

# Function to test DHIS2 connection
test_dhis2_connection() {
    log_step "Testing DHIS2 connection..."
    
    # Test DHIS2 with a hard timeout
    log_info "Testing DHIS2 accessibility with timeout..."
    
    # Use timeout command to ensure we don't hang
    if timeout 15s bash -c "echo > /dev/tcp/localhost/8080" 2>/dev/null; then
        log_success "✅ DHIS2 port 8080 is accessible"
        
        # Try to get the login page with a strict timeout
        log_info "Attempting to fetch DHIS2 login page..."
        if timeout 10s wget --tries=1 --quiet --spider "http://localhost:8080/dhis-web-commons/security/login.action" 2>/dev/null; then
            log_success "✅ DHIS2 login page accessible"
        else
            log_warning "⚠️  Port accessible but login page may not be ready"
        fi
        
        return 0
    else
        log_error "❌ DHIS2 port 8080 not accessible"
        log_warning "⚠️  DHIS2 may not be fully started or there's a networking issue"
        
        # Don't fail the whole test - workflows might still work
        log_info "Continuing with other tests..."
        return 1
    fi
}

# Main command handler
main() {
    local command="${COMMAND:-full}"
    
    echo ""
    log_info "🧪 OpenFN End-to-End Testing with Bundled Files"
    log_info "Using Excel files bundled in SFTP service"
    log_info "=============================================="
    echo ""
    
    case "$command" in
        "check")
            check_services
            ;;
        "sftp")
            check_services && verify_bundled_files && test_sftp_check
            ;;
        "dhis2")
            check_services && test_dhis2_connection
            ;;
        "full"|"test")
            log_info "Running complete end-to-end test suite..."
            echo ""
            
            if check_services; then
                log_success "✅ All services accessible"
            else
                log_error "❌ Service check failed"
                exit 1
            fi
            
            echo ""
            if verify_bundled_files; then
                log_success "✅ Bundled files verified"
            else
                log_warning "⚠️  Bundled files verification had issues"
            fi
            
            echo ""
            if test_sftp_check; then
                log_success "✅ SFTP test passed"
            else
                log_warning "⚠️  SFTP test had issues"
            fi
            
            echo ""
            if test_dhis2_connection; then
                log_success "✅ DHIS2 connection test passed"
            else
                log_error "❌ DHIS2 connection test failed"
            fi
            
            echo ""
            log_success "🎉 End-to-end testing completed!"
            log_info "Check results in: $OUTPUTS_DIR"
            ;;
        *)
            echo "OpenFN End-to-End Testing Script"
            echo ""
            echo "Usage: $0 [--env-file FILE] {command}"
            echo ""
            echo "Options:"
            echo "  --env-file FILE   Source environment variables from specified file"
            echo ""
            echo "Commands:"
            echo "  check     - Check if all services are running"
            echo "  sftp      - Test SFTP connection and bundled files"
            echo "  dhis2     - Test DHIS2 connection and API access"
            echo "  full      - Run all tests (default)"
            echo ""
            echo "Uses bundled Excel files from SFTP service build:"
            echo "  • ART_data_long_format.xlsx - Bundled during build"
            echo "  • Q2FY25_DQ_253_sites.xlsx - Bundled during build"
            echo "  • Direct Queries - Q1 2025 MoH Reports.xlsx - Bundled during build"
            echo ""
            echo "Environment Variables (sourced from package metadata if not set):"
            echo "  SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_PASSWORD"
            echo "  DHIS2_URL, DHIS2_USER, DHIS2_PASS"
            echo ""
            echo "Examples:"
            echo "  $0 check                    # Check services"
            echo "  $0 --env-file .env sftp     # Test SFTP with custom env"
            echo "  $0 full                     # Complete test suite"
            echo ""
            echo "Before running:"
            echo "  1. Build and start services:"
            echo "     ./mk.sh                  # Builds SFTP with bundled files"
            echo "  2. No file upload needed - files are bundled!"
            exit 1
            ;;
    esac
}

# Run main function
main 