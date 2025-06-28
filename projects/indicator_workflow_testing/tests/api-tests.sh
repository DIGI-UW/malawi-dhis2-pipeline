#!/bin/bash

# OpenFN Workflow Test Script
# Tests if workflows are correctly loaded via the OpenFN API

set -e

# Configuration
OPENFN_URL="http://localhost:4000"
API_KEY="apiKey"
USER_EMAIL="root@openhim.org"
USER_PASSWORD="instant101"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to make API requests
api_request() {
    local method=$1
    local endpoint=$2
    local auth_header=$3
    local data=$4
    
    local curl_cmd="curl -s -X $method '$OPENFN_URL$endpoint'"
    
    if [[ -n "$auth_header" ]]; then
        curl_cmd="$curl_cmd -H '$auth_header'"
    fi
    
    if [[ -n "$data" ]]; then
        curl_cmd="$curl_cmd -H 'Content-Type: application/json' -d '$data'"
    fi
    
    eval $curl_cmd
}

# Test 1: API Connectivity Check
test_api_connectivity() {
    log_info "Testing OpenFN API connectivity..."
    
    local response=$(api_request "GET" "/api/projects" "Authorization: Bearer $API_KEY")
    
    if echo "$response" | grep -q "data"; then
        log_success "API connectivity check passed"
        return 0
    else
        log_error "API connectivity failed. Response: $response"
        return 1
    fi
}

# Test 2: Authentication
test_authentication() {
    log_info "Testing authentication..."
    
    # Try API key authentication
    local response=$(api_request "GET" "/api/projects" "Authorization: Bearer $API_KEY")
    
    if echo "$response" | grep -q "data"; then
        log_success "API key authentication successful"
        return 0
    else
        log_warning "API key auth failed, trying user/password auth..."
        
        # Try user/password authentication (get session)
        local login_data="{\"user\":{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}}"
        local login_response=$(api_request "POST" "/users/log_in" "" "$login_data")
        
        if echo "$login_response" | grep -q "session"; then
            log_success "User/password authentication successful"
            return 0
        else
            log_error "Authentication failed. Response: $login_response"
            return 1
        fi
    fi
}

# Test 3: List Projects
test_list_projects() {
    log_info "Testing project listing..."
    
    local response=$(api_request "GET" "/api/projects" "Authorization: Bearer $API_KEY")
    
    if echo "$response" | grep -q "data"; then
        local project_count=$(echo "$response" | grep -o '"data":\[' | wc -l)
        log_success "Found projects (count: $project_count)"
        
        # Pretty print project names if jq is available
        if command -v jq &> /dev/null; then
            log_info "Project details:"
            echo "$response" | jq -r '.data[] | "  - Name: \(.name), ID: \(.id)"' 2>/dev/null || true
        fi
        
        return 0
    else
        log_error "Failed to list projects. Response: $response"
        return 1
    fi
}

# Test 4: Check Workflows in Project
test_project_workflows() {
    log_info "Testing workflows within project..."
    
    local response=$(api_request "GET" "/api/projects" "Authorization: Bearer $API_KEY")
    
    if echo "$response" | grep -q "data"; then
        # Check if project has workflows
        if command -v jq &> /dev/null; then
            local workflow_count=$(echo "$response" | jq -r '.data[0].workflows | length' 2>/dev/null || echo "0")
            local project_name=$(echo "$response" | jq -r '.data[0].name' 2>/dev/null || echo "Unknown")
            
            if [[ "$workflow_count" -gt 0 ]]; then
                log_success "Found $workflow_count workflow(s) in project: $project_name"
                
                # Check for SFTP-DHIS2 workflow specifically
                local sftp_workflow=$(echo "$response" | jq -r '.data[0].workflows[] | select(.name | test("sftp|SFTP|dhis2|DHIS2")) | .name' 2>/dev/null || true)
                if [[ -n "$sftp_workflow" ]]; then
                    log_success "SFTP-DHIS2 related workflow found: $sftp_workflow"
                else
                    log_warning "SFTP-DHIS2 workflow not found by name pattern"
                fi
                
                # Show workflow details
                log_info "Workflow details:"
                echo "$response" | jq -r '.data[0].workflows[] | "  - Name: \(.name), ID: \(.id), Jobs: \(.jobs | length), Triggers: \(.triggers | length)"' 2>/dev/null || true
                
                return 0
            else
                log_error "No workflows found in project"
                return 1
            fi
        else
            # Fallback without jq
            if echo "$response" | grep -q "workflows"; then
                log_success "Workflows found in project (jq not available for detailed parsing)"
                return 0
            else
                log_error "No workflows found in project"
                return 1
            fi
        fi
    else
        log_error "Failed to get project data. Response: $response"
        return 1
    fi
}

