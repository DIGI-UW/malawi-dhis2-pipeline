#!/bin/bash

# Deploy a specific workflow to OpenFN

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

function usage() {
    echo "Usage: $0 <workflow-name> [openfn-endpoint] [options]"
    echo ""
    echo "Arguments:"
    echo "  workflow-name    Name of the workflow to deploy"
    echo "  openfn-endpoint  OpenFN instance URL (default: http://localhost:4000)"
    echo ""
    echo "Options:"
    echo "  --dry-run        Validate only, don't actually deploy"
    echo "  --api-key KEY    Use API key for authentication"
    echo "  --user USER      Admin username (requires --password)"
    echo "  --password PASS  Admin password (requires --user)"
    echo ""
    echo "Examples:"
    echo "  $0 sftp-dhis2"
    echo "  $0 sftp-dhis2 http://openfn.example.com:4000"
    echo "  $0 sftp-dhis2 --dry-run"
    echo "  $0 sftp-dhis2 --api-key your-api-key-here"
}

function main() {
    local workflow_name="$1"
    local openfn_endpoint="${2:-http://localhost:4000}"
    local dry_run="false"
    local api_key=""
    local username=""
    local password=""
    
    # Parse additional arguments
    shift 2 2>/dev/null || shift 1 2>/dev/null || true
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                dry_run="true"
                shift
                ;;
            --api-key)
                api_key="$2"
                shift 2
                ;;
            --user)
                username="$2"
                shift 2
                ;;
            --password)
                password="$2"
                shift 2
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
    
    if [[ -z "$workflow_name" ]]; then
        echo "ERROR: Workflow name is required"
        usage
        exit 1
    fi
    
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
        "-e" "OPENFN_ENDPOINT=$openfn_endpoint"
        "-e" "WORKFLOW_NAME=$workflow_name"
        "-e" "MODE=deploy"
        "-e" "DRY_RUN=$dry_run"
    )
    
    if [[ -n "$api_key" ]]; then
        docker_env+=("-e" "OPENFN_API_KEY=$api_key")
    elif [[ -n "$username" && -n "$password" ]]; then
        docker_env+=("-e" "OPENFN_ADMIN_USER=$username")
        docker_env+=("-e" "OPENFN_ADMIN_PASSWORD=$password")
    else
        echo "WARNING: No authentication provided. Make sure OpenFN allows unauthenticated access or set credentials."
    fi
    
    # Run the deployment
    echo "Deploying workflow '$workflow_name' to '$openfn_endpoint'..."
    
    docker run --rm \
        --network host \
        "${docker_env[@]}" \
        "$image_name"
}

main "$@"
