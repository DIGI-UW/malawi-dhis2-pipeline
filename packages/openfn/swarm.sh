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
        # Setup initial user
        OPENFN_CONTAINER_ID=$(docker ps --filter "label=com.docker.swarm.service.name=openfn_openfn" --filter "status=running" -q | head -n 1)
        if [ -n "$OPENFN_CONTAINER_ID" ]; then
           log info "Performing initial OpenFn user setup..."
           SETUP_USER_CMD="/app/bin/lightning eval 'Lightning.Setup.setup_user(%{first_name: \"Test\", last_name: \"User\",email: \"root@openhim.org\", password: \"instant101\", role: :superuser}, \"${OPENFN_API_KEY}\")'"
           docker exec "$OPENFN_CONTAINER_ID" sh -c "$SETUP_USER_CMD" || log error "User setup failed"
        fi
    fi

    # Handle workflow loading
    if [[ "${OPENFN_WORKFLOW_MANUAL_CLI}" == "true" ]]; then
        log info "Starting workflow manager in interactive mode for manual debugging"
        # Run the debug script that starts a separate container with volume mounts
        chmod +x "${COMPOSE_FILE_PATH}/debug-workflow.sh"
        "${COMPOSE_FILE_PATH}/debug-workflow.sh"
    elif [[ "${OPENFN_LOAD_WORKFLOW_ON_STARTUP}" == "true" ]]; then
        log info "Loading workflows automatically on startup"
        docker::deploy_service $STACK "$COMPOSE_FILE_PATH/importer/workflows" "docker-compose.config.yml"
    else
        log info "OpenFN started without workflow loading"
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
