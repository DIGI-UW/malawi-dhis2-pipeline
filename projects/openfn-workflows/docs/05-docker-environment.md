# Docker Environment Guide

## Overview

This guide covers the Docker-based infrastructure for the Malawi DHIS2 pipeline, including custom images, service configuration, and troubleshooting.

## Architecture

```mermaid
graph TB
    subgraph "Docker Swarm"
        SFTP[SFTP Server<br/>Port 2225]
        DHIS2[DHIS2 Instance<br/>Port 8080]
        OpenFN[OpenFN Lightning<br/>Port 4000]
        Postgres[(PostgreSQL)]
    end
    
    subgraph "Custom Images"
        CLI[openfn-cli-test:latest]
        Custom[openfn-custom:latest]
    end
    
    CLI --> SFTP
    OpenFN --> SFTP
    OpenFN --> DHIS2
    OpenFN --> Postgres
```

## Custom Docker Images

### Problem: Broken pnpm Symlinks

The official OpenFN images use pnpm with symlinks that break when copying between Docker build stages. This causes the "Invalid username" error which is actually a module loading failure.

**Important**: The SFTP adaptor code itself (`@openfn/language-sftp@2.0.14`) is perfectly fine. The issue is purely with how it's bundled in Docker images.

### Solution: Custom Images with npm

We created custom Docker images that properly install the official adaptors using npm instead of copying broken pnpm symlinks. **No modifications were made to any adaptor code.**

#### openfn-cli-test:latest

Purpose: CLI testing with working SFTP adaptor

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install OpenFN CLI and official adaptors with npm (not pnpm)
# This ensures proper module resolution in the container
RUN npm install -g @openfn/cli@latest && \
    npm install -g @openfn/language-sftp@2.0.14 && \  # Official, unmodified package
    npm install -g @openfn/language-common@latest && \
    npm install -g @openfn/language-http@latest

# Add test fixtures
COPY fixtures /fixtures

ENTRYPOINT ["openfn"]
```

#### openfn-custom:latest

Purpose: OpenFN Lightning with properly installed adaptors

```dockerfile
FROM openfn/lightning:latest

# Fix adaptor installation by using npm instead of broken symlinks
# No changes to adaptor code - just proper installation
RUN cd /app && \
    npm install @openfn/language-sftp@2.0.14 && \  # Official package
    npm install @openfn/language-common@latest && \
    npm install @openfn/language-dhis2@latest
```

### Building Custom Images

```bash
cd /home/ubuntu/code/malawi-dhis2-pipeline

# Build all custom images
./build-custom-images.sh openfn-cli-test openfn

# Build specific image
./build-image.sh openfn-cli-test

# Verify images
docker images | grep openfn
```

## Service Configuration

### SFTP Storage

**Package**: `sftp-storage`
**Port**: 2225
**Credentials**: openfn / instant101

```yaml
# packages/sftp-storage/swarm.sh
services:
  sftp-server:
    image: ghcr.io/openfie/instant-openhie-sftp-server:latest
    environment:
      SFTP_USER: openfn
      SFTP_PASSWORD: instant101
      SFTP_PORT: 2225
    volumes:
      - sftp-data:/data
    ports:
      - "2225:2225"
```

**Pre-loaded Excel Files**:
- `ART_data_long_format.xlsx` (30.2MB)
- `Direct Queries - Q1 2025 MoH Reports.xlsx` (4.2MB)
- `Q2FY25_DQ_253_sites.xlsx` (3.2MB)

### DHIS2 Instance

**Package**: `dhis2-instance`
**Port**: 8080
**Credentials**: admin / district

```yaml
services:
  dhis2:
    image: dhis2/core:2.39.1
    environment:
      DHIS2_DATABASE_HOST: postgres
      DHIS2_DATABASE_NAME: dhis2
    ports:
      - "8080:8080"
```

### OpenFN Lightning

**Package**: `openfn`
**Port**: 4000
**Custom Image**: `openfn-custom:latest`

```yaml
services:
  openfn:
    image: openfn-custom:latest
    environment:
      DATABASE_URL: postgres://openfn:password@postgres/openfn
      SECRET_KEY_BASE: your-secret-key
    ports:
      - "4000:4000"
