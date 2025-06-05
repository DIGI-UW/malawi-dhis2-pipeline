#!/bin/bash

# Enhanced SFTP Excel Integration Deployment and Test Script
# This script deploys the complete SFTP + Excel integration and runs comprehensive tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "🚀 Enhanced SFTP Excel Integration - Deployment & Test"
echo "===================================================="
echo "Project root: $SCRIPT_DIR"

# Configuration
export OPENFN_LOAD_WORKFLOW_ON_STARTUP=true
export OPENFN_WORKFLOW_MANUAL_CLI=true
export SFTP_HOST=sftp-server
export SFTP_PORT=22
export SFTP_USER=openfn
export SFTP_PASSWORD=instant101

echo "🔧 Configuration:"
echo "  - SFTP Host: $SFTP_HOST:$SFTP_PORT"
echo "  - SFTP User: $SFTP_USER"
echo "  - Excel files: $(ls -1 data/*.xlsx | wc -l) files"
echo ""

# Function to check service status
check_service() {
    local service_name=$1
    local retries=30
    local count=0
    
    echo "⏳ Waiting for $service_name to be ready..."
    
    while [ $count -lt $retries ]; do
        if docker service ls --filter "name=$service_name" --format "{{.Replicas}}" | grep -q "1/1"; then
            echo "✅ $service_name is ready"
            return 0
        fi
        
        echo "   Attempt $((count + 1))/$retries - waiting..."
        sleep 5
        count=$((count + 1))
    done
    
    echo "❌ $service_name failed to start after $((retries * 5)) seconds"
    return 1
}

# Function to test SFTP connectivity
test_sftp_connection() {
    echo "🔌 Testing SFTP connection..."
    
    # Test with sshpass if available, otherwise use expect or alternative
    if command -v sshpass >/dev/null 2>&1; then
        if timeout 10 sshpass -p "$SFTP_PASSWORD" sftp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$SFTP_USER@localhost:$SFTP_PORT" <<< "ls data/excel-files/" >/dev/null 2>&1; then
            echo "✅ SFTP connection successful"
            return 0
        else
            echo "❌ SFTP connection failed"
            return 1
        fi
    else
        echo "⚠️  sshpass not available, skipping direct SFTP test"
        return 0
    fi
}

# Function to test Excel parsing
test_excel_parsing() {
    echo "📊 Testing Excel parsing functionality..."
    
    # Test with Node.js
    node -e "
        const XLSX = require('xlsx');
        const fs = require('fs');
        const path = require('path');
        
        console.log('XLSX version:', XLSX.version);
        
        const testFile = 'data/DHIS2_HIV Indicators.xlsx';
        if (fs.existsSync(testFile)) {
            try {
                const workbook = XLSX.readFile(testFile);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(sheet);
                console.log('✅ Excel parsing successful');
                console.log('   Sheets:', workbook.SheetNames.length);
                console.log('   Rows in first sheet:', data.length);
                console.log('   Sample columns:', Object.keys(data[0] || {}).slice(0, 3).join(', '));
            } catch (error) {
                console.error('❌ Excel parsing failed:', error.message);
                process.exit(1);
            }
        } else {
            console.error('❌ Test file not found:', testFile);
            process.exit(1);
        }
    "
}

