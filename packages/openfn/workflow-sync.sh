#!/bin/bash

# OpenFN Workflow Sync Manager
# Handles bidirectional sync between OpenFN UI and local code
# Integrates with the OpenFN package lifecycle

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_debug() { echo -e "${MAGENTA}[DEBUG]${NC} $1"; }
log_action() { echo -e "${CYAN}[ACTION]${NC} $1"; }

# Configuration from environment or defaults
OPENFN_URL="${OPENFN_ENDPOINT:-http://localhost:4000}"
API_KEY="${OPENFN_API_KEY:-apiKey}"
ADMIN_USER="${OPENFN_ADMIN_USER:-root@openhim.org}"
ADMIN_PASSWORD="${OPENFN_ADMIN_PASSWORD:-instant101secure}"
WORKFLOW_BASE_DIR="${OPENFN_WORKFLOW_BASE_DIR:-projects/openfn-workflows/workflows}"
SYNC_MODE="${OPENFN_SYNC_MODE:-manual}"  # manual, auto-download, auto-upload
SYNC_INTERVAL="${OPENFN_SYNC_INTERVAL:-300}"  # 5 minutes default
STATE_DIR="${OPENFN_STATE_DIR:-.openfn-sync}"

# Workflow sync configuration
ENABLE_AUTO_SNAPSHOT="${OPENFN_ENABLE_AUTO_SNAPSHOT:-true}"
CONFLICT_RESOLUTION="${OPENFN_CONFLICT_RESOLUTION:-prompt}"  # prompt, local-wins, remote-wins
SYNC_ON_DEPLOY="${OPENFN_SYNC_ON_DEPLOY:-true}"
SYNC_ON_STARTUP="${OPENFN_SYNC_ON_STARTUP:-true}"

# Create state directory
mkdir -p "$STATE_DIR"

# Get all workflow directories
get_workflow_dirs() {
    find "$WORKFLOW_BASE_DIR" -maxdepth 1 -type d -name "*" ! -name "." ! -name ".." 2>/dev/null | sort
}

# Get project name from workflow directory
get_project_name() {
    local workflow_dir="$1"
    local project_yaml="$workflow_dir/project.yaml"
    
    if [[ -f "$project_yaml" ]]; then
        # Try to extract project name from YAML
        local name=$(grep -E "^name:" "$project_yaml" | head -1 | sed 's/name:[ ]*//' | sed 's/["'\'']//g' | xargs)
        if [[ -n "$name" ]]; then
            echo "$name"
        else
            # Fallback to directory name
            basename "$workflow_dir"
        fi
    else
        basename "$workflow_dir"
    fi
}

# Download workflow from OpenFN
download_workflow() {
    local workflow_dir="$1"
    local project_name=$(get_project_name "$workflow_dir")
    local state_file="$STATE_DIR/$project_name.state.json"
    local version_dir="$workflow_dir/.versions"
    
    log_info "📥 Downloading workflow: $project_name"
    
    # Create directories
    mkdir -p "$version_dir"
    
    # Get project ID by name
    local project_id=$(curl -s -H "Authorization: Bearer $API_KEY" \
                            -H "Accept: application/json" \
                            "$OPENFN_URL/api/projects" | \
                      jq -r ".data[] | select(.name == \"$project_name\") | .id" 2>/dev/null)
    
    if [[ -z "$project_id" ]]; then
        log_warning "Project '$project_name' not found on server"
        return 1
    fi
    
    # Download current state
    local timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
    local response=$(curl -s -H "Authorization: Bearer $API_KEY" \
                          -H "Accept: application/json" \
                          "$OPENFN_URL/api/provision/$project_id")
    
    # Save versioned copy
    echo "$response" | jq . > "$version_dir/server-$timestamp.json"
    
    # Update state file
    echo "$response" | jq "{
        project_id: \"$project_id\",
        project_name: \"$project_name\",
        last_download: \"$(date -Iseconds)\",
        server_version: .data.workflows[0].lock_version,
        server_updated: .data.workflows[0].updated_at
    }" > "$state_file"
    
    log_success "Downloaded workflow state to: $version_dir/server-$timestamp.json"
    return 0
}

