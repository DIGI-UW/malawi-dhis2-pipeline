#!/bin/bash
set -e  # Exit on error

echo "=========================================="
echo "🔄 Complete Rebuild and Deployment"
echo "=========================================="
echo ""

echo "Step 1: Cleaning up all running services..."
./instant package destroy -n openfn || true
./instant package destroy -n dhis2-instance || true
./instant package destroy -n database-postgres || true

echo ""
echo "Step 2: Removing old instant platform image..."
docker rmi malawi-dhis2-indicators:latest || true

echo ""
echo "Step 3: Building custom images..."
./build-custom-images.sh

echo ""
echo "Step 4: Building instant platform image (with updated utils)..."
./build-image.sh

echo ""
echo "Step 5: Verifying new image was built..."
docker images | grep malawi-dhis2-indicators

echo ""
echo "Step 6: Deploying database..."
./instant package init -n database-postgres -d

echo ""
echo "Step 7: Deploying DHIS2 (with database initialization)..."
./instant package init -n dhis2-instance -d 

echo ""
echo "Step 8: Deploying OpenFN (with automatic secrets creation)..."
./instant package init -n openfn -d

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "Check service status:"
echo "  docker service ls"
echo ""
echo "Check for secrets:"
echo "  docker secret ls"
echo ""
echo "View logs:"
echo "  docker service logs openfn_openfn"
echo "  docker service logs dhis2_dhis2"


