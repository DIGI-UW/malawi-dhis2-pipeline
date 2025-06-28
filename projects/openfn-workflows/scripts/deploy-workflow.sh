#!/bin/bash

# Deploy OpenFN Workflows
# This script deploys workflows to the OpenFN instance

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

# Default values
WORKFLOW_NAME="${1:-sftp-dhis2}"
WORKFLOW_PATH="${WORKFLOW_PATH:-/app/workflows}"
OPENFN_ENDPOINT="${OPENFN_ENDPOINT:-http://openfn:4000}"
OPENFN_API_KEY="${OPENFN_API_KEY:-apiKey}"
DRY_RUN="${DRY_RUN:-false}"

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [WORKFLOW_NAME] [OPTIONS]

Arguments:
  WORKFLOW_NAME    Name of the workflow to deploy (default: sftp-dhis2)

Environment Variables:
  WORKFLOW_PATH    Path to workflows directory (default: /app/workflows)
  OPENFN_ENDPOINT  OpenFN instance endpoint (default: http://openfn:4000)
  OPENFN_API_KEY   OpenFN API key (default: apiKey)
  DRY_RUN          Set to "true" for dry run mode (default: false)

Examples:
  $0 sftp-dhis2
  $0 sftp-dhis2 DRY_RUN=true
  OPENFN_ENDPOINT=http://localhost:4000 $0 sftp-dhis2

Available workflows:
EOF
    # List available workflows
    if [[ -d "$WORKFLOW_PATH" ]]; then
        for workflow_dir in "$WORKFLOW_PATH"/*; do
            if [[ -d "$workflow_dir" && -f "$workflow_dir/project.yaml" ]]; then
                local workflow_name=$(basename "$workflow_dir")
                echo "  - $workflow_name"
            fi
        done
    else
        echo "  No workflows directory found at $WORKFLOW_PATH"
    fi
}

# Check if help is requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_usage
    exit 0
fi

# Validate environment
validate_environment() {
    log "Validating environment..."
    
    if [[ -z "$OPENFN_ENDPOINT" ]]; then
        error "OPENFN_ENDPOINT is required"
        exit 1
    fi
    
    if [[ -z "$OPENFN_API_KEY" ]]; then
        error "OPENFN_API_KEY is required"
        exit 1
    fi
    
    if [[ ! -d "$WORKFLOW_PATH" ]]; then
        error "Workflow path does not exist: $WORKFLOW_PATH"
        exit 1
    fi
    
    if [[ ! -d "$WORKFLOW_PATH/$WORKFLOW_NAME" ]]; then
        error "Workflow directory does not exist: $WORKFLOW_PATH/$WORKFLOW_NAME"
        exit 1
    fi
    
    if [[ ! -f "$WORKFLOW_PATH/$WORKFLOW_NAME/project.yaml" ]]; then
        error "project.yaml not found in workflow: $WORKFLOW_PATH/$WORKFLOW_NAME"
        exit 1
    fi
    
    success "Environment validation passed"
}

# Wait for OpenFN to be ready
wait_for_openfn() {
    log "Waiting for OpenFN to be ready at $OPENFN_ENDPOINT..."
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        ((attempt++))
        log "Attempt $attempt/$max_attempts: Checking OpenFN API availability..."
        
        # Check if we get a response from the login page
        local response=$(curl -s "$OPENFN_ENDPOINT/users/log_in" 2>/dev/null || true)
        if [[ -n "$response" ]] && echo "$response" | tr -d '\n\r' | grep -q "<h1[^>]*>.*Log in.*</h1>"; then
            success "OpenFN API is ready"
            return 0
        fi
        
        if [[ $attempt -lt $max_attempts ]]; then
            warning "OpenFN API not ready, waiting 10 seconds..."
            sleep 10
        fi
    done
    
    error "OpenFN did not become ready within expected time"
    return 1
}

# Deploy workflow
deploy_workflow() {
    log "Deploying workflow: $WORKFLOW_NAME"
    
    # Set environment variables for the entrypoint script
    export MODE="deploy"
    export WORKFLOW_NAME="$WORKFLOW_NAME"
    export WORKFLOW_PATH="$WORKFLOW_PATH"
    export OPENFN_ENDPOINT="$OPENFN_ENDPOINT"
    export OPENFN_API_KEY="$OPENFN_API_KEY"
    export DRY_RUN="$DRY_RUN"
    export PACKAGE_LIFECYCLE="false"
    
    # Run the entrypoint script
    if /app/entrypoint.sh; then
        success "Workflow '$WORKFLOW_NAME' deployed successfully"
        return 0
    else
        error "Failed to deploy workflow '$WORKFLOW_NAME'"
        return 1
    fi
}

# Main execution
main() {
    log "OpenFN Workflow Deployment Script"
    log "Workflow: $WORKFLOW_NAME"
    log "Path: $WORKFLOW_PATH"
    log "Endpoint: $OPENFN_ENDPOINT"
    log "Dry run: $DRY_RUN"
    
    # Validate environment
    validate_environment
    
    # Wait for OpenFN to be ready
    if ! wait_for_openfn; then
        exit 1
    fi
    
    # Deploy the workflow
    if deploy_workflow; then
        success "Deployment completed successfully"
        exit 0
    else
        error "Deployment failed"
        exit 1
    fi
}

# Run main function
main "$@"
