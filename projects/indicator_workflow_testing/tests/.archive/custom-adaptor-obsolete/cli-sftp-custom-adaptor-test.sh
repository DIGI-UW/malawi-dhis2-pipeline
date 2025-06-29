#!/bin/bash

# OpenFN CLI Test with Custom SFTP Adaptor
# Uses the project structure approach that successfully loads the custom adaptor

set -e

# Get script directory and load common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/common.sh"

# Configuration
PROJECT_ROOT="/home/ubuntu/code/malawi-dhis2-pipeline"
WORKFLOWS_DIR="$PROJECT_ROOT/projects/openfn-workflows"

log_info "🧪 OpenFN CLI Custom SFTP Adaptor Test"
log_info "Testing with version 2.0.14-custom to fix module loading issues"
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

# Check if the CLI test container exists
if ! docker images | grep -q "openfn-cli-test.*latest"; then
    log_error "OpenFN CLI test container not found"
    log_info "Build it with: cd $WORKFLOWS_DIR && docker build -f Dockerfile.cli -t openfn-cli-test:latest ."
    exit 1
else
    log_success "CLI test container found"
fi

# Check SFTP service
log_info "Checking SFTP service..."
SFTP_HOST="172.17.0.1"  # Docker bridge IP
SFTP_PORT="2225"

if nc -z $SFTP_HOST $SFTP_PORT > /dev/null 2>&1; then
    log_success "SFTP service is accessible on $SFTP_HOST:$SFTP_PORT"
else
    log_warning "SFTP service not accessible on $SFTP_HOST:$SFTP_PORT"
    log_info "Make sure SFTP server is running"
fi

echo ""
log_info "Running OpenFN CLI with custom SFTP adaptor..."
echo "================================================"

# Create test timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEST_DIR="$WORKFLOWS_DIR/test-results/custom-sftp-$TIMESTAMP"
mkdir -p "$TEST_DIR"

# Run the working command that uses project structure
docker run --rm -it \
    -v "$WORKFLOWS_DIR/tests/e2e:/e2e" \
    -v "$TEST_DIR:/output" \
    openfn-cli-test:latest /bin/sh -c "
# Create project structure
mkdir -p /tmp/myproject/workflows/sftp-test

# Create openfn.json configuration
cat > /tmp/myproject/openfn.json << 'EOF'
{
  \"workflowRoot\": \"workflows\",
  \"formats\": {
    \"workflow\": \"json\"
  }
}
EOF

# Create workflow file with SFTP connection test
cat > /tmp/myproject/workflows/sftp-test/sftp-test.json << 'EOF'
{
  \"id\": \"sftp-test\",
  \"name\": \"SFTP Connection Test\",
  \"steps\": [
    {
      \"id\": \"connect-and-list\",
      \"name\": \"Connect to SFTP and List Files\",
      \"adaptor\": \"@openfn/language-sftp@2.0.14-custom\",
      \"expression\": \"console.log('=== SFTP Custom Adaptor Test ===');\\nconsole.log('Using version 2.0.14-custom with fixes');\\nconsole.log('Attempting to connect to SFTP server...');\\n\\nlist('/', (state) => {\\n  console.log('✅ Connection successful!');\\n  console.log('Files found:', state.data);\\n  return { ...state, success: true, timestamp: new Date().toISOString() };\\n});\"
    }
  ]
}
EOF

# Change to temp directory and run workflow
cd /tmp
echo 'Project structure created:'
ls -la myproject/workflows/sftp-test/

echo ''
echo 'Running workflow with custom SFTP adaptor...'
openfn myproject sftp-test -i /e2e/sftp-check-input.json -o /output/result.json 2>&1 | tee /output/test.log
"

# Check results
echo ""
log_info "Checking test results..."

if [[ -f "$TEST_DIR/result.json" ]]; then
    log_success "Output file created"
    
    # Check if the test was successful
    if jq -e '.success == true' "$TEST_DIR/result.json" > /dev/null 2>&1; then
        log_success "SFTP connection test passed!"
        
        # Show results summary
        echo ""
        log_info "Test Results:"
        jq '{
            success: .success,
            timestamp: .timestamp,
            files_found: (.data | length),
            sample_files: .data[:3]
        }' "$TEST_DIR/result.json" 2>/dev/null || echo "Could not parse results"
    else
        log_error "SFTP connection test failed"
        
        # Show error details
        if [[ -f "$TEST_DIR/test.log" ]]; then
            echo ""
            log_info "Error details from log:"
            grep -i "error\|failed\|invalid" "$TEST_DIR/test.log" | head -10
        fi
    fi
else
    log_error "No output file created"
fi

# Show CLI version info from log
if grep -q "@openfn/language-sftp.*2.0.14-custom" "$TEST_DIR/test.log" 2>/dev/null; then
    log_success "Custom SFTP adaptor version 2.0.14-custom loaded successfully"
else
    log_warning "Could not confirm custom adaptor version"
fi

echo ""
log_info "Test artifacts saved to: $TEST_DIR"
log_info "  - result.json: Workflow output"
log_info "  - test.log: Full execution log"

# Summary
echo ""
log_info "Test Summary:"
log_info "============="
if [[ -f "$TEST_DIR/result.json" ]] && jq -e '.success == true' "$TEST_DIR/result.json" > /dev/null 2>&1; then
    log_success "✅ Custom SFTP adaptor is working correctly!"
    log_info "The module loading issue has been resolved."
    exit 0
else
    log_error "❌ Custom SFTP adaptor test failed"
    log_info "Check the logs for details: $TEST_DIR/test.log"
    exit 1
fi 