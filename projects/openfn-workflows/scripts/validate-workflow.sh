#!/bin/bash

# Validate workflow configurations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

function usage() {
    echo "Usage: $0 [workflow-name]"
    echo ""
    echo "Arguments:"
    echo "  workflow-name    Name of specific workflow to validate (optional)"
    echo "                   If not provided, validates all workflows"
    echo ""
    echo "Examples:"
    echo "  $0                # Validate all workflows"
    echo "  $0 sftp-dhis2     # Validate specific workflow"
}

function main() {
    local workflow_name="$1"
    
    # Check if Docker is available
    if ! command -v docker >/dev/null 2>&1; then
        echo "ERROR: Docker is not available"
        exit 1
    fi
    
    # Build the image if it doesn't exist
    local image_name="openfn-workflows:latest"
    if ! docker image inspect "$image_name" >/dev/null 2>&1; then
        echo "Building workflow manager image..."
        cd "$PROJECT_DIR"
        ./build.sh
    fi
    
    # Prepare environment variables
    local docker_env=(
        "-e" "MODE=validate"
    )
    
    if [[ -n "$workflow_name" ]]; then
        docker_env+=("-e" "WORKFLOW_NAME=$workflow_name")
        echo "Validating workflow: $workflow_name"
    else
        echo "Validating all workflows..."
    fi
    
    # Run validation
    docker run --rm \
        "${docker_env[@]}" \
        "$image_name"
}

main "$@"
