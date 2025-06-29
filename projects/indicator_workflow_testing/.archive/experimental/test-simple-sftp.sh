#!/bin/bash
# Simple SFTP Test for Docker Container Environment

set -e

echo "🧪 Simple SFTP Connection Test"
echo "==============================="
echo ""

# Set up test environment
export TIMESTAMP=$(date +%Y%m%d_%H%M%S) 
export TEST_DIR="./test-results/simple-$TIMESTAMP"

# Create test directory
mkdir -p "$TEST_DIR"

echo "📁 Test Directory: $TEST_DIR"
echo ""

# Update SFTP configuration with host IP (container should use host.docker.internal)
echo "🔧 Updating SFTP configuration..."
sed -i.bak 's/"host": "[^"]*"/"host": "host.docker.internal"/' tests/e2e/sftp-check-input.json

echo "📋 Current SFTP Configuration:"
cat tests/e2e/sftp-check-input.json
echo ""

# Find the first job file
JOB_DIR="workflows/sftp-dhis2/extracted/2025-06-28_01-29-52"
JOB_FILE="$JOB_DIR/job-0-Check-SFTP-for-New-or-Updated-Files.js"

if [[ -f "$JOB_FILE" ]]; then
    echo "🚀 Running SFTP connection test with job: $JOB_FILE"
    echo ""
    
    # Set environment for OpenFN CLI
    export OPENFN_REPO_DIR="/workspace"
    
    # Run the SFTP test directly
    openfn run "$JOB_FILE" \
        -s "tests/e2e/sftp-check-input.json" \
        -o "$TEST_DIR/sftp-test-output.json" \
        --log debug \
        --modulePath /adaptors/node_modules \
        --no-config \
        2>&1 | tee "$TEST_DIR/sftp-test-log.txt"
    
    # Check results
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo ""
        echo "✅ SFTP test completed successfully!"
        echo ""
        echo "📊 Output Summary:"
        jq '.' "$TEST_DIR/sftp-test-output.json" 2>/dev/null || echo "Could not parse output"
    else
        echo ""
        echo "❌ SFTP test failed!"
        echo "Check log: $TEST_DIR/sftp-test-log.txt"
        exit 1
    fi
else
    echo "❌ Job file not found: $JOB_FILE"
    echo "Available files:"
    find workflows/ -name "*.js" | head -5
    exit 1
fi

echo ""
echo "🎉 Simple SFTP test completed!" 