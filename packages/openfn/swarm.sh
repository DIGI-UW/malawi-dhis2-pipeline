#!/bin/bash

declare ACTION=""
declare MODE=""
declare COMPOSE_FILE_PATH=""
declare UTILS_PATH=""
declare STACK="openfn"

function init_vars() {
  # Temporary arrays to hold positional arguments
  local pos_args=()

  # Parse all arguments (excluding the old --debug-workflows)
  for arg in "$@"; do
    case "$arg" in
      # Old --debug-workflows case removed
      *)
        pos_args+=("$arg") # Collect positional arguments
        ;;
    esac
  done

  # Assign positional arguments based on what's left
  ACTION=${pos_args[0]:-} # Default to empty if not set
  MODE=${pos_args[1]:-}   # Default to empty if not set

  COMPOSE_FILE_PATH=$(
    cd "$(dirname "${BASH_SOURCE[0]}")" || exit
    pwd -P
  )

  UTILS_PATH="${COMPOSE_FILE_PATH}/../utils"

  readonly ACTION
  readonly MODE
  readonly COMPOSE_FILE_PATH
  readonly UTILS_PATH
  readonly STACK
}

# shellcheck disable=SC1091
function import_sources() {
  source "${UTILS_PATH}/docker-utils.sh"
  source "${UTILS_PATH}/log.sh"
}

