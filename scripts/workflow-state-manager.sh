#!/bin/bash

# OpenFN Workflow State Manager
# Handles workflow deployment with state management and conflict detection

set -e

# Configuration
WORKFLOW_DIR="projects/openfn-workflows/workflows/sftp-dhis2"
VERSIONS_DIR="$WORKFLOW_DIR/.versions"
SNAPSHOTS_DIR="$WORKFLOW_DIR/.snapshots"
OPENFN_URL="http://localhost:4000"
API_KEY="apiKey"
PROJECT_NAME="malawi-sftp"  # Use project name instead of hardcoded ID

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_debug() { echo -e "${MAGENTA}[DEBUG]${NC} $1"; }

# Get project ID dynamically by name
get_project_id() {
    local response=$(curl -s -H "Authorization: Bearer $API_KEY" \
                          -H "Accept: application/json" \
                          "$OPENFN_URL/api/projects")
    
    if command -v jq &> /dev/null; then
        local project_id=$(echo "$response" | jq -r ".data[] | select(.name == \"$PROJECT_NAME\") | .id" 2>/dev/null)
        
        # If not found in projects API, try checking all projects via provisioning API
        if [[ -z "$project_id" || "$project_id" == "null" ]]; then
            local project_ids=$(echo "$response" | jq -r '.data[].id' 2>/dev/null)
            for id in $project_ids; do
                local prov_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
                                          -H "Accept: application/json" \
                                          "$OPENFN_URL/api/provision/$id")
                local prov_name=$(echo "$prov_response" | jq -r '.data.name' 2>/dev/null)
                if [[ "$prov_name" == "$PROJECT_NAME" ]]; then
                    echo "$id"
                    return 0
                fi
            done
        else
            echo "$project_id"
            return 0
        fi
    else
        # Fallback without jq - use first project if only one exists
        local project_id=$(echo "$response" | grep '"id":' | sed 's/.*"id":"\([^"]*\)".*/\1/' | head -1)
        echo "$project_id"
    fi
}

# Fetch current state from OpenFN
fetch_current_state() {
    log_info "Fetching current workflow state from OpenFN..."
    
    local project_id=$(get_project_id)
    if [[ -z "$project_id" ]]; then
        log_error "Could not find project with name: $PROJECT_NAME"
        return 1
    fi
    
    log_info "Using project ID: $project_id"
    
    local response=$(curl -s -H "Authorization: Bearer $API_KEY" \
                          -H "Accept: application/json" \
                          "$OPENFN_URL/api/provision/$project_id")
    
    if echo "$response" | jq -e .data > /dev/null 2>&1; then
        echo "$response" | jq .data > "$WORKFLOW_DIR/.current-state.json"
        log_success "Current state fetched and saved"
        return 0
    else
        log_error "Failed to fetch current state: $response"
        return 1
    fi
}