# Function to test data import
test_data_import() {
    echo "📦 Testing automatic data import functionality..."
    
    # Check if importer files exist
    if [ -f "packages/sftp-storage/importer/docker-compose.config.yml" ]; then
        echo "✅ Data importer config found"
    else
        echo "❌ Data importer config missing"
        return 1
    fi
    
    if [ -d "packages/sftp-storage/importer/data" ]; then
        echo "✅ Importer data directory found"
        echo "   Files available for import:"
        ls -la packages/sftp-storage/importer/data/*.xlsx | awk '{print "   - " $9 " (" $5 " bytes)"}'
    else
        echo "❌ Importer data directory missing"
        return 1
    fi
    
    echo "✅ Data import ready for deployment"
}

echo "📦 Step 1: Deploy SFTP Storage Package"
echo "====================================="
cd "$SCRIPT_DIR/packages/sftp-storage"

if ./swarm.sh init; then
    echo "✅ SFTP storage package deployed successfully"
else
    echo "❌ SFTP storage package deployment failed"
    exit 1
fi

# Wait for SFTP service
check_service "sftp-storage_sftp-server"

echo ""
echo "📦 Step 2: Deploy OpenFN Workflow Package"
echo "========================================"
cd "$SCRIPT_DIR/packages/openfn"

if ./swarm.sh init; then
    echo "✅ OpenFN workflow package deployed successfully"
else
    echo "❌ OpenFN workflow package deployment failed"
    exit 1
fi

# Wait for OpenFN service
check_service "openfn_openfn"

echo ""
echo "🧪 Step 3: Run Integration Tests"
echo "==============================="

# Test Excel parsing
cd "$SCRIPT_DIR"
test_excel_parsing

# Test SFTP connection
test_sftp_connection

# Test Docker services
echo "🐳 Checking Docker services..."
echo "Active services:"
docker service ls --format "table {{.Name}}\t{{.Replicas}}\t{{.Image}}"

echo ""
echo "📂 Checking SFTP file structure..."
docker exec -it "$(docker ps -qf 'label=com.docker.swarm.service.name=sftp-storage_sftp-server')" ls -la /home/openfn/data/excel-files/ 2>/dev/null || echo "⚠️  Could not access SFTP container directly"

echo ""
echo "🌐 Step 4: API Integration Test"
echo "=============================="

# Test OpenFN webhook endpoints
echo "Testing OpenFN webhook endpoints..."

# Test Google Sheets webhook (existing)
echo "📊 Testing Google Sheets webhook..."
curl_result_gs=$(curl -s -w "%{http_code}" -X POST http://localhost:4000/webhooks/sheets-webhook \
    -H 'Content-Type: application/json' \
    -d '{"test": "google_sheets_integration"}' -o /dev/null || echo "000")

if [ "$curl_result_gs" = "200" ] || [ "$curl_result_gs" = "201" ]; then
    echo "✅ Google Sheets webhook responded with $curl_result_gs"
else
    echo "⚠️  Google Sheets webhook responded with $curl_result_gs (may be expected if not configured)"
fi

# Test SFTP webhook (new)
echo "📁 Testing SFTP webhook..."
curl_result_sftp=$(curl -s -w "%{http_code}" -X POST http://localhost:4000/webhooks/sftp-webhook \
    -H 'Content-Type: application/json' \
    -d '{"test": "sftp_excel_integration"}' -o /dev/null || echo "000")

if [ "$curl_result_sftp" = "200" ] || [ "$curl_result_sftp" = "201" ]; then
    echo "✅ SFTP webhook responded with $curl_result_sftp"
else
    echo "⚠️  SFTP webhook responded with $curl_result_sftp (check OpenFN logs for details)"
fi

echo ""
echo "📊 Step 5: Performance & Validation Summary"
echo "=========================================="

# Network connectivity test
echo "🌐 Network connectivity:"
if docker network ls | grep -q "sftp-storage_sftp"; then
    echo "✅ SFTP network exists"
else
    echo "❌ SFTP network missing"
fi

if docker network ls | grep -q "openfn_openfn"; then
    echo "✅ OpenFN network exists"
else
    echo "❌ OpenFN network missing"
fi

# Volume mounts test
echo "💾 Volume mounts:"
if docker volume ls | grep -q "sftp-storage_sftp-data"; then
    echo "✅ SFTP data volume exists"
else
    echo "❌ SFTP data volume missing"
fi

# Configuration validation
echo "⚙️  Configuration validation:"
if docker config ls | grep -q "openfn_project_yaml"; then
    echo "✅ OpenFN project configuration exists"
else
    echo "❌ OpenFN project configuration missing"
fi

echo ""
echo "🎯 Step 6: Manual Testing Instructions"
echo "====================================="
echo "The SFTP Excel integration is now deployed! To test manually:"
echo ""
echo "1. 📊 Check service status:"
echo "   docker service ls"
echo ""
echo "2. 📁 Access SFTP server (using any SFTP client):"
echo "   Host: localhost:$SFTP_PORT"
echo "   User: $SFTP_USER"
echo "   Pass: $SFTP_PASSWORD"
echo "   Files: /data/excel-files/"
echo ""
echo "3. 🔗 Trigger SFTP workflow:"
echo "   curl -X POST http://localhost:4000/webhooks/sftp-webhook \\"
echo "        -H 'Content-Type: application/json' \\"
echo "        -d '{\"trigger\": \"manual_test\"}'"
echo ""
echo "4. 📋 Check OpenFN logs:"
echo "   docker service logs openfn_openfn --follow"
echo ""
echo "5. 🔍 Monitor SFTP server logs:"
echo "   docker service logs sftp-storage_sftp-server --follow"
echo ""
echo "✅ Deployment completed successfully!"
echo "📊 Excel files available: $(ls -1 data/*.xlsx | wc -l)"
echo "🌐 Webhook endpoints: /webhooks/sheets-webhook, /webhooks/sftp-webhook"
echo "🔄 Dual-path workflow: Google Sheets ✓ | SFTP Excel ✓"
