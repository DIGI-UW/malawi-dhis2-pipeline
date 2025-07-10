#!/bin/bash

# Comprehensive End-to-End Test for OpenFN Workflows
# Tests complete SFTP → Excel → DHIS2 pipeline with bundled files
# Consolidated from openfn-workflows/scripts/test-end-to-end.sh

set -e

# Get script directory and load utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../utils/common.sh"

# Test configuration
TESTS_DIR="$SCRIPT_DIR/../fixtures"
OUTPUTS_DIR="$SCRIPT_DIR/outputs"
DOCKER_IMAGE="openfn-cli-test:latest"

# Ensure directories exist
mkdir -p "$OUTPUTS_DIR"

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
    # Extract host and port from DHIS2_URL
    DHIS2_HOST=$(echo "$DHIS2_URL" | sed -E 's|^https?://||' | cut -d':' -f1)
    DHIS2_PORT=$(echo "$DHIS2_URL" | sed -E 's|^https?://||' | cut -d':' -f2 | cut -d'/' -f1)
    # Default to port 80 for http or 443 for https if no port specified
    if [[ "$DHIS2_PORT" == "$DHIS2_HOST" ]]; then
        if [[ "$DHIS2_URL" =~ ^https:// ]]; then
            DHIS2_PORT=443
        else
            DHIS2_PORT=80
        fi
    fi
    
    if timeout 10s bash -c "echo > /dev/tcp/$DHIS2_HOST/$DHIS2_PORT" 2>/dev/null; then
        log_success "✅ DHIS2 service is accessible"
    else
        log_warning "⚠️  DHIS2 service not accessible at $DHIS2_URL"
        log_info "DHIS2 may not be required for all tests"
    fi
    
    # Check Docker image
    if docker image inspect "$DOCKER_IMAGE" >/dev/null 2>&1; then
        log_success "✅ Docker test image available"
    else
        log_error "❌ Docker image not found: $DOCKER_IMAGE"
        log_info "Build with: ./build-custom-images.sh openfn-cli-test"
        return 1
    fi
    
    return 0
}

# Function to verify SFTP has bundled files
verify_bundled_files() {
    log_step "Verifying bundled Excel files on SFTP..."
    
    # Create state file for SFTP check
    local state_file="$OUTPUTS_DIR/sftp-verify-state.json"
    cat > "$state_file" << EOF
{
  "data": [],
  "configuration": {
    "host": "$SFTP_HOST",
    "port": $SFTP_PORT,
    "username": "$SFTP_USER",
    "password": "$SFTP_PASSWORD"
  }
}
EOF
    
    # List files using OpenFN CLI
    log_info "Checking for bundled Excel files on SFTP server..."
    
    if docker run --rm \
        -v "$SCRIPT_DIR:/work" \
        -v "$OUTPUTS_DIR:/outputs" \
        --add-host=host.docker.internal:host-gateway \
        "$DOCKER_IMAGE" /bin/sh -c "
            cd /work
            openfn -s /outputs/sftp-verify-state.json \
                -a @openfn/language-sftp@2.0.14 \
                -e \"list('/data/excel-files', (state) => {
                    const xlsxFiles = state.data.filter(f => f.name.endsWith('.xlsx'));
                    console.log('Excel files found:', xlsxFiles.length);
                    xlsxFiles.forEach(f => console.log('  -', f.name, '(' + (f.size/1024/1024).toFixed(1) + 'MB)'));
                    return state;
                });\"
        " > "$OUTPUTS_DIR/sftp-verify.log" 2>&1; then
        
        # Check results
        if grep -q "Excel files found:" "$OUTPUTS_DIR/sftp-verify.log"; then
            local file_count=$(grep "Excel files found:" "$OUTPUTS_DIR/sftp-verify.log" | awk '{print $4}')
            log_success "✅ Found $file_count Excel file(s) on SFTP"
            
            # Check for specific expected files
            if grep -q "ART_data_long_format.xlsx" "$OUTPUTS_DIR/sftp-verify.log"; then
                log_success "  ✅ ART_data_long_format.xlsx found"
            fi
            
            if grep -q "Q2FY25_DQ_253_sites.xlsx" "$OUTPUTS_DIR/sftp-verify.log"; then
                log_success "  ✅ Q2FY25_DQ_253_sites.xlsx found"
            fi
            
            if grep -q "Direct Queries" "$OUTPUTS_DIR/sftp-verify.log"; then
                log_success "  ✅ Direct Queries file found"
            fi
            
            return 0
        else
            log_warning "⚠️  Could not verify Excel files on SFTP"
            cat "$OUTPUTS_DIR/sftp-verify.log"
            return 1
        fi
    else
        log_error "❌ Failed to check SFTP files"
        cat "$OUTPUTS_DIR/sftp-verify.log"
        return 1
    fi
}

