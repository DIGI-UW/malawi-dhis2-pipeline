#!/bin/bash

# OpenFN Instant Package Workflow Sync Integration
# Provides seamless workflow sync commands for the instant package

set -e

# Get script directory
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORKFLOW_SYNC="$SCRIPT_DIR/workflow-sync.sh"

# Make sure workflow-sync.sh is executable
chmod +x "$WORKFLOW_SYNC"

# Source environment from instant
if [[ -f ".env" ]]; then
    export $(grep -v '^#' .env | xargs)
fi

# Main command handler
case "${1:-help}" in
    "download")
        # Download workflows from OpenFN UI to local code
        echo "📥 Downloading workflows from OpenFN UI..."
        "$WORKFLOW_SYNC" download "${@:2}"
        ;;
    "upload")
        # Upload local workflow code to OpenFN
        echo "📤 Uploading workflows to OpenFN..."
        "$WORKFLOW_SYNC" upload "${@:2}"
        ;;
    "sync")
        # Check and sync workflows
        echo "🔄 Syncing workflows..."
        "$WORKFLOW_SYNC" sync "${@:2}"
        ;;
    "watch")
        # Start watch mode for auto-sync
        echo "👁️  Starting workflow watch mode..."
        "$WORKFLOW_SYNC" watch
        ;;
    "status")
        # Show sync status
        "$WORKFLOW_SYNC" status
        ;;
    "snapshot")
        # Create workflow snapshot
        "$WORKFLOW_SYNC" snapshot "${@:2}"
        ;;
    "extract")
        # Extract workflow from downloaded state
        "$WORKFLOW_SYNC" extract "${@:2}"
        ;;
    *)
        echo "OpenFN Workflow Sync for Instant Package"
        echo ""
        echo "Usage: ./instant package exec -n openfn workflow-sync {command} [options]"
        echo "   or: ./packages/openfn/instant-workflow-sync.sh {command} [options]"
        echo ""
        echo "Commands:"
        echo "  download [workflow]  - Download workflow(s) from OpenFN UI to local code"
        echo "  upload [workflow]    - Upload local workflow code to OpenFN"
        echo "  sync                 - Check and sync all workflows"
        echo "  watch                - Start auto-sync watch mode"
        echo "  status               - Show sync status"
        echo "  snapshot <workflow>  - Create workflow snapshot"
        echo "  extract <file>       - Extract workflow from state file"
        echo ""
        echo "Examples:"
        echo "  # Download all workflows from UI"
        echo "  ./instant package exec -n openfn workflow-sync download"
        echo ""
        echo "  # Upload specific workflow to UI"
        echo "  ./instant package exec -n openfn workflow-sync upload sftp-dhis2"
        echo ""
        echo "  # Check sync status"
        echo "  ./instant package exec -n openfn workflow-sync status"
        echo ""
        echo "  # Start watch mode for auto-sync"
        echo "  ./instant package exec -n openfn workflow-sync watch"
        echo ""
        echo "Environment Variables:"
        echo "  OPENFN_SYNC_MODE            - Sync mode (manual|auto-download|auto-upload)"
        echo "  OPENFN_CONFLICT_RESOLUTION  - How to resolve conflicts (prompt|local-wins|remote-wins)"
        echo "  OPENFN_ENABLE_AUTO_SNAPSHOT - Enable automatic snapshots (true|false)"
        exit 1
        ;;
esac 