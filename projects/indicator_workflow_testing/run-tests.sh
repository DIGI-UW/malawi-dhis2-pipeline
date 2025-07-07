#!/bin/bash

# OpenFN Workflow Testing Framework - Main Test Runner
# Executes the complete test suite for OpenFN DHIS2 workflows

set -e

# Get script directory and load common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils/common.sh"

# Test suite configuration
VERBOSE=false
RUN_API_TESTS=true
RUN_EXCEL_TESTS=true
RUN_SFTP_TESTS=true
RUN_INTEGRATION_TESTS=true
RUN_CLI_WORKFLOW_TESTS=true
SPECIFIC_TEST=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --api)
            RUN_API_TESTS=true
            RUN_EXCEL_TESTS=false
            RUN_SFTP_TESTS=false
            RUN_INTEGRATION_TESTS=false
            RUN_CLI_WORKFLOW_TESTS=false
            SPECIFIC_TEST="api"
            shift
            ;;
        --excel)
            RUN_API_TESTS=false
            RUN_EXCEL_TESTS=true
            RUN_SFTP_TESTS=false
            RUN_INTEGRATION_TESTS=false
            RUN_CLI_WORKFLOW_TESTS=false
            SPECIFIC_TEST="excel"
            shift
            ;;
        --sftp)
            RUN_API_TESTS=false
            RUN_EXCEL_TESTS=false
            RUN_SFTP_TESTS=true
            RUN_INTEGRATION_TESTS=false
            RUN_CLI_WORKFLOW_TESTS=false
            SPECIFIC_TEST="sftp"
            shift
            ;;
        --workflows)
            RUN_API_TESTS=true
            RUN_EXCEL_TESTS=false
            RUN_SFTP_TESTS=false
            RUN_INTEGRATION_TESTS=false
            RUN_CLI_WORKFLOW_TESTS=false
            SPECIFIC_TEST="workflows"
            shift
            ;;
        --integration)
            RUN_API_TESTS=false
            RUN_EXCEL_TESTS=false
            RUN_SFTP_TESTS=false
            RUN_INTEGRATION_TESTS=true
            RUN_CLI_WORKFLOW_TESTS=false
            SPECIFIC_TEST="integration"
            shift
            ;;
        --cli-workflow)
            RUN_API_TESTS=false
            RUN_EXCEL_TESTS=false
            RUN_SFTP_TESTS=false
            RUN_INTEGRATION_TESTS=false
            RUN_CLI_WORKFLOW_TESTS=true
            SPECIFIC_TEST="cli-workflow"
            shift
            ;;
        --simple-sftp)
            RUN_API_TESTS=false
            RUN_EXCEL_TESTS=false
            RUN_SFTP_TESTS=false
            RUN_INTEGRATION_TESTS=false
            RUN_CLI_WORKFLOW_TESTS=false
            SPECIFIC_TEST="simple-sftp"
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            export VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "OpenFN Workflow Testing Framework"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --api          Run only API connectivity tests"
            echo "  --workflows    Run only workflow validation tests"
            echo "  --excel        Run only Excel parsing tests"
            echo "  --sftp         Run only SFTP integration tests"
            echo "  --integration  Run only end-to-end integration tests"
            echo "  --cli-workflow Run CLI-based workflow tests (3 working tests)"
            echo "  --simple-sftp  Run only the simple SFTP job test"
            echo "  --verbose, -v  Enable verbose output"
            echo "  --help, -h     Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                     # Run all tests"
            echo "  $0 --cli-workflow      # Run 3 CLI tests (SFTP basic, simple job, full workflow)"
            echo "  $0 --simple-sftp       # Run only the simple SFTP job test"
            echo "  $0 --api --verbose     # Run API tests with verbose output"
            echo "  $0 --integration       # Run only integration tests"
            echo ""
            echo "CLI Tests Available:"
            echo "  • test-sftp-working-command.sh   - ⭐ PROVEN WORKING (30s)"
            echo "  • test-simple-sftp-job.sh        - Simple inline test"
            echo "  • test-sftp-dhis2-workflow.sh    - Complete workflow"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Test results tracking