# Function to test complete workflow
test_complete_workflow() {
    log_step "Testing complete SFTP → Excel → DHIS2 workflow..."
    
    # Use the existing comprehensive workflow test
    if [[ -f "$SCRIPT_DIR/test-sftp-dhis2-workflow.sh" ]]; then
        bash "$SCRIPT_DIR/test-sftp-dhis2-workflow.sh"
        return $?
    else
        log_error "Workflow test script not found"
        return 1
    fi
}

# Function to test DHIS2 connection
test_dhis2_connection() {
    log_step "Testing DHIS2 connection..."
    
    # Create state file for DHIS2 check
    local state_file="$OUTPUTS_DIR/dhis2-check-state.json"
    cat > "$state_file" << EOF
{
  "data": {},
  "configuration": {
    "baseUrl": "$DHIS2_URL/api",
    "username": "$DHIS2_USER",
    "password": "$DHIS2_PASS"
  }
}
EOF
    
    log_info "Checking DHIS2 API accessibility..."
    
    if docker run --rm \
        -v "$OUTPUTS_DIR:/outputs" \
        --add-host=host.docker.internal:host-gateway \
        "$DOCKER_IMAGE" /bin/sh -c "
            openfn -s /outputs/dhis2-check-state.json \
                -a @openfn/language-dhis2@4.0.3 \
                -e \"get('system/info', {}, (state) => {
                    console.log('DHIS2 Version:', state.data.version);
                    console.log('Build:', state.data.build);
                    return state;
                });\"
        " > "$OUTPUTS_DIR/dhis2-check.log" 2>&1; then
        
        if grep -q "DHIS2 Version:" "$OUTPUTS_DIR/dhis2-check.log"; then
            log_success "✅ DHIS2 API connection successful"
            grep "DHIS2 Version:" "$OUTPUTS_DIR/dhis2-check.log"
            return 0
        else
            log_warning "⚠️  DHIS2 API response unclear"
            return 1
        fi
    else
        log_warning "⚠️  DHIS2 API not accessible"
        return 1
    fi
}

# Main execution
main() {
    echo ""
    log_info "🧪 OpenFN Comprehensive End-to-End Testing"
    log_info "=========================================="
    echo ""
    
    # Display configuration
    log_info "Using configuration:"
    log_info "  SFTP: $SFTP_USER@$SFTP_HOST:$SFTP_PORT"
    log_info "  DHIS2: $DHIS2_URL"
    log_info "  Docker Image: $DOCKER_IMAGE"
    echo ""
    
    # Run tests
    local all_passed=true
    
    # Check services
    if check_services; then
        log_success "✅ All required services accessible"
    else
        log_error "❌ Service check failed"
        all_passed=false
    fi
    
    echo ""
    
    # Verify bundled files
    if verify_bundled_files; then
        log_success "✅ Bundled files verified"
    else
        log_warning "⚠️  Bundled files verification had issues"
        all_passed=false
    fi
    
    echo ""
    
    # Test DHIS2 connection (optional)
    if test_dhis2_connection; then
        log_success "✅ DHIS2 connection test passed"
    else
        log_warning "⚠️  DHIS2 connection test failed (may not be required)"
    fi
    
    echo ""
    
    # Run complete workflow test
    if test_complete_workflow; then
        log_success "✅ Complete workflow test passed"
    else
        log_error "❌ Complete workflow test failed"
        all_passed=false
    fi
    
    echo ""
    
    # Summary
    if $all_passed; then
        log_success "🎉 All end-to-end tests completed successfully!"
        log_info "Results saved in: $OUTPUTS_DIR"
        return 0
    else
        log_error "❌ Some tests failed. Check the logs above."
        return 1
    fi
}

# Run main function
main "$@"