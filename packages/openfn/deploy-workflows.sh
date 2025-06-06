#!/bin/bash

# OpenFN Workflow Deployment Manager
# This script manages deployment of different OpenFN workflow configurations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UTILS_PATH="${SCRIPT_DIR}/../utils"

# Source utilities
source "${UTILS_PATH}/docker-utils.sh"
source "${UTILS_PATH}/log.sh"

STACK="openfn"

function usage() {
    echo "Usage: $0 <action> <workflow-type> [mode]"
    echo ""
    echo "Actions:"
    echo "  deploy    - Deploy the specified workflow"
    echo "  destroy   - Remove the specified workflow"
    echo "  switch    - Switch between workflows (destroy current, deploy new)"
    echo "  status    - Check status of workflows"
    echo ""
    echo "Workflow Types:"
    echo "  original  - Original Google Sheets + SFTP workflow (config-based)"
    echo "  sftp      - New SFTP-focused workflow (volume-based)"
    echo ""
    echo "Modes:"
    echo "  prod      - Production mode (default)"
    echo "  dev       - Development mode"
    echo ""
    echo "Examples:"
    echo "  $0 deploy sftp"
    echo "  $0 switch original"
    echo "  $0 destroy sftp"
    echo "  $0 status"
}

function check_prerequisites() {
    local workflow_type="$1"
    
    if [[ "$workflow_type" == "sftp" ]]; then
        # Check if SFTP workflow image exists
        local sftp_image_var="LOCAL_OPENFN_SFTP_WORKFLOW_IMAGE"
        local sftp_image="${!sftp_image_var}"
        
        if [[ -z "$sftp_image" ]]; then
            log error "SFTP workflow image not configured. Set LOCAL_OPENFN_SFTP_WORKFLOW_IMAGE environment variable."
            return 1
        fi
        
        if ! docker image inspect "$sftp_image" >/dev/null 2>&1; then
            log warn "SFTP workflow image '$sftp_image' not found locally."
            log info "Building SFTP workflow image..."
            
            if ! "${SCRIPT_DIR}/../../build-custom-images.sh" openfn-sftp-workflow; then
                log error "Failed to build SFTP workflow image"
                return 1
            fi
        fi
        
        # Check if project files exist
        local project_path="${SCRIPT_DIR}/../../projects/openfn-sftp-workflow"
        if [[ ! -d "$project_path/workflows" ]]; then
            log error "SFTP workflow project files not found at $project_path/workflows"
            return 1
        fi
    fi
    
    return 0
}

function deploy_workflow() {
    local workflow_type="$1"
    local mode="${2:-prod}"
    
    log info "Deploying $workflow_type workflow in $mode mode..."
    
    # Check prerequisites
    if ! check_prerequisites "$workflow_type"; then
        log error "Prerequisites check failed for $workflow_type workflow"
        return 1
    fi
    
    local compose_files=()
    compose_files+=("docker-compose.yml")
    
    if [[ "$mode" == "dev" ]]; then
        compose_files+=("docker-compose.dev.yml")
    fi
    
    case "$workflow_type" in
        "original")
            compose_files+=("importer/workflows/docker-compose.config.yml")
            log info "Deploying original workflow with config-based mounting"
            ;;
        "sftp")
            compose_files+=("importer/workflows/docker-compose.sftp-volume.yml")
            log info "Deploying SFTP workflow with volume-based mounting"
            ;;
        *)
            log error "Unknown workflow type: $workflow_type"
            return 1
            ;;
    esac
    
    # Build compose file arguments
    local compose_args=()
    for file in "${compose_files[@]}"; do
        compose_args+=("-f" "$file")
    done
    
    # Deploy the stack
    cd "$SCRIPT_DIR"
    
    log info "Using compose files: ${compose_files[*]}"
    docker::deploy_stack "$STACK" "${compose_args[@]}"
    
    # Wait for services to be ready
    log info "Waiting for services to be ready..."
    sleep 10
    
    # Deploy workflow configuration if enabled
    if [[ "${OPENFN_LOAD_WORKFLOW_ON_STARTUP}" == "true" ]]; then
        deploy_workflow_config "$workflow_type"
    else
        log info "OPENFN_LOAD_WORKFLOW_ON_STARTUP is not true. Skipping workflow configuration."
    fi
    
    log info "$workflow_type workflow deployment completed"
}