# Upload workflow to OpenFN
upload_workflow() {
    local workflow_dir="$1"
    local project_name=$(get_project_name "$workflow_dir")
    local state_file="$STATE_DIR/$project_name.state.json"
    
    log_info "📤 Uploading workflow: $project_name"
    
    # Check if we should create snapshot
    if [[ "$ENABLE_AUTO_SNAPSHOT" == "true" ]]; then
        create_snapshot "$workflow_dir" "Pre-upload snapshot"
    fi
    
    # Rebuild workflow image
    log_action "Rebuilding workflow image..."
    if ./build-custom-images.sh openfn-workflows; then
        log_success "Workflow image rebuilt"
    else
        log_error "Failed to rebuild workflow image"
        return 1
    fi
    
    # Redeploy OpenFN with new workflows
    log_action "Redeploying OpenFN service..."
    if ./instant package up -n openfn -d; then
        log_success "OpenFN service redeployed"
        
        # Wait for deployment
        sleep 10
        
        # Update state file
        download_workflow "$workflow_dir"
        
        return 0
    else
        log_error "Failed to redeploy OpenFN"
        return 1
    fi
}

# Check for conflicts
check_conflicts() {
    local workflow_dir="$1"
    local project_name=$(get_project_name "$workflow_dir")
    local state_file="$STATE_DIR/$project_name.state.json"
    
    if [[ ! -f "$state_file" ]]; then
        log_debug "No previous state found for $project_name"
        return 1
    fi
    
    # Download current state to compare
    local temp_dir=$(mktemp -d)
    local project_id=$(jq -r '.project_id' "$state_file")
    
    local current_response=$(curl -s -H "Authorization: Bearer $API_KEY" \
                                  -H "Accept: application/json" \
                                  "$OPENFN_URL/api/provision/$project_id")
    
    local current_version=$(echo "$current_response" | jq -r '.data.workflows[0].lock_version // 0')
    local saved_version=$(jq -r '.server_version // 0' "$state_file")
    
    rm -rf "$temp_dir"
    
    if [[ "$current_version" -gt "$saved_version" ]]; then
        log_warning "⚠️  Server has newer version (server: v$current_version, local: v$saved_version)"
        return 0
    fi
    
    return 1
}

# Create snapshot
create_snapshot() {
    local workflow_dir="$1"
    local description="${2:-Manual snapshot}"
    local project_name=$(get_project_name "$workflow_dir")
    local snapshot_dir="$workflow_dir/.snapshots/$(date +"%Y-%m-%d_%H-%M-%S")"
    
    mkdir -p "$snapshot_dir"
    
    # Copy current files
    if [[ -f "$workflow_dir/project.yaml" ]]; then
        cp "$workflow_dir/project.yaml" "$snapshot_dir/"
    fi
    
    if [[ -d "$workflow_dir/jobs" ]]; then
        cp -r "$workflow_dir/jobs" "$snapshot_dir/"
    fi
    
    # Create metadata
    cat > "$snapshot_dir/metadata.json" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "description": "$description",
    "project_name": "$project_name"
}
EOF
    
    log_debug "Created snapshot: $snapshot_dir"
}

# Sync single workflow
sync_workflow() {
    local workflow_dir="$1"
    local direction="${2:-check}"  # check, download, upload
    local project_name=$(get_project_name "$workflow_dir")
    
    log_info "🔄 Syncing workflow: $project_name ($direction)"
    
    case "$direction" in
        "check")
            if check_conflicts "$workflow_dir"; then
                log_warning "Conflicts detected for $project_name"
                
                case "$CONFLICT_RESOLUTION" in
                    "prompt")
                        read -p "How to resolve? (l)ocal wins, (r)emote wins, (s)kip: " -n 1 -r
                        echo
                        case "$REPLY" in
                            l|L) sync_workflow "$workflow_dir" "upload" ;;
                            r|R) sync_workflow "$workflow_dir" "download" ;;
                            *) log_info "Skipping $project_name" ;;
                        esac
                        ;;
                    "local-wins")
                        sync_workflow "$workflow_dir" "upload"
                        ;;
                    "remote-wins")
                        sync_workflow "$workflow_dir" "download"
                        ;;
                esac
            else
                log_success "✅ $project_name is in sync"
            fi
            ;;
        "download")
            download_workflow "$workflow_dir"
            ;;
        "upload")
            upload_workflow "$workflow_dir"
            ;;
    esac
}

# Sync all workflows
sync_all() {
    local direction="${1:-check}"
    
    log_info "🔄 Syncing all workflows..."
    
    for workflow_dir in $(get_workflow_dirs); do
        if [[ -f "$workflow_dir/project.yaml" ]]; then
            sync_workflow "$workflow_dir" "$direction"
        fi
    done
}

# Watch mode for auto-sync
watch_mode() {
    log_info "👁️  Starting watch mode (interval: ${SYNC_INTERVAL}s)"
    log_info "Press Ctrl+C to stop"
    
    while true; do
        log_action "Checking for changes..."
        sync_all "check"
        
        log_debug "Sleeping for ${SYNC_INTERVAL}s..."
        sleep "$SYNC_INTERVAL"
    done
}

