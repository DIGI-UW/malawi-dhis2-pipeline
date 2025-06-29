#!/bin/bash
# Test SFTP Excel File Reading
# Verifies that we can connect to SFTP and read/display Excel files

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "🔍 SFTP Excel File Reading Test"
echo "==============================="
echo ""

# Configuration
DOCKER_IMAGE="openfn-cli-test:latest"
PROJECT_ROOT="/home/ubuntu/code/malawi-dhis2-pipeline"

cd "$(dirname "$0")"

# Ensure fixtures directory exists
mkdir -p ../fixtures ../outputs

# Create enhanced SFTP test input with correct directory
cat > ../fixtures/sftp-excel-test-input.json << 'EOF'
{
  "data": [],
  "fileTracking": {},
  "configuration": {
    "host": "172.17.0.1",
    "port": 2225,
    "username": "openfn",
    "password": "instant101",
    "remoteDir": "/data/excel-files"
  }
}
EOF

log_info "Testing SFTP connection and Excel file access..."

# Run the enhanced SFTP test
docker run --rm -it \
    -v "$PROJECT_ROOT/projects/indicator_workflow_testing/tests/fixtures:/fixtures" \
    -v "$PROJECT_ROOT/projects/indicator_workflow_testing/tests/outputs:/outputs" \
    "$DOCKER_IMAGE" /bin/sh -c "
        # Create proper OpenFN project structure
        mkdir -p /tmp/test-project/workflows/sftp-excel-test
        
        # Create openfn.json configuration
        cat > /tmp/test-project/openfn.json << 'EOF'
{
  \"workflowRoot\": \"workflows\",
  \"formats\": {
    \"workflow\": \"json\"
  }
}
EOF

        # Create enhanced workflow that lists and examines Excel files
        cat > /tmp/test-project/workflows/sftp-excel-test/sftp-excel-test.json << 'EOF'
{
  \"id\": \"sftp-excel-test\",
  \"name\": \"SFTP Excel File Access Test\",
  \"steps\": [
    {
      \"id\": \"list-excel-files\",
      \"adaptor\": \"@openfn/language-sftp@2.0.14-custom\",
      \"expression\": \"list('/data/excel-files', (state) => { console.log('=== SFTP Excel File Test ==='); console.log('Files found:', state.data ? state.data.length : 0); if (state.data && state.data.length > 0) { console.log('Excel files detected:'); state.data.forEach(file => { if (file.name && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) { console.log('📊 Excel file: ' + file.name + ' (' + file.size + ' bytes)'); } }); } return state; });\"
    }
  ]
}
EOF

        # Change to project directory and run
        cd /tmp
        
        echo 'Project structure created:'
        ls -la test-project/workflows/sftp-excel-test/
        
        echo ''
        echo 'Input state:'
        cat /fixtures/sftp-excel-test-input.json
        
        echo ''
        echo 'Running enhanced SFTP Excel test...'
        openfn test-project sftp-excel-test -s /fixtures/sftp-excel-test-input.json -o /outputs/excel-test-result.json 2>&1
        
        echo ''
        echo '📋 Test Results Summary:'
        if [[ -f /outputs/excel-test-result.json ]]; then
            echo 'Output file created successfully'
            echo 'Excel files found in state:'
            cat /outputs/excel-test-result.json | grep -o '\"excelFiles\":\\[.*\\]' || echo 'No excelFiles in output'
        else
            echo 'No output file created'
        fi
    "

echo ""
log_info "Test completed! Check outputs/excel-test-result.json for results"

# Show results if available
if [[ -f "../outputs/excel-test-result.json" ]]; then
    echo ""
    log_success "✅ Test output file created"
    echo ""
    echo "🔍 Excel files detected in state:"
    cat "../outputs/excel-test-result.json" | jq '.excelFiles[]?.name // empty' 2>/dev/null || echo "Unable to parse JSON or no Excel files found"
else
    log_warning "⚠️  No output file found"
fi

echo ""
echo "📁 Available test results:"
ls -la ../outputs/ 2>/dev/null || echo "No outputs directory" 