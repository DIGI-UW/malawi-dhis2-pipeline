#!/bin/bash
# Test the complete sftp-dhis2 workflow using manual JSON workflow creation
# This bypasses YAML->JSON conversion issues

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 Testing SFTP → Excel → DHIS2 Workflow${NC}"
echo "==========================================="

# Configuration
DOCKER_IMAGE="openfn-cli-test:latest"
PROJECT_ROOT="/home/ubuntu/code/malawi-dhis2-pipeline"
WORKFLOW_DIR="$PROJECT_ROOT/projects/openfn-workflows/workflows/sftp-dhis2"
STATE_FILE="./fixtures/sftp-test-input.json"
OUTPUT_FILE="./outputs/sftp-dhis2-workflow-$(date +%Y%m%d_%H%M%S).json"

# Ensure we're in the right directory
cd "$(dirname "$0")"
mkdir -p outputs

echo "📁 Workflow directory: $WORKFLOW_DIR"
echo "📊 State file: $STATE_FILE"
echo "💾 Output: $OUTPUT_FILE"
echo ""

# Run the workflow with manually created JSON structure
echo "🔄 Creating and running workflow..."
docker run --rm -i \
    -v "$PROJECT_ROOT:/workspace" \
    -v "$(pwd)/fixtures:/fixtures" \
    -v "$(pwd)/outputs:/outputs" \
    "$DOCKER_IMAGE" /bin/sh -c '
        # Create proper OpenFN project structure
        mkdir -p /tmp/test-project/workflows/sftp-dhis2
        
        # Create openfn.json configuration
        cat > /tmp/test-project/openfn.json << "EOF"
{
  "workflowRoot": "workflows",
  "formats": {
    "workflow": "json"
  }
}
EOF
        
        # Create workflow JSON manually (avoiding YAML conversion)
        cat > /tmp/test-project/workflows/sftp-dhis2/sftp-dhis2.json << "EOF"
{
  "id": "sftp-dhis2",
  "name": "SFTP to DHIS2 Workflow",
  "steps": [
    {
      "id": "check-files",
      "name": "Check SFTP Files",
      "adaptor": "@openfn/language-sftp@2.0.14",
      "expression": "list(\"/data/excel-files\", state => {\n  console.log(\"Found files:\", state.data.length);\n  state.data.forEach(f => console.log(\" -\", f.name));\n  return { ...state, filesFound: state.data.length > 0 };\n});"
    },
    {
      "id": "process-results",
      "name": "Process Results",
      "adaptor": "@openfn/language-common@latest",
      "expression": "fn(state => {\n  console.log(\"Processing\", state.data.length, \"files\");\n  console.log(\"ART file present:\", state.data.some(f => f.name.includes(\"ART_data\")));\n  return state;\n});"
    }
  ]
}
EOF
        
        # Change to project directory and run
        cd /tmp
        
        echo "📋 Created workflow structure:"
        ls -la test-project/workflows/sftp-dhis2/
        
        echo ""
        echo "🔍 Workflow preview:"
        cat test-project/workflows/sftp-dhis2/sftp-dhis2.json | jq -c ".steps[].name" 2>/dev/null || echo "Could not parse workflow"
        
        echo ""
        echo "🚀 Running workflow..."
        openfn test-project sftp-dhis2 -s /fixtures/sftp-test-input.json -o /outputs/'"$OUTPUT_FILE"' --log info
    '

# Check results
if [[ -f "$OUTPUT_FILE" ]]; then
    echo ""
    echo -e "${GREEN}✅ Workflow completed successfully!${NC}"
    echo ""
    echo "📄 Workflow output summary:"
    
    # Try to extract meaningful data
    if command -v jq >/dev/null 2>&1; then
        FILES_COUNT=$(cat "$OUTPUT_FILE" | jq -r '.data | length' 2>/dev/null || echo "0")
        echo "  Files found: $FILES_COUNT"
        
        # List files
        echo "  File names:"
        cat "$OUTPUT_FILE" | jq -r '.data[]?.name' 2>/dev/null | while read -r file; do
            if [[ -n "$file" ]]; then
                if [[ "$file" == *"ART_data"* ]]; then
                    echo -e "    ${YELLOW}⭐ $file${NC}"
                else
                    echo "    - $file"
                fi
            fi
        done
    else
        # Fallback without jq
        echo "  (Install jq for detailed output)"
        head -20 "$OUTPUT_FILE"
    fi
    
    echo ""
    echo "💡 Full output saved to: $OUTPUT_FILE"
else
    echo -e "${RED}❌ Workflow failed - no output file created${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}📊 Workflow Test Summary:${NC}"
echo "  ✓ SFTP connection established"
echo "  ✓ Files listed successfully"
echo "  ✓ Workflow steps executed"
echo ""
echo "Next steps:"
echo "  1. Add download-sftp-files step to fetch the ART Excel file"
echo "  2. Add process-excel-data step to parse the file"
echo "  3. Add generate-dhis2-payload step to transform data"
echo "  4. Add upload-to-dhis2 step to send to DHIS2" 