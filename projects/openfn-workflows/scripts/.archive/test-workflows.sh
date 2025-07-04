#!/bin/bash

# OpenFN Workflow Testing Script
# Tests complete workflows using the OpenFN CLI in Docker

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
DOCKER_IMAGE="openfn-workflows-test"
WORKFLOW_DIR="workflows/sftp-dhis2"
TESTS_DIR="tests"
FIXTURES_DIR="$TESTS_DIR/fixtures"
OUTPUTS_DIR="$TESTS_DIR/outputs"

# Function to run OpenFN CLI in Docker
run_openfn() {
    local cmd="$1"
    docker run --rm \
        -v "$(pwd):/app" \
        -w /app \
        "$DOCKER_IMAGE" \
        openfn $cmd
}

# Function to test workflow configuration
test_workflow_config() {
    local workflow_path="$1"
    local workflow_name=$(basename "$workflow_path")
    
    log_workflow "Testing workflow configuration: $workflow_name"
    
    # Check if project.yaml exists
    if [[ ! -f "$workflow_path/project.yaml" ]]; then
        log_error "❌ project.yaml not found in $workflow_path"
        return 1
    fi
    
    # Validate YAML syntax
    if ! python3 -c "import yaml; yaml.safe_load(open('$workflow_path/project.yaml'))" 2>/dev/null; then
        log_error "❌ Invalid YAML syntax in project.yaml"
        return 1
    fi
    
    log_success "✅ Workflow configuration valid"
    return 0
}

# Function to create workflow execution plan
create_workflow_plan() {
    local workflow_path="$1"
    local plan_file="$OUTPUTS_DIR/workflow-plan.json"
    
    log_info "Creating workflow execution plan..."
    
    # Parse project.yaml to create execution plan
    python3 << EOF > "$plan_file"
import yaml
import json

with open('$workflow_path/project.yaml', 'r') as f:
    project = yaml.safe_load(f)

plan = {
    "project_name": project.get('name', 'unknown'),
    "workflows": []
}

for workflow_name, workflow_config in project.get('workflows', {}).items():
    workflow_plan = {
        "name": workflow_name,
        "jobs": [],
        "triggers": workflow_config.get('triggers', []),
        "edges": workflow_config.get('edges', [])
    }
    
    for job_name, job_config in workflow_config.get('jobs', {}).items():
        job_plan = {
            "name": job_name,
            "file": f"jobs/{job_config.get('body', job_name.lower().replace(' ', '-'))}.js",
            "adaptor": job_config.get('adaptor', '@openfn/language-common')
        }
        workflow_plan["jobs"].append(job_plan)
    
    plan["workflows"].append(workflow_plan)

print(json.dumps(plan, indent=2))
EOF
    
    if [[ -f "$plan_file" ]]; then
        log_success "Workflow plan created: $plan_file"
        return 0
    else
        log_error "Failed to create workflow plan"
        return 1
    fi
}

# Function to test workflow execution
test_workflow_execution() {
    local workflow_path="$1"
    local plan_file="$OUTPUTS_DIR/workflow-plan.json"
    
    if [[ ! -f "$plan_file" ]]; then
        log_error "Workflow plan not found. Run create_workflow_plan first."
        return 1
    fi
    
    log_workflow "Testing workflow execution..."
    
    # Create a test workflow file for OpenFN CLI
    local workflow_file="$OUTPUTS_DIR/test-workflow.json"
    
    # Convert our plan to OpenFN workflow format
    python3 << EOF > "$workflow_file"
import json

with open('$plan_file', 'r') as f:
    plan = json.load(f)

# Create OpenFN workflow format
workflow = {
    "workflow": {
        "steps": []
    }
}

for wf in plan["workflows"]:
    for i, job in enumerate(wf["jobs"]):
        step = {
            "id": f"step_{i+1}",
            "expression": f"// Job: {job['name']}\n// File: {job['file']}\n// This is a test placeholder\nfn(state => {{ console.log('Testing {job['name']}'); return state; }});",
            "adaptor": job["adaptor"]
        }
        
        if i > 0:
            step["previous"] = f"step_{i}"
        
        workflow["workflow"]["steps"].append(step)

print(json.dumps(workflow, indent=2))
EOF

    # Test the workflow
    local input_file="$FIXTURES_DIR/workflow-input.json"
    local output_file="$OUTPUTS_DIR/workflow-output.json"
    local log_file="$OUTPUTS_DIR/workflow-log.txt"
    
    # Create workflow input if it doesn't exist
    if [[ ! -f "$input_file" ]]; then
        cat > "$input_file" << 'EOF'
{
  "data": {
    "message": "Testing workflow execution"
  },
  "configuration": {
    "baseUrl": "https://test-dhis2.example.com/api",
    "username": "test_user",
    "password": "test_pass",
    "hostUrl": "test-sftp.example.com"
  }
}
EOF
    fi
    
    if run_openfn "workflow $workflow_file -i $input_file -o $output_file" > "$log_file" 2>&1; then
        log_success "✅ Workflow execution test passed"
        return 0
    else
        log_error "❌ Workflow execution test failed"
        log_error "Check logs: $log_file"
        cat "$log_file"
        return 1
    fi
}

