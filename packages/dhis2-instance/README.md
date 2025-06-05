# DHIS2 Instance Package

## Overview

The DHIS2 instance package provides a complete DHIS2 Health Information Management System deployment integrated with the Malawi HIV/TB indicators pipeline. This package deploys DHIS2 2.40.2 with PostgreSQL database backend and is configured to receive data from OpenFN workflows.

## Features

- **DHIS2 2.40.2**: Latest stable release with HIV/TB indicator support
- **PostgreSQL Integration**: Uses shared PostgreSQL instance from database-postgres package
- **OpenFN Integration**: Pre-configured to receive data via OpenFN language-dhis2 adaptor
- **Web API Access**: Full REST API for data import/export
- **Docker Swarm Support**: Production-ready deployment with scaling capabilities
- **Health Monitoring**: Built-in health checks and monitoring endpoints

## Architecture

```
OpenFN Workflow → DHIS2 Web API → DHIS2 Instance → PostgreSQL Database
```

## Getting Started

### Prerequisites

- Docker Swarm initialized
- PostgreSQL package deployed (`packages/database-postgres`)
- OpenFN package deployed (`packages/openfn`)


### Access DHIS2

Once deployed, DHIS2 will be available at:
- **URL**: `http://localhost:8080` (dev mode) or `http://dhis2:8080` (internal)
- **Username**: `admin`
- **Password**: `district`

## Configuration

### Environment Variables

Key environment variables (defined in `package-metadata.json`):

```bash
# DHIS2 Application
DHIS2_IMAGE=dhis2/core:2.40.2.1
DHIS2_PORT=8080
DHIS2_ADMIN_PASSWORD=district

# Database Connection
DHIS2_DATABASE_HOST=postgres-1
DHIS2_DATABASE_NAME=dhis2
DHIS2_DATABASE_USERNAME=dhis2
DHIS2_DATABASE_PASSWORD=instant101

# Performance Tuning
DHIS2_MEMORY_LIMIT=4G
DHIS2_CPU_LIMIT=2
```

### Database Configuration

The DHIS2 instance connects to the shared PostgreSQL database with:
- **Host**: `postgres-1` (from database-postgres package)
- **Database**: `dhis2`
- **Username**: `dhis2`
- **Password**: `instant101`

The database is automatically created during deployment if it doesn't exist.

## Database Initialization

The DHIS2 package includes automatic database initialization through the importer/config pattern managed by OpenHIE Instant v2 CLI:

### Initialization Process

1. **Service Dependency**: The initialization waits for the PostgreSQL service from the `database-postgres` package to be running using `docker::await_service_status`
2. **Connection Verification**: Verifies PostgreSQL is ready to accept connections using `pg_isready`
3. **Database Creation**: Creates the DHIS2 database if it doesn't exist
4. **User Management**: Creates the DHIS2 database user with proper privileges
5. **Extensions**: Installs required PostgreSQL extensions (uuid-ossp, pg_trgm, btree_gin)
6. **Permission Setup**: Grants all necessary privileges for DHIS2 operation
7. **Connection Test**: Verifies the DHIS2 user can connect to the database

### Configuration Files

- `importer/docker-compose.config.yml` - Database initialization service
- `importer/dhis2-db-init.sh` - Database setup script
- Uses Docker configs for script deployment in Swarm environment

### Environment Variables

The initialization uses these environment variables from `package-metadata.json`:
- PostgreSQL admin credentials (POSTGRES_USER, POSTGRES_PASSWORD)
- DHIS2 database configuration (DHIS2_DATABASE_NAME, DHIS2_DATABASE_USERNAME, DHIS2_DATABASE_PASSWORD)
- Database connection details (DHIS2_DATABASE_HOST, DHIS2_DATABASE_PORT)

## OpenFN Integration

### DHIS2 API Endpoints

The OpenFN workflow uses these DHIS2 endpoints:

- **Data Value Sets**: `POST /api/dataValueSets`
- **Metadata**: `GET /api/metadata`
- **System Info**: `GET /api/system/info`

### Credential Configuration

Configure DHIS2 credentials in OpenFN:

```json
{
  "hostUrl": "http://dhis2:8080",
  "username": "admin", 
  "password": "district",
  "apiVersion": "40"
}
```

### Data Flow

1. **SFTP/Google Sheets** → OpenFN extracts data
2. **OpenFN Processing** → Transforms to DHIS2 format
3. **DHIS2 Upload** → Posts dataValueSets to DHIS2 API
4. **DHIS2 Storage** → Data stored in PostgreSQL database

## HIV/TB Indicators Configuration

### Data Elements

The DHIS2 instance should be configured with data elements for:
- Number of adults and children currently receiving ART
- Number of adults and children newly enrolled on ART  
- Number of adults and children who died while on ART
- TB case detection rates
- TB treatment success rates

### Organization Units

Configure organization units matching your health facilities:
- Health centers
- District hospitals
- Regional hospitals

