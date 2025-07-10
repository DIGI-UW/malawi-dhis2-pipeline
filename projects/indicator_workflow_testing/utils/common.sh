#!/bin/bash

# Common utilities for OpenFN Workflow Testing Framework

# Get the utils directory
UTILS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$(dirname "$UTILS_DIR")")")"
CONFIG_DIR="$UTILS_DIR/../config"

# Load configuration
if [[ -f "$CONFIG_DIR/test-config.json" ]]; then
    # Extract configuration values using jq if available
    if command -v jq &> /dev/null; then
        OPENFN_URL=$(jq -r '.openfn.url' "$CONFIG_DIR/test-config.json")
        OPENFN_API_KEY=$(jq -r '.openfn.apiKey' "$CONFIG_DIR/test-config.json")
        OPENFN_USER=$(jq -r '.openfn.adminUser' "$CONFIG_DIR/test-config.json")
        OPENFN_PASSWORD=$(jq -r '.openfn.adminPassword' "$CONFIG_DIR/test-config.json")
    else
        # Fallback values if jq is not available
        OPENFN_URL="http://localhost:4000"
        OPENFN_API_KEY="apiKey"
        OPENFN_USER="root@openhim.org"
        OPENFN_PASSWORD="instant101secure"
    fi
else
    # Default values
    OPENFN_URL="http://localhost:4000"
    OPENFN_API_KEY="apiKey"
    OPENFN_USER="root@openhim.org"
    OPENFN_PASSWORD="instant101secure"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
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

log_debug() {
    if [[ "${VERBOSE:-false}" == "true" ]]; then
        echo -e "${CYAN}[DEBUG]${NC} $1"
    fi
}

log_test() {
    echo -e "${CYAN}[TEST]${NC} $1"
}

log_step() {
    echo -e "${MAGENTA}[STEP]${NC} $1"
}

# Function to get environment variable with fallback to package metadata
# Migrated from openfn-workflows/scripts/test-end-to-end.sh
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
        # Look for package metadata in multiple possible locations
        local metadata_paths=(
            "../../packages/$package_name/package-metadata.json"
            "../packages/$package_name/package-metadata.json"
            "packages/$package_name/package-metadata.json"
        )
        
        for metadata_file in "${metadata_paths[@]}"; do
            if [[ -f "$metadata_file" ]] && command -v jq >/dev/null 2>&1; then
                local metadata_value=$(jq -r ".environmentVariables.${var_name} // empty" "$metadata_file" 2>/dev/null)
                if [[ -n "$metadata_value" && "$metadata_value" != "null" ]]; then
                    echo "$metadata_value"
                    return
                fi
            fi
        done
    fi
    
    # Use default value
    echo "$default_value"
}

# Function to make API requests
api_request() {
    local method=$1
    local endpoint=$2
    local auth_header=$3
    local data=$4
    
    local curl_cmd="curl -s -X $method '$OPENFN_URL$endpoint'"
    
    if [[ -n "$auth_header" ]]; then
        curl_cmd="$curl_cmd -H '$auth_header'"
    fi
    
    if [[ -n "$data" ]]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi
    
    log_debug "API Request: $curl_cmd"
    eval $curl_cmd
}

# Function to wait for service availability
wait_for_service() {
    local service_name=$1
    local url=$2
    local max_attempts=${3:-30}
    local sleep_interval=${4:-2}
    
    log_info "Waiting for $service_name to be available at $url..."
    
    for ((i=1; i<=max_attempts; i++)); do
        if curl -s --max-time 5 "$url" > /dev/null 2>&1; then
            log_success "$service_name is available"
            return 0
        fi
        
        log_debug "Attempt $i/$max_attempts failed, retrying in ${sleep_interval}s..."
        sleep $sleep_interval
    done
    
    log_error "$service_name failed to become available after $max_attempts attempts"
    return 1
}

# Function to validate JSON response
validate_json() {
    local response=$1
    local expected_field=$2
    
    if command -v jq &> /dev/null; then
        if echo "$response" | jq -e ".$expected_field" > /dev/null 2>&1; then
            return 0
        else
            return 1
        fi
    else
        # Simple validation without jq
        if echo "$response" | grep -q "\"$expected_field\""; then
            return 0
        else
            return 1
        fi
    fi
}

# Function to check if service is running via Docker
check_docker_service() {
    local service_name=$1
    
    if docker service ls --filter "name=$service_name" --format "{{.Replicas}}" | grep -q "1/1"; then
        return 0
    else
        return 1
    fi
}

# Function to get service logs
get_service_logs() {
    local service_name=$1
    local lines=${2:-20}
    
    docker service logs "$service_name" --tail "$lines" 2>/dev/null || echo "No logs available for $service_name"
}

# Function to run test with timeout
run_test_with_timeout() {
    local test_function=$1
    local timeout=${2:-30}
    local description=${3:-"Test"}
    
    log_info "Running: $description"
    
    if timeout "$timeout" bash -c "$test_function"; then
        log_success "$description completed"
        return 0
    else
        log_error "$description failed or timed out"
        return 1
    fi
}

# Function to summarize test results
summarize_results() {
    local passed=$1
    local failed=$2
    local total=$((passed + failed))
    
    echo ""
    log_info "=== Test Summary ==="
    log_info "Total tests: $total"
    log_success "Passed: $passed"
    
    if [[ $failed -gt 0 ]]; then
        log_error "Failed: $failed"
    else
        log_success "Failed: $failed"
    fi
    
    if [[ $total -gt 0 ]]; then
        local percentage=$((passed * 100 / total))
        log_info "Success rate: ${percentage}%"
        
        if [[ $percentage -eq 100 ]]; then
            log_success "All tests passed! 🎉"
        elif [[ $percentage -ge 80 ]]; then
            log_warning "Most tests passed, but some issues need attention"
        else
            log_error "Many tests failed, significant issues detected"
        fi
    fi
}

# Export functions for use in other scripts
export -f log_info log_success log_warning log_error log_debug log_test log_step
export -f api_request wait_for_service validate_json
export -f check_docker_service get_service_logs run_test_with_timeout summarize_results 