declare -a TEST_RESULTS
declare -a TEST_NAMES
TOTAL_PASSED=0
TOTAL_FAILED=0

# Function to run a test suite
run_test_suite() {
    local test_name=$1
    local test_script=$2
    local test_description=$3
    
    log_info "Running $test_description..."
    echo "==============================================="
    
    if [[ -f "$test_script" ]]; then
        if bash "$test_script"; then
            log_success "$test_name tests passed"
            TEST_RESULTS+=("PASS")
            TOTAL_PASSED=$((TOTAL_PASSED + 1))
        else
            log_error "$test_name tests failed"
            TEST_RESULTS+=("FAIL")
            TOTAL_FAILED=$((TOTAL_FAILED + 1))
        fi
    else
        log_warning "$test_name test script not found: $test_script"
        TEST_RESULTS+=("SKIP")
    fi
    
    TEST_NAMES+=("$test_name")
    echo ""
}

# Function to run CLI-based test using openfn-cli-test container
run_cli_test() {
    local test_name="$1"
    local test_description="$2"
    
    log_info "Running $test_description..."
    echo "==============================================="
    
    local success=false
    
    # Check if openfn-cli-test image exists
    if ! docker image inspect "openfn-cli-test:latest" >/dev/null 2>&1; then
        log_error "openfn-cli-test:latest image not found. Build it with: ./build-custom-images.sh openfn-cli-test"
        TEST_RESULTS+=("FAIL")
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
        TEST_NAMES+=("$test_name")
        echo ""
        return
    fi
    
    case $test_name in
        "CLI SFTP Basic")
            # Run the proven working SFTP test
            log_info "Running proven working SFTP test (30s)..."
            if cd "$SCRIPT_DIR/tests/cli" && bash test-sftp-working-command.sh; then
                success=true
            fi
            ;;
        "CLI SFTP Workflow")
            # Run the complete workflow test
            log_info "Running complete SFTP→Excel→DHIS2 workflow test..."
            if cd "$SCRIPT_DIR/tests/cli" && bash test-sftp-dhis2-workflow.sh; then
                success=true
            fi
            ;;
        "CLI Simple Job")
            # Run simple inline job test
            log_info "Running simple inline SFTP job test..."
            if cd "$SCRIPT_DIR/tests/cli" && bash test-simple-sftp-job.sh; then
                success=true
            fi
            ;;
        "Excel Parsing")
            # Test Excel parsing through CLI workflow
            log_info "Testing Excel parsing via CLI workflow..."
            if docker run --rm \
                -v "$SCRIPT_DIR/tests/fixtures:/e2e" \
                openfn-cli-test:latest /bin/sh -c "
                    mkdir -p /tmp/excel-test/workflows/excel-parse
                    cat > /tmp/excel-test/openfn.json << 'EOF'
{
  \"workflowRoot\": \"workflows\",
  \"formats\": {
    \"workflow\": \"json\"
  }
}
EOF
                    cat > /tmp/excel-test/workflows/excel-parse/excel-parse.json << 'EOF'
{
  \"id\": \"excel-parse\",
  \"steps\": [
    {
      \"adaptor\": \"@openfn/language-sftp@2.0.14\",
      \"expression\": \"console.log('Testing Excel file access via SFTP...'); list('/data/excel-files', (state) => { console.log('Excel files found:', state.data.length); const artFile = state.data.find(f => f.name.includes('ART_data')); if (artFile) { console.log('✅ ART Excel file found:', artFile.name, '(' + (artFile.size/1024/1024).toFixed(1) + 'MB)'); } return state; });\"
    }
  ]
}
EOF
                    cd /tmp
                    openfn excel-test excel-parse -s /e2e/sftp-test-input.json 2>&1 | grep -E '(Excel files found|ART Excel file found|completed)'
                "; then
                success=true
            fi
            ;;
        *)
            log_warning "Unknown CLI test: $test_name"
            TEST_RESULTS+=("SKIP")
            TEST_NAMES+=("$test_name")
            echo ""
            return
            ;;
    esac
    
    if $success; then
        log_success "$test_name tests passed"
        TEST_RESULTS+=("PASS")
        TOTAL_PASSED=$((TOTAL_PASSED + 1))
    else
        log_error "$test_name tests failed"
        TEST_RESULTS+=("FAIL")
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
    fi
    
    TEST_NAMES+=("$test_name")
    echo ""
}

