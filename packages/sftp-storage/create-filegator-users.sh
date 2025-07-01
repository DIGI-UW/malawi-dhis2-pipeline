#!/bin/bash
set -e

# FileGator User Creation Script
# Creates admin users for FileGator with SFTP credentials

SFTP_USER="${SFTP_USER:-openfn}"
SFTP_PASSWORD="${SFTP_PASSWORD:-instant101}"
VOLUME_NAME="sftp-storage_filegator-private"

log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

log_debug() {
    echo "[DEBUG] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

create_filegator_users() {
    local sftp_user="$1"
    local sftp_password="$2"
    
    log_info "Starting FileGator user creation process..."
    log_info "SFTP_USER: ${sftp_user}"
    
    # Get FileGator container ID
    local filegator_container=$(docker ps -q --filter "name=sftpui")
    if [ -z "$filegator_container" ]; then
        log_error "FileGator container not found"
        return 1
    fi
    
    # Generate bcrypt hash using PHP in the container
    log_debug "Generating bcrypt hash for SFTP password..."
    local sftp_password_hash
    sftp_password_hash=$(docker exec "$filegator_container" /usr/local/bin/php -r "echo password_hash('${sftp_password}', PASSWORD_BCRYPT);") || {
        log_error "Failed to generate password hash"
        return 1
    }
    log_debug "Password hash generated successfully"
    
    # Create a temporary users.json file locally
    local temp_users_json="/tmp/filegator_users_$$.json"
    
    log_debug "Creating users.json file..."
    cat > "$temp_users_json" << EOF
{
  "1": {
    "username": "admin",
    "name": "Admin",
    "role": "admin",
    "homedir": "/",
    "permissions": "read|write|upload|download|batchdownload|zip|chmod",
    "password": "\$2y\$10\$Nu35w4pteLfc7BDCIkDPkecjw8wsH8Y2GMfIewUbXLT7zzW6WOxwq"
  },
  "2": {
    "username": "guest",
    "name": "Guest",
    "role": "guest",
    "homedir": "/",
    "permissions": "",
    "password": ""
  },
  "3": {
    "username": "${sftp_user}",
    "name": "SFTP Admin",
    "role": "admin",
    "homedir": "/",
    "permissions": "read|write|upload|download|batchdownload|zip|chmod",
    "password": "${sftp_password_hash}"
  }
}
EOF
    
    # Copy the users.json file to the container
    log_debug "Copying users.json to container..."
    if docker cp "$temp_users_json" "$filegator_container:/var/www/filegator/private/users.json"; then
        log_debug "users.json copied successfully"
        
        # Fix ownership inside the container
        if docker exec --user root "$filegator_container" chown www-data:www-data /var/www/filegator/private/users.json; then
            log_info "File ownership set correctly"
        else
            log_error "Failed to set file ownership"
            rm -f "$temp_users_json"
            return 1
        fi
    else
        log_error "Failed to copy users.json to container"
        rm -f "$temp_users_json"
        return 1
    fi
    
    # Clean up temporary file
    rm -f "$temp_users_json"
    
    log_info "FileGator user creation process completed successfully"
}

# Main execution function
configure_filegator_users() {
    # Accept parameters: username and password
    local sftp_user="${1:-${SFTP_USER}}"
    local sftp_password="${2:-${SFTP_PASSWORD}}"
    
    if [ -z "${sftp_user}" ] || [ -z "${sftp_password}" ]; then
        log_error "SFTP username and password must be provided as parameters or environment variables"
        log_error "Usage: configure_filegator_users <username> <password>"
        return 1
    fi
    
    log_info "Creating FileGator admin user with SFTP credentials..."
    log_debug "Parameter check: SFTP_USER=${sftp_user}, password length=$(echo -n "${sftp_password}" | wc -c)"
    
    if create_filegator_users "${sftp_user}" "${sftp_password}"; then
        log_info "✅ FileGator users configured successfully"
        log_info "You can now log in with:"
        log_info "  - admin / admin123 (default admin)"
        log_info "  - ${sftp_user} / ${sftp_password} (SFTP admin)"
        return 0
    else
        log_error "❌ Failed to configure FileGator users"
        return 1
    fi
}

# Function is called explicitly from swarm.sh with parameters
# configure_filegator_users "$@" 