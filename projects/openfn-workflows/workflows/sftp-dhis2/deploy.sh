#!/bin/bash

# Deploy SFTP to DHIS2 Workflow
# This script sets up the new SFTP-focused OpenFN workflow

set -e

echo "🚀 Deploying SFTP to DHIS2 Workflow..."

# Configuration
WORKFLOW_DIR="/home/ubuntu/code/malawi-dhis2-pipeline/packages/openfn/importer/workflows/sftp-dhis2-workflow"
OPENFN_CLI=${OPENFN_CLI:-"openfn"}

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if OpenFN CLI is available
    if ! command -v $OPENFN_CLI &> /dev/null; then
        log_warning "OpenFN CLI not found. Please install it first."
        log_info "Installation: npm install -g @openfn/cli"
        exit 1
    fi
    
    # Check if workflow directory exists
    if [ ! -d "$WORKFLOW_DIR" ]; then
        log_error "Workflow directory not found: $WORKFLOW_DIR"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Validate workflow configuration
validate_workflow() {
    log_info "Validating workflow configuration..."
    
    cd "$WORKFLOW_DIR"
    
    # Check if project.yaml exists and is valid
    if [ ! -f "project.yaml" ]; then
        log_error "project.yaml not found"
        exit 1
    fi
    
    # Validate with OpenFN CLI if available
    if $OPENFN_CLI validate project.yaml &> /dev/null; then
        log_success "Workflow configuration is valid"
    else
        log_warning "Workflow validation failed, but continuing..."
    fi
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    cd "$WORKFLOW_DIR"
    
    if [ -f "package.json" ]; then
        npm install
        log_success "Dependencies installed"
    else
        log_warning "No package.json found, skipping dependency installation"
    fi
}

# Deploy to OpenFN
deploy_workflow() {
    log_info "Deploying workflow to OpenFN..."
    
    cd "$WORKFLOW_DIR"
    
    # Deploy the project
    if $OPENFN_CLI deploy; then
        log_success "Workflow deployed successfully"
    else
        log_error "Failed to deploy workflow"
        log_info "Manual deployment may be required"
        return 1
    fi
}

# Create credential templates
create_credential_templates() {
    log_info "Creating credential templates..."
    
    cd "$WORKFLOW_DIR"
    mkdir -p credentials
    
    # SFTP credentials template
    cat > credentials/sftp-credentials.template.json << 'EOF'
{
  "host": "your-sftp-server.com",
  "port": 22,
  "username": "sftp-user",
  "password": "sftp-password",
  "privateKey": null,
  "passphrase": null
}
EOF

    # DHIS2 credentials template
    cat > credentials/dhis2-credentials.template.json << 'EOF'
{
  "hostUrl": "https://your-dhis2-instance.org",
  "username": "dhis2-user",
  "password": "dhis2-password",
  "version": "2.39"
}
EOF

    log_success "Credential templates created in credentials/ directory"
    log_warning "Please copy templates to actual credential files and update with real values"
}

# Create monitoring script
create_monitoring_script() {
    log_info "Creating file system monitoring script..."
    
    cat > /tmp/sftp-file-monitor.sh << 'EOF'
#!/bin/bash

# SFTP File System Monitor
# Monitors SFTP directory for changes and triggers OpenFN webhook

SFTP_DIR="${1:-/uploads/hiv-indicators/}"
WEBHOOK_URL="${2:-http://localhost:4002/webhooks/file-change-webhook}"

if ! command -v inotifywait &> /dev/null; then
    echo "Installing inotify-tools..."
    sudo apt-get update && sudo apt-get install -y inotify-tools
fi

echo "Monitoring $SFTP_DIR for file changes..."
echo "Webhook URL: $WEBHOOK_URL"

inotifywait -m "$SFTP_DIR" -e create,modify,moved_to --format '%w%f %e' |
while read file event; do
    echo "File change detected: $file ($event)"
    
    # Extract filename and path
    filename=$(basename "$file")
    filepath="$file"
    
    # Only process Excel files
    if [[ "$filename" =~ \.(xlsx|xls)$ ]]; then
        echo "Processing Excel file: $filename"
        
        # Get file info
        if [ -f "$file" ]; then
            filesize=$(stat -c%s "$file")
            modtime=$(stat -c %Y "$file")
            modtime_iso=$(date -u -d @"$modtime" +"%Y-%m-%dT%H:%M:%SZ")
            
            # Trigger webhook
            curl -X POST "$WEBHOOK_URL" \
                -H "Content-Type: application/json" \
                -d "{
                    \"filePath\": \"$filepath\",
                    \"fileName\": \"$filename\",
                    \"fileSize\": $filesize,
                    \"modifiedTime\": \"$modtime_iso\",
                    \"event\": \"$event\"
                }" \
                --max-time 10 \
                || echo "Failed to trigger webhook for $filename"
        fi
    else
        echo "Ignoring non-Excel file: $filename"
    fi
done
EOF

    chmod +x /tmp/sftp-file-monitor.sh
    log_success "File monitor script created at /tmp/sftp-file-monitor.sh"
    log_info "Usage: /tmp/sftp-file-monitor.sh [directory] [webhook-url]"
}

# Print deployment summary
print_summary() {
    log_success "🎉 SFTP to DHIS2 Workflow deployment completed!"
    echo
    log_info "Next Steps:"
    echo "1. Update credential files in credentials/ directory"
    echo "2. Configure your SFTP server details"
    echo "3. Set up DHIS2 connection parameters"
    echo "4. Test the workflow with manual trigger"
    echo "5. Set up file system monitoring (optional)"
    echo
    log_info "Workflow Features:"
    echo "• Cron trigger: Checks for new files every 15 minutes"
    echo "• Webhook trigger: Processes files on demand"
    echo "• File tracking: Prevents duplicate processing"
    echo "• Comprehensive logging and error handling"
    echo
    log_info "Testing:"
    echo "• Manual trigger: curl -X POST [openfn-host]/webhooks/manual-trigger"
    echo "• File monitor: /tmp/sftp-file-monitor.sh [sftp-dir] [webhook-url]"
    echo
    log_warning "Remember to configure your OpenFN instance with proper credentials!"
}

# Main execution
main() {
    echo "🔧 SFTP to DHIS2 Workflow Deployment Script"
    echo "=========================================="
    echo
    
    check_prerequisites
    validate_workflow
    install_dependencies
    create_credential_templates
    create_monitoring_script
    
    # Optional: Deploy to OpenFN (uncomment if you have OpenFN instance configured)
    # deploy_workflow
    
    print_summary
}

# Execute main function
main "$@"