function deploy_workflow_config() {
    local workflow_type="$1"
    
    log info "Deploying workflow configuration for $workflow_type..."
    
    local service_name
    case "$workflow_type" in
        "original")
            service_name="openfn_workflow_config"
            ;;
        "sftp")
            service_name="openfn_sftp_workflow"
            ;;
        *)
            log error "Unknown workflow type for config deployment: $workflow_type"
            return 1
            ;;
    esac
    
    local container_id
    container_id=$(docker ps --filter "label=com.docker.swarm.service.name=${STACK}_${service_name}" --filter "status=running" -q | head -n 1)
    
    if [[ -z "$container_id" ]]; then
        # Fallback for non-swarm environments
        container_id=$(docker ps --filter "name=${STACK}_${service_name}" --filter "status=running" -q | head -n 1)
        if [[ -z "$container_id" ]]; then
            container_id=$(docker ps --filter "name=${service_name}" --filter "status=running" -q | head -n 1)
        fi
    fi
    
    if [[ -z "$container_id" ]]; then
        log error "Could not find running container for service: $service_name"
        return 1
    fi
    
    log info "Found container: $container_id"
    
    local deploy_cmd
    case "$workflow_type" in
        "original")
            deploy_cmd="cd /app/project && openfn deploy . --no-confirm --log info"
            ;;
        "sftp")
            deploy_cmd="cd /app/workflows && openfn deploy . --no-confirm --log info"
            ;;
    esac
    
    log info "Executing OpenFN deploy command..."
    if docker exec "$container_id" sh -c "$deploy_cmd"; then
        log info "OpenFN workflow configuration deployed successfully"
    else
        log error "Failed to deploy OpenFN workflow configuration"
        return 1
    fi
}

function destroy_workflow() {
    local workflow_type="$1"
    
    log info "Destroying $workflow_type workflow..."
    
    # For now, we destroy the entire stack since services share the same stack name
    # In the future, we might want more granular control
    docker::stack_destroy "$STACK"
    
    log info "$workflow_type workflow destroyed"
}

function switch_workflow() {
    local new_workflow_type="$1"
    local mode="${2:-prod}"
    
    log info "Switching to $new_workflow_type workflow..."
    
    # Destroy current deployment
    destroy_workflow "current"
    
    # Wait a bit for cleanup
    sleep 5
    
    # Deploy new workflow
    deploy_workflow "$new_workflow_type" "$mode"
    
    log info "Successfully switched to $new_workflow_type workflow"
}

function show_status() {
    log info "OpenFN Workflow Status:"
    echo ""
    
    # Check OpenFN core services
    echo "=== Core OpenFN Services ==="
    docker service ls --filter "name=${STACK}" --format "table {{.Name}}\t{{.Replicas}}\t{{.Image}}" 2>/dev/null || {
        echo "No swarm services found. Checking for running containers..."
        docker ps --filter "name=${STACK}" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
    }
    
    echo ""
    echo "=== Workflow Containers ==="
    docker ps --filter "name=workflow" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}" || echo "No workflow containers found"
    
    echo ""
    echo "=== Available Images ==="
    docker images --filter "reference=*openfn*workflow*" --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    
    echo ""
    echo "=== Environment Variables ==="
    echo "OPENFN_LOAD_WORKFLOW_ON_STARTUP: ${OPENFN_LOAD_WORKFLOW_ON_STARTUP:-not set}"
    echo "LOCAL_OPENFN_WORKFLOW_IMAGE: ${LOCAL_OPENFN_WORKFLOW_IMAGE:-not set}"
    echo "LOCAL_OPENFN_SFTP_WORKFLOW_IMAGE: ${LOCAL_OPENFN_SFTP_WORKFLOW_IMAGE:-not set}"
}

function main() {
    local action="$1"
    local workflow_type="$2"
    local mode="$3"
    
    if [[ -z "$action" ]]; then
        usage
        exit 1
    fi
    
    case "$action" in
        "deploy")
            if [[ -z "$workflow_type" ]]; then
                log error "Workflow type required for deploy action"
                usage
                exit 1
            fi
            deploy_workflow "$workflow_type" "$mode"
            ;;
        "destroy")
            if [[ -z "$workflow_type" ]]; then
                log error "Workflow type required for destroy action"
                usage
                exit 1
            fi
            destroy_workflow "$workflow_type"
            ;;
        "switch")
            if [[ -z "$workflow_type" ]]; then
                log error "Workflow type required for switch action"
                usage
                exit 1
            fi
            switch_workflow "$workflow_type" "$mode"
            ;;
        "status")
            show_status
            ;;
        *)
            log error "Unknown action: $action"
            usage
            exit 1
            ;;
    esac
}

main "$@"
