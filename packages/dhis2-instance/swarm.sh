#!/bin/bash

declare ACTION=""
declare MODE=""
declare COMPOSE_FILE_PATH=""
declare UTILS_PATH=""
declare STACK="dhis2"

function init_vars() {
  ACTION=$1
  MODE=$2

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
  source "${UTILS_PATH}/config-utils.sh"
  source "${UTILS_PATH}/log.sh"
}

function initialize_package() {
  local dhis2_dev_compose_filename=""

  if [ "${MODE}" == "dev" ]; then
    log info "Running DHIS2 package in DEV mode"
    dhis2_dev_compose_filename="docker-compose.dev.yml"
  else
    log info "Running DHIS2 package in PROD mode"
  fi

  (
    log info "Configuring postgres database for DHIS2"
    docker::await_service_status "postgres" "postgres-1" "Running" 
    
    if [[ "${ACTION}" == "init" ]]; then
         docker::deploy_config_importer $STACK "$COMPOSE_FILE_PATH/importer/docker-compose.config.yml" "dhis2-db-init" "dhis2-db-init"
    fi
    
    docker::deploy_service "$STACK" "${COMPOSE_FILE_PATH}" "docker-compose.yml" "" "$dhis2_dev_compose_filename"
  ) ||
    {
      log error "Failed to deploy DHIS2 package"
      exit 1
    }
}

function destroy_package() {
  docker::stack_destroy "$STACK"

  docker::prune_configs "name=dhis2"
}

main() {
  init_vars "$@"
  import_sources

  if [[ "${ACTION}" == "init" ]] || [[ "${ACTION}" == "up" ]]; then
    log info "Running package"
    initialize_package
  elif [[ "${ACTION}" == "down" ]]; then
    log info "Scaling down package"
    docker::scale_services "$STACK" 0
  elif [[ "${ACTION}" == "destroy" ]]; then
    log info "Destroying package"
    destroy_package
  else
    log error "Valid options are: init, up, down, or destroy"
  fi
}

main "$@"