# Compare local and server state
detect_conflicts() {
    log_info "Detecting conflicts between local and server state..."
    
    if [[ ! -f "$WORKFLOW_DIR/.deployed-state.json" ]]; then
        log_warning "No previous deployment state found - first deployment"
        return 1
    fi
    
    if [[ ! -f "$WORKFLOW_DIR/.current-state.json" ]]; then
        log_error "Current state not available - run fetch first"
        return 1
    fi
    
    # Compare workflows, jobs, triggers
    local conflicts=0
    
    # Check if workflows were modified in UI
    local deployed_hash=$(jq -r '.workflows[] | .updated_at // .inserted_at' "$WORKFLOW_DIR/.deployed-state.json" 2>/dev/null || echo "")
    local current_hash=$(jq -r '.workflows[] | .updated_at // .inserted_at' "$WORKFLOW_DIR/.current-state.json" 2>/dev/null || echo "")
    
    if [[ "$deployed_hash" != "$current_hash" ]]; then
        log_warning "Workflow modified in UI since last deployment"
        conflicts=$((conflicts + 1))
    fi
    
    # Check job modifications
    if jq -e '.workflows[].jobs' "$WORKFLOW_DIR/.current-state.json" > /dev/null 2>&1; then
        local job_changes=$(jq -r '
            [.workflows[] | .jobs[] | select(.updated_at > (.inserted_at // "1970-01-01"))] | length
        ' "$WORKFLOW_DIR/.current-state.json" 2>/dev/null || echo "0")
        
        if [[ $job_changes -gt 0 ]]; then
            log_warning "Jobs modified in UI: $job_changes changes detected"
            conflicts=$((conflicts + 1))
        fi
    fi
    
    if [[ $conflicts -gt 0 ]]; then
        log_warning "Conflicts detected: $conflicts areas of divergence"
        return 0
    else
        log_success "No conflicts detected"
        return 1
    fi
}

# Create backup of current state
backup_state() {
    local backup_dir="$WORKFLOW_DIR/.state-backups"
    mkdir -p "$backup_dir"
    
    local timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
    local backup_file="$backup_dir/backup-$timestamp.json"
    
    if [[ -f "$WORKFLOW_DIR/.current-state.json" ]]; then
        cp "$WORKFLOW_DIR/.current-state.json" "$backup_file"
        log_success "State backed up to: $backup_file"
    fi
}

# Deploy workflow with state tracking
deploy_workflow() {
    local force="$1"
    
    log_info "Deploying workflow to OpenFN..."
    
    # Fetch current state first
    fetch_current_state || return 1
    
    # Create backup and snapshot
    backup_state
    create_snapshot "Pre-deployment snapshot" || log_warning "Failed to create snapshot"
    
    # Check for conflicts unless forcing
    if [[ "$force" != "--force" ]]; then
        if detect_conflicts; then
            log_warning "Conflicts detected. Resolution options:"
            echo "1. Use --force to override server changes with local code"
            echo "2. Use 'export' command to save server changes first"
            echo "3. Use 'status' command to review conflicts"
            return 1
        fi
    fi
    
    # Deploy using our existing workflow loader
    log_info "Deploying via workflow loader service..."
    
    # Rebuild workflow image with changes
    if ./build-custom-images.sh openfn-workflows; then
        log_success "Workflow image rebuilt"
    else
        log_error "Failed to rebuild workflow image"
        return 1
    fi
    
    # Redeploy OpenFN service
    if ./instant package up -n openfn -d; then
        log_success "OpenFN service redeployed"
        
        # Wait for deployment to complete
        sleep 10
        
        # Fetch new state and save as deployed state
        fetch_current_state
        cp "$WORKFLOW_DIR/.current-state.json" "$WORKFLOW_DIR/.deployed-state.json"
        
        # Save deployment info with version tracking
        local project_id=$(get_project_id)
        if [[ -n "$project_id" ]]; then
            local response=$(curl -s -H "Authorization: Bearer $API_KEY" \
                                  -H "Accept: application/json" \
                                  "$OPENFN_URL/api/provision/$project_id")
            
            echo "$response" | jq '.data.workflows[0] | {updated_at, lock_version, id}' > "$WORKFLOW_DIR/.last-deployed.json"
        fi
        
        log_success "State tracking updated"
        return 0
    else
        log_error "Deployment failed"
        return 1
    fi
}

# Export current server state for review
export_server_state() {
    log_info "Exporting current server state..."
    
    fetch_current_state || return 1
    
    # Pretty print the current state
    log_info "Current server state:"
    jq . "$WORKFLOW_DIR/.current-state.json"
    
    # Show workflow summary
    if command -v jq &> /dev/null; then
        echo ""
        log_info "Workflow Summary:"
        jq -r '
            "Project: " + .name + " (ID: " + .id + ")",
            "Description: " + (.description // "No description"),
            "Workflows: " + (.workflows | length | tostring),
            (.workflows[] | "  - " + .name + " (Jobs: " + (.jobs | length | tostring) + ", Triggers: " + (.triggers | length | tostring) + ")")
        ' "$WORKFLOW_DIR/.current-state.json"
    fi
    
    log_success "Server state exported to: $WORKFLOW_DIR/.current-state.json"
}

# Show sync status
show_status() {
    log_info "Checking workflow sync status..."
    
    fetch_current_state || return 1
    
    if detect_conflicts; then
        log_warning "⚠️  Workflow has diverged from source code"
        echo ""
        echo "Possible actions:"
        echo "  1. Review changes: ./scripts/workflow-state-manager.sh export"
        echo "  2. Deploy code changes: ./scripts/workflow-state-manager.sh deploy --force"
        echo "  3. Check differences: diff $WORKFLOW_DIR/.deployed-state.json $WORKFLOW_DIR/.current-state.json"
    else
        log_success "✅ Workflow in sync with source code"
    fi
    
    # Show last deployment info
    if [[ -f "$WORKFLOW_DIR/.deployed-state.json" ]]; then
        local last_deployed=$(stat -c %y "$WORKFLOW_DIR/.deployed-state.json" 2>/dev/null || echo "Unknown")
        echo "Last deployment: $last_deployed"
    fi
}

# List available backups
list_backups() {
    local backup_dir="$WORKFLOW_DIR/.state-backups"
    
    if [[ -d "$backup_dir" ]]; then
        log_info "Available state backups:"
        ls -la "$backup_dir"/*.json 2>/dev/null || log_info "No backups found"
    else
        log_info "No backup directory found"
    fi
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    
    if [[ -z "$backup_file" ]]; then
        log_error "Please specify backup file to restore"
        list_backups
        return 1
    fi
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    log_warning "Restoring from backup: $backup_file"
    log_warning "This will override current server state!"
    
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # This would require implementing restore via provisioning API
        log_warning "Restore functionality not yet implemented"
        log_info "Manual restore: Use provisioning API to POST backup content"
        log_info "Backup file: $backup_file"
    else
        log_info "Restore cancelled"
    fi
}

# Download current workflow state with versioning
download_latest() {
    log_info "Downloading latest workflow state from OpenFN..."
    
    local project_id=$(get_project_id)
    if [[ -z "$project_id" ]]; then
        log_error "Could not find project: $PROJECT_NAME"
        return 1
    fi
    
    # Create directories
    mkdir -p "$VERSIONS_DIR" "$SNAPSHOTS_DIR"
    
    # Get current state via provisioning API (complete project structure)
    local prov_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
                              -H "Accept: application/json" \
                              "$OPENFN_URL/api/provision/$project_id")
    
    # Get detailed workflow via new Workflows API
    local workflow_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
                                  -H "Accept: application/json" \
                                  "$OPENFN_URL/api/projects/$project_id/workflows")
    
    local timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
    
    # Save complete project state
    echo "$prov_response" | jq . > "$VERSIONS_DIR/project-state-$timestamp.json"
    
    # Save detailed workflow state
    echo "$workflow_response" | jq . > "$VERSIONS_DIR/workflow-detail-$timestamp.json"
    
    # Create symlinks to latest
    ln -sf "project-state-$timestamp.json" "$VERSIONS_DIR/latest-project.json"
    ln -sf "workflow-detail-$timestamp.json" "$VERSIONS_DIR/latest-workflow.json"
    
    # Also update the legacy current state file
    echo "$prov_response" | jq .data > "$WORKFLOW_DIR/.current-state.json"
    
    log_success "Latest state downloaded to:"
    log_info "  Project state: $VERSIONS_DIR/project-state-$timestamp.json"
    log_info "  Workflow detail: $VERSIONS_DIR/workflow-detail-$timestamp.json"
    log_info "  Latest symlinks: $VERSIONS_DIR/latest-*.json"
    
    return 0
}

# Extract workflow to source files
extract_to_source() {
    local source_file="${1:-$VERSIONS_DIR/latest-project.json}"
    local target_dir="${2:-$WORKFLOW_DIR}"
    
    if [[ ! -f "$source_file" ]]; then
        log_error "Source file not found: $source_file"
        log_info "Run 'download-latest' first to get current state"
        return 1
    fi
    
    log_info "Extracting workflow from $source_file to $target_dir"
    
    # Create target directory structure
    mkdir -p "$target_dir/jobs"
    mkdir -p "$target_dir/extracted"
    
    local timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
    local extract_dir="$target_dir/extracted/$timestamp"
    mkdir -p "$extract_dir"
    
    if command -v jq &> /dev/null; then
        # Extract project metadata
        jq -r '.data // .workflows[0] | {
            name: .name,
            description: .description,
            workflows: [.workflows[0] // . | {
                name: .name,
                jobs: [.jobs[] | {name: .name, adaptor: .adaptor}],
                triggers: [.triggers[] | {type: .type, enabled: .enabled}],
                edges: [.edges[] | {condition_type: .condition_type, enabled: .enabled}]
            }]
        }' "$source_file" > "$extract_dir/project-structure.json"
        
        # Extract individual jobs
        local job_count=$(jq -r '.data.workflows[0].jobs // .workflows[0].jobs // [] | length' "$source_file" 2>/dev/null || echo "0")
        if [[ "$job_count" -gt 0 ]]; then
            log_info "Extracting $job_count job(s)..."
            
            # Extract jobs using a safer approach
            for i in $(seq 0 $((job_count - 1))); do
                local job_name=$(jq -r ".data.workflows[0].jobs[$i].name // \"job-$i\"" "$source_file" 2>/dev/null)
                local job_body=$(jq -r ".data.workflows[0].jobs[$i].body // \"\"" "$source_file" 2>/dev/null)
                
                # Clean up job name for filename
                local safe_name=$(echo "$job_name" | sed 's/[^a-zA-Z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g')
                local job_file="$extract_dir/job-${i}-${safe_name}.js"
                
                if [[ -n "$job_body" && "$job_body" != "null" ]]; then
                    echo "$job_body" > "$job_file"
                    log_debug "Extracted job: $(basename "$job_file")"
                fi
            done
        fi
        
        # Create a simplified project.yaml
        cat > "$extract_dir/project.yaml" << EOF
name: $(jq -r '.data.name // .workflows[0].name // "extracted-workflow"' "$source_file")
description: $(jq -r '.data.description // .workflows[0].description // "Extracted from OpenFN"' "$source_file")
workflows:
  ExtractedWorkflow:
    name: $(jq -r '.data.workflows[0].name // .workflows[0].name // "Extracted Workflow"' "$source_file")
    # Jobs and triggers would need manual reconstruction
    # This is a starting point for manual editing
EOF
        
        log_success "Workflow extracted to: $extract_dir"
        log_info "Files created:"
        log_info "  - project-structure.json (metadata)"
        log_info "  - project.yaml (template for manual editing)"
        log_info "  - job-*.js (individual job files)"
        
        # Create symlink to latest extraction
        ln -sf "$timestamp" "$target_dir/extracted/latest"
        
    else
        log_error "jq is required for extraction. Please install jq."
        return 1
    fi
}

# Enhanced version comparison with lock_version
compare_versions() {
    log_info "Comparing local source with server state..."
    
    # Download current state first
    download_latest || return 1
    
    local latest_file="$VERSIONS_DIR/latest-project.json"
    if [[ ! -f "$latest_file" ]]; then
        log_error "No server state available"
        return 1
    fi
    
    # Compare timestamps and versions
    if command -v jq &> /dev/null; then
        local server_updated=$(jq -r '.data.workflows[0].updated_at // .workflows[0].updated_at // "unknown"' "$latest_file")
        local server_version=$(jq -r '.data.workflows[0].lock_version // .workflows[0].lock_version // 0' "$latest_file")
        
        log_info "Server state:"
        log_info "  Last updated: $server_updated"
        log_info "  Lock version: $server_version"
        
        # Check if we have local version info
        if [[ -f "$WORKFLOW_DIR/.last-deployed.json" ]]; then
            local local_updated=$(jq -r '.updated_at // "unknown"' "$WORKFLOW_DIR/.last-deployed.json")
            local local_version=$(jq -r '.lock_version // 0' "$WORKFLOW_DIR/.last-deployed.json")
            
            log_info "Last deployed from local:"
            log_info "  Last updated: $local_updated"
            log_info "  Lock version: $local_version"
            
            if [[ "$server_version" -gt "$local_version" ]]; then
                log_warning "⚠️  Server has newer version (server: $server_version, local: $local_version)"
                log_warning "Consider downloading latest state before deploying"
                return 1
            elif [[ "$server_version" -eq "$local_version" ]]; then
                log_success "✅ Versions in sync (version: $server_version)"
                return 0
            else
                log_info "📤 Local changes ready to deploy (local version ahead)"
                return 0
            fi
        else
            log_warning "No local deployment history found"
            return 1
        fi
    else
        log_error "jq is required for version comparison"
        return 1
    fi
}

# Create snapshot with metadata
create_snapshot() {
    local description="${1:-Manual snapshot}"
    
    log_info "Creating snapshot: $description"
    
    local timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
    local snapshot_dir="$SNAPSHOTS_DIR/$timestamp"
    mkdir -p "$snapshot_dir"
    
    # Download current state
    local project_id=$(get_project_id)
    if [[ -z "$project_id" ]]; then
        log_error "Could not find project: $PROJECT_NAME"
        return 1
    fi
    
    # Save current server state
    local prov_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
                              -H "Accept: application/json" \
                              "$OPENFN_URL/api/provision/$project_id")
    
    echo "$prov_response" | jq . > "$snapshot_dir/server-state.json"
    
    # Save current local source
    if [[ -f "$WORKFLOW_DIR/project.yaml" ]]; then
        cp "$WORKFLOW_DIR/project.yaml" "$snapshot_dir/"
    fi
    
    if [[ -d "$WORKFLOW_DIR/jobs" ]]; then
        cp -r "$WORKFLOW_DIR/jobs" "$snapshot_dir/"
    fi
    
    # Create metadata
    cat > "$snapshot_dir/metadata.json" << EOF
{
    "timestamp": "$timestamp",
    "description": "$description",
    "project_name": "$PROJECT_NAME",
    "created_by": "workflow-state-manager",
    "server_version": $(echo "$prov_response" | jq -r '.data.workflows[0].lock_version // 0'),
    "server_updated": "$(echo "$prov_response" | jq -r '.data.workflows[0].updated_at // null')"
}
EOF
    
    # Create symlink to latest snapshot
    ln -sf "$timestamp" "$SNAPSHOTS_DIR/latest"
    
    log_success "Snapshot created: $snapshot_dir"
    return 0
}

# List available snapshots and versions
list_versions() {
    log_info "📦 Available Snapshots:"
    if [[ -d "$SNAPSHOTS_DIR" ]]; then
        for snapshot in "$SNAPSHOTS_DIR"/*/; do
            if [[ -d "$snapshot" && -f "$snapshot/metadata.json" ]]; then
                local desc=$(jq -r '.description // "No description"' "$snapshot/metadata.json" 2>/dev/null)
                local timestamp=$(basename "$snapshot")
                local version=$(jq -r '.server_version // "unknown" | tostring' "$snapshot/metadata.json" 2>/dev/null)
                log_info "  $timestamp (v$version): $desc"
            fi
        done
    else
        log_info "  No snapshots found"
    fi
    
    echo ""
    log_info "📁 Available Downloads:"
    if [[ -d "$VERSIONS_DIR" ]]; then
        for version in "$VERSIONS_DIR"/*.json; do
            if [[ -f "$version" ]]; then
                local filename=$(basename "$version")
                local size=$(du -h "$version" | cut -f1)
                log_info "  $filename ($size)"
            fi
        done
    else
        log_info "  No downloads found"
    fi
}

# Main command handler
main() {
    local command="$1"
    local option="$2"
    
    # Create workflow directory if it doesn't exist
    mkdir -p "$WORKFLOW_DIR" "$VERSIONS_DIR" "$SNAPSHOTS_DIR"
    
    case "$command" in
        "fetch")
            fetch_current_state
            ;;
        "download-latest"|"download")
            download_latest
            ;;
        "extract")
            local source_file="${option:-$VERSIONS_DIR/latest-project.json}"
            extract_to_source "$source_file"
            ;;
        "compare")
            compare_versions
            ;;
        "conflicts")
            fetch_current_state && detect_conflicts
            ;;
        "deploy")
            deploy_workflow "$option"
            ;;
        "export")
            export_server_state
            ;;
        "status")
            show_status
            ;;
        "backup")
            fetch_current_state && backup_state
            ;;
        "snapshot")
            create_snapshot "${option:-Manual snapshot}"
            ;;
        "list-backups")
            list_backups
            ;;
        "list"|"versions")
            list_versions
            ;;
        "restore")
            restore_backup "$option"
            ;;
        *)
            echo "OpenFN Workflow State Manager"
            echo ""
            echo "Usage: $0 {command} [options]"
            echo ""
            echo "State Management Commands:"
            echo "  fetch           - Fetch current state from OpenFN (legacy)"
            echo "  download-latest - Download current workflow state with versioning"
            echo "  conflicts       - Check for conflicts between local and server"
            echo "  deploy [--force] - Deploy workflow (use --force to override conflicts)"
            echo "  export          - Export server state for review"
            echo "  status          - Show sync status"
            echo ""
            echo "Version Management Commands:"
            echo "  compare         - Compare local source with server state (with lock_version)"
            echo "  snapshot [desc] - Create snapshot of current state"
            echo "  extract [file]  - Extract workflow to source files"
            echo "  list            - List available snapshots and downloads"
            echo ""
            echo "Backup Commands:"
            echo "  backup          - Create backup of current state"
            echo "  list-backups    - List available backups"
            echo "  restore <file>  - Restore from backup file"
            echo ""
            echo "Basic Workflow:"
            echo "  1. $0 download-latest        # Get current state from OpenFN"
            echo "  2. $0 extract                # Convert to source files (optional)"
            echo "  3. # Edit source files"
            echo "  4. $0 compare                # Check for conflicts"
            echo "  5. $0 deploy                 # Deploy changes"
            echo ""
            echo "Version Management:"
            echo "  $0 snapshot 'Before changes' # Manual snapshot"
            echo "  $0 list                      # See all versions"
            echo "  $0 status                    # Current sync status"
            exit 1
            ;;
    esac
}

# Run main function
main "$@" 