# Extract workflow from downloaded state
extract_workflow() {
    local state_file="$1"
    local target_dir="${2:-extracted}"
    
    if [[ ! -f "$state_file" ]]; then
        log_error "State file not found: $state_file"
        return 1
    fi
    
    mkdir -p "$target_dir"
    
    # Extract jobs and metadata
    jq -r '.data.workflows[0].jobs[] | "\(.name):\(.body)"' "$state_file" | \
    while IFS=: read -r name body; do
        if [[ -n "$name" ]]; then
            echo "$body" > "$target_dir/$(echo "$name" | sed 's/[^a-zA-Z0-9-]/-/g').js"
        fi
    done
    
    log_success "Extracted workflow to: $target_dir"
}

# Package lifecycle integration
lifecycle_hook() {
    local hook="$1"
    
    case "$hook" in
        "pre-deploy")
            if [[ "$SYNC_ON_DEPLOY" == "true" ]]; then
                log_info "🚀 Pre-deployment sync check..."
                sync_all "check"
            fi
            ;;
        "post-deploy")
            log_info "✅ Post-deployment state update..."
            sync_all "download"
            ;;
        "startup")
            if [[ "$SYNC_ON_STARTUP" == "true" ]]; then
                log_info "🌟 Startup sync..."
                sync_all "download"
            fi
            ;;
    esac
}

# Main command handler
main() {
    local command="${1:-help}"
    shift || true
    
    case "$command" in
        "sync")
            sync_all "${1:-check}"
            ;;
        "download")
            if [[ -n "$1" ]]; then
                sync_workflow "$WORKFLOW_BASE_DIR/$1" "download"
            else
                sync_all "download"
            fi
            ;;
        "upload")
            if [[ -n "$1" ]]; then
                sync_workflow "$WORKFLOW_BASE_DIR/$1" "upload"
            else
                sync_all "upload"
            fi
            ;;
        "watch")
            watch_mode
            ;;
        "extract")
            extract_workflow "$1" "${2:-extracted}"
            ;;
        "snapshot")
            if [[ -n "$1" ]]; then
                create_snapshot "$WORKFLOW_BASE_DIR/$1" "${2:-Manual snapshot}"
            else
                log_error "Please specify workflow name"
            fi
            ;;
        "status")
            log_info "📊 Workflow Sync Status"
            log_info "======================"
            log_info "Mode: $SYNC_MODE"
            log_info "Conflict Resolution: $CONFLICT_RESOLUTION"
            log_info "Auto Snapshot: $ENABLE_AUTO_SNAPSHOT"
            log_info ""
            sync_all "check"
            ;;
        "hook")
            lifecycle_hook "$1"
            ;;
        *)
            echo "OpenFN Workflow Sync Manager"
            echo ""
            echo "Usage: $0 {command} [options]"
            echo ""
            echo "Commands:"
            echo "  sync [check|download|upload]  - Sync workflows (default: check)"
            echo "  download [workflow]           - Download workflow(s) from OpenFN"
            echo "  upload [workflow]             - Upload workflow(s) to OpenFN"
            echo "  watch                         - Watch mode for auto-sync"
            echo "  extract <file> [dir]          - Extract workflow from state file"
            echo "  snapshot <workflow> [desc]    - Create workflow snapshot"
            echo "  status                        - Show sync status"
            echo "  hook <pre-deploy|post-deploy|startup> - Package lifecycle hooks"
            echo ""
            echo "Environment Variables:"
            echo "  OPENFN_SYNC_MODE              - Sync mode (manual|auto-download|auto-upload)"
            echo "  OPENFN_CONFLICT_RESOLUTION    - Conflict resolution (prompt|local-wins|remote-wins)"
            echo "  OPENFN_ENABLE_AUTO_SNAPSHOT   - Enable auto snapshots (true|false)"
            echo "  OPENFN_SYNC_ON_DEPLOY         - Sync on deployment (true|false)"
            echo "  OPENFN_SYNC_ON_STARTUP        - Sync on startup (true|false)"
            echo ""
            echo "Examples:"
            echo "  $0 sync                       # Check all workflows for changes"
            echo "  $0 download sftp-dhis2        # Download specific workflow"
            echo "  $0 upload                     # Upload all workflows"
            echo "  $0 watch                      # Start auto-sync watch mode"
            exit 1
            ;;
    esac
}

# Run main function
main "$@" 