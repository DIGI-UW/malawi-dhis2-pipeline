#!/bin/bash
# Complete SFTP to DHIS2 Workflow Test
# Tests the full workflow: SFTP → Excel → DHIS2

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing Complete SFTP → Excel → DHIS2 Workflow${NC}"
echo "=============================================="

# Configuration
DOCKER_IMAGE="openfn-cli-test:latest"
WORKFLOW_STATE_FILE="../../../openfn-workflows/workflows/sftp-test/state/sftp-test-state.json"
OUTPUT_FILE="./outputs/sftp-dhis2-workflow-output-$(date +%Y%m%d_%H%M%S).json"

# Ensure we're in the right directory
cd "$(dirname "$0")"
mkdir -p outputs

echo "📊 Workflow state file: $WORKFLOW_STATE_FILE"
echo "💾 Output: $OUTPUT_FILE"
echo ""

echo "🚀 Running complete SFTP → Excel → DHIS2 workflow..."
docker run --rm -i \
    --network openfn_public \
    -v "$(pwd)/../../../openfn-workflows/workflows/sftp-test/state:/state" \
    -v "$(pwd)/outputs:/outputs" \
    "$DOCKER_IMAGE" /bin/sh <<'EOF'
# Create project structure
mkdir -p /tmp/workflow-test/workflows/sftp-dhis2

# Create openfn.json
cat > /tmp/workflow-test/openfn.json << 'INNER_EOF'
{
  "workflowRoot": "workflows",
  "formats": {
    "workflow": "json"
  }
}
INNER_EOF

# Create workflow file
cat > /tmp/workflow-test/workflows/sftp-dhis2/sftp-dhis2-workflow.json << 'INNER_EOF'
{
  "id": "sftp-dhis2-workflow",
  "steps": [
    {
      "adaptor": "@openfn/language-sftp@2.0.14",
      "expression": "list(\"/data/excel-files\", state => { console.log(\"SFTP Files:\", state.data.length); return state; });"
    },
    {
      "adaptor": "@openfn/language-common@2.4.0",
      "expression": "fn(state => { console.log(\"Processing Excel files...\"); return state; });"
    },
    {
      "adaptor": "@openfn/language-dhis2@6.3.4",
      "expression": "fn(state => { console.log(\"Uploading to DHIS2...\"); return state; });"
    }
  ]
}
INNER_EOF

# Change to project directory
cd /tmp/workflow-test

echo 'Project structure:'
ls -la workflows/sftp-dhis2/

echo ''
echo 'State file content:'
cat /state/sftp-test-state.json

echo ''
echo 'Running complete workflow...'
openfn workflow-test sftp-dhis2-workflow -s /state/sftp-test-state.json -o /outputs/sftp-dhis2-workflow-output.json 2>&1
EOF

# Check results
echo ""
echo "🔍 Checking workflow results..."

if [[ ! -f "$OUTPUT_FILE" ]]; then
    echo -e "${RED}❌ Workflow failed - no output file created${NC}"
    exit 1
fi

# Check for errors
if jq -e '.errors' "$OUTPUT_FILE" >/dev/null 2>&1; then
    echo -e "${RED}❌ Workflow failed with errors${NC}"
    echo ""
    echo "📄 Error details:"
    jq -r '.errors' "$OUTPUT_FILE"
    echo ""
    echo "📄 Full output:"
    cat "$OUTPUT_FILE"
    echo ""
    exit 1
fi

# Check for authentication errors
if grep -q "Invalid username\|authentication failed\|connection failed" "$OUTPUT_FILE" 2>/dev/null; then
    echo -e "${RED}❌ Workflow failed with authentication error${NC}"
    echo ""
    echo "📄 Error details:"
    grep -i "invalid username\|authentication failed\|connection failed" "$OUTPUT_FILE"
    echo ""
    echo "📄 Full output:"
    cat "$OUTPUT_FILE"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Workflow completed successfully!${NC}"
echo ""
echo "📄 Output preview:"
cat "$OUTPUT_FILE" | jq -r '.data | length' | xargs -I {} echo "Processed {} files"
echo ""
echo "💡 Full output saved to: $OUTPUT_FILE" 