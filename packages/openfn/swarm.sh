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
    log info "Configuring postgres database"
    docker::await_service_status "postgres" "postgres-1" "Running" 
    
    if [[ "${ACTION}" == "init" ]]; then
         docker::deploy_config_importer $STACK "$COMPOSE_FILE_PATH/importer/postgres/docker-compose.config.yml" "openfn_db_config" "openfn"
    fi
     
    docker::deploy_service $STACK "${COMPOSE_FILE_PATH}" "docker-compose.yml" "$package_dev_compose_filename"

    log info "Configuring OpenFn service. Stack: $STACK"

    if [[ "${ACTION}" == "init" ]]; then
        local OPENFN_SERVICE_COMPOSE_NAME="openfn" # Name of the service in docker-compose.yml
        local OPENFN_SERVICE_SWARM_NAME="${STACK}_${OPENFN_SERVICE_COMPOSE_NAME}"

        # Get a running container ID for the healthy service
        OPENFN_CONTAINER_ID=$(docker ps --filter "label=com.docker.swarm.service.name=openfn_openfn" --filter "status=running" -q | head -n 1)

        if [ -n "$OPENFN_CONTAINER_ID" ]; then
           log info "Performing initial OpenFn user setup in container $OPENFN_CONTAINER_ID..."
           SETUP_USER_CMD_FOR_CONTAINER_SHELL="/app/bin/lightning eval 'Lightning.Setup.setup_user(%{first_name: \"Test\", last_name: \"User\",email: \"root@openhim.org\", password: \"instant101\", role: :superuser}, \"${OPENFN_API_KEY}\")'"
           log info "Executing command: $SETUP_USER_CMD_FOR_CONTAINER_SHELL on container $OPENFN_CONTAINER_ID"
           if docker exec "$OPENFN_CONTAINER_ID" sh -c "$SETUP_USER_CMD_FOR_CONTAINER_SHELL"; then
               log info "OpenFn user setup command executed successfully."
           else
               log error "OpenFn user setup command failed."
           fi
        else
           log error "Could not find a running container for service ${OPENFN_SERVICE_SWARM_NAME}. Skipping user setup."
        fi
    fi

    # Check if workflow loading is enabled (runs for both init and up)
    if [[ "${OPENFN_LOAD_WORKFLOW_ON_STARTUP}" == "true" ]]; then
        log info "OPENFN_LOAD_WORKFLOW_ON_STARTUP is true. Deploying OpenFN workflow configuration..."
        
        # Deploy config importer first - will skip if configs already exist
        docker::deploy_config_importer $STACK "$COMPOSE_FILE_PATH/importer/workflows/docker-compose.config.yml" "openfn_workflow_config" "openfn_workflow"

        # Now deploy the service for workflow execution
        log info "Deploying workflow service..."
        docker::deploy_service $STACK "$COMPOSE_FILE_PATH/importer/workflows" "docker-compose.config.yml"

        # Get container ID for the running service
        WORKFLOW_CONFIG_SERVICE_COMPOSE_NAME="openfn_workflow_config"
        WORKFLOW_CONFIG_SERVICE_SWARM_NAME="${STACK}_${WORKFLOW_CONFIG_SERVICE_COMPOSE_NAME}"
        WORKFLOW_CONFIG_CONTAINER_ID=$(docker ps --filter "label=com.docker.swarm.service.name=${WORKFLOW_CONFIG_SERVICE_SWARM_NAME}" --filter "status=running" -q | head -n 1)

        if [ -z "$WORKFLOW_CONFIG_CONTAINER_ID" ]; then
            # Fallback for non-swarm environments
            WORKFLOW_CONFIG_CONTAINER_ID=$(docker ps --filter "name=${STACK}_${WORKFLOW_CONFIG_SERVICE_COMPOSE_NAME}" --filter "status=running" -q | head -n 1)
            if [ -z "$WORKFLOW_CONFIG_CONTAINER_ID" ]; then
                WORKFLOW_CONFIG_CONTAINER_ID=$(docker ps --filter "name=${WORKFLOW_CONFIG_SERVICE_COMPOSE_NAME}" --filter "status=running" -q | head -n 1)
            fi
        fi

        if [ -z "$WORKFLOW_CONFIG_CONTAINER_ID" ]; then
            log error "Could not find a running OpenFN workflow config container."
        else
            log info "Found OpenFN workflow config container: $WORKFLOW_CONFIG_CONTAINER_ID"
            
            # Check if manual CLI is enabled
            if [[ "${OPENFN_WORKFLOW_MANUAL_CLI}" == "true" ]]; then
                log warn "OPENFN_WORKFLOW_MANUAL_CLI is true: Manual OpenFN CLI execution required."
                log warn "The '${WORKFLOW_CONFIG_SERVICE_COMPOSE_NAME}' container ($WORKFLOW_CONFIG_CONTAINER_ID) is running with OpenFN CLI installed"
                log warn "Please exec into container $WORKFLOW_CONFIG_CONTAINER_ID (e.g., docker exec -it $WORKFLOW_CONFIG_CONTAINER_ID sh) and run:"
                log warn "1. cd /app/project"
                log warn "2. openfn deploy -p . --no-confirm --log info"
                log warn "(Environment variables are available inside the container.)"
            else
                log info "OPENFN_WORKFLOW_MANUAL_CLI is false. Executing OpenFN deploy command in container $WORKFLOW_CONFIG_CONTAINER_ID..."
                
                DEPLOY_CMD="set -e; echo 'Executing OpenFN deploy...'; source /etc/profile 2>/dev/null || true; export PATH=\"/usr/local/bin:\$PATH\"; cd /app/project && ls -la && pwd && echo 'Checking OpenFN CLI availability:' && (which openfn || echo 'openfn not in PATH') && echo 'Attempting deploy with multiple fallback methods:' && (openfn deploy . --no-confirm --log info 2>&1 || /usr/local/bin/openfn deploy . --no-confirm --log info 2>&1 || /usr/local/bin/node /usr/local/lib/node_modules/@openfn/cli/bin/run.js deploy . --no-confirm --log info 2>&1 || npx @openfn/cli deploy . --no-confirm --log info 2>&1)"
                log info "Attempting OpenFN deploy in /app/project..."
                if docker exec "$WORKFLOW_CONFIG_CONTAINER_ID" sh -c "$DEPLOY_CMD"; then
                    log info "OpenFN deploy successful."
                else
                    log error "OpenFN deploy command failed in container $WORKFLOW_CONFIG_CONTAINER_ID."
                fi
            fi
        fi
    else
        log info "OPENFN_LOAD_WORKFLOW_ON_STARTUP is not true. Skipping workflow configuration."
    fi

  ) || {
    log error "Failed to deploy package"
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