# Function to run integration tests
run_integration_tests() {
    local workflow_path="$1"
    
    log_workflow "Running integration tests..."
    
    # Test 1: Configuration validation
    if ! test_workflow_config "$workflow_path"; then
        return 1
    fi
    
    # Test 2: Create execution plan
    if ! create_workflow_plan "$workflow_path"; then
        return 1
    fi
    
    # Test 3: Test workflow execution
    if ! test_workflow_execution "$workflow_path"; then
        return 1
    fi
    
    log_success "🎉 All integration tests passed!"
    return 0
}

# Function to validate all jobs exist
validate_job_files() {
    local workflow_path="$1"
    local jobs_dir="$workflow_path/jobs"
    
    log_info "Validating job files exist..."
    
    if [[ ! -d "$jobs_dir" ]]; then
        log_error "Jobs directory not found: $jobs_dir"
        return 1
    fi
    
    local missing_jobs=0
    
    # Check each job file exists
    for job_file in "$jobs_dir"/*.js; do
        if [[ ! -f "$job_file" ]]; then
            log_error "❌ Job file not found: $job_file"
            missing_jobs=$((missing_jobs + 1))
        else
            log_success "✅ Found: $(basename "$job_file")"
        fi
    done
    
    if [[ $missing_jobs -eq 0 ]]; then
        log_success "All job files found"
        return 0
    else
        log_error "$missing_jobs job file(s) missing"
        return 1
    fi
}

# Function to generate workflow documentation
generate_docs() {
    local workflow_path="$1"
    local docs_file="$OUTPUTS_DIR/workflow-docs.md"
    
    log_info "Generating workflow documentation..."
    
    cat > "$docs_file" << EOF
# Workflow Documentation

Generated on: $(date)

## Project Configuration

EOF
    
    # Add project info from YAML
    python3 << 'PYTHON_EOF' >> "$docs_file"
import yaml

with open('workflows/sftp-dhis2/project.yaml', 'r') as f:
    project = yaml.safe_load(f)

print(f"**Name:** {project.get('name', 'Unknown')}")
print(f"**Description:** {project.get('description', 'No description')}")
print()

for workflow_name, workflow_config in project.get('workflows', {}).items():
    print(f"## Workflow: {workflow_name}")
    print()
    print(f"**Name:** {workflow_config.get('name', workflow_name)}")
    print()
    
    print("### Jobs")
    for job_name, job_config in workflow_config.get('jobs', {}).items():
        print(f"- **{job_name}**")
        print(f"  - Adaptor: {job_config.get('adaptor', 'Unknown')}")
        print(f"  - Body: {job_config.get('body', 'No body specified')}")
        print()
    
    print("### Triggers")
    for trigger in workflow_config.get('triggers', []):
        print(f"- **Type:** {trigger.get('type', 'Unknown')}")
        if trigger.get('cron_expression'):
            print(f"  - Schedule: {trigger['cron_expression']}")
        print()
    
    print("### Edges")
    for edge in workflow_config.get('edges', []):
        print(f"- **Source:** {edge.get('source_job', 'Unknown')}")
        print(f"- **Target:** {edge.get('target_job', 'Unknown')}")
        print(f"- **Condition:** {edge.get('condition_type', 'always')}")
        print()
PYTHON_EOF
    
    log_success "Documentation generated: $docs_file"
}

# Main command handler
main() {
    local command="${1:-test}"
    local workflow_path="${2:-$WORKFLOW_DIR}"
    
    # Ensure directories exist
    mkdir -p "$FIXTURES_DIR" "$OUTPUTS_DIR"
    
    # Build Docker image if it doesn't exist
    if ! docker image inspect "$DOCKER_IMAGE" >/dev/null 2>&1; then
        log_info "Building Docker test image..."
        docker build -f Dockerfile.test -t "$DOCKER_IMAGE" .
    fi
    
    case "$command" in
        "test")
            run_integration_tests "$workflow_path"
            ;;
        "validate")
            test_workflow_config "$workflow_path" && validate_job_files "$workflow_path"
            ;;
        "plan")
            create_workflow_plan "$workflow_path"
            ;;
        "execute")
            test_workflow_execution "$workflow_path"
            ;;
        "docs")
            generate_docs "$workflow_path"
            ;;
        "full")
            log_workflow "Running full test suite..."
            run_integration_tests "$workflow_path" && \
            validate_job_files "$workflow_path" && \
            generate_docs "$workflow_path"
            ;;
        *)
            echo "OpenFN Workflow Testing Script"
            echo ""
            echo "Usage: $0 {command} [workflow_path]"
            echo ""
            echo "Commands:"
            echo "  test      - Run integration tests"
            echo "  validate  - Validate configuration and job files"
            echo "  plan      - Create workflow execution plan"
            echo "  execute   - Test workflow execution"
            echo "  docs      - Generate workflow documentation"
            echo "  full      - Run all tests and generate docs"
            echo ""
            echo "Examples:"
            echo "  $0 test                              # Test default workflow"
            echo "  $0 validate workflows/sftp-dhis2    # Validate specific workflow"
            echo "  $0 full                              # Run complete test suite"
            exit 1
            ;;
    esac
}

# Run main function
main "$@" 