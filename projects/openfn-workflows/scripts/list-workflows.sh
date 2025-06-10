#!/bin/bash

# List available workflows

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

function main() {
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
    
    # List workflows using the container
    docker run --rm \
        -e "MODE=list" \
        "$image_name"
}

main "$@"
