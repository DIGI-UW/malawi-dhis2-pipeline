#!/bin/bash

# Debug script for OpenFN workflow development
# This runs a separate workflow container with volume mounts for live editing

echo "Starting OpenFN workflow debug container..."

# Check if we're on the host or need to use external access
OPENFN_DEBUG_ENDPOINT="${OPENFN_DEBUG_ENDPOINT:-${OPENFN_ENDPOINT:-http://openfn:4000}}"

# Try to connect to the OpenFN network if it exists
NETWORK_ARG=""
if docker network ls | grep -q "openfn_public"; then
    echo "Connecting to openfn_public network..."
    NETWORK_ARG="--network openfn_public"
    # Use internal service name when on the network
    if [[ "$OPENFN_DEBUG_ENDPOINT" == *"localhost"* ]] || [[ "$OPENFN_DEBUG_ENDPOINT" == *"127.0.0.1"* ]]; then
        OPENFN_DEBUG_ENDPOINT="http://openfn:4000"
    fi
else
    echo "Warning: openfn_public network not found. Using host networking..."
    # When not on the Docker network, we need external access
    if [[ -z "$OPENFN_DEBUG_ENDPOINT" ]] || [[ "$OPENFN_DEBUG_ENDPOINT" == "http://openfn:4000" ]]; then
        echo "Please set OPENFN_DEBUG_ENDPOINT to the external OpenFN URL (e.g., http://your-host:4000)"
        exit 1
    fi
fi

echo "Using OpenFN endpoint: $OPENFN_DEBUG_ENDPOINT"

# Get the absolute path for volume mounting
WORKFLOW_PATH="${WORKFLOW_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/projects/openfn-workflows}"

# Run the container with proper configuration
docker run -d --rm \
  --name openfn-workflow-debug \
  $NETWORK_ARG \
  -v "$WORKFLOW_PATH/workflows:/app/workflows" \
  -v "$WORKFLOW_PATH/configs:/app/configs" \
  -v "$WORKFLOW_PATH/shared:/app/shared" \
  -e OPENFN_ENDPOINT="$OPENFN_DEBUG_ENDPOINT" \
  -e OPENFN_API_KEY="${OPENFN_API_KEY:-apiKey}" \
  -e OPENFN_ADMIN_USER="${OPENFN_ADMIN_USER:-root@openhim.org}" \
  -e OPENFN_ADMIN_PASSWORD="${OPENFN_ADMIN_PASSWORD:-instant101secure}" \
  -e OPENFN_WORKFLOW_MANUAL_CLI="true" \
  -e WORKFLOW_PATH="/app/workflows" \
  ${OPENFN_WORKFLOWS_IMAGE:-openfn-workflows:local} \
  tail -f /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Debug container started successfully"
    echo "📋 To connect to the debug container, run:"
    echo "   docker exec -it openfn-workflow-debug /bin/bash"
    echo ""
    echo "🔧 Inside the container, you can:"
    echo "   - Edit workflows in /app/workflows (mounted from $WORKFLOW_PATH/workflows)"
    echo "   - Deploy a workflow: /app/entrypoint.sh deploy sftp-dhis2"
    echo "   - Validate workflows: /app/entrypoint.sh validate"
    echo "   - List workflows: /app/entrypoint.sh list"
    echo "   - Use OpenFN CLI directly: openfn --help"
    echo ""
    echo "🌐 OpenFN endpoint: $OPENFN_DEBUG_ENDPOINT"
    echo ""
    echo "🛑 To stop the debug container:"
    echo "   docker stop openfn-workflow-debug"
else
    echo "❌ Failed to start debug container"
    exit 1
fi
