#!/bin/bash

# CSV/XLSX Import Workflow Deployment Script
# This script deploys the flexible CSV/XLSX to DHIS2 import workflow

set -e

echo "🚀 Deploying CSV/XLSX Import Workflow..."

# Check if OpenFN CLI is available
if ! command -v openfn &> /dev/null; then
    echo "❌ OpenFN CLI not found. Installing..."
    npm install -g @openfn/cli
fi

# Set OpenFN endpoint
OPENFN_ENDPOINT=${OPENFN_ENDPOINT:-"http://localhost:4000"}
OPENFN_API_KEY=${OPENFN_API_KEY:-""}

echo "📡 Using OpenFN endpoint: $OPENFN_ENDPOINT"

# Wait for OpenFN to be ready
echo "⏳ Waiting for OpenFN to be ready..."
for i in {1..30}; do
    if curl -f "$OPENFN_ENDPOINT/health_check" >/dev/null 2>&1; then
        echo "✅ OpenFN is ready"
        break
    fi
    echo "   Waiting... ($i/30)"
    sleep 10
done

# Check if we can connect
if ! curl -f "$OPENFN_ENDPOINT/health_check" >/dev/null 2>&1; then
    echo "❌ Cannot connect to OpenFN at $OPENFN_ENDPOINT"
    exit 1
fi

# Deploy the project
echo "📦 Deploying project configuration..."
cd "$(dirname "$0")"

# Set environment variables for the CLI
export OPENFN_ENDPOINT="$OPENFN_ENDPOINT"
export OPENFN_API_KEY="$OPENFN_API_KEY"

# Deploy the workflow
openfn deploy -c project.yaml

if [[ $? -eq 0 ]]; then
    echo "✅ CSV/XLSX Import Workflow deployed successfully!"
    echo ""
    echo "🔧 Next steps:"
    echo "1. Configure credentials in OpenFN UI:"
    echo "   - SFTP credentials (host: sftp-server, user: openfn, password: instant101)"
    echo "   - DHIS2 credentials (host: http://dhis2:8080, user: admin, password: district)"
    echo ""
    echo "2. The workflow will automatically:"
    echo "   - Check SFTP every 5 minutes for new files"
    echo "   - Process CSV/XLSX files using configuration-based mapping"
    echo "   - Upload data to DHIS2"
    echo ""
    echo "3. Monitor workflow execution in OpenFN UI at: $OPENFN_ENDPOINT"
else
    echo "❌ Failed to deploy workflow"
    exit 1
fi 