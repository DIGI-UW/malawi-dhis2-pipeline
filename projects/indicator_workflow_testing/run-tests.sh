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
SPECIFIC_TEST=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --api)
            RUN_API_TESTS=true
            RUN_EXCEL_TESTS=false
            RUN_SFTP_TESTS=false
            RUN_INTEGRATION_TESTS=false
            SPECIFIC_TEST="api"
            shift
            ;;
        --excel)
            RUN_API_TESTS=false
            RUN_EXCEL_TESTS=true
            RUN_SFTP_TESTS=false
            RUN_INTEGRATION_TESTS=false
            SPECIFIC_TEST="excel"
            shift
            ;;
        --sftp)
            RUN_API_TESTS=false
            RUN_EXCEL_TESTS=false
            RUN_SFTP_TESTS=true
            RUN_INTEGRATION_TESTS=false
            SPECIFIC_TEST="sftp"
            shift
            ;;
        --workflows)
            RUN_API_TESTS=true
            RUN_EXCEL_TESTS=false
            RUN_SFTP_TESTS=false
            RUN_INTEGRATION_TESTS=false
            SPECIFIC_TEST="workflows"
            shift
            ;;
        --integration)
            RUN_API_TESTS=false
            RUN_EXCEL_TESTS=false
            RUN_SFTP_TESTS=false
            RUN_INTEGRATION_TESTS=true
            SPECIFIC_TEST="integration"
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
            echo "  --verbose, -v  Enable verbose output"
            echo "  --help, -h     Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Run all tests"
            echo "  $0 --api --verbose    # Run API tests with verbose output"
            echo "  $0 --integration      # Run only integration tests"
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
        # Fallback to Docker
        log_info "Node.js not found locally, running $test_name with Docker..."
        
        local script_dir=$(dirname "$test_script")
        local script_file=$(basename "$test_script")
        
        if docker run --rm -v "$script_dir:/app" -w /app node:18-alpine node "$script_file"; then
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
        run_js_test "Excel Parsing" "$SCRIPT_DIR/tests/excel-parsing-tests.js" "Excel file parsing and validation tests"
    fi
    
    if [[ "$RUN_SFTP_TESTS" == "true" ]]; then
        run_test_suite "SFTP Basic" "$SCRIPT_DIR/tests/test-sftp.sh" "Basic SFTP connectivity tests"
        run_test_suite "SFTP Integration" "$SCRIPT_DIR/tests/sftp-integration-tests.sh" "SFTP workflow integration tests"
        run_test_suite "SFTP Deployment" "$SCRIPT_DIR/tests/deploy-and-test-sftp-integration.sh" "SFTP deployment and testing"
    fi
    
    if [[ "$RUN_INTEGRATION_TESTS" == "true" ]]; then
        run_js_test "Integration" "$SCRIPT_DIR/tests/integration-tests.js" "End-to-end integration validation"
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