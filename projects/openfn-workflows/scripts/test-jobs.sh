#!/bin/bash

# OpenFN Job Testing Script
# Tests individual jobs using the OpenFN CLI in Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
DOCKER_IMAGE="openfn-workflows-test"
WORKFLOW_DIR="workflows/sftp-dhis2"
JOBS_DIR="$WORKFLOW_DIR/jobs"
TESTS_DIR="tests"
FIXTURES_DIR="$TESTS_DIR/fixtures"
OUTPUTS_DIR="$TESTS_DIR/outputs"

# Ensure directories exist
mkdir -p "$FIXTURES_DIR" "$OUTPUTS_DIR"

# Build Docker image if it doesn't exist
if ! docker image inspect "$DOCKER_IMAGE" >/dev/null 2>&1; then
    log_info "Building Docker test image..."
    docker build -f Dockerfile.test -t "$DOCKER_IMAGE" .
fi

# Function to run OpenFN CLI in Docker
run_openfn() {
    local cmd="$1"
    docker run --rm \
        -v "$(pwd):/app" \
        -w /app \
        "$DOCKER_IMAGE" \
        openfn $cmd
}

# Function to test a single job
test_job() {
    local job_file="$1"
    local input_file="${2:-$FIXTURES_DIR/default-input.json}"
    local job_name=$(basename "$job_file" .js)
    
    log_info "Testing job: $job_name"
    
    # Create default input if it doesn't exist
    if [[ ! -f "$input_file" ]]; then
        echo '{"data": {}, "configuration": {}}' > "$input_file"
    fi
    
    # Run the job
    local output_file="$OUTPUTS_DIR/${job_name}-output.json"
    local log_file="$OUTPUTS_DIR/${job_name}-log.txt"
    
    if run_openfn "$job_file -i $input_file -o $output_file" > "$log_file" 2>&1; then
        log_success "✅ $job_name passed"
        return 0
    else
        log_error "❌ $job_name failed"
        log_error "Check logs: $log_file"
        cat "$log_file"
        return 1
    fi
}

# Function to validate job syntax
validate_job() {
    local job_file="$1"
    local job_name=$(basename "$job_file" .js)
    
    log_info "Validating syntax: $job_name"
    
    # Check for basic syntax errors using Docker
    if docker run --rm -v "$(pwd):/app" -w /app "$DOCKER_IMAGE" node -c "$job_file" 2>/dev/null; then
        log_success "✅ $job_name syntax valid"
        return 0
    else
        log_error "❌ $job_name syntax error"
        docker run --rm -v "$(pwd):/app" -w /app "$DOCKER_IMAGE" node -c "$job_file"
        return 1
    fi
}

# Function to test all jobs
test_all_jobs() {
    local failed=0
    local total=0
    
    log_info "🧪 Testing all jobs in $JOBS_DIR"
    
    for job_file in "$JOBS_DIR"/*.js; do
        if [[ -f "$job_file" ]]; then
            total=$((total + 1))
            
            # First validate syntax
            if ! validate_job "$job_file"; then
                failed=$((failed + 1))
                continue
            fi
            
            # Then test execution (if test input exists)
            local job_name=$(basename "$job_file" .js)
            local test_input="$FIXTURES_DIR/${job_name}-input.json"
            
            if [[ -f "$test_input" ]]; then
                if ! test_job "$job_file" "$test_input"; then
                    failed=$((failed + 1))
                fi
            else
                log_warning "⚠️  No test input found for $job_name (expected: $test_input)"
                # Try with default input
                if ! test_job "$job_file"; then
                    failed=$((failed + 1))
                fi
            fi
        fi
    done
    
    echo ""
    log_info "📊 Test Results:"
    log_info "  Total jobs: $total"
    log_info "  Passed: $((total - failed))"
    log_info "  Failed: $failed"
    
    if [[ $failed -eq 0 ]]; then
        log_success "🎉 All tests passed!"
        return 0
    else
        log_error "💥 $failed test(s) failed"
        return 1
    fi
}

# Function to create test fixtures
create_fixtures() {
    log_info "Creating test fixtures..."
    
    # Default input
    cat > "$FIXTURES_DIR/default-input.json" << 'EOF'
{
  "data": {},
  "configuration": {
    "hostUrl": "test.example.com",
    "username": "test_user",
    "password": "test_pass",
    "baseUrl": "https://test-dhis2.example.com/api"
  }
}
EOF

    # SFTP check input
    cat > "$FIXTURES_DIR/check-sftp-files-input.json" << 'EOF'
{
  "data": [
    {
      "name": "test-file.xlsx",
      "type": "file",
      "size": 1024,
      "modifiedTime": "2024-01-01T12:00:00Z"
    },
    {
      "name": "another-file.xlsx", 
      "type": "file",
      "size": 2048,
      "modifiedTime": "2024-01-02T12:00:00Z"
    }
  ],
  "fileTracking": {},
  "configuration": {
    "hostUrl": "test-sftp.example.com",
    "username": "test_user",
    "password": "test_pass"
  }
}
EOF

    # DHIS2 input
    cat > "$FIXTURES_DIR/upload-to-dhis2-input.json" << 'EOF'
{
  "data": {
    "dataValues": [
      {
        "dataElement": "TEST_DE_001",
        "period": "202401",
        "orgUnit": "TEST_OU_001",
        "value": "100"
      }
    ]
  },
  "configuration": {
    "baseUrl": "https://test-dhis2.example.com/api",
    "username": "test_user",
    "password": "test_pass"
  }
}
EOF

    log_success "Test fixtures created in $FIXTURES_DIR"
}

# Main command handler
main() {
    local command="${1:-test}"
    
    case "$command" in
        "test")
            test_all_jobs
            ;;
        "validate")
            log_info "Validating all job syntax..."
            local failed=0
            for job_file in "$JOBS_DIR"/*.js; do
                if [[ -f "$job_file" ]]; then
                    if ! validate_job "$job_file"; then
                        failed=$((failed + 1))
                    fi
                fi
            done
            if [[ $failed -eq 0 ]]; then
                log_success "All jobs have valid syntax"
            else
                log_error "$failed job(s) have syntax errors"
                exit 1
            fi
            ;;
        "fixtures")
            create_fixtures
            ;;
        "build")
            log_info "Building Docker test image..."
            docker build -f Dockerfile.test -t "$DOCKER_IMAGE" .
            log_success "Docker image built: $DOCKER_IMAGE"
            ;;
        "clean")
            log_info "Cleaning test outputs..."
            rm -rf "$OUTPUTS_DIR"/*
            log_success "Test outputs cleaned"
            ;;
        *)
            echo "OpenFN Job Testing Script"
            echo ""
            echo "Usage: $0 {command}"
            echo ""
            echo "Commands:"
            echo "  test      - Test all jobs"
            echo "  validate  - Validate job syntax only"
            echo "  fixtures  - Create test fixtures"
            echo "  build     - Build Docker test image"
            echo "  clean     - Clean test outputs"
            echo ""
            echo "Examples:"
            echo "  $0 test                    # Test all jobs"
            echo "  $0 validate                # Check syntax only"
            echo "  $0 fixtures                # Create test data"
            exit 1
            ;;
    esac
}

# Run main function
main "$@" 