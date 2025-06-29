#!/bin/bash
# This script demonstrates how to successfully run a workflow with the custom SFTP adaptor
# It creates the proper project structure that the OpenFN CLI expects

echo "Running SFTP workflow with custom adaptor version 2.0.14-custom"
echo "============================================================"

docker run --rm -it -v "$(pwd)/tests/e2e:/e2e" openfn-cli-test:latest /bin/sh -c "
# Create project structure
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

# Create workflow file
cat > /tmp/myproject/workflows/test-workflow/test-workflow.json << 'EOF'
{
  \"id\": \"test-workflow\",
  \"steps\": [
    {
      \"adaptor\": \"@openfn/language-sftp@2.0.14-custom\",
      \"expression\": \"list('/', (state) => { console.log('SFTP Files:', state.data); return state; });\"
    }
  ]
}
EOF

# Change to temp directory and run workflow
cd /tmp
echo 'Project structure created:'
ls -la myproject/workflows/test-workflow/

echo ''
echo 'Running workflow with correct -s flag for state...'
openfn myproject test-workflow -s /e2e/sftp-test-input.json -o output.json 2>&1
" 