```

## Network Configuration

### Docker Bridge IP

**Linux**: `172.17.0.1`
**Mac/Windows**: `host.docker.internal`

```bash
# Get Docker bridge IP on Linux
ip addr show docker0 | grep inet | awk '{print $2}' | cut -d/ -f1
```

### Service Discovery

Within Docker Swarm, services can communicate using service names:

```javascript
// From OpenFN to SFTP (internal)
{
  "host": "sftp-storage_sftp-server",
  "port": 2225
}

// From host to SFTP (external)
{
  "host": "172.17.0.1",  // or localhost
  "port": 2225
}
```

## Deployment Commands

### Using instant CLI v2

```bash
# Initialize packages
./instant package init -n sftp-storage -d
./instant package init -n dhis2-instance -d
./instant package init -n openfn -d

# Check status
docker service ls

# View logs
docker service logs sftp-storage_sftp-server
docker service logs dhis2-instance_dhis2
docker service logs openfn_openfn

# Scale services
docker service scale sftp-storage_sftp-server=2
```

### Direct Docker Commands

```bash
# Run CLI test
docker run --rm -it \
  -v "$(pwd):/workspace" \
  openfn-cli-test:latest \
  /workspace/test.js -a sftp@latest -s input.json

# Access SFTP container
docker exec -it $(docker ps -q -f name=sftp-server) /bin/sh

# Check SFTP files
docker exec $(docker ps -q -f name=sftp-server) ls -la /data/excel-files/
```

## Volume Management

### Persistent Volumes

```bash
# List volumes
docker volume ls | grep -E "(sftp|dhis2|openfn)"

# Inspect volume
docker volume inspect sftp-storage_sftp-data

# Backup SFTP data
docker run --rm \
  -v sftp-storage_sftp-data:/source \
  -v $(pwd):/backup \
  alpine tar czf /backup/sftp-backup.tar.gz -C /source .
```

### Volume Locations

- **SFTP Data**: `sftp-storage_sftp-data`
- **DHIS2 Database**: `dhis2-instance_db-data`
- **OpenFN Database**: `openfn_postgres-data`

## Troubleshooting

### Container Issues

```bash
# Check container status
docker ps -a | grep -E "(sftp|dhis2|openfn)"

# View recent logs
docker service logs --tail 50 sftp-storage_sftp-server

# Restart service
docker service update --force sftp-storage_sftp-server

# Remove and recreate
docker service rm sftp-storage_sftp-server
./instant package init -n sftp-storage -d
```

### Network Issues

```bash
# Test SFTP connectivity
nc -zv 172.17.0.1 2225

# Check Docker network
docker network ls
docker network inspect bridge

# Test from within container
docker run --rm alpine nc -zv 172.17.0.1 2225
```

### Permission Issues

```bash
# Fix SFTP permissions
docker exec $(docker ps -q -f name=sftp-server) \
  chown -R openfn:openfn /data/excel-files

# Check file permissions
docker exec $(docker ps -q -f name=sftp-server) \
  ls -la /data/excel-files/
```

## Health Checks

### Service Health

```bash
# SFTP health check
sftp -P 2225 openfn@localhost <<< "ls /data/excel-files"

# DHIS2 health check
curl -u admin:district http://localhost:8080/api/system/info

# OpenFN health check
curl http://localhost:4000/health_check
```

### Monitoring Script

```bash
#!/bin/bash
# monitor-services.sh

echo "Checking service health..."

# Check SFTP
if nc -zv 172.17.0.1 2225 2>/dev/null; then
  echo "✅ SFTP: Running"
else
  echo "❌ SFTP: Down"
fi

# Check DHIS2
if curl -sf -u admin:district http://localhost:8080/api/system/info >/dev/null; then
  echo "✅ DHIS2: Running"
else
  echo "❌ DHIS2: Down"
fi

# Check OpenFN
if curl -sf http://localhost:4000/health_check >/dev/null; then
  echo "✅ OpenFN: Running"
else
  echo "❌ OpenFN: Down"
fi
```

## Best Practices

1. **Always use custom images** for production deployments to ensure adaptors are properly installed
2. **Monitor logs** during workflow execution
3. **Backup volumes** before major changes
4. **Use health checks** to ensure service availability
5. **Document environment variables** for each service

## Resources

- [Docker Swarm Documentation](https://docs.docker.com/engine/swarm/)
- [instant OpenHIE Documentation](https://openhie.github.io/instant/)
- [OpenFN Docker Images](https://hub.docker.com/u/openfn)