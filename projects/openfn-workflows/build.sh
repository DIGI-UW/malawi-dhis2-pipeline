#!/bin/bash

# Build OpenFN Workflows Manager Docker Image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

function usage() {
    echo "Usage: $0 [tag]"
    echo ""
    echo "Arguments:"
    echo "  tag    Docker image tag (default: latest)"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 v1.0.0"
    echo "  $0 development"
}

function main() {
    local tag="${1:-latest}"
    local image_name="openfn-workflows:$tag"
    
    echo "Building OpenFN Workflows Manager image..."
    echo "Image: $image_name"
    echo "Context: $PROJECT_DIR"
    
    # Change to project directory
    cd "$PROJECT_DIR"
    
    # Build the Docker image
    docker build \
        -f docker/Dockerfile \
        -t "$image_name" \
        .
    
    echo "Successfully built: $image_name"
    
    # Tag as latest if building a specific version
    if [[ "$tag" != "latest" ]]; then
        docker tag "$image_name" "openfn-workflows:latest"
        echo "Also tagged as: openfn-workflows:latest"
    fi
    
    # Show image info
    echo ""
    echo "Image information:"
    docker image inspect "$image_name" --format 'Size: {{.Size}} bytes'
    docker image inspect "$image_name" --format 'Created: {{.Created}}'
    
    echo ""
    echo "Build completed successfully!"
    echo ""
    echo "Usage examples:"
    echo "  # List workflows:"
    echo "  docker run --rm -e MODE=list $image_name"
    echo ""
    echo "  # Validate workflows:"
    echo "  docker run --rm -e MODE=validate $image_name"
    echo ""
    echo "  # Deploy workflow:"
    echo "  docker run --rm \\"
    echo "    -e OPENFN_ENDPOINT=http://localhost:4000 \\"
    echo "    -e WORKFLOW_NAME=sftp-dhis2 \\"
    echo "    -e MODE=deploy \\"
    echo "    $image_name"
}

main "$@"
