#!/bin/bash
# Test the check-sftp-files.js job directly from sftp-dhis2 workflow
# This bypasses YAML->JSON conversion issues

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing check-sftp-files.js from sftp-dhis2 workflow${NC}"
echo "=================================================="

# Configuration
DOCKER_IMAGE="openfn-cli-test:latest"
PROJECT_ROOT="/home/ubuntu/code/malawi-dhis2-pipeline"
JOB_FILE="$PROJECT_ROOT/projects/openfn-workflows/workflows/sftp-dhis2/jobs/check-sftp-files.js"
STATE_FILE="./fixtures/sftp-test-input.json"
OUTPUT_FILE="./outputs/check-sftp-output-$(date +%Y%m%d_%H%M%S).json"

# Ensure we're in the right directory
cd "$(dirname "$0")"
mkdir -p outputs

# Check if job file exists locally
if [[ ! -f "$JOB_FILE" ]]; then
    echo -e "${RED}❌ Job file not found: $JOB_FILE${NC}"
    exit 1
fi

echo "📋 Job file: $JOB_FILE"
echo "📊 State file: $STATE_FILE"
echo "💾 Output: $OUTPUT_FILE"
echo ""

# Run the job directly using CLI
echo "🚀 Running job with OpenFN CLI..."
docker run --rm -it \
    -v "$PROJECT_ROOT:/workspace" \
    -v "$(pwd)/fixtures:/fixtures" \
    -v "$(pwd)/outputs:/outputs" \
    "$DOCKER_IMAGE" \
    openfn /workspace/projects/openfn-workflows/workflows/sftp-dhis2/jobs/check-sftp-files.js \
        -a sftp@2.0.14 \
        -s /fixtures/sftp-test-input.json \
        -o /outputs/$(basename "$OUTPUT_FILE") \
        --log info

# Check results
if [[ -f "$OUTPUT_FILE" ]]; then
    echo ""
    echo -e "${GREEN}✅ Job completed successfully!${NC}"
    echo ""
    echo "📄 Output preview:"
    cat "$OUTPUT_FILE" | jq -r '.data | if type == "array" then "Found \(length) files" else . end' 2>/dev/null || cat "$OUTPUT_FILE" | head -20
    echo ""
    echo "💡 Full output saved to: $OUTPUT_FILE"
else
    echo -e "${RED}❌ Job failed - no output file created${NC}"
    exit 1
fi 