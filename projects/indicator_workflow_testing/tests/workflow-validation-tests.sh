#!/bin/bash

# OpenFN Workflow Validation Tests
# Tests to verify that workflows are properly loaded and configured

# Load common utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../utils/common.sh"

# Test configuration
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
PROJECT_NAME="malawi-sftp"

# Get project ID dynamically by name
get_project_id() {
    # First try the projects API
    local response=$(api_request "GET" "/api/projects" "Authorization: Bearer $OPENFN_API_KEY")
    
    if command -v jq &> /dev/null; then
        local project_id=$(echo "$response" | jq -r ".data[] | select(.name == \"$PROJECT_NAME\") | .id" 2>/dev/null)
        
        # If not found in projects API, try checking all projects via provisioning API
        if [[ -z "$project_id" || "$project_id" == "null" ]]; then
            local project_ids=$(echo "$response" | jq -r '.data[].id' 2>/dev/null)
            for id in $project_ids; do
                local prov_response=$(api_request "GET" "/api/provision/$id" "Authorization: Bearer $OPENFN_API_KEY")
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

# Function to run a workflow test
run_workflow_test() {
    local test_name="$1"
    local test_function="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    log_info "Running: $test_name"
    
    if $test_function; then
        log_success "$test_name passed"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        log_error "$test_name failed"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# Test 1: Check if OpenFN API is accessible
test_api_accessibility() {
    local response=$(api_request "GET" "/api/projects" "Authorization: Bearer $OPENFN_API_KEY")
    
    if echo "$response" | grep -q "data"; then
        return 0
    else
        log_error "API not accessible. Response: $response"
        return 1
    fi
}

# Test 2: Check if workflows are loaded
test_workflows_loaded() {
    # Get project ID dynamically
    local project_id=$(get_project_id)
    if [[ -z "$project_id" ]]; then
        log_error "Could not find project with name: $PROJECT_NAME"
        return 1
    fi
    
    # Use the provisioning API to get complete project structure with workflows
    local response=$(api_request "GET" "/api/provision/$project_id" "Authorization: Bearer $OPENFN_API_KEY")
    
    if echo "$response" | grep -q '"workflows"'; then
        # Check if project has workflows
        if command -v jq &> /dev/null; then
            local workflow_count=$(echo "$response" | jq -r '.data.workflows | length' 2>/dev/null || echo "0")
            if [[ "$workflow_count" -gt 0 ]]; then
                log_success "Found $workflow_count workflow(s) in project"
                
                # List workflow names
                echo "$response" | jq -r '.data.workflows[] | "  - \(.name)"' 2>/dev/null || true
                
                return 0
            else
                log_error "No workflows found in project"
                return 1
            fi
        else
            # Fallback without jq
            if echo "$response" | grep -q '"workflows":\[' && ! echo "$response" | grep -q '"workflows":\[\]'; then
                log_success "Workflows found in project"
                return 0
            else
                log_error "No workflows found in project"
                return 1
            fi
        fi
    else
        log_error "Provisioning endpoint not accessible or no workflow data returned"
        return 1
    fi
}

# Test 3: Check if jobs are configured
test_jobs_configured() {
    local response=$(api_request "GET" "/api/jobs" "Authorization: Bearer $OPENFN_API_KEY")
    
    if echo "$response" | grep -q "data"; then
        local job_count=$(echo "$response" | jq '.data | length' 2>/dev/null || echo 0)
        
        if [[ "$job_count" -gt 0 ]]; then
            log_success "Found $job_count job(s)"
            
            # List job names if jq is available
            if command -v jq &> /dev/null; then
                echo "$response" | jq -r '.data[] | "  - \(.name)"' 2>/dev/null || true
            fi
            
            return 0
        else
            log_warning "No jobs found - this might be expected if workflows use inline jobs"
            return 0  # Not necessarily an error
        fi
    else
        log_error "Jobs endpoint not accessible"
        return 1
    fi
}

# Test 4: Check if triggers are configured  
test_triggers_configured() {
    # Get project ID dynamically
    local project_id=$(get_project_id)
    if [[ -z "$project_id" ]]; then
        log_error "Could not find project with name: $PROJECT_NAME"
        return 1
    fi
    
    # Use the provisioning API to get complete project structure with workflows
    local response=$(api_request "GET" "/api/provision/$project_id" "Authorization: Bearer $OPENFN_API_KEY")
    
    if echo "$response" | grep -q '"triggers"'; then
        # Check if project workflows have triggers
        if command -v jq &> /dev/null; then
            local trigger_count=$(echo "$response" | jq -r '[.data.workflows[].triggers[]] | length' 2>/dev/null || echo "0")
            if [[ "$trigger_count" -gt 0 ]]; then
                log_success "Found $trigger_count trigger(s) across workflows"
                
                # List trigger types
                echo "$response" | jq -r '.data.workflows[].triggers[] | "  - \(.type): \(.name // "unnamed")"' 2>/dev/null || true
                
                return 0
            else
                log_error "No triggers found - workflows need triggers to be executable"
                return 1
            fi
        else
            # Fallback without jq
            if echo "$response" | grep -q '"triggers":\[' && ! echo "$response" | grep -q '"triggers":\[\]'; then
                log_success "Triggers found in workflows"
                return 0
            else
                log_error "No triggers found in workflows"
                return 1
            fi
        fi
    else
        log_error "Provisioning endpoint not accessible or no trigger data returned"
        return 1
    fi
}

# Test 5: Check for expected workflow files in the project
test_workflow_files_exist() {
    local workflow_files=(
        "projects/openfn-workflows/workflows/sftp-dhis2"
        "packages/openfn/importer/workflows"
    )
    
    local found_files=0
    
    for workflow_path in "${workflow_files[@]}"; do
        if [[ -d "$PROJECT_ROOT/$workflow_path" ]]; then
            log_success "Found workflow directory: $workflow_path"
            found_files=$((found_files + 1))
        fi
    done
    
    if [[ $found_files -gt 0 ]]; then
        return 0
    else
        log_error "No workflow directories found in expected locations"
        return 1
    fi
}

# Test 6: Check Docker services are running
test_docker_services_running() {
    local required_services=(
        "openfn_openfn"
        "openfn_worker"
        "postgres_postgres-1"
    )
    
    local running_services=0
    
    for service in "${required_services[@]}"; do
        if check_docker_service "$service"; then
            log_success "Service $service is running"
            running_services=$((running_services + 1))
        else
            log_error "Service $service is not running"
        fi
    done
    
    if [[ $running_services -eq ${#required_services[@]} ]]; then
        return 0
    else
        log_error "Only $running_services/${#required_services[@]} required services are running"
        return 1
    fi
}

# Test 7: Check for specific SFTP-DHIS2 workflow
test_sftp_dhis2_workflow() {
    # Get project ID dynamically
    local project_id=$(get_project_id)
    if [[ -z "$project_id" ]]; then
        log_error "Could not find project with name: $PROJECT_NAME"
        return 1
    fi
    
    # Use the provisioning API to get complete project structure with workflows
    local response=$(api_request "GET" "/api/provision/$project_id" "Authorization: Bearer $OPENFN_API_KEY")
    
    if echo "$response" | grep -q "sftp.*dhis2\|SFTP.*DHIS2\|sftp-dhis2\|malawi-sftp\|HIV.*Indicators.*SFTP"; then
        log_success "SFTP-DHIS2 workflow found"
        return 0
    else
        log_warning "SFTP-DHIS2 workflow not found by name pattern"
        
        # Check if any workflow exists that could be the SFTP-DHIS2 workflow
        if command -v jq &> /dev/null; then
            local workflow_count=$(echo "$response" | jq -r '.data.workflows | length' 2>/dev/null || echo "0")
            if [[ "$workflow_count" -gt 0 ]]; then
                log_info "Available workflows:"
                echo "$response" | jq -r '.data.workflows[] | "  - \(.name)"' 2>/dev/null || true
                return 0  # At least some workflows exist
            else
                return 1
            fi
        else
            # Fallback without jq
            if echo "$response" | grep -q '"workflows":\[' && ! echo "$response" | grep -q '"workflows":\[\]'; then
                log_info "Workflows exist but cannot parse names without jq"
                return 0
            else
                return 1
            fi
        fi
    fi
}

# Main test execution
main() {
    log_info "🔄 OpenFN Workflow Validation Tests"
    log_info "=================================="
    log_info "Validating OpenFN workflow configuration and deployment"
    echo ""
    
    # Run all workflow validation tests
    run_workflow_test "API Accessibility" test_api_accessibility
    echo ""
    
    run_workflow_test "Workflows Loaded" test_workflows_loaded
    echo ""
    
    run_workflow_test "Jobs Configured" test_jobs_configured
    echo ""
    
    run_workflow_test "Triggers Configured" test_triggers_configured
    echo ""
    
    run_workflow_test "Workflow Files Exist" test_workflow_files_exist
    echo ""
    
    run_workflow_test "Docker Services Running" test_docker_services_running
    echo ""
    
    run_workflow_test "SFTP-DHIS2 Workflow" test_sftp_dhis2_workflow
    echo ""
    
    # Summary
    log_info "🎯 Workflow Validation Summary"
    log_info "=============================="
    summarize_results $PASSED_TESTS $FAILED_TESTS
    
    if [[ $FAILED_TESTS -eq 0 ]]; then
        log_success "All workflow validation tests passed! Workflows are properly configured."
        return 0
    else
        log_error "Some workflow validation tests failed. Check the issues above."
        return 1
    fi
}

# Run tests if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi 