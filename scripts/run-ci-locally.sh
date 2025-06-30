#!/bin/bash

# Run GitHub Actions CI Workflows Locally
# Uses 'act' to execute the actual workflow files

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

# Usage function
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Run GitHub Actions workflows locally using 'act'"
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
    echo "  - 'act' must be installed (see: https://github.com/nektos/act)"
    echo ""
    echo "Examples:"
    echo "  $0                      # Run all workflows"
    echo "  $0 --env-setup          # Run environment setup workflow"
    echo "  $0 --workflow-tests     # Run workflow tests"
    echo "  $0 --list               # List available workflows"
    echo ""
}

# Check if act is installed
check_act_installed() {
    if ! command -v act &> /dev/null; then
        log_error "'act' is not installed!"
        echo ""
        echo "To install 'act', run one of:"
        echo "  # macOS:"
        echo "  brew install act"
        echo ""
        echo "  # Linux (using install script):"
        echo "  curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash"
        echo ""
        echo "  # Or download from: https://github.com/nektos/act/releases"
        echo ""
        exit 1
    fi
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

# Check prerequisites
check_act_installed

# Check if Docker is running
if ! docker info &> /dev/null; then
    log_error "Docker is not running!"
    echo "Please start Docker and try again."
    exit 1
fi

# Create .actrc file if it doesn't exist
if [ ! -f .actrc ]; then
    cat > .actrc << 'EOF'
# Default act configuration
-P ubuntu-latest=catthehacker/ubuntu:act-latest
-P ubuntu-22.04=catthehacker/ubuntu:act-22.04
-P ubuntu-20.04=catthehacker/ubuntu:act-20.04
--container-architecture linux/amd64
EOF
    log_info "Created .actrc configuration file"
fi

# List workflows if requested
if [ "$LIST_ONLY" = true ]; then
    log_info "Available workflows:"
    act -l
    exit 0
fi

# Run the requested workflow(s)
log_info "🚀 Running GitHub Actions locally with 'act'"
log_info "========================================="

case $WORKFLOW in
    "env-setup")
        log_info "Running Environment Setup CI..."
        act -W .github/workflows/ci-environment.yml $VERBOSE \
            --secret-file .env \
            --env-file .env
        ;;
    "workflow-tests")
        log_info "Running Workflow Tests CI..."
        act -W .github/workflows/ci-workflow-tests.yml $VERBOSE \
            --secret-file .env \
            --env-file .env
        ;;
    "all")
        log_info "Running all CI workflows..."
        
        # Run environment setup first
        log_info "1/2: Environment Setup CI"
        if act -W .github/workflows/ci-environment.yml $VERBOSE \
            --secret-file .env \
            --env-file .env; then
            log_success "Environment setup completed"
        else
            log_error "Environment setup failed"
            exit 1
        fi
        
        # Then run workflow tests
        log_info "2/2: Workflow Tests CI"
        if act -W .github/workflows/ci-workflow-tests.yml $VERBOSE \
            --secret-file .env \
            --env-file .env; then
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
echo "- Use 'act -l' to list all available jobs"
echo "- Use 'act -n' for a dry run"
echo "- Use 'act --container-architecture linux/amd64' if you're on Apple Silicon"
echo "- See https://github.com/nektos/act for more options" 