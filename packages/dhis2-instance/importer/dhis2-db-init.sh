#!/bin/bash
set -e

# DHIS2 Database Initialization Script

echo "=== DHIS2 Database Initialization ==="
echo "Host: ${POSTGRES_HOST}"
echo "Port: ${POSTGRES_PORT}"
echo "Admin User: ${POSTGRES_USER}"
echo "DHIS2 Database: ${DHIS2_DATABASE_NAME}"
echo "DHIS2 User: ${DHIS2_DATABASE_USERNAME}"

execute_sql() {
    local sql_command="$1"
    local description="$2"
    echo "Executing: $description"
    PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "$sql_command"
}

echo "Checking if DHIS2 database exists..."
DB_EXISTS=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "SELECT 1 FROM pg_database WHERE datname='${DHIS2_DATABASE_NAME}'" || echo "")
if [ -z "$DB_EXISTS" ]; then
    execute_sql "CREATE DATABASE \"${DHIS2_DATABASE_NAME}\";" "Create DHIS2 database"
else
    echo "✓ DHIS2 database '${DHIS2_DATABASE_NAME}' already exists"
fi

echo "Checking if DHIS2 user exists..."
USER_EXISTS=$(PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DHIS2_DATABASE_USERNAME}'" || echo "")
if [ -z "$USER_EXISTS" ]; then
    execute_sql "CREATE USER \"${DHIS2_DATABASE_USERNAME}\" WITH ENCRYPTED PASSWORD '${DHIS2_DATABASE_PASSWORD}';" "Create DHIS2 user"
else
    echo "✓ DHIS2 user '${DHIS2_DATABASE_USERNAME}' already exists"
    execute_sql "ALTER USER \"${DHIS2_DATABASE_USERNAME}\" WITH ENCRYPTED PASSWORD '${DHIS2_DATABASE_PASSWORD}';" "Update DHIS2 user password"
fi

echo "Granting DB privileges to DHIS2 user..."
execute_sql "GRANT ALL PRIVILEGES ON DATABASE \"${DHIS2_DATABASE_NAME}\" TO \"${DHIS2_DATABASE_USERNAME}\";" "Grant database privileges"

echo "Granting schema privileges and creating extensions..."
PGPASSWORD="${POSTGRES_PASSWORD}" psql -v ON_ERROR_STOP=1 -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "postgres" -d "${DHIS2_DATABASE_NAME}" <<EOF
-- Schema grants
GRANT ALL PRIVILEGES ON SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO "${DHIS2_DATABASE_USERNAME}";

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO "${DHIS2_DATABASE_USERNAME}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO "${DHIS2_DATABASE_USERNAME}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO "${DHIS2_DATABASE_USERNAME}";

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS postgis;
EOF

echo "Testing DHIS2 user connection..."
PGPASSWORD="${DHIS2_DATABASE_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${DHIS2_DATABASE_USERNAME}" -d "${DHIS2_DATABASE_NAME}" -c "SELECT version();" >/dev/null

echo "=== DHIS2 Database Initialization Complete ==="
echo "Database: ${DHIS2_DATABASE_NAME}"
echo "User: ${DHIS2_DATABASE_USERNAME}"
echo "Extensions ensured: uuid-ossp, pg_trgm, btree_gin, postgis"



