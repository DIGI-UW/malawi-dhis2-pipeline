#!/bin/bash

# OpenFN Workflows Manager Entrypoint
# Handles both package lifecycle and CLI utility usage

set -e

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

# Initialize OpenFN CLI environment
initialize_openfn_env() {
    log "Initializing OpenFN CLI environment..."
    
    # Set global repo directory
    export OPENFN_REPO_DIR="${OPENFN_REPO_DIR:-/app}"
    
    # Create global auth directory structure
    mkdir -p "$OPENFN_REPO_DIR/auth"
    
    # Create auth config if we have credentials
    if [[ -n "$OPENFN_API_KEY" ]]; then
        log "Creating auth config with API key"
        cat > "$OPENFN_REPO_DIR/auth/openfn.json" << EOF
{
  "endpoint": "$OPENFN_ENDPOINT",
  "apiKey": "$OPENFN_API_KEY"
}
EOF
    elif [[ -n "$OPENFN_ADMIN_USER" && -n "$OPENFN_ADMIN_PASSWORD" ]]; then
        log "Creating auth config with user credentials"
        cat > "$OPENFN_REPO_DIR/auth/openfn.json" << EOF
{
  "endpoint": "$OPENFN_ENDPOINT",
  "username": "$OPENFN_ADMIN_USER",
  "password": "$OPENFN_ADMIN_PASSWORD"
}
EOF
    fi
    
    log "OpenFN CLI environment initialized"
    log "OPENFN_REPO_DIR: $OPENFN_REPO_DIR"
    log "Auth config created at: $OPENFN_REPO_DIR/auth/openfn.json"
}

# Validate environment
validate_environment() {
    local errors=0
    
    if [[ -z "$OPENFN_ENDPOINT" ]]; then
        log "ERROR: OPENFN_ENDPOINT is required"
        ((errors++))
    fi
    
    if [[ -z "$OPENFN_API_KEY" && (-z "$OPENFN_ADMIN_USER" || -z "$OPENFN_ADMIN_PASSWORD") ]]; then
        log "ERROR: Either OPENFN_API_KEY or OPENFN_ADMIN_USER+OPENFN_ADMIN_PASSWORD is required"
        ((errors++))
    fi
    
    if [[ "$MODE" == "deploy" && -z "$WORKFLOW_NAME" ]]; then
        log "ERROR: WORKFLOW_NAME is required for deploy mode"
        ((errors++))
    fi
    
    if [[ "$MODE" == "pull" && -z "$WORKFLOW_NAME" ]]; then
        log "ERROR: WORKFLOW_NAME is required for pull mode"
        ((errors++))
    fi
    
    if [[ ! -d "$WORKFLOW_PATH" ]]; then
        log "ERROR: Workflow path does not exist: $WORKFLOW_PATH"
        ((errors++))
    fi
    
    # For deploy mode, the specific workflow directory must exist
    if [[ "$MODE" == "deploy" && -n "$WORKFLOW_NAME" && ! -d "$WORKFLOW_PATH/$WORKFLOW_NAME" ]]; then
        log "ERROR: Workflow directory does not exist: $WORKFLOW_PATH/$WORKFLOW_NAME"
        ((errors++))
    fi
    
    return $errors
}

# List available workflows
list_workflows() {
    log "Available workflows in $WORKFLOW_PATH:"
    for workflow_dir in "$WORKFLOW_PATH"/*; do
        if [[ -d "$workflow_dir" && -f "$workflow_dir/project.yaml" ]]; then
            local workflow_name=$(basename "$workflow_dir")
            local description=""
            
            # Try to extract description from project.yaml
            if command -v yq >/dev/null 2>&1; then
                description=$(yq eval '.description' "$workflow_dir/project.yaml" 2>/dev/null || echo "")
            else
                description=$(grep -E "^description:" "$workflow_dir/project.yaml" | cut -d':' -f2- | sed 's/^ *//' 2>/dev/null || echo "")
            fi
            
            echo "  - $workflow_name: $description"
        fi
    done
}

