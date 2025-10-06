#!/bin/bash

# PostgreSQL Extensions Initialization Script
# This script runs during container initialization via docker-entrypoint-initdb.d

set -e

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

log "PostgreSQL container initialization starting..."


psql -v ON_ERROR_STOP=1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" <<-EOSQL
    -- Create basic extensions that might be needed
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- Log completion
    SELECT 'PostgreSQL basic extensions created successfully' as status;
EOSQL

log "PostgreSQL container initialization completed"
log "Note: PostGIS extensions will be created by DHIS2 initialization script"
