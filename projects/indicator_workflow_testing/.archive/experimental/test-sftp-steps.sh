#!/bin/bash
# Step-by-step SFTP-to-DHIS2 Test using OpenFN CLI Container

set -e

echo "🚀 Step-by-Step OpenFN CLI Test"
echo "==============================="
echo ""

# Set up test environment
export TIMESTAMP=$(date +%Y%m%d_%H%M%S)
export TEST_DIR="test-results/$TIMESTAMP"
export JOB_DIR="workflows/sftp-dhis2/extracted/2025-06-28_01-29-52"

# Create test directory
mkdir -p "$TEST_DIR"

echo "📁 Test Directory: $TEST_DIR"
echo "🔧 Job Directory: $JOB_DIR"
echo ""

# Update SFTP configuration to use correct host
echo "🔧 Preparing SFTP configuration..."
cp tests/e2e/sftp-check-input.json "$TEST_DIR/initial-state.json"

# For Docker container, we need to use the Docker bridge IP
sed -i 's/"host": "[^"]*"/"host": "172.17.0.1"/' "$TEST_DIR/initial-state.json"

echo "📋 Initial State:"
cat "$TEST_DIR/initial-state.json" | jq '.'
echo ""

# Function to run a single step
run_step() {
    local STEP_NUM="$1"
    local JOB_NAME="$2"
    local INPUT_STATE="$3"
    local OUTPUT_STATE="$4"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔄 Step $STEP_NUM: $JOB_NAME"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Run the step using our custom CLI container with pre-installed adaptors
    docker run --rm \
        --network host \
        -v "$(pwd):/workspace" \
        -w /workspace \
        openfn-cli-test:latest \
        openfn "$JOB_DIR/job-$STEP_NUM-$JOB_NAME.js" \
            -s "$INPUT_STATE" \
            -o "$OUTPUT_STATE" \
            -a sftp@2.0.14-custom \
            -a common \
            --autoinstall false \
        2>&1 | tee "$TEST_DIR/step-$STEP_NUM.log"
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo "✅ Step $STEP_NUM completed successfully"
        echo ""
        echo "📊 Output preview:"
        jq '{
            has_data: (.data != null),
            data_type: .data | type,
            data_keys: .data | if type == "object" then keys else "not an object" end,
            errors: .errors
        }' "$OUTPUT_STATE" 2>/dev/null || echo "Could not parse output"
        echo ""
        return 0
    else
        echo "❌ Step $STEP_NUM failed!"
        echo "Check log: $TEST_DIR/step-$STEP_NUM.log"
        return 1
    fi
}

# Execute the workflow step by step
echo "🎯 Starting Step-by-Step Execution..."
echo ""

# Step 0: Check SFTP for New Files
if run_step 0 "Check-SFTP-for-New-or-Updated-Files" \
    "$TEST_DIR/initial-state.json" \
    "$TEST_DIR/step-0-output.json"; then
    
    # Step 1: Download New SFTP Files
    if run_step 1 "Download-New-SFTP-Files" \
        "$TEST_DIR/step-0-output.json" \
        "$TEST_DIR/step-1-output.json"; then
        
        # Step 2: Process Excel Data
        if run_step 2 "Process-Excel-Data" \
            "$TEST_DIR/step-1-output.json" \
            "$TEST_DIR/step-2-output.json"; then
            
            # Step 3: Generate DHIS2 Payload
            if run_step 3 "Generate-DHIS2-Payload" \
                "$TEST_DIR/step-2-output.json" \
                "$TEST_DIR/step-3-output.json"; then
                
                echo "🎉 All transformation steps completed successfully!"
                echo ""
                echo "📊 DHIS2 Payload Preview:"
                jq '.data | if type == "array" then {
                    total_records: length,
                    first_record: .[0]
                } else . end' "$TEST_DIR/step-3-output.json" 2>/dev/null || echo "Could not parse payload"
                
                # Optional: Test DHIS2 connectivity
                echo ""
                echo "🔐 Testing DHIS2 connectivity..."
                if curl -s -m 10 -u "admin:district" http://127.0.0.1:8080/api/system/info > /dev/null 2>&1; then
                    echo "✅ DHIS2 is accessible"
                    echo ""
                    echo "💡 To upload data to DHIS2, run:"
                    echo "   docker run --rm --network host -v \$(pwd):/workspace -w /workspace openfn-cli-test:latest \\"
                    echo "     openfn $JOB_DIR/job-4-Upload-to-DHIS2.js \\"
                    echo "     -s $TEST_DIR/step-3-output.json \\"
                    echo "     -o $TEST_DIR/step-4-output.json \\"
                    echo "     -a @openfn/language-http \\"
                    echo "     -a @openfn/language-common \\"
                    echo "     --autoinstall false"
                else
                    echo "⚠️  DHIS2 not accessible at http://127.0.0.1:8080"
                fi
            fi
        fi
    fi
fi

echo ""
echo "📁 Test Results:"
ls -la "$TEST_DIR/"

echo ""
echo "🔍 Debug Commands:"
echo "  View step output: jq . $TEST_DIR/step-N-output.json"
echo "  View step logs: less $TEST_DIR/step-N.log"
echo ""
echo "✨ Test execution completed!" 