### Data Sets

Create data sets for:
- HIV Monthly Reports
- TB Quarterly Reports
- Combined HIV/TB Indicators

## Management Commands

### Service Management

```bash
# Start DHIS2 services
./swarm.sh up

# Stop DHIS2 services  
./swarm.sh down

# Restart DHIS2 services
./swarm.sh down && ./swarm.sh up

# Destroy DHIS2 services and data
./swarm.sh destroy
```

### Health Checks

Monitor DHIS2 health:

```bash
# Check service status
docker service ps dhis2_dhis2

# View service logs
docker service logs -f dhis2_dhis2

# Test health endpoint
curl -f http://localhost:8080/dhis-web-commons/security/login.action
```

### Database Management

```bash
# Connect to DHIS2 database
docker exec -it $(docker ps -qf "label=com.docker.swarm.service.name=postgres_postgres-1") psql -U dhis2 -d dhis2

# Backup DHIS2 database
docker exec $(docker ps -qf "label=com.docker.swarm.service.name=postgres_postgres-1") pg_dump -U dhis2 dhis2 > dhis2_backup.sql

# Restore DHIS2 database
docker exec -i $(docker ps -qf "label=com.docker.swarm.service.name=postgres_postgres-1") psql -U dhis2 dhis2 < dhis2_backup.sql
```

## Troubleshooting

### Common Issues

1. **DHIS2 not starting**:
   - Check PostgreSQL is running: `docker service ps postgres_postgres-1`
   - Verify database connectivity
   - Check memory allocation (minimum 2GB required)

2. **Database connection errors**:
   - Verify PostgreSQL service is healthy
   - Check database credentials
   - Ensure `dhis2` database exists

3. **Performance issues**:
   - Increase memory limits: `DHIS2_MEMORY_LIMIT=6G`
   - Adjust CPU allocation: `DHIS2_CPU_LIMIT=4`
   - Monitor resource usage

### Log Analysis

```bash
# View DHIS2 application logs
docker service logs dhis2_dhis2

# View Tomcat logs
docker exec $(docker ps -qf "label=com.docker.swarm.service.name=dhis2_dhis2") tail -f /opt/dhis2/logs/dhis.log

# Check database initialization logs
docker service logs dhis2_dhis2-db-init
```

## Security

### Default Credentials

**Important**: Change default credentials in production:

```bash
# Change admin password via DHIS2 UI
# Or via environment variable
DHIS2_ADMIN_PASSWORD=your_secure_password
```

### Network Security

- DHIS2 runs in isolated Docker networks
- Only exposes port 8080 in development mode
- Database access restricted to internal network

### API Security

- Enable HTTPS in production
- Configure proper CORS settings
- Use API tokens for service accounts

## Monitoring

### Health Checks

The service includes automatic health monitoring:
- **Endpoint**: `/dhis-web-commons/security/login.action`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Start Period**: 120 seconds (allows for initialization)

### Metrics

Monitor key metrics:
- Memory usage
- Database connections
- API response times
- Import/export operations

## Integration Testing

### Test DHIS2 API

```bash
# Test system info endpoint
curl -u admin:district http://localhost:8080/api/system/info

# Test data value sets endpoint
curl -u admin:district -X POST http://localhost:8080/api/dataValueSets \
  -H "Content-Type: application/json" \
  -d '{"dataValues": []}'
```

### Test OpenFN Integration

1. Deploy OpenFN workflow with DHIS2 credentials
2. Trigger workflow execution
3. Verify data appears in DHIS2 data entry forms
4. Check import logs in DHIS2 admin interface

## Volumes

- **dhis2-logs**: Application and Tomcat logs
- **dhis2-apps**: DHIS2 web applications and plugins
- **dhis2-files**: File uploads and document storage
- **dhis2-db-init**: Database initialization data

## Networks

- **dhis2_public**: External network for DHIS2 web interface
- **postgres_public**: Shared network with PostgreSQL database

## Performance Tuning

### Memory Configuration

```bash
# Minimum for development
DHIS2_MEMORY_LIMIT=2G
DHIS2_MEMORY_RESERVE=1G

# Recommended for production
DHIS2_MEMORY_LIMIT=6G
DHIS2_MEMORY_RESERVE=2G
```

### JVM Tuning

```bash
DHIS2_CATALINA_OPTS="-Xmx4000m -Xms2000m -XX:PermSize=800m -XX:MaxPermSize=1600m"
DHIS2_JAVA_OPTS="-Djava.security.egd=file:/dev/./urandom"
```

## Support

For issues with:
- **DHIS2 Configuration**: See [DHIS2 Documentation](https://docs.dhis2.org/)
- **PostgreSQL Integration**: Check `packages/database-postgres/README.md`
- **OpenFN Integration**: Check `packages/openfn/README.md`
- **Docker Deployment**: Check Docker Swarm logs and service status
