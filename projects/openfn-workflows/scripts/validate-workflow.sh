#!/bin/bash

# Validate OpenFN Workflows
# This script validates workflows before deployment

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
WORKFLOW_NAME="${1:-}"
WORKFLOW_PATH="${WORKFLOW_PATH:-/app/workflows}"

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [WORKFLOW_NAME]

Arguments:
  WORKFLOW_NAME    Name of the workflow to validate (optional - validates all if not specified)

Environment Variables:
  WORKFLOW_PATH    Path to workflows directory (default: /app/workflows)

Examples:
  $0                    # Validate all workflows
  $0 sftp-dhis2        # Validate specific workflow
  WORKFLOW_PATH=/path/to/workflows $0

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
    
    if [[ ! -d "$WORKFLOW_PATH" ]]; then
        error "Workflow path does not exist: $WORKFLOW_PATH"
        exit 1
    fi
    
    if [[ -n "$WORKFLOW_NAME" && ! -d "$WORKFLOW_PATH/$WORKFLOW_NAME" ]]; then
        error "Workflow directory does not exist: $WORKFLOW_PATH/$WORKFLOW_NAME"
        exit 1
    fi
    
    success "Environment validation passed"
}

# Validate a specific workflow
validate_specific_workflow() {
    local workflow_name="$1"
    local workflow_path="$WORKFLOW_PATH/$workflow_name"
    
    log "Validating workflow: $workflow_name"
    
    # Check if workflow directory exists
    if [[ ! -d "$workflow_path" ]]; then
        error "Workflow directory not found: $workflow_path"
        return 1
    fi
    
    # Check for project.yaml
    if [[ ! -f "$workflow_path/project.yaml" ]]; then
        error "project.yaml not found in workflow: $workflow_path"
        return 1
    fi
    
    # Validate YAML syntax
    if command -v yq >/dev/null 2>&1; then
        if ! yq eval '.' "$workflow_path/project.yaml" >/dev/null 2>&1; then
            error "Invalid YAML syntax in project.yaml"
            return 1
        fi
    else
        # Basic YAML validation without yq
        if ! grep -q "^[[:space:]]*[a-zA-Z]" "$workflow_path/project.yaml" 2>/dev/null; then
            error "project.yaml appears to be empty or invalid"
            return 1
        fi
    fi
    
    # Check for jobs directory
    local jobs_dir="$workflow_path/jobs"
    if [[ -d "$jobs_dir" ]]; then
        local job_count=$(find "$jobs_dir" -name "*.js" | wc -l)
        log "Found $job_count job files in $jobs_dir"
        
        # Validate each job file
        for job_file in "$jobs_dir"/*.js; do
            if [[ -f "$job_file" ]]; then
                local job_name=$(basename "$job_file")
                log "Validating job: $job_name"
                
                # Basic JavaScript syntax check
                if command -v node >/dev/null 2>&1; then
                    if ! node -c "$job_file" 2>/dev/null; then
                        error "JavaScript syntax error in $job_name"
                        return 1
                    fi
                fi
            fi
        done
    else
        warning "No jobs directory found in workflow"
    fi
    
    # Check for state directory
    local state_dir="$workflow_path/state"
    if [[ -d "$state_dir" ]]; then
        local state_count=$(find "$state_dir" -name "*.json" | wc -l)
        log "Found $state_count state files in $state_dir"
    fi
    
    success "Workflow '$workflow_name' validation completed successfully"
    return 0
}

# Validate all workflows
validate_all_workflows() {
    log "Validating all workflows in $WORKFLOW_PATH"
    
    local errors=0
    local total_workflows=0
    
    for workflow_dir in "$WORKFLOW_PATH"/*; do
        if [[ -d "$workflow_dir" && -f "$workflow_dir/project.yaml" ]]; then
            local workflow_name=$(basename "$workflow_dir")
            ((total_workflows++))
            
            if ! validate_specific_workflow "$workflow_name"; then
                ((errors++))
            fi
        fi
    done
    
    if [[ $total_workflows -eq 0 ]]; then
        warning "No workflows found in $WORKFLOW_PATH"
        return 0
    fi
    
    if [[ $errors -gt 0 ]]; then
        error "$errors out of $total_workflows workflow(s) failed validation"
        return 1
    else
        success "All $total_workflows workflow(s) validated successfully"
        return 0
    fi
}

# Main execution
main() {
    log "OpenFN Workflow Validation Script"
    log "Workflow path: $WORKFLOW_PATH"
    
    if [[ -n "$WORKFLOW_NAME" ]]; then
        log "Validating specific workflow: $WORKFLOW_NAME"
    else
        log "Validating all workflows"
    fi
    
    # Validate environment
    validate_environment
    
    # Run validation
    if [[ -n "$WORKFLOW_NAME" ]]; then
        # Validate specific workflow
        if validate_specific_workflow "$WORKFLOW_NAME"; then
            success "Validation completed successfully"
            exit 0
        else
            error "Validation failed"
            exit 1
        fi
    else
        # Validate all workflows
        if validate_all_workflows; then
            success "All validations completed successfully"
            exit 0
        else
            error "Some validations failed"
            exit 1
        fi
    fi
}

# Run main function
main "$@"
