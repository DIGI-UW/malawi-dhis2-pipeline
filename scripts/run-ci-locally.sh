#!/bin/bash

# Run GitHub Actions CI Workflows Locally
# Uses Docker to run 'act' without requiring local installation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Default values
WORKFLOW="all"
LIST_ONLY=false
VERBOSE=""
ACT_IMAGE="malawi-pipeline-act"

# Usage function
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Run GitHub Actions workflows locally using Docker + 'act'"
    echo ""
    echo "Options:"
    echo "  --env-setup         Run environment setup workflow only"
    echo "  --workflow-tests    Run workflow tests only"
    echo "  --list              List available workflows"
    echo "  --verbose           Enable verbose output"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Prerequisites:"
    echo "  - Docker must be installed and running"
    echo ""
    echo "Examples:"
    echo "  $0                      # Run all workflows"
    echo "  $0 --env-setup          # Run environment setup workflow"
    echo "  $0 --workflow-tests     # Run workflow tests"
    echo "  $0 --list               # List available workflows"
    echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env-setup)
            WORKFLOW="env-setup"
            shift
            ;;
        --workflow-tests)
            WORKFLOW="workflow-tests"
            shift
            ;;
        --list)
            LIST_ONLY=true
            shift
            ;;
        --verbose)
            VERBOSE="-v"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Check if Docker is running
if ! docker info &> /dev/null; then
    log_error "Docker is not running!"
    echo "Please start Docker and try again."
    exit 1
fi

# Build act image if it doesn't exist
if ! docker images | grep -q "$ACT_IMAGE"; then
    log_info "Building act Docker image..."
    docker build -f Dockerfile.act -t "$ACT_IMAGE" .
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        log_info "Created .env from .env.example"
    else
        log_warning "No .env or .env.example file found"
    fi
fi

# Docker run function for act
run_act() {
    local act_args="$1"
    
    docker run --rm -i \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v "$PWD:/workspace" \
        -w /workspace \
        --env-file .env \
        "$ACT_IMAGE" \
        $act_args
}

# List workflows if requested
if [ "$LIST_ONLY" = true ]; then
    log_info "Available workflows:"
    run_act "-l"
    exit 0
fi

# Run the requested workflow(s)
log_info "🚀 Running GitHub Actions locally with Docker + 'act'"
log_info "=================================================="

case $WORKFLOW in
    "env-setup")
        log_info "Running Environment Setup CI..."
        run_act "-W .github/workflows/ci-environment.yml $VERBOSE"
        ;;
    "workflow-tests")
        log_info "Running Workflow Tests CI..."
        run_act "-W .github/workflows/ci-workflow-tests.yml $VERBOSE"
        ;;
    "all")
        log_info "Running all CI workflows..."
        
        # Run environment setup first
        log_info "1/2: Environment Setup CI"
        if run_act "-W .github/workflows/ci-environment.yml $VERBOSE"; then
            log_success "Environment setup completed"
        else
            log_error "Environment setup failed"
            exit 1
        fi
        
        # Then run workflow tests
        log_info "2/2: Workflow Tests CI"
        if run_act "-W .github/workflows/ci-workflow-tests.yml $VERBOSE"; then
            log_success "Workflow tests completed"
        else
            log_error "Workflow tests failed"
            exit 1
        fi
        ;;
esac

log_success "🎉 CI run completed!"

# Tips
echo ""
echo "Tips:"
echo "- This builds a Docker image with 'act'"
echo "- The Docker socket is mounted to allow workflow containers to run"
echo "- Environment variables are loaded from .env file"
echo "- Use --verbose for detailed output" 