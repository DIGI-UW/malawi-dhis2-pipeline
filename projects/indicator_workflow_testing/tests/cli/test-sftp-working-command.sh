#!/bin/bash
# Working SFTP Test Command - Validated working approach
# This script demonstrates the correct CLI usage for SFTP workflows

echo "🚀 Running SFTP Test with Working Configuration"
echo "=============================================="
echo ""

# Run the working Docker command with proper CLI flags from project root
docker run --rm -i -v "$(pwd)/../fixtures:/e2e" openfn-cli-test:latest /bin/sh -c "
# Create proper OpenFN project structure
mkdir -p /tmp/myproject/workflows/test-workflow

# Create openfn.json configuration
cat > /tmp/myproject/openfn.json << 'EOF'
{
  \"workflowRoot\": \"workflows\",
  \"formats\": {
    \"workflow\": \"json\"
  }
}
EOF

# Create workflow with SFTP test
cat > /tmp/myproject/workflows/test-workflow/test-workflow.json << 'EOF'
{
  \"id\": \"test-workflow\",
  \"steps\": [
    {
      \"adaptor\": \"@openfn/language-sftp@2.0.14\",
      \"expression\": \"list('/data/excel-files', (state) => { console.log('SFTP Files:', state.data); return state; });\"
    }
  ]
}
EOF

# Change to project directory and run
cd /tmp

echo 'Project structure created:'
ls -la myproject/workflows/test-workflow/

echo ''
echo 'State file content:'
cat /e2e/sftp-test-input.json

echo ''
echo 'Running workflow with -s flag (NOT -i which is autoinstall)...'
openfn myproject test-workflow -s /e2e/sftp-test-input.json -o output.json 2>&1

echo ''
echo 'Output result:'
cat output.json | jq '.' 2>/dev/null || cat output.json
"

echo ""
echo "✅ Test completed!"
echo ""
echo "📋 Key learnings:"
echo "  • Use -s flag for state input (not -i which is autoinstall)"
echo "  • State must have configuration nested: { data: {}, configuration: { host, port, username, password } }"
echo "  • Testing official adaptor @openfn/language-sftp@2.0.14"
echo "  • OpenFN CLI requires proper project structure with openfn.json" 