#!/bin/bash

declare ACTION=""
declare MODE=""
declare COMPOSE_FILE_PATH=""
declare UTILS_PATH=""
declare SERVICE_NAMES=()
declare STACK="traefik"

function init_vars() {
    ACTION=$1
    MODE=$2

    COMPOSE_FILE_PATH=$(
        cd "$(dirname "${BASH_SOURCE[0]}")" || exit
        pwd -P
    )

    UTILS_PATH="${COMPOSE_FILE_PATH}/../utils"

    SERVICE_NAMES=("reverse-proxy-traefik")

    readonly ACTION
    readonly MODE
    readonly COMPOSE_FILE_PATH
    readonly UTILS_PATH
    readonly SERVICE_NAMES
    readonly STACK
}

# shellcheck disable=SC1091
function import_sources() {
    source "${UTILS_PATH}/docker-utils.sh"
    source "${UTILS_PATH}/config-utils.sh"
    source "${UTILS_PATH}/log.sh"
}

function generate_traefik_auth() {
    # Use USERNAME and PASSWORD from .env file, with fallbacks
    local username="${USERNAME:-admin}"
    local password_plain="${TRAEFIK_PASSWORD:-changeme123}"
    
    log info "Generating Traefik dashboard authentication for user: $username"
    
    # Check if htpasswd is available
    if ! command -v htpasswd &> /dev/null; then
        log info "htpasswd not found. Installing apache2-utils..."
        sudo apt-get update && sudo apt-get install -y apache2-utils
    fi
    
    # Generate the hash
    local auth_hash
    auth_hash=$(htpasswd -nb "$username" "$password_plain")
    
    if [[ $? -eq 0 ]]; then
        log info "Generated authentication hash for Traefik dashboard"
        # Export the variables for docker compose
        export USERNAME="$username"
        export PASSWORD="$auth_hash"
        log info "Dashboard will be accessible at: https://traefik.${DOMAIN_NAME:-mwdhis2.info}"
        log info "Username: $username"
    else
        log error "Failed to generate authentication hash"
        exit 1
    fi
}

function initialize_package() {

    log info "Running package in PROD mode"
    
    # Generate authentication if not already provided
    if [[ -z "${PASSWORD}" ]]; then
        generate_traefik_auth
    else
        log info "Using existing PASSWORD environment variable"
    fi

    log info "Deploying package with compose file: ${COMPOSE_FILE_PATH}/docker-compose.yml"

    (
        docker::deploy_service $STACK "${COMPOSE_FILE_PATH}" "docker-compose.yml"
    ) || {
        log error "Failed to deploy package"
        exit 1
    }

}

function destroy_package() {
    docker::stack_destroy $STACK

    docker::prune_configs $STACK
}

main() {
    init_vars "$@"
    import_sources

    if [[ "${MODE}" == "dev" ]]; then
        log info "Not including reverse proxy as we are running DEV mode"
        exit 0
    fi

    if [[ "${ACTION}" == "init" ]] || [[ "${ACTION}" == "up" ]]; then
        log info "Running package"

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
