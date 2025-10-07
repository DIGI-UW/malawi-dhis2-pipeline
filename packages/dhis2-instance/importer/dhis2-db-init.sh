#!/bin/bash
set -e

# DHIS2 Database Initialization Script
# This script creates the necessary database and user for DHIS2

echo "=== DHIS2 Database Initialization ==="
echo "Host: ${POSTGRES_HOST}"
echo "Port: ${POSTGRES_PORT}"
echo "Admin User: ${POSTGRES_USER}"
echo "DHIS2 Database: ${DHIS2_DATABASE_NAME}"
echo "DHIS2 User: ${DHIS2_DATABASE_USERNAME}"

# Retry function for operations that might fail due to connection issues
retry_command() {
    local max_attempts=5
    local delay=2
    local attempt=1
    local exit_code=0
    
    while [ $attempt -le $max_attempts ]; do
        set +e
        "$@"
        exit_code=$?
        set -e
        
        if [ $exit_code -eq 0 ]; then
            return 0
        fi
        
        if [ $attempt -lt $max_attempts ]; then
            echo "Command failed (attempt $attempt/$max_attempts). Retrying in ${delay}s..." >&2
            sleep $delay
            delay=$((delay * 2))
        fi
        
        attempt=$((attempt + 1))
    done
    
    echo "Command failed after $max_attempts attempts" >&2
    return $exit_code
}

# Function to execute SQL commands with retry
execute_sql() {
    local sql_command="$1"
    local description="$2"
    
    echo "Executing: $description"
    
    if retry_command bash -c "PGPASSWORD='${POSTGRES_PASSWORD}' psql -h '${POSTGRES_HOST}' -p '${POSTGRES_PORT}' -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' -c \"$sql_command\""; then
        echo "✓ $description completed successfully"
    else
        echo "✗ $description failed after retries"
        exit 1
    fi
}

# Function to check if database exists (with retry)
check_database_exists() {
    retry_command bash -c "PGPASSWORD='${POSTGRES_PASSWORD}' psql -h '${POSTGRES_HOST}' -p '${POSTGRES_PORT}' -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' -tAc \"SELECT 1 FROM pg_database WHERE datname='${DHIS2_DATABASE_NAME}'\"" 2>/dev/null | grep -q 1
}

# Check if DHIS2 database already exists
echo "Checking if DHIS2 database exists..."
if check_database_exists; then
    echo "✓ DHIS2 database '${DHIS2_DATABASE_NAME}' already exists"
else
    echo "Creating DHIS2 database: ${DHIS2_DATABASE_NAME}"
    execute_sql "CREATE DATABASE \"${DHIS2_DATABASE_NAME}\";" "Create DHIS2 database"
    
    # Verify creation
    if check_database_exists; then
        echo "✓ DHIS2 database '${DHIS2_DATABASE_NAME}' created and verified"
    else
        echo "✗ Failed to verify DHIS2 database creation"
        exit 1
    fi
fi

# Function to check if user exists (with retry)
check_user_exists() {
    retry_command bash -c "PGPASSWORD='${POSTGRES_PASSWORD}' psql -h '${POSTGRES_HOST}' -p '${POSTGRES_PORT}' -U '${POSTGRES_USER}' -d '${POSTGRES_DB}' -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DHIS2_DATABASE_USERNAME}'\"" 2>/dev/null | grep -q 1
}

# Check if DHIS2 user already exists
echo "Checking if DHIS2 user exists..."
if check_user_exists; then
    echo "✓ DHIS2 user '${DHIS2_DATABASE_USERNAME}' already exists"
    # Update password in case it changed
    execute_sql "ALTER USER \"${DHIS2_DATABASE_USERNAME}\" WITH ENCRYPTED PASSWORD '${DHIS2_DATABASE_PASSWORD}';" "Update DHIS2 user password"
else
    echo "Creating DHIS2 user: ${DHIS2_DATABASE_USERNAME}"
    execute_sql "CREATE USER \"${DHIS2_DATABASE_USERNAME}\" WITH ENCRYPTED PASSWORD '${DHIS2_DATABASE_PASSWORD}';" "Create DHIS2 user"
fi

# Grant privileges to DHIS2 user
echo "Granting privileges to DHIS2 user..."
execute_sql "GRANT ALL PRIVILEGES ON DATABASE \"${DHIS2_DATABASE_NAME}\" TO \"${DHIS2_DATABASE_USERNAME}\";" "Grant database privileges"

# Connect to DHIS2 database and grant schema privileges
echo "Granting schema privileges..."
grant_schema_privileges() {
    PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${DHIS2_DATABASE_NAME}" <<EOF
GRANT ALL PRIVILEGES ON SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO "${DHIS2_DATABASE_USERNAME}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO "${DHIS2_DATABASE_USERNAME}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO "${DHIS2_DATABASE_USERNAME}";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "postgis";
EOF
}

if retry_command grant_schema_privileges; then
    echo "✓ Schema privileges granted successfully"
    echo "✓ DHIS2 database extensions created successfully"
else
    echo "✗ Failed to grant schema privileges or create extensions after retries"
    exit 1
fi

# Test DHIS2 user connection
echo "Testing DHIS2 user connection..."
test_connection() {
    PGPASSWORD="${DHIS2_DATABASE_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${DHIS2_DATABASE_USERNAME}" -d "${DHIS2_DATABASE_NAME}" -c "SELECT version();" > /dev/null
}

if retry_command test_connection; then
    echo "✓ DHIS2 user can connect to database successfully"
else
    echo "✗ DHIS2 user connection test failed after retries"
    exit 1
fi

echo "=== DHIS2 Database Initialization Complete ==="
echo "Database: ${DHIS2_DATABASE_NAME}"
echo "User: ${DHIS2_DATABASE_USERNAME}"
echo "Extensions: uuid-ossp, pg_trgm, btree_gin, postgis"
echo "All privileges granted and connection verified"