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
STATE_FILE="./fixtures/sftp-test-input.json"
OUTPUT_FILE="./outputs/simple-sftp-output-$(date +%Y%m%d_%H%M%S).json"

# Ensure we're in the right directory
cd "$(dirname "$0")"
mkdir -p outputs

echo "📊 State file: $STATE_FILE"
echo "💾 Output: $OUTPUT_FILE"
echo ""

# Create a simple job inline
JOB_EXPRESSION="list('/data/excel-files', state => { console.log('Files:', state.data); return state; });"

# Run the job directly using CLI
echo "🚀 Running simple SFTP job..."
docker run --rm -i \
    -v "$(pwd)/fixtures:/fixtures" \
    -v "$(pwd)/outputs:/outputs" \
    "$DOCKER_IMAGE" /bin/sh -c "
        # Create temporary job file
        echo \"$JOB_EXPRESSION\" > /tmp/simple-job.js
        
        # Run with OpenFN CLI
        openfn /tmp/simple-job.js \
            -a sftp@2.0.14 \
            -s /fixtures/sftp-test-input.json \
            -o /outputs/$(basename "$OUTPUT_FILE")
    "

# Check results
if [[ -f "$OUTPUT_FILE" ]]; then
    echo ""
    echo -e "${GREEN}✅ Job completed successfully!${NC}"
    echo ""
    echo "📄 Output preview:"
    cat "$OUTPUT_FILE" | jq -r '.data | length' | xargs -I {} echo "Found {} files"
    cat "$OUTPUT_FILE" | jq -r '.data[].name' 2>/dev/null | head -10
    echo ""
    echo "💡 Full output saved to: $OUTPUT_FILE"
else
    echo -e "${RED}❌ Job failed - no output file created${NC}"
    exit 1
fi 