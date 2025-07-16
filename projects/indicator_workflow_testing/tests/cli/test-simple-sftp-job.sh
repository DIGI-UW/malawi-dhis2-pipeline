#!/bin/bash
# Simple inline SFTP job test - using proven working syntax

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing Simple SFTP Job (inline expression)${NC}"
echo "=============================================="

# Configuration
DOCKER_IMAGE="openfn-cli-test:latest"
WORKFLOW_STATE_FILE="../../../openfn-workflows/workflows/sftp-test/state/sftp-test-state.json"
OUTPUT_FILE="./outputs/simple-sftp-output.json"

# Ensure we're in the right directory
cd "$(dirname "$0")"
mkdir -p outputs

echo "📊 Workflow state file: $WORKFLOW_STATE_FILE"
echo "💾 Output: $OUTPUT_FILE"
echo ""

# Run the job directly using CLI with state file containing credentials
echo "🚀 Running simple SFTP job with unified state file..."
docker run --rm -i \
    -v "$(pwd)/../../../openfn-workflows/workflows/sftp-test/state:/state" \
    -v "$(pwd)/outputs:/outputs" \
    "$DOCKER_IMAGE" /bin/sh <<EOF
# Create temporary job file
echo "list('/data/excel-files', state => { console.log('Files:', state.data); return state; });" > /tmp/simple-job.js

# Run with OpenFN CLI using state file with embedded credentials
openfn /tmp/simple-job.js \
    -a sftp@2.0.14 \
    -s /state/sftp-test-state.json \
    -o /outputs/simple-sftp-output.json
EOF

# Check results
echo ""
echo "🔍 Checking job results..."

if [[ ! -f "$OUTPUT_FILE" ]]; then
    echo -e "${RED}❌ Job failed - no output file created${NC}"
    exit 1
fi

# Check for errors in the output file
if jq -e '.errors' "$OUTPUT_FILE" >/dev/null 2>&1; then
    echo -e "${RED}❌ Job failed with errors in output${NC}"
    echo ""
    echo "📄 Error details:"
    jq -r '.errors' "$OUTPUT_FILE"
    echo ""
    echo "📄 Full output:"
    cat "$OUTPUT_FILE"
    echo ""
    exit 1
fi

# Check for "Invalid username" or other authentication errors in the output
if grep -q "Invalid username\|authentication failed\|connection failed" "$OUTPUT_FILE" 2>/dev/null; then
    echo -e "${RED}❌ Job failed with authentication error${NC}"
    echo ""
    echo "📄 Error details:"
    grep -i "invalid username\|authentication failed\|connection failed" "$OUTPUT_FILE"
    echo ""
    echo "📄 Full output:"
    cat "$OUTPUT_FILE"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Job completed successfully!${NC}"
echo ""
echo "📄 Output preview:"
cat "$OUTPUT_FILE" | jq -r '.data | length' | xargs -I {} echo "Found {} files"
cat "$OUTPUT_FILE" | jq -r '.data[].name' 2>/dev/null | head -10
echo ""
echo "💡 Full output saved to: $OUTPUT_FILE"