#!/bin/bash
# Full SFTP-to-DHIS2 Workflow Test with Step Caching

set -e

echo "🚀 Full Workflow Test: SFTP → DHIS2 with Step Caching"
echo "======================================================"
echo ""

# Set up test environment
export TIMESTAMP=$(date +%Y%m%d_%H%M%S)
export TEST_DIR="./test-results/$TIMESTAMP"
export CACHE_DIR="./.cli-cache/sftp-dhis2"

# Create test directories
mkdir -p "$TEST_DIR"
mkdir -p "$CACHE_DIR"

echo "📁 Test Directory: $TEST_DIR"
echo "💾 Cache Directory: $CACHE_DIR"
echo ""

# Update SFTP configuration with host IP
echo "🔧 Updating SFTP configuration..."
sed -i.bak 's/"host": "[^"]*"/"host": "172.17.0.1"/' tests/e2e/sftp-check-input.json

# Function to run a step and save output
run_step() {
    local STEP_NAME="$1"
    local STEP_INDEX="$2"
    local JOB_FILE="$3"
    local INPUT_STATE="$4"
    
    echo ""
    echo "🔄 Running Step $STEP_INDEX: $STEP_NAME"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Use openfn-dev to run the step
    ./openfn-dev openfn run "$JOB_FILE" \
        -s "$INPUT_STATE" \
        -o "$TEST_DIR/step-${STEP_INDEX}-output.json" \
        -a sftp,http,common \
        --log debug \
        --cache-steps \
        --modulePath /adaptors/node_modules \
        2>&1 | tee "$TEST_DIR/step-${STEP_INDEX}-log.txt"
    
    # Check if the step succeeded
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo "✅ Step $STEP_INDEX completed successfully"
        
        # Copy cached output if it exists
        if [ -f "$CACHE_DIR/job-${STEP_INDEX}.json" ]; then
            cp "$CACHE_DIR/job-${STEP_INDEX}.json" "$TEST_DIR/step-${STEP_INDEX}-cached.json"
        fi
        
        # Pretty print the output summary
        echo "📊 Output Summary:"
        jq '{
            data_type: .data | type,
            data_keys: .data | if type == "object" then keys else "not an object" end,
            array_length: .data | if type == "array" then length else "not an array" end,
            fileTracking: .fileTracking | keys? // "no file tracking",
            errors: .errors? // "no errors"
        }' "$TEST_DIR/step-${STEP_INDEX}-output.json" 2>/dev/null || echo "Could not parse output"
    else
        echo "❌ Step $STEP_INDEX failed!"
        return 1
    fi
}

# Run the workflow steps in sequence
echo "🎯 Starting Workflow Execution..."

# Find job files
JOB_DIR="workflows/sftp-dhis2/extracted/2025-06-28_01-29-52"

# Step 0: Check SFTP for New Files
run_step "Check SFTP for New Files" 0 \
    "$JOB_DIR/job-0-Check-SFTP-for-New-or-Updated-Files.js" \
    "tests/e2e/sftp-check-input.json"

# Step 1: Download New SFTP Files (using output from step 0)
run_step "Download New SFTP Files" 1 \
    "$JOB_DIR/job-1-Download-New-SFTP-Files.js" \
    "$TEST_DIR/step-0-output.json"

# Step 2: Process Excel Data
run_step "Process Excel Data" 2 \
    "$JOB_DIR/job-2-Process-Excel-Data.js" \
    "$TEST_DIR/step-1-output.json"

# Step 3: Generate DHIS2 Payload
run_step "Generate DHIS2 Payload" 3 \
    "$JOB_DIR/job-3-Generate-DHIS2-Payload.js" \
    "$TEST_DIR/step-2-output.json"

# Step 4: Upload to DHIS2
echo ""
echo "⚠️  Step 4: Upload to DHIS2 (Preview Mode)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 DHIS2 Payload Preview:"
jq '.data | if type == "array" then {
    total_records: length,
    first_record: .[0],
    data_elements: .[0] | if type == "object" then keys else "not an object" end
} else . end' "$TEST_DIR/step-3-output.json" 2>/dev/null || echo "Could not parse DHIS2 payload"

echo ""
echo "🔐 DHIS2 Connection Test:"
# Test DHIS2 connectivity
curl -s -u "admin:district" http://127.0.0.1:8080/api/system/info | jq '.version' || echo "DHIS2 not accessible"

# Uncomment to actually upload to DHIS2
# run_step "Upload to DHIS2" 4 \
#     "$JOB_DIR/job-4-Upload-to-DHIS2.js" \
#     "$TEST_DIR/step-3-output.json"

# Step 5: Update File Tracking State
# run_step "Update File Tracking" 5 \
#     "$JOB_DIR/job-5-Update-File-Tracking-State.js" \
#     "$TEST_DIR/step-4-output.json"

echo ""
echo "📊 Test Summary"
echo "=============="
echo "Test Directory: $TEST_DIR"
echo "Cache Directory: $CACHE_DIR"
echo ""
echo "📁 Generated Files:"
ls -la "$TEST_DIR"

echo ""
echo "💡 Debug Tips:"
echo "- View step output: cat $TEST_DIR/step-X-output.json | jq"
echo "- View step logs: less $TEST_DIR/step-X-log.txt"
echo "- View cached states: ls -la $CACHE_DIR"
echo ""
echo "🎉 Workflow test completed!" 