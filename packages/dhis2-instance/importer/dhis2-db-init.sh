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

# Function to execute SQL commands
execute_sql() {
    local sql_command="$1"
    local description="$2"
    
    echo "Executing: $description"
    PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "$sql_command"
    
    if [ $? -eq 0 ]; then
        echo "✓ $description completed successfully"
    else
        echo "✗ $description failed"
        exit 1
    fi
}

# Check if DHIS2 database already exists
echo "Checking if DHIS2 database exists..."
DB_EXISTS=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "SELECT 1 FROM pg_database WHERE datname='${DHIS2_DATABASE_NAME}'" || echo "")

if [ -z "$DB_EXISTS" ]; then
    echo "Creating DHIS2 database: ${DHIS2_DATABASE_NAME}"
    execute_sql "CREATE DATABASE \"${DHIS2_DATABASE_NAME}\";" "Create DHIS2 database"
else
    echo "✓ DHIS2 database '${DHIS2_DATABASE_NAME}' already exists"
fi

# Check if DHIS2 user already exists
echo "Checking if DHIS2 user exists..."
USER_EXISTS=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DHIS2_DATABASE_USERNAME}'" || echo "")

if [ -z "$USER_EXISTS" ]; then
    echo "Creating DHIS2 user: ${DHIS2_DATABASE_USERNAME}"
    execute_sql "CREATE USER \"${DHIS2_DATABASE_USERNAME}\" WITH ENCRYPTED PASSWORD '${DHIS2_DATABASE_PASSWORD}';" "Create DHIS2 user"
else
    echo "✓ DHIS2 user '${DHIS2_DATABASE_USERNAME}' already exists"
    # Update password in case it changed
    execute_sql "ALTER USER \"${DHIS2_DATABASE_USERNAME}\" WITH ENCRYPTED PASSWORD '${DHIS2_DATABASE_PASSWORD}';" "Update DHIS2 user password"
fi

# Grant privileges to DHIS2 user
echo "Granting privileges to DHIS2 user..."
execute_sql "GRANT ALL PRIVILEGES ON DATABASE \"${DHIS2_DATABASE_NAME}\" TO \"${DHIS2_DATABASE_USERNAME}\";" "Grant database privileges"

# Connect to DHIS2 database and grant schema privileges
echo "Granting schema privileges..."
PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${DHIS2_DATABASE_NAME}" <<EOF
-- Grant privileges on public schema
GRANT ALL PRIVILEGES ON SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO "${DHIS2_DATABASE_USERNAME}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO "${DHIS2_DATABASE_USERNAME}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO "${DHIS2_DATABASE_USERNAME}";

-- Create necessary extensions for DHIS2
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create PostGIS extension (required for spatial operations)
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Verify connection
\c
EOF

if [ $? -eq 0 ]; then
    echo "✓ Schema privileges granted successfully"
    echo "✓ DHIS2 database extensions created successfully"
else
    echo "✗ Failed to grant schema privileges or create extensions"
    exit 1
fi

# Test DHIS2 user connection
echo "Testing DHIS2 user connection..."
PGPASSWORD="${DHIS2_DATABASE_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${DHIS2_DATABASE_USERNAME}" -d "${DHIS2_DATABASE_NAME}" -c "SELECT version();" > /dev/null

if [ $? -eq 0 ]; then
    echo "✓ DHIS2 user can connect to database successfully"
else
    echo "✗ DHIS2 user connection test failed"
    exit 1
fi

echo "=== DHIS2 Database Initialization Complete ==="
echo "Database: ${DHIS2_DATABASE_NAME}"
echo "User: ${DHIS2_DATABASE_USERNAME}"
echo "Extensions: uuid-ossp, pg_trgm, btree_gin, postgis"
echo "All privileges granted and connection verified"
