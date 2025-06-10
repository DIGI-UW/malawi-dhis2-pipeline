#!/bin/bash

declare ACTION=""
declare MODE=""
declare COMPOSE_FILE_PATH=""
declare UTILS_PATH=""
declare STACK="sftp-storage"

function init_vars() {
  # Temporary arrays to hold positional arguments
  local pos_args=()

  # Parse all arguments
  for arg in "$@"; do
    case "$arg" in
      *)
        pos_args+=("$arg") # Collect positional arguments
        ;;
    esac
  done

  # Assign positional arguments
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
  fi

  (
    # First deploy the SFTP service
    docker::deploy_service $STACK "$COMPOSE_FILE_PATH" "docker-compose.yml" "$package_dev_compose_filename"
    docker::deploy_sanity $STACK "$COMPOSE_FILE_PATH/$package_dev_compose_filename"
    docker::await_container_startup $STACK "sftp-server"
    
    log info "SFTP server is ready at localhost:${SFTP_PORT}"
    log info "Excel files available at: sftp://${SFTP_USER}@localhost:${SFTP_PORT}/data/excel-files/"
    log info "Use password: ${SFTP_PASSWORD}"
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
    log info "Running SFTP storage package"
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
