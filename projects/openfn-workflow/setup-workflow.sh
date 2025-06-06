#!/bin/bash
set -e

echo "🚀 Starting OpenFN Workflow Setup..."

# Export PATH for current session
export PATH="/usr/local/bin:$PATH"

# Verify OpenFN CLI is available
echo "🔍 Verifying OpenFN CLI installation..."
which openfn || {
    echo "❌ OpenFN CLI not found in PATH"
    exit 1
}

openfn --version || {
    echo "❌ OpenFN CLI version check failed"
    exit 1
}

echo "✅ OpenFN CLI is ready"

# Check if we're in manual or auto mode
if [ "${OPENFN_WORKFLOW_MANUAL_CLI}" = "true" ]; then
    echo "🔧 Manual CLI mode enabled"
    echo "📋 Container is ready for manual workflow deployment"
    echo "📍 Current directory: $(pwd)"
    echo "📁 Available files:"
    ls -la
    echo ""
    echo "🔨 To deploy the workflow manually, run:"
    echo "   openfn deploy . --no-confirm --log info"
    echo ""
    echo "🔄 Keeping container alive for manual operations..."
    tail -f /dev/null
else
    echo "🤖 Auto deployment mode enabled"
    echo "📁 Project directory contents:"
    ls -la
    
    # Validate required files exist
    if [ ! -f "project.yaml" ]; then
        echo "❌ project.yaml not found"
        exit 1
    fi
    
    if [ ! -d "jobs" ]; then
        echo "❌ jobs directory not found"
        exit 1
    fi
    
    echo "✅ Required project files found"
    
    # Wait a moment for the OpenFN Lightning service to be ready
    echo "⏳ Waiting for OpenFN Lightning service to be ready..."
    sleep 10
    
    # Deploy the workflow
    echo "🚀 Deploying workflow to OpenFN Lightning..."
    echo "📡 Endpoint: ${OPENFN_ENDPOINT:-http://openfn:4000}"
    echo "🔑 API Key: ${OPENFN_API_KEY:0:8}***"
    
    # Try deployment with multiple fallback approaches
    deploy_success=false
    
    echo "🎯 Attempting deployment..."
    if openfn deploy . --no-confirm --log info; then
        deploy_success=true
        echo "✅ Workflow deployed successfully via openfn command"
    elif /usr/local/bin/openfn deploy . --no-confirm --log info; then
        deploy_success=true
        echo "✅ Workflow deployed successfully via full path"
    elif /usr/local/bin/node /usr/local/lib/node_modules/@openfn/cli/bin/run.js deploy . --no-confirm --log info; then
        deploy_success=true
        echo "✅ Workflow deployed successfully via Node.js direct execution"
    elif npx @openfn/cli deploy . --no-confirm --log info; then
        deploy_success=true
        echo "✅ Workflow deployed successfully via npx"
    else
        echo "❌ All deployment methods failed"
        echo "🔍 Debugging information:"
        echo "   Current directory: $(pwd)"
        echo "   OpenFN CLI location: $(which openfn)"
        echo "   Node.js version: $(node --version)"
        echo "   NPM version: $(npm --version)"
        echo "   Environment variables:"
        env | grep -E "(OPENFN|NODE)" | sort
        exit 1
    fi
    
    if [ "$deploy_success" = true ]; then
        echo "🎉 Workflow deployment completed successfully!"
        echo "📊 Workflow is now available in OpenFN Lightning"
        
        # Optional: Keep container running for a period for monitoring
        if [ "${OPENFN_WORKFLOW_KEEP_ALIVE}" = "true" ]; then
            echo "🔄 Keeping container alive for monitoring (600 seconds)..."
            sleep 600
        else
            echo "✅ Deployment container exiting gracefully"
            exit 0
        fi
    fi
fi