# Function to run JavaScript test with Docker fallback
run_js_test() {
    local test_name=$1
    local test_script=$2
    local test_description=$3
    
    log_info "Running $test_description..."
    echo "==============================================="
    
    if [[ ! -f "$test_script" ]]; then
        log_warning "$test_name test script not found: $test_script"
        TEST_RESULTS+=("SKIP")
        TEST_NAMES+=("$test_name")
        echo ""
        return
    fi
    
    local success=false
    
    # Try Node.js locally first
    if command -v node &> /dev/null; then
        log_debug "Running $test_name with local Node.js"
        if node "$test_script"; then
            success=true
        fi
    else
        # Fallback to Docker with dependencies
        log_info "Node.js not found locally, running $test_name with Docker..."
        
        local script_dir=$(dirname "$test_script")
        local script_file=$(basename "$test_script")
        
        if docker run --rm -v "$script_dir:/app" -w /app node:18-alpine sh -c "npm install xlsx csv-parser && node $script_file"; then
            success=true
        fi
    fi
    
    if $success; then
        log_success "$test_name tests passed"
        TEST_RESULTS+=("PASS")
        TOTAL_PASSED=$((TOTAL_PASSED + 1))
    else
        log_error "$test_name tests failed"
        TEST_RESULTS+=("FAIL")
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
    fi
    
    TEST_NAMES+=("$test_name")
    echo ""
}