# Test 5: Check Triggers in Workflows
test_workflow_triggers() {
    log_info "Testing triggers within workflows..."
    
    local response=$(api_request "GET" "/api/projects" "Authorization: Bearer $API_KEY")
    
    if echo "$response" | grep -q "data"; then
        if command -v jq &> /dev/null; then
            local trigger_count=$(echo "$response" | jq -r '[.data[0].workflows[].triggers[]] | length' 2>/dev/null || echo "0")
            
            if [[ "$trigger_count" -gt 0 ]]; then
                log_success "Found $trigger_count trigger(s) across all workflows"
                
                # Check for specific trigger types
                local cron_triggers=$(echo "$response" | jq -r '[.data[0].workflows[].triggers[] | select(.type == "cron")] | length' 2>/dev/null || echo "0")
                local webhook_triggers=$(echo "$response" | jq -r '[.data[0].workflows[].triggers[] | select(.type == "webhook")] | length' 2>/dev/null || echo "0")
                
                if [[ "$cron_triggers" -gt 0 ]]; then
                    log_success "Found $cron_triggers cron trigger(s)"
                fi
                
                if [[ "$webhook_triggers" -gt 0 ]]; then
                    log_success "Found $webhook_triggers webhook trigger(s)"
                fi
                
                # Show trigger details
                log_info "Trigger details:"
                echo "$response" | jq -r '.data[0].workflows[].triggers[] | "  - Type: \(.type), ID: \(.id), Enabled: \(.enabled)"' 2>/dev/null || true
                
                return 0
            else
                log_error "No triggers found in workflows"
                return 1
            fi
        else
            # Fallback without jq
            if echo "$response" | grep -q "triggers"; then
                log_success "Triggers found in workflows (jq not available for detailed parsing)"
                return 0
            else
                log_error "No triggers found in workflows"
                return 1
            fi
        fi
    else
        log_error "Failed to get project data. Response: $response"
        return 1
    fi
}

# Test 6: List Jobs
test_list_jobs() {
    log_info "Testing job listing..."
    
    local response=$(api_request "GET" "/api/jobs" "Authorization: Bearer $API_KEY")
    
    if echo "$response" | grep -q "data"; then
        local job_count=$(echo "$response" | grep -o '"name":' | wc -l)
        log_success "Found jobs (count: $job_count)"
        
        # Pretty print job names if jq is available
        if command -v jq &> /dev/null; then
            log_info "Job details:"
            echo "$response" | jq -r '.data[] | "  - Name: \(.name), ID: \(.id)"' 2>/dev/null || true
        fi
        
        return 0
    else
        log_error "Failed to list jobs. Response: $response"
        return 1
    fi
}

# Main test execution
main() {
    log_info "Starting OpenFN Workflow Tests..."
    log_info "Testing OpenFN at: $OPENFN_URL"
    echo ""
    
    local tests_passed=0
    local tests_total=6
    
    # Run tests
    test_api_connectivity && ((tests_passed++)) || true
    echo ""
    
    test_authentication && ((tests_passed++)) || true
    echo ""
    
    test_list_projects && ((tests_passed++)) || true
    echo ""
    
    test_project_workflows && ((tests_passed++)) || true
    echo ""
    
    test_list_jobs && ((tests_passed++)) || true
    echo ""
    
    test_workflow_triggers && ((tests_passed++)) || true
    echo ""
    
    # Summary
    log_info "Test Results: $tests_passed/$tests_total tests passed"
    
    if [[ $tests_passed -eq $tests_total ]]; then
        log_success "All tests passed! OpenFN workflows are loaded correctly."
        exit 0
    elif [[ $tests_passed -gt 0 ]]; then
        log_warning "Some tests passed but there may be issues with workflow loading."
        exit 1
    else
        log_error "All tests failed. OpenFN may not be properly configured."
        exit 1
    fi
}

# Run the tests
main "$@" 