# Validate a specific workflow
validate_workflow() {
    local workflow_name="$1"
    local workflow_path="$WORKFLOW_PATH/$workflow_name"
    
    log "Validating workflow: $workflow_name"
    
    if [[ ! -d "$workflow_path" ]]; then
        log "ERROR: Workflow directory not found: $workflow_path"
        return 1
    fi
    
    if [[ ! -f "$workflow_path/project.yaml" ]]; then
        log "ERROR: project.yaml not found in workflow: $workflow_path"
        return 1
    fi
    
    # Validate YAML syntax
    if command -v yq >/dev/null 2>&1; then
        if ! yq eval '.' "$workflow_path/project.yaml" >/dev/null 2>&1; then
            log "ERROR: Invalid YAML syntax in project.yaml"
            return 1
        fi
    fi
    
    # Check for job files
    local jobs_dir="$workflow_path/jobs"
    if [[ -d "$jobs_dir" ]]; then
        local job_count=$(find "$jobs_dir" -name "*.js" | wc -l)
        log "Found $job_count job files in $jobs_dir"
    else
        log "WARNING: No jobs directory found in workflow"
    fi
    
    log "Workflow validation completed successfully"
    return 0
}

# Deploy workflow to OpenFN
deploy_workflow() {
    local workflow_name="$1"
    local workflow_path="$WORKFLOW_PATH/$workflow_name"
    
    log "Deploying workflow: $workflow_name from $workflow_path"
    
    # Validate workflow first
    if ! validate_workflow "$workflow_name"; then
        log "ERROR: Workflow validation failed"
        return 1
    fi
    
    # Change to workflow directory
    cd "$workflow_path"
    
    # Update config.json with current endpoint and API key for this workflow
    log "Updating workflow config.json with current settings..."
    cat > config.json << EOF
{
  "endpoint": "$OPENFN_ENDPOINT",
  "apiKey": "$OPENFN_API_KEY",
  "specPath": "./project.yaml"
}
EOF
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would deploy workflow with command: openfn deploy --no-confirm --log info"
        log "DRY RUN: Current directory: $(pwd)"
        log "DRY RUN: Files present:"
        ls -la
        log "DRY RUN: Config content:"
        cat config.json
        return 0
    fi
    
    # Wait for OpenFN to be ready
    if ! wait_for_openfn_ready; then
        return 1
    fi
    
    # Deploy the workflow using config.json
    log "Executing OpenFN deploy command..."
    log "Config file content:"
    cat config.json
    
    if openfn deploy --no-confirm --log info; then
        log "Successfully deployed workflow: $workflow_name"
        return 0
    else
        log "ERROR: Failed to deploy workflow: $workflow_name"
        return 1
    fi
}

# Pull workflow from OpenFN instance
pull_workflow() {
    local workflow_name="$1"
    local workflow_path="$WORKFLOW_PATH/$workflow_name"
    
    log "Pulling workflow: $workflow_name to $workflow_path"
    
    # Create workflow directory if it doesn't exist
    mkdir -p "$workflow_path"
    cd "$workflow_path"
    
    # Create/update config.json for this workflow
    log "Creating workflow config.json..."
    cat > config.json << EOF
{
  "endpoint": "$OPENFN_ENDPOINT",
  "apiKey": "$OPENFN_API_KEY",
  "specPath": "./project.yaml"
}
EOF
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would pull workflow with command: openfn pull --no-confirm --log info"
        log "DRY RUN: Current directory: $(pwd)"
        log "DRY RUN: Config content:"
        cat config.json
        return 0
    fi
    
    # Wait for OpenFN to be ready
    if ! wait_for_openfn_ready; then
        return 1
    fi
    
    # Pull the workflow
    log "Executing OpenFN pull command..."
    log "Config file content:"
    cat config.json
    
    if openfn pull --no-confirm --log info; then
        log "Successfully pulled workflow: $workflow_name"
        log "Files now in directory:"
        ls -la
        return 0
    else
        log "ERROR: Failed to pull workflow: $workflow_name"
        return 1
    fi
}

