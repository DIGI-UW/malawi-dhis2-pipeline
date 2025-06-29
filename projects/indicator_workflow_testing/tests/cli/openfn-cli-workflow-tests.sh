#!/bin/bash

# OpenFN CLI-based Workflow Testing
# Tests the complete SFTP-to-DHIS2 workflow using the custom CLI container

set -e

# Get script directory and load common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/common.sh"

# Configuration
PROJECT_ROOT="/home/ubuntu/code/malawi-dhis2-pipeline"
WORKFLOWS_DIR="$PROJECT_ROOT/projects/openfn-workflows"
CLI_TEST_SCRIPT="$WORKFLOWS_DIR/tests/e2e/test-full-workflow-cli.sh"

log_info "🧪 OpenFN CLI Workflow Tests"
log_info "Testing SFTP → DHIS2 workflow with custom CLI container"
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

# Check if the CLI test container exists
if ! docker images | grep -q "openfn-cli-test.*latest"; then
    log_warning "OpenFN CLI test container not found"
    log_info "Building container..."
    if cd "$PROJECT_ROOT" && ./build-custom-images.sh openfn-cli-test; then
        log_success "CLI test container built successfully"
    else
        log_error "Failed to build CLI test container"
        exit 1
    fi
else
    log_success "CLI test container found"
fi

# Check if the test script exists
if [[ ! -f "$CLI_TEST_SCRIPT" ]]; then
    log_error "Test script not found: $CLI_TEST_SCRIPT"
    exit 1
fi

# Check SFTP service
log_info "Checking SFTP service..."
if docker service ls | grep -q "sftp-storage_sftp-server"; then
    log_success "SFTP service is running"
else
    log_warning "SFTP service not found"
    exit 1
fi

# Check DHIS2 service
log_info "Checking DHIS2 service..."
DHIS2_HOST="127.0.0.1"
DHIS2_PORT="8080"

if nc -z $DHIS2_HOST $DHIS2_PORT > /dev/null 2>&1; then
    log_success "DHIS2 port $DHIS2_PORT is accessible"
    
    # Try accessing the DHIS2 login page with timeout
    if timeout 15 curl -s -f http://$DHIS2_HOST:$DHIS2_PORT/dhis-web-commons/security/login.action > /dev/null 2>&1; then
        log_success "DHIS2 web interface is responding"
    elif timeout 15 curl -s http://$DHIS2_HOST:$DHIS2_PORT/dhis-web-commons/security/login.action 2>/dev/null | grep -q -i "dhis\|login" 2>/dev/null; then
        log_success "DHIS2 login page is accessible"
    else
        log_success "DHIS2 service is running (port accessible)"
        log_info "Note: Login page check may be slow, but service is available"
    fi
else
    log_error "DHIS2 port $DHIS2_PORT is not accessible on $DHIS2_HOST"
    log_info "This will cause workflow tests to fail"
fi

echo ""
log_info "Running OpenFN CLI workflow tests..."
echo "================================================"

# Run the test script
if cd "$WORKFLOWS_DIR" && bash "$CLI_TEST_SCRIPT"; then
    log_success "CLI workflow tests completed successfully"
    test_result=0
else
    log_error "CLI workflow tests failed"
    test_result=1
fi

# Check test results
echo ""
log_info "Checking test results..."

# Find the latest test results directory
LATEST_RESULTS=$(find "$WORKFLOWS_DIR/test-results" -type d -name "20*" 2>/dev/null | sort -r | head -1)

if [[ -n "$LATEST_RESULTS" ]]; then
    log_info "Test results found in: $LATEST_RESULTS"
    
    # Count successful steps
    successful_steps=$(find "$LATEST_RESULTS" -name "step-*-output.json" 2>/dev/null | wc -l)
    log_info "Successful steps: $successful_steps"
    
    # Check for errors
    if grep -q "error" "$LATEST_RESULTS"/*.json 2>/dev/null; then
        log_warning "Errors detected in test outputs"
    fi
else
    log_warning "No test results directory found"
fi

# Summary
echo ""
log_info "Test Summary:"
log_info "============="
log_info "✅ CLI Container: Available"
log_info "✅ SFTP Service: Running"
log_info "✅ Test Script: Executed"

if [[ $test_result -eq 0 ]]; then
    log_success "All CLI workflow tests passed!"
else
    log_error "Some CLI workflow tests failed"
fi

exit $test_result 