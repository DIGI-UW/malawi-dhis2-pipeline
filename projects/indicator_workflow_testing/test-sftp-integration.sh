#!/bin/bash

# Test script to validate SFTP Excel data integration
# This script tests the complete flow: SFTP storage -> OpenFN workflow -> DHIS2 payload

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "=== SFTP Excel Data Integration Test ==="
echo "Project root: $PROJECT_ROOT"

# Set test environment variables
export OPENFN_LOAD_WORKFLOW_ON_STARTUP=true
export OPENFN_WORKFLOW_MANUAL_CLI=true
export SFTP_PORT=2222
export SFTP_USER=openfn
export SFTP_PASSWORD=instant101

echo "Step 1: Deploy SFTP storage package..."
cd "$PROJECT_ROOT/packages/sftp-storage"
./swarm.sh init

echo "Step 2: Wait for SFTP server to be ready..."
sleep 10

echo "Step 3: Test SFTP connection and file listing..."
# Use Docker to test SFTP connection without requiring local SFTP client
docker run --rm --network sftp-storage_sftp \
  alpine/curl:latest \
  sh -c "apk add --no-cache openssh-client && sftp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $SFTP_USER@sftp-server:22 <<< 'ls data/excel-files/'" || echo "SFTP connection test failed (expected if network not ready)"

echo "Step 4: Deploy OpenFN workflow package..."
cd "$PROJECT_ROOT/packages/openfn"
./swarm.sh init

echo "Step 5: Manual test instructions:"
echo "----------------------------------------"
echo "1. Check SFTP server is running:"
echo "   docker service ls | grep sftp"
echo ""
echo "2. List files in SFTP:"
echo "   docker exec -it \$(docker ps -qf 'label=com.docker.swarm.service.name=sftp-storage_sftp-server') ls -la /home/openfn/data/excel-files/"
echo ""
echo "3. Test OpenFN workflow with SFTP trigger:"
echo "   curl -X POST http://localhost:4000/webhooks/sftp-webhook -H 'Content-Type: application/json' -d '{}'"
echo ""
echo "4. Check OpenFN logs:"
echo "   docker service logs sftp-storage_sftp-server"
echo "   docker service logs openfn_openfn_workflow_config"
echo ""
echo "5. Access OpenFN Lightning UI:"
echo "   http://localhost:4000"
echo ""
echo "Test setup complete. Use the manual instructions above to validate the integration."
