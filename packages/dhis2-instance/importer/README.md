# DHIS2 Database Initialization

This directory contains the database initialization configuration for DHIS2, following the OpenHIE Instant v2 CLI importer/config pattern.

## Files

- **docker-compose.config.yml** - Docker Compose configuration for the database initialization service
- **dhis2-db-init.sh** - PostgreSQL initialization script for DHIS2 database and user setup

## Database Initialization Process

The initialization script performs the following actions:

1. **Database Creation**
   - Creates the DHIS2 database if it doesn't exist
   - Database name: `${DHIS2_DATABASE_NAME}` (default: `dhis2`)

2. **User Management**
   - Creates the DHIS2 database user if it doesn't exist
   - Username: `${DHIS2_DATABASE_USERNAME}` (default: `dhis2`)
   - Password: `${DHIS2_DATABASE_PASSWORD}` (default: `instant101`)

3. **Privilege Assignment**
   - Grants all privileges on the DHIS2 database to the DHIS2 user
   - Grants schema-level privileges for current and future objects
   - Sets up default privileges for tables, sequences, and functions

4. **PostgreSQL Extensions**
   - Installs required extensions for DHIS2:
     - `uuid-ossp` - UUID generation functions
     - `pg_trgm` - Trigram matching for text search
     - `btree_gin` - GIN indexing support

5. **Connection Verification**
   - Tests the DHIS2 user connection to ensure proper setup

## Environment Variables

The initialization process uses the following environment variables:

### PostgreSQL Admin Connection
- `POSTGRES_HOST` - PostgreSQL server hostname
- `POSTGRES_PORT` - PostgreSQL server port
- `POSTGRES_USER` - PostgreSQL admin username
- `POSTGRES_PASSWORD` - PostgreSQL admin password
- `POSTGRES_DB` - PostgreSQL admin database

### DHIS2 Database Configuration
- `DHIS2_DATABASE_NAME` - Name of the DHIS2 database
- `DHIS2_DATABASE_USERNAME` - DHIS2 database user
- `DHIS2_DATABASE_PASSWORD` - DHIS2 database password

## Deployment

This initialization is automatically managed by the OpenHIE Instant v2 CLI during the package deployment process. The CLI will:

1. Load the configuration from `docker-compose.config.yml`
2. Create Docker configs from the shell scripts
3. Execute the database initialization service
4. Ensure the DHIS2 database is ready before starting the main DHIS2 service

## Integration

The initialization service connects to the existing PostgreSQL instance via the `postgres_public` network and prepares the database for DHIS2 to use. This ensures that:

- DHIS2 has its own dedicated database and user
- Required PostgreSQL extensions are installed
- Proper privileges are configured
- The setup is idempotent (can be run multiple times safely)

## Troubleshooting

If database initialization fails:

1. Check PostgreSQL service availability
2. Verify network connectivity (`postgres_public`)
3. Confirm environment variables are set correctly
4. Review PostgreSQL logs for connection issues
5. Ensure the PostgreSQL admin user has CREATE DATABASE privileges
