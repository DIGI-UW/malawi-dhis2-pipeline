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
    
    # For deploy mode, empty WORKFLOW_NAME means deploy all workflows
    # For pull mode, WORKFLOW_NAME is still required
    if [[ "$MODE" == "pull" && -z "$WORKFLOW_NAME" ]]; then
        log "ERROR: WORKFLOW_NAME is required for pull mode"
        ((errors++))
    fi
    
    if [[ ! -d "$WORKFLOW_PATH" ]]; then
        log "ERROR: Workflow path does not exist: $WORKFLOW_PATH"
        ((errors++))
    fi
    
    # For deploy mode, if specific workflow name is given, check that directory exists
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
    log "Current working directory before change: $(pwd)"
    
    # Check if workflow directory exists
    if [[ ! -d "$workflow_path" ]]; then
        log "ERROR: Workflow directory does not exist: $workflow_path"
        return 1
    fi
    
    # Validate workflow first
    log "Validating workflow: $workflow_name"
    if ! validate_workflow "$workflow_name"; then
        log "ERROR: Workflow validation failed for $workflow_name"
        return 1
    fi
    log "Workflow validation passed for: $workflow_name"
    
    # Change to workflow directory
    log "Changing to workflow directory: $workflow_path"
    cd "$workflow_path" || {
        log "ERROR: Failed to change to directory: $workflow_path"
        return 1
    }
    log "Current working directory after change: $(pwd)"
    log "Contents of workflow directory:"
    ls -la 2>&1 | while read line; do log "  $line"; done
    
    # Update config.json with current endpoint and API key for this workflow
    log "Updating workflow config.json with current settings..."
    log "OPENFN_ENDPOINT: $OPENFN_ENDPOINT"
    log "OPENFN_API_KEY: ${OPENFN_API_KEY:0:8}***"
    
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
    log "Checking if OpenFN is ready..."
    if ! wait_for_openfn_ready; then
        log "ERROR: OpenFN is not ready for deployment"
        return 1
    fi
    log "OpenFN is ready for deployment"
    
    # Note: Credentials are now defined in project.yaml and will be created by OpenFN deploy
    # However, we need to ensure the credential body (username/password) exists in the platform
    if [[ "$workflow_name" == "sftp-test" ]]; then
        log "Note: sftp-test workflow requires credential 'sftp-test-credential' to be configured"
        log "The credential should have the following body:"
        log "  username: openfn"
        log "  password: instant101"
        log "This can be configured in the OpenFN UI after deployment"
    fi
    
    # Deploy the workflow using config.json
    log "Executing OpenFN deploy command..."
    log "Config file content:"
    cat config.json
    
    log "Running: openfn deploy --no-confirm --log info"
    # Capture both stdout and stderr for better debugging
    if openfn deploy --no-confirm --log info 2>&1 | while read line; do log "OPENFN: $line"; done; then
        log "Successfully deployed workflow: $workflow_name"
        return 0
    else
        local exit_code=$?
        log "ERROR: Failed to deploy workflow: $workflow_name (exit code: $exit_code)"
        return 1
    fi
}

