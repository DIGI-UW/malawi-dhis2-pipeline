#!/bin/bash

# Debug script for OpenFN workflow development
# This runs a separate workflow container with volume mounts for live editing

echo "Starting OpenFN workflow debug container..."

# Use external networking since swarm overlay networks are not attachable
echo "Using external networking to connect to OpenFN at http://35.80.8.132:4000"

# Run the container in detached mode with volume mount (no custom networks)
docker run -d --rm \
  --name openfn-workflow-debug \
  -v /home/ubuntu/code/malawi-dhis2-pipeline/projects/openfn-workflows/workflows:/app/workflows \
  -e OPENFN_ENDPOINT=http://35.80.8.132:4000 \
  -e OPENFN_API_KEY=apiKey \
  -e OPENFN_ADMIN_USER=root@openhim.org \
  -e OPENFN_ADMIN_PASSWORD=instant101 \
  openfn-workflows:local tail -f /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Debug container started successfully"
    echo "📋 To connect to the debug container, run:"
    echo "   docker exec -it openfn-workflow-debug /bin/bash"
    echo ""
    echo "🔧 Inside the container, you can:"
    echo "   - Edit workflows in /app/workflows (mounted from host)"
    echo "   - Run: openfn deploy ./workflows/sftp-dhis2"
    echo "   - Run: openfn validate ./workflows/sftp-dhis2"
    echo ""
else
    echo "❌ Failed to start debug container"
    exit 1
fi