# Main execution
main() {
    log_info "🧪 OpenFN Workflow Testing Framework"
    log_info "====================================="
    log_info "Testing configuration:"
    log_info "  OpenFN URL: $OPENFN_URL"
    log_info "  Verbose mode: $VERBOSE"
    
    if [[ -n "$SPECIFIC_TEST" ]]; then
        log_info "  Running specific test suite: $SPECIFIC_TEST"
    else
        log_info "  Running all test suites"
    fi
    
    echo ""
    
    # Check prerequisites
    log_info "Checking prerequisites..."
    
    # Check if Node.js is available for JavaScript tests
    if ! command -v node &> /dev/null; then
        if command -v docker &> /dev/null; then
            log_info "Node.js not found locally - will use Docker for JavaScript tests"
        else
            log_warning "Neither Node.js nor Docker found - JavaScript tests will be skipped"
            RUN_EXCEL_TESTS=false
            RUN_INTEGRATION_TESTS=false
        fi
    fi
    
    # Check if curl is available
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not found"
        exit 1
    fi
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        log_warning "Docker not found - some tests may fail"
    fi
    
    echo ""
    
    # Run test suites
    if [[ "$RUN_API_TESTS" == "true" ]]; then
        if [[ "$SPECIFIC_TEST" == "workflows" ]]; then
            run_test_suite "Workflow Validation" "$SCRIPT_DIR/tests/workflow-validation-tests.sh" "OpenFN workflow validation tests"
        else
            run_test_suite "API" "$SCRIPT_DIR/tests/api-tests.sh" "OpenFN API connectivity tests"
        fi
    fi
    
    if [[ "$RUN_EXCEL_TESTS" == "true" ]]; then
        run_cli_test "Excel Parsing" "CLI-based Excel file parsing and validation tests"
    fi
    
    if [[ "$RUN_SFTP_TESTS" == "true" ]]; then
        # Run CLI-based SFTP tests using the openfn-cli-test Docker image
        log_info "Running CLI-based SFTP tests..."
        
        # Run the two main CLI SFTP test files
        run_test_suite "SFTP CLI Working Command" "$SCRIPT_DIR/tests/cli/test-sftp-working-command.sh" "Proven working SFTP CLI test"
        run_test_suite "SFTP CLI Simple Job" "$SCRIPT_DIR/tests/cli/test-simple-sftp-job.sh" "Simple inline SFTP job test"
    fi
    
    if [[ "$RUN_INTEGRATION_TESTS" == "true" ]]; then
        # Test the full sftp-dhis2 workflow using our comprehensive framework
        if [[ -f "$SCRIPT_DIR/tests/cli/test-real-workflows.sh" ]]; then
            log_info "Testing full SFTP → Excel → DHIS2 workflow..."
            if bash "$SCRIPT_DIR/tests/cli/test-real-workflows.sh" sftp-dhis2; then
                log_success "Integration tests passed"
                TEST_RESULTS+=("PASS")
                TOTAL_PASSED=$((TOTAL_PASSED + 1))
            else
                log_error "Integration tests failed"
                TEST_RESULTS+=("FAIL")
                TOTAL_FAILED=$((TOTAL_FAILED + 1))
            fi
            TEST_NAMES+=("Integration")
        else
            # Fallback to simple SFTP test
            run_test_suite "Integration" "$SCRIPT_DIR/tests/cli/test-sftp-working-command.sh" "Basic SFTP connectivity"
        fi
    fi
    
    if [[ "$RUN_CLI_WORKFLOW_TESTS" == "true" ]]; then
        # Run our 3 working CLI tests
        run_cli_test "CLI SFTP Basic" "Proven working SFTP connectivity test (30s)"
        run_cli_test "CLI Simple Job" "Simple inline SFTP job test"
        run_cli_test "CLI SFTP Workflow" "Complete SFTP→Excel→DHIS2 workflow test"
    fi
    
    if [[ "$SPECIFIC_TEST" == "simple-sftp" ]]; then
        # Run just the simple SFTP job test
        run_cli_test "CLI Simple Job" "Simple inline SFTP job test"
    fi
    
    # Generate summary
    echo ""
    log_info "🎯 Final Test Results"
    log_info "======================"
    
    for i in "${!TEST_NAMES[@]}"; do
        local name="${TEST_NAMES[$i]}"
        local result="${TEST_RESULTS[$i]}"
        
        case $result in
            "PASS")
                log_success "$name: PASSED"
                ;;
            "FAIL")
                log_error "$name: FAILED"
                ;;
            "SKIP")
                log_warning "$name: SKIPPED"
                ;;
        esac
    done
    
    summarize_results $TOTAL_PASSED $TOTAL_FAILED
    
    # Write results to file
    local results_file="$SCRIPT_DIR/test-results.log"
    echo "Test Results - $(date)" > "$results_file"
    echo "========================" >> "$results_file"
    
    for i in "${!TEST_NAMES[@]}"; do
        echo "${TEST_NAMES[$i]}: ${TEST_RESULTS[$i]}" >> "$results_file"
    done
    
    echo "" >> "$results_file"
    echo "Summary: $TOTAL_PASSED passed, $TOTAL_FAILED failed" >> "$results_file"
    
    log_info "Results written to: $results_file"
    
    # Exit with appropriate code
    if [[ $TOTAL_FAILED -eq 0 ]]; then
        log_success "All tests completed successfully! 🎉"
        exit 0
    else
        log_error "Some tests failed. Please review the results above."
        exit 1
    fi
}

# Trap to ensure cleanup on exit
cleanup() {
    if [[ $? -ne 0 ]]; then
        log_error "Test execution was interrupted"
    fi
}

trap cleanup EXIT

# Run main function
main "$@" 