# Deploy all workflows in the workflows directory
deploy_all_workflows() {
    log "Deploying all workflows from $WORKFLOW_PATH"
    
    # First, let's see what's in the directory
    log "Checking contents of $WORKFLOW_PATH..."
    ls -la "$WORKFLOW_PATH" 2>&1 | while read line; do log "  $line"; done
    
    local deployed=0
    local failed=0
    local total=0
    
    log "Scanning for workflows with project.yaml files..."
    
    for workflow_dir in "$WORKFLOW_PATH"/*; do
        log "Checking directory: $workflow_dir"
        
        if [[ -d "$workflow_dir" ]]; then
            log "  → Is a directory"
            if [[ -f "$workflow_dir/project.yaml" ]]; then
                log "  → Has project.yaml file"
                local workflow_name
                workflow_name=$(basename "$workflow_dir")
                log "  → Workflow name: $workflow_name"
                
                total=$((total + 1))
                log "  → Total workflows found so far: $total"
                
                log "=== Deploying workflow $total: $workflow_name ==="
                log "Workflow path: $workflow_dir"
                
                # Add error handling around deployment
                set +e  # Don't exit on error
                if deploy_workflow "$workflow_name"; then
                    deployed=$((deployed + 1))
                    log "✅ Successfully deployed: $workflow_name"
                else
                    failed=$((failed + 1))
                    log "❌ Failed to deploy: $workflow_name"
                    log "Continuing with next workflow..."
                fi
                set -e  # Re-enable exit on error
                
                log "=== End of $workflow_name deployment ==="
                log ""
            else
                log "  → No project.yaml file found, skipping"
            fi
        else
            log "  → Not a directory, skipping"
        fi
    done
    
    log "Deployment Summary:"
    log "  Total workflows found: $total"
    log "  Successfully deployed: $deployed"
    log "  Failed deployments: $failed"
    
    if [[ $total -eq 0 ]]; then
        log "WARNING: No workflows found to deploy"
        return 0
    elif [[ $failed -gt 0 ]]; then
        log "ERROR: $failed workflow(s) failed to deploy"
        return 1
    else
        log "All workflows deployed successfully"
        return 0
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
  "specPath": "./project.yaml",
  "projectId": "$workflow_name"
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
    
    # Check if endpoint is set
    if [[ -z "$OPENFN_ENDPOINT" ]]; then
        log "ERROR: OPENFN_ENDPOINT is not set"
        return 1
    fi
    
    local max_attempts=30
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        ((attempt++))
        log "Attempt $attempt/$max_attempts: Checking OpenFN API availability at $OPENFN_ENDPOINT/users/log_in"
        
        # Test basic connectivity first
        if ! curl -s --connect-timeout 5 --max-time 10 "$OPENFN_ENDPOINT/users/log_in" >/dev/null 2>&1; then
            log "  → Cannot connect to $OPENFN_ENDPOINT (connection failed)"
            if [[ $attempt -lt $max_attempts ]]; then
                log "  → Waiting 10 seconds before retry..."
                sleep 10
            fi
            continue
        fi
        
        # Check if we get the expected "Log in" h1 text in the response (handles multiline)
        log "  → Connection successful, checking response content..."
        local response=$(curl -s --connect-timeout 5 --max-time 10 "$OPENFN_ENDPOINT/users/log_in" 2>/dev/null || true)
        
        if [[ -z "$response" ]]; then
            log "  → Empty response from OpenFN"
        elif echo "$response" | tr -d '\n\r' | grep -q "<h1[^>]*>.*Log in.*</h1>"; then
            log "  → OpenFN API is ready and returning login page with expected content"
            return 0
        else
            log "  → Response received but does not contain expected login page content"
            # Show first 200 chars of response for debugging
            local preview=$(echo "$response" | tr -d '\n\r' | cut -c1-200)
            log "  → Response preview: $preview..."
        fi
        
        if [[ $attempt -lt $max_attempts ]]; then
            log "  → OpenFN API not ready, waiting 10 seconds..."
            sleep 10
        fi
    done
    
    log "ERROR: OpenFN did not become ready within expected time ($max_attempts attempts)"
    log "Final endpoint check: $OPENFN_ENDPOINT"
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
    
    # Check for manual CLI mode
    if [[ "${OPENFN_WORKFLOW_MANUAL_CLI}" == "true" ]]; then
        log "OPENFN_WORKFLOW_MANUAL_CLI is enabled - starting interactive shell mode"
        log "Container is ready for manual workflow debugging"
        log "Available commands:"
        log "  - openfn --help"
        log "  - /app/entrypoint.sh deploy (to deploy workflows)"
        log "  - /app/entrypoint.sh validate (to validate workflows)"
        log "Working directory: /app"
        log "Workflow path: $WORKFLOW_PATH"
        
        # Keep container alive with shell access
        exec /bin/bash
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
            if [[ -z "$WORKFLOW_NAME" ]]; then
                log "No specific workflow name provided - deploying all workflows"
                deploy_all_workflows
            else
                log "Deploying specific workflow: $WORKFLOW_NAME"
            deploy_workflow "$WORKFLOW_NAME"
            fi
            
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