function initialize_package() {
  local package_dev_compose_filename=""
  if [[ "${MODE}" == "dev" ]]; then
    log info "Running package in DEV mode"
    package_dev_compose_filename="docker-compose.dev.yml"
  else
    log info "Running package in PROD mode"
  fi

  (
    log info "🔧 OPENFN PACKAGE INITIALIZATION"
    log info "================================="
    log info "Action: ${ACTION}"
    log info "Mode: ${MODE}"
    log info "Stack: ${STACK}"
    log info ""
    log info "🌍 KEY ENVIRONMENT VARIABLES:"
    log info "  OPENFN_ENDPOINT='${OPENFN_ENDPOINT}'"
    log info "  OPENFN_WORKFLOWS_IMAGE='${OPENFN_WORKFLOWS_IMAGE}'"
    log info "  OPENFN_WORKFLOW_MANUAL_CLI='${OPENFN_WORKFLOW_MANUAL_CLI}'"
    log info "  OPENFN_LOAD_WORKFLOWS_ON_STARTUP='${OPENFN_LOAD_WORKFLOWS_ON_STARTUP}'"
    log info ""
    
    log info "🗄️  Configuring postgres database"
    docker::await_service_status "postgres" "postgres-1" "Running" 
    
    if [[ "${ACTION}" == "init" ]]; then
         docker::deploy_config_importer $STACK "$COMPOSE_FILE_PATH/importer/postgres/docker-compose.config.yml" "openfn_db_config" "openfn"
    fi
     
    docker::deploy_service $STACK "${COMPOSE_FILE_PATH}" "docker-compose.yml" "$package_dev_compose_filename"

    log info "Configuring OpenFn service. Stack: $STACK"

    if [[ "${ACTION}" == "init" ]]; then
        # Setup initial user
        log info "👤 Setting up initial OpenFN user..."
        log info "  API Key: ${OPENFN_API_KEY:0:8}***"
        log info "  Admin User: ${OPENFN_ADMIN_USER}"
        log info "  Endpoint: ${OPENFN_ENDPOINT}"
        
        log info "⏳ Waiting for OpenFN service to be ready..."
        docker::await_service_status "openfn" "openfn" "Running"
        sleep 10  # Give the service time to fully initialize
        
        OPENFN_CONTAINER_ID=$(docker ps --filter "label=com.docker.swarm.service.name=openfn_openfn" --filter "status=running" -q | head -n 1)
        if [ -n "$OPENFN_CONTAINER_ID" ]; then
           log info "🔧 Performing initial OpenFn user setup..."
           log info "  Container ID: ${OPENFN_CONTAINER_ID:0:12}..."
           
           SETUP_USER_CMD="/app/bin/lightning eval '
Lightning.Setup.setup_user(
  %{
    first_name: \"Test\", 
    last_name: \"User\",
    email: \"${OPENFN_ADMIN_USER}\", 
    password: \"${OPENFN_ADMIN_PASSWORD}\", 
    role: :superuser
  }, 
  \"${OPENFN_API_KEY}\", 
  [
    %{
      name: \"sftp-test-credential\", 
      schema: \"sftp\", 
      body: %{
        host: \"sftp://172.17.0.1\", 
        port: 2225, 
        username: \"${SFTP_TEST_USERNAME:-openfn}\", 
        password: \"${SFTP_TEST_PASSWORD:-instant101}\"
      }
    }, 
    %{
      name: \"dhis2-credential\", 
      schema: \"dhis2\", 
      body: %{
        username: \"${DHIS2_USERNAME:-admin}\", 
        password: \"${DHIS2_PASSWORD:-district}\", 
        hostUrl: \"${DHIS2_URL:-http://dhis2:8080}\"
      }
    }, 
    %{
      name: \"combined-sftp-dhis2-credential\", 
      schema: \"dhis2\", 
      body: %{
        username: \"openfn_integration\", 
        password: \"OpenFn@2024!\", 
        hostUrl: \"${DHIS2_URL:-http://dhis2:8080}\", 
        sftpConfiguration: %{
          host: \"172.17.0.1\", 
          port: 2225, 
          username: \"${SFTP_TEST_USERNAME:-openfn}\", 
          password: \"${SFTP_TEST_PASSWORD:-instant101}\"
        }
      }
    }
  ]
)'"
           
           if docker exec "$OPENFN_CONTAINER_ID" sh -c "$SETUP_USER_CMD"; then
               log info "✅ User and credentials setup completed successfully"
           else
               log error "❌ User and credentials setup failed"
           fi
        else
            log error "Could not find OpenFN container"
        fi
    fi

    # Handle workflow loading
    log info "🔧 WORKFLOW LOADING CONFIGURATION:"
    log info "  OPENFN_WORKFLOW_MANUAL_CLI='${OPENFN_WORKFLOW_MANUAL_CLI}'"
    log info "  OPENFN_LOAD_WORKFLOWS_ON_STARTUP='${OPENFN_LOAD_WORKFLOWS_ON_STARTUP}'"
    
    # Debug environment variable sources
    log info ""
    log info "🔍 ENVIRONMENT VARIABLE DEBUGGING:"
    log info "=================================="
    
    # Check if variables are set and their sources
    if [[ -n "${OPENFN_WORKFLOW_MANUAL_CLI:-}" ]]; then
        log info "✅ OPENFN_WORKFLOW_MANUAL_CLI is set to: '${OPENFN_WORKFLOW_MANUAL_CLI}'"
    else
        log info "❌ OPENFN_WORKFLOW_MANUAL_CLI is not set"
    fi
    
    if [[ -n "${OPENFN_LOAD_WORKFLOWS_ON_STARTUP:-}" ]]; then
        log info "✅ OPENFN_LOAD_WORKFLOWS_ON_STARTUP is set to: '${OPENFN_LOAD_WORKFLOWS_ON_STARTUP}'"
    else
        log info "❌ OPENFN_LOAD_WORKFLOWS_ON_STARTUP is not set"
    fi
    
    # Show all OPENFN related environment variables
    log info ""
    log info "📋 ALL OPENFN ENVIRONMENT VARIABLES:"
    env | grep -E "^OPENFN_" | sort | while read -r line; do
        log info "    $line"
    done
    
    # Logic explanation
    log info ""
    log info "🧠 DECISION LOGIC:"
    if [[ "${OPENFN_WORKFLOW_MANUAL_CLI}" == "true" ]]; then
        log info "  → Will use MANUAL CLI mode (because OPENFN_WORKFLOW_MANUAL_CLI=true)"
    elif [[ "${OPENFN_LOAD_WORKFLOWS_ON_STARTUP}" == "true" ]]; then
        log info "  → Will use AUTOMATIC LOADING mode (because OPENFN_LOAD_WORKFLOWS_ON_STARTUP=true)"
    else
        log info "  → Will SKIP workflow loading (both flags are false/unset)"
    fi
    
    # Run workflow sync hook if enabled
    if [[ -f "${COMPOSE_FILE_PATH}/workflow-sync.sh" ]] && [[ "${OPENFN_SYNC_ON_STARTUP}" == "true" ]]; then
        log info "🔄 Running workflow sync startup hook..."
        chmod +x "${COMPOSE_FILE_PATH}/workflow-sync.sh"
        "${COMPOSE_FILE_PATH}/workflow-sync.sh" hook startup || log warning "Workflow sync hook failed"
    fi
    
    if [[ "${OPENFN_WORKFLOW_MANUAL_CLI}" == "true" ]]; then
        log info "🛠️  Starting workflow manager in interactive mode for manual debugging"
        # Run the debug script that starts a separate container with volume mounts
        chmod +x "${COMPOSE_FILE_PATH}/debug-workflow.sh"
        "${COMPOSE_FILE_PATH}/debug-workflow.sh"
    elif [[ "${OPENFN_LOAD_WORKFLOWS_ON_STARTUP}" == "true" ]]; then
        log info "🚀 Loading workflows automatically on startup"
        
        # Use static workflow loader configuration
        local workflow_config_file="$COMPOSE_FILE_PATH/importer/workflows/docker-compose.yml"
        log info "📁 Using static workflow config at: $workflow_config_file"
        
        # Deploy the workflow loader
        log info "🚢 Deploying workflow loader service..."
        log info "  Stack: $STACK"
        log info "  Config: $workflow_config_file" 
        log info "  Service name: workflow_loader"
        log info "  Container name: openfn-workflows"
        
        if docker::deploy_service "$STACK" "$(dirname "$workflow_config_file")" "$(basename "$workflow_config_file")"; then
            log info "✅ Workflow loader deployment initiated successfully"
            
            # Wait a moment and check if the service is starting
            sleep 5
            local service_name=$(docker service ls --format "{{.Name}}" | grep -E "(workflow|openfn.*workflow)" | head -1)
            if [[ -n "$service_name" ]]; then
                local service_status=$(docker service ps "$service_name" --format "{{.CurrentState}}" 2>/dev/null | head -1)
                log info "📊 Workflow loader service '$service_name' status: $service_status"
            else
                log warning "⚠️  Could not find workflow loader service"
            fi
        else
            log error "❌ Failed to deploy workflow loader service"
            log error "🔍 Check Docker service logs with: docker service ls | grep workflow"
        fi
    else
        log info "⏭️  OpenFN started without workflow loading (both MANUAL_CLI and LOAD_ON_STARTUP are false)"
    fi
    
    log info ""
    log info "🎯 OPENFN INITIALIZATION COMPLETE"
    log info "================================="

  ) || {
    log error "❌ Failed to deploy package"
    exit 1
  }
}

function destroy_package() {
  docker::stack_destroy $STACK
}

main() {
  init_vars "$@"
  import_sources

  if [[ "${ACTION}" == "init" ]] || [[ "${ACTION}" == "up" ]]; then
    log info "Running package in Single node mode"

    initialize_package
  elif [[ "${ACTION}" == "down" ]]; then
    log info "Scaling down package"

   docker::scale_services $STACK 0
  elif [[ "${ACTION}" == "destroy" ]]; then
    log info "Destroying package"

    destroy_package
  else
    log error "Valid options are: init, up, down, or destroy"
  fi
}

main "$@"
