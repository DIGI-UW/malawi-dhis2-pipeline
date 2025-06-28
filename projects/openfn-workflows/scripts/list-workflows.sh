#!/bin/bash

# List OpenFN Workflows
# This script lists all available workflows

set -e

# Colors for output
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

# Default values
WORKFLOW_PATH="${WORKFLOW_PATH:-/app/workflows}"

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Options:
  -h, --help    Show this help message

Environment Variables:
  WORKFLOW_PATH    Path to workflows directory (default: /app/workflows)

Examples:
  $0
  WORKFLOW_PATH=/path/to/workflows $0
EOF
}

# Check if help is requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    show_usage
    exit 0
fi

# Validate environment
validate_environment() {
    if [[ ! -d "$WORKFLOW_PATH" ]]; then
        warning "Workflow path does not exist: $WORKFLOW_PATH"
        return 1
    fi
    return 0
}

# List workflows
list_workflows() {
    log "Listing workflows in: $WORKFLOW_PATH"
    echo ""
    
    local workflow_count=0
    
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
            
            # Count job files
            local jobs_dir="$workflow_dir/jobs"
            local job_count=0
            if [[ -d "$jobs_dir" ]]; then
                job_count=$(find "$jobs_dir" -name "*.js" | wc -l)
            fi
            
            # Count state files
            local state_dir="$workflow_dir/state"
            local state_count=0
            if [[ -d "$state_dir" ]]; then
                state_count=$(find "$state_dir" -name "*.json" | wc -l)
            fi
            
            echo "📋 $workflow_name"
            if [[ -n "$description" ]]; then
                echo "   Description: $description"
            fi
            echo "   Jobs: $job_count"
            echo "   State files: $state_count"
            echo "   Path: $workflow_dir"
            echo ""
            
            ((workflow_count++))
        fi
    done
    
    if [[ $workflow_count -eq 0 ]]; then
        warning "No workflows found in $WORKFLOW_PATH"
        echo "   Make sure the directory contains workflow folders with project.yaml files"
    else
        success "Found $workflow_count workflow(s)"
    fi
}

# Main execution
main() {
    log "OpenFN Workflow Listing Script"
    
    # Validate environment
    if ! validate_environment; then
        exit 1
    fi
    
    # List workflows
    list_workflows
}

# Run main function
main "$@"
