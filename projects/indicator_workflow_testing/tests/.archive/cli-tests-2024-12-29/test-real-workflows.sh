#!/bin/bash
# Main CLI Test Framework for Real OpenFN Workflows
# Tests actual workflows from projects/openfn-workflows using our working CLI approach

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_workflow() { echo -e "${CYAN}[WORKFLOW]${NC} $1"; }

# Configuration
DOCKER_IMAGE="openfn-cli-test:latest"
WORKFLOWS_DIR="../../../openfn-workflows/workflows"
FIXTURES_DIR="./fixtures"
OUTPUTS_DIR="./outputs"
PROJECT_ROOT="/home/ubuntu/code/malawi-dhis2-pipeline"

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Create output directory
mkdir -p "$OUTPUTS_DIR"

show_usage() {
    cat << EOF
Usage: $0 [OPTIONS] [WORKFLOW_NAME] [JOB_NAME]

Test OpenFN workflows using CLI with our working configuration approach.

Options:
  -h, --help           Show this help
  -l, --list           List available workflows
  -v, --verbose        Verbose output
  -d, --dry-run        Show what would be executed without running
  
Arguments:
  WORKFLOW_NAME        Name of workflow to test (e.g., sftp-dhis2)
  JOB_NAME            Specific job to test (optional, tests all if not specified)

Examples:
  $0 -l                         # List workflows  
  $0 sftp-dhis2                 # Test entire sftp-dhis2 workflow
  $0 sftp-dhis2 CheckSFTPFiles  # Test specific job

Available workflows:
EOF
    if [[ -d "$WORKFLOWS_DIR" ]]; then
        for workflow_dir in "$WORKFLOWS_DIR"/*; do
            if [[ -d "$workflow_dir" && -f "$workflow_dir/project.yaml" ]]; then
                local workflow_name=$(basename "$workflow_dir")
                echo "  - $workflow_name"
            fi
        done
    fi
}

# Parse command line arguments
WORKFLOW_NAME=""
JOB_NAME=""
VERBOSE=false
DRY_RUN=false
LIST_WORKFLOWS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -l|--list)
            LIST_WORKFLOWS=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -*)
            log_error "Unknown option: $1"
            exit 1
            ;;
        *)
            if [[ -z "$WORKFLOW_NAME" ]]; then
                WORKFLOW_NAME="$1"
            elif [[ -z "$JOB_NAME" ]]; then
                JOB_NAME="$1"
            else
                log_error "Too many arguments"
                exit 1
            fi
            shift
            ;;
    esac
done

list_workflows() {
    log_info "Available workflows in $WORKFLOWS_DIR:"
    echo ""
    
    for workflow_dir in "$WORKFLOWS_DIR"/*; do
        if [[ -d "$workflow_dir" && -f "$workflow_dir/project.yaml" ]]; then
            local workflow_name=$(basename "$workflow_dir")
            local description=""
            
            # Extract description from project.yaml
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
            
            echo "📋 $workflow_name"
            if [[ -n "$description" ]]; then
                echo "   Description: $description"
            fi
            echo "   Jobs: $job_count"
            echo "   Path: $workflow_dir"
            echo ""
        fi
    done
}

# Function to run OpenFN CLI with our working approach
run_openfn_cli() {
    local workflow_name="$1"
    local job_name="$2"
    local input_state="$3"
    local output_file="$4"
    
    log_info "Running OpenFN CLI with working configuration..."
    
    # Use our working Docker command structure
    docker run --rm -it \
        -v "$PROJECT_ROOT/projects/openfn-workflows:/workspace" \
        -v "$PROJECT_ROOT/projects/indicator_workflow_testing/tests/fixtures:/fixtures" \
        -v "$PROJECT_ROOT/projects/indicator_workflow_testing/tests/outputs:/outputs" \
        "$DOCKER_IMAGE" /bin/sh -c "
            # Create proper OpenFN project structure
            mkdir -p /tmp/test-project/workflows/$workflow_name
            
            # Create openfn.json configuration
            cat > /tmp/test-project/openfn.json << 'EOF'
{
  \"workflowRoot\": \"workflows\",
  \"formats\": {
    \"workflow\": \"json\"
  }
}
EOF

            # Convert project.yaml to CLI-compatible workflow.json
            python3 -c \"
import yaml
import json
import sys

# Read the project.yaml
with open('/workspace/workflows/$workflow_name/project.yaml', 'r') as f:
    project = yaml.safe_load(f)

# Find the workflow and job
workflow_config = None
for wf_name, wf_config in project.get('workflows', {}).items():
    workflow_config = wf_config
    break

if not workflow_config:
    print('No workflow found', file=sys.stderr)
    sys.exit(1)

# Find the specific job or create workflow with all jobs
if '$job_name':
    job_config = workflow_config.get('jobs', {}).get('$job_name')
    if not job_config:
        print('Job $job_name not found', file=sys.stderr)
        sys.exit(1)
    
    # Read the job file
    job_file_path = job_config.get('body', {}).get('path', './jobs/${job_name,,}.js')
    job_file_path = job_file_path.replace('./jobs/', '/workspace/workflows/$workflow_name/jobs/')
    
    try:
        with open(job_file_path, 'r') as jf:
            job_expression = jf.read()
    except FileNotFoundError:
        print(f'Job file not found: {job_file_path}', file=sys.stderr)
        sys.exit(1)
    
    # Create single-job workflow
    cli_workflow = {
        'id': '$job_name',
        'steps': [{
            'adaptor': job_config.get('adaptor', '@openfn/language-common'),
            'expression': job_expression
        }]
    }
else:
    # Create multi-job workflow (simplified for testing)
    cli_workflow = {
        'id': '$workflow_name',
        'steps': []
    }
    
    for job_name, job_config in workflow_config.get('jobs', {}).items():
        job_file_path = job_config.get('body', {}).get('path', f'./jobs/{job_name.lower()}.js')
        job_file_path = job_file_path.replace('./jobs/', '/workspace/workflows/$workflow_name/jobs/')
        
        try:
            with open(job_file_path, 'r') as jf:
                job_expression = jf.read()
        except FileNotFoundError:
            continue
        
        cli_workflow['steps'].append({
            'id': job_name,
            'adaptor': job_config.get('adaptor', '@openfn/language-common'),
            'expression': job_expression
        })

print(json.dumps(cli_workflow, indent=2))
\" > /tmp/test-project/workflows/$workflow_name/$workflow_name.json

            # Change to project directory and run
            cd /tmp
            
            echo 'Generated workflow structure:'
            ls -la test-project/workflows/$workflow_name/
            
            echo ''
            echo 'Workflow content:'
            cat test-project/workflows/$workflow_name/$workflow_name.json | head -20
            
            echo ''
            echo 'Input state:'
            cat /fixtures/$input_state
            
            echo ''
            echo 'Running OpenFN CLI with -s flag for state...'
            openfn test-project $workflow_name -s /fixtures/$input_state -o /outputs/$output_file 2>&1
        "
}

# Function to test a specific workflow
test_workflow() {
    local workflow_name="$1"
    local job_name="$2"
    
    log_workflow "Testing workflow: $workflow_name"
    if [[ -n "$job_name" ]]; then
        log_info "Specific job: $job_name"
    fi
    
    # Validate workflow exists
    local workflow_dir="$WORKFLOWS_DIR/$workflow_name"
    if [[ ! -d "$workflow_dir" ]]; then
        log_error "Workflow directory not found: $workflow_dir"
        return 1
    fi
    
    if [[ ! -f "$workflow_dir/project.yaml" ]]; then
        log_error "project.yaml not found in: $workflow_dir"
        return 1
    fi
    
    # Determine input state file
    local input_state="sftp-test-input.json"  # Default
    if [[ -f "$FIXTURES_DIR/${workflow_name}-input.json" ]]; then
        input_state="${workflow_name}-input.json"
    fi
    
    # Create output filename
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local output_file="${workflow_name}-${job_name:-full}-${timestamp}.json"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would test $workflow_name with:"
        log_info "  Input: $input_state"
        log_info "  Output: $output_file" 
        log_info "  Job: ${job_name:-all jobs}"
        return 0
    fi
    
    # Run the test
    if run_openfn_cli "$workflow_name" "$job_name" "$input_state" "$output_file"; then
        log_success "✅ Workflow test completed successfully"
        log_info "Results saved to: $OUTPUTS_DIR/$output_file"
        return 0
    else
        log_error "❌ Workflow test failed"
        return 1
    fi
}

# Main execution
main() {
    log_info "🚀 OpenFN CLI Workflow Testing Framework"
    log_info "==========================================="
    echo ""
    
    if [[ "$LIST_WORKFLOWS" == "true" ]]; then
        list_workflows
        exit 0
    fi
    
    if [[ -z "$WORKFLOW_NAME" ]]; then
        log_error "No workflow specified. Use -h for help or -l to list workflows."
        exit 1
    fi
    
    # Validate Docker image exists
    if ! docker image inspect "$DOCKER_IMAGE" >/dev/null 2>&1; then
        log_error "Docker image not found: $DOCKER_IMAGE"
        log_info "Please build the image first or check if it exists"
        exit 1
    fi
    
    # Test the workflow
    if test_workflow "$WORKFLOW_NAME" "$JOB_NAME"; then
        log_success "🎉 All tests completed successfully!"
    else
        log_error "💥 Some tests failed!"
        exit 1
    fi
}

# Run main function
main "$@" 