# Wait for OpenFN instance to be ready
wait_for_openfn_ready() {
    log "Waiting for OpenFN to be ready at $OPENFN_ENDPOINT..."
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        ((attempt++))
        log "Attempt $attempt/$max_attempts: Checking OpenFN API availability..."
        
        # Check if we get the expected "Log in" h1 text in the response (handles multiline)
        local response=$(curl -s "$OPENFN_ENDPOINT/users/log_in" 2>/dev/null || true)
        if [[ -n "$response" ]] && echo "$response" | tr -d '\n\r' | grep -q "<h1[^>]*>.*Log in.*</h1>"; then
            log "OpenFN API is ready and returning login page with expected content"
            return 0
        fi
        
        if [[ $attempt -lt $max_attempts ]]; then
            log "OpenFN API not ready (no valid login page response), waiting 10 seconds..."
            sleep 10
        fi
    done
    
    log "ERROR: OpenFN did not become ready within expected time"
    return 1
}

# Wait for completion signal (useful for package lifecycle)
wait_for_completion() {
    log "Workflow deployment completed. Keeping container alive..."
    log "Send SIGTERM to exit gracefully"
    
    # Handle shutdown gracefully
    trap 'log "Received shutdown signal, exiting..."; exit 0' SIGTERM SIGINT
    
    # Keep container alive
    while true; do
        sleep 30
    done
}

# Main execution logic
main() {
    log "OpenFN Workflows Manager starting..."
    log "Mode: $MODE"
    log "Workflow path: $WORKFLOW_PATH"
    log "OpenFN endpoint: $OPENFN_ENDPOINT"
    
    # Initialize OpenFN CLI environment first
    initialize_openfn_env
    
    # If custom commands are passed, execute them
    if [[ $# -gt 0 ]]; then
        log "Executing custom command: $*"
        exec "$@"
        return $?
    fi
    
    # Validate environment for non-list modes
    if [[ "$MODE" != "list" ]]; then
        if ! validate_environment; then
            log "ERROR: Environment validation failed"
            exit 1
        fi
    fi
    
    # Execute based on mode
    case "$MODE" in
        "list")
            list_workflows
            ;;
        "validate")
            if [[ -n "$WORKFLOW_NAME" ]]; then
                validate_workflow "$WORKFLOW_NAME"
            else
                log "Validating all workflows..."
                local errors=0
                for workflow_dir in "$WORKFLOW_PATH"/*; do
                    if [[ -d "$workflow_dir" && -f "$workflow_dir/project.yaml" ]]; then
                        local workflow_name=$(basename "$workflow_dir")
                        if ! validate_workflow "$workflow_name"; then
                            ((errors++))
                        fi
                    fi
                done
                
                if [[ $errors -gt 0 ]]; then
                    log "ERROR: $errors workflow(s) failed validation"
                    exit 1
                else
                    log "All workflows validated successfully"
                fi
            fi
            ;;
        "deploy")
            deploy_workflow "$WORKFLOW_NAME"
            
            # Keep container alive if this is part of package lifecycle
            if [[ "${PACKAGE_LIFECYCLE}" == "true" ]]; then
                wait_for_completion
            fi
            ;;
        "pull")
            pull_workflow "$WORKFLOW_NAME"
            
            # Keep container alive if this is part of package lifecycle
            if [[ "${PACKAGE_LIFECYCLE}" == "true" ]]; then
                wait_for_completion
            fi
            ;;
        *)
            log "ERROR: Unknown mode: $MODE"
            log "Available modes: list, validate, deploy, pull"
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
main "$@"
