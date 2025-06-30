# Environment Setup Guide

This guide provides detailed instructions for setting up the Malawi DHIS2 HIV/TB Indicators Pipeline development and testing environment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Docker Installation](#docker-installation)
3. [Repository Setup](#repository-setup)
4. [instant CLI v2 Installation](#instant-cli-v2-installation)
5. [Environment Configuration](#environment-configuration)
6. [Building Custom Images](#building-custom-images)
7. [Service Initialization](#service-initialization)
8. [Verification and Testing](#verification-and-testing)
9. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

- **Operating System**: Ubuntu 20.04+ or similar Linux distribution
- **Hardware**: 
  - Minimum 4GB RAM (8GB recommended)
  - 20GB free disk space
  - 2+ CPU cores
- **Network**: Stable internet connection for downloading Docker images

### Software Requirements

- **Docker**: Version 20.10+ with Docker Compose and Swarm mode
- **Git**: Version 2.25+
- **Node.js**: Version 18+ (for OpenFN CLI and npm packages)
- **Text Editor**: nano, vim, or your preferred editor

## Docker Installation

### Ubuntu/Debian

```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
sudo mkdir -m 0755 -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group (logout/login required)
sudo usermod -aG docker $USER

# Verify installation
docker --version
docker compose version
```

### Initialize Docker Swarm

```bash
# Initialize swarm mode (required for instant)
docker swarm init

# If you have multiple network interfaces, specify the advertise address
# docker swarm init --advertise-addr <your-ip-address>
```

## Repository Setup

### Clone the Repository

```bash
# Clone the repository
git clone https://github.com/your-org/malawi-dhis2-pipeline.git
cd malawi-dhis2-pipeline

# Set up working directory environment variable
export MALAWI_PROJECT_ROOT=$(pwd)
echo "export MALAWI_PROJECT_ROOT=$(pwd)" >> ~/.bashrc
```

### Directory Structure Overview

```
malawi-dhis2-pipeline/
├── packages/              # instant packages (services)
│   ├── openfn/           # OpenFN Lightning
│   ├── dhis2-instance/   # DHIS2 server
│   ├── sftp-storage/     # SFTP server with Excel files
│   └── database-postgres/# PostgreSQL database
├── projects/             # Project-specific code
│   ├── openfn-workflows/ # Workflow definitions
│   └── indicator_workflow_testing/ # Test framework
├── docs/                 # Documentation
├── scripts/              # Utility scripts
├── .env.example          # Environment template
├── mk.sh                 # Project initialization script
└── instant               # instant CLI executable
```

## instant CLI v2 Installation

### Method 1: Using the Installation Script

```bash
# Run the provided installation script
./get-cli.sh

# Verify installation
./instant --version
# Expected output: instant version 2.x.x
```

### Method 2: Manual Download

```bash
# Download instant CLI v2 for Linux
curl -L https://github.com/openhie/instant-v2/releases/latest/download/instant-linux -o instant
chmod +x instant

# Option 1: Use locally
# ./instant <command>

# Option 2: Install system-wide
sudo mv instant /usr/local/bin/
instant --version
```

### Method 3: Install via npm

```bash
# Install globally via npm
npm install -g @openhie/instant-v2-cli

# Verify installation
instant --version
```

## Environment Configuration

### Create Environment File

```bash
# Copy the template
cp .env.example .env

# Edit with your preferred editor
nano .env
```

### Essential Configuration Variables

```bash
# SFTP Configuration
SFTP_HOST=localhost
SFTP_PORT=2225
SFTP_USER=openfn
SFTP_PASSWORD=instant101

# DHIS2 Configuration
DHIS2_URL=http://localhost:8080
DHIS2_USER=admin
DHIS2_PASS=district
DHIS2_VERSION=2.39

# OpenFN Configuration
OPENFN_URL=http://localhost:4000
OPENFN_API_KEY=your_api_key_here
OPENFN_ADMIN_USER=admin@openfn.org
OPENFN_ADMIN_PASSWORD=changeme

# Workflow Configuration
OPENFN_LOAD_WORKFLOWS_ON_STARTUP=true
OPENFN_WORKFLOW_MANUAL_CLI=false
OPENFN_SYNC_MODE=manual
OPENFN_CONFLICT_RESOLUTION=prompt

# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=dhis2

# Optional: Resource Limits
DHIS2_MEMORY_LIMIT=2G
OPENFN_MEMORY_LIMIT=1G
```

### Security Considerations

1. **Never commit `.env` to version control**
2. **Use strong passwords in production**
3. **Rotate API keys regularly**
4. **Use Docker secrets for sensitive data in production**

## Building Custom Images

The project requires custom Docker images with properly configured adaptors:

### Build All Custom Images

```bash
# Build all custom images at once
./build-custom-images.sh all
```

### Build Individual Images

```bash
# Build OpenFN CLI testing image (with working SFTP adaptor)
./build-custom-images.sh openfn-cli-test

# Build OpenFN workflows image (with bundled configurations)
./build-custom-images.sh openfn-workflows

# Build custom SFTP server (with pre-loaded Excel files)
./build-custom-images.sh sftp

# Build custom OpenFN Lightning (with adaptors)
./build-custom-images.sh openfn
```

### Verify Built Images

```bash
# List custom images
docker images | grep -E "(openfn-cli-test|openfn-workflows|sftp-custom|openfn-custom)"

# Inspect image details
docker inspect openfn-cli-test:latest
```

## Service Initialization

### Method 1: Automated Setup (Recommended)

```bash
# Run the complete initialization script
./mk.sh

# This script:
# 1. Validates environment configuration
# 2. Builds necessary Docker images
# 3. Initializes the instant project
# 4. Deploys all services
# 5. Waits for services to be ready
# 6. Loads OpenFN workflows
```

### Method 2: Manual Step-by-Step

```bash
# 1. Initialize instant project
./instant project init --env-file .env

# 2. Deploy core infrastructure
./instant package init -n database-postgres -d
./instant package init -n reverse-proxy-nginx -d

# 3. Deploy application services
./instant package init -n dhis2-instance -d
./instant package init -n sftp-storage -d
./instant package init -n openfn -d

# 4. Deploy workflow loader
cd packages/openfn/importer/workflows
docker stack deploy -c docker-compose.yml openfn-workflows
cd $MALAWI_PROJECT_ROOT

# 5. Wait for services to be ready (2-5 minutes)
./instant project status --watch
```

## Verification and Testing

### Check Service Status

```bash
# List all services
docker service ls

# Expected output (all should show 1/1):
# ID     NAME                         MODE         REPLICAS
# xxx    database-postgres_postgres   replicated   1/1
# xxx    reverse-proxy-nginx_nginx    replicated   1/1
# xxx    dhis2-instance_dhis2         replicated   1/1
# xxx    sftp-storage_sftp-server     replicated   1/1
# xxx    openfn_openfn               replicated   1/1
# xxx    openfn-workflows_loader      replicated   1/1
```

### Access Service UIs

1. **OpenFN Lightning** - http://localhost:4000
   - Username: `admin@openfn.org`
   - Password: `changeme`
   - Verify workflows are loaded

2. **DHIS2** - http://localhost:8080
   - Username: `admin`
   - Password: `district`
   - Note: Initial startup can take 2-5 minutes

3. **SFTP** - sftp://localhost:2225
   - Username: `openfn`
   - Password: `instant101`
   - Pre-loaded files in `/data/excel-files/`

### Run Test Suite

```bash
cd projects/indicator_workflow_testing

# Run all tests
./run-tests.sh

# Run specific test categories
./run-tests.sh --api          # API connectivity
./run-tests.sh --excel       # Excel parsing
./run-tests.sh --sftp        # SFTP integration
./run-tests.sh --cli-workflow # CLI workflows
./run-tests.sh --integration # End-to-end tests
```

### Verify SFTP Files

```bash
# Check bundled Excel files
docker exec $(docker ps -q -f name=sftp-server) ls -la /data/excel-files/

# Expected files:
# - ART_data_long_format.xlsx (30.2MB)
# - Direct Queries - Q1 2025 MoH Reports.xlsx (4.2MB)
# - Q2FY25_DQ_253_sites.xlsx (3.2MB)
```

## Troubleshooting

### Docker Issues

#### Permission Denied
```bash
# Add user to docker group
sudo usermod -aG docker $USER
# Logout and login again
```

#### Disk Space
```bash
# Check disk usage
docker system df

# Clean up unused resources
docker system prune -a --volumes
```

### Service Issues

#### OpenFN Workflows Not Loading
```bash
# Check workflow loader logs
docker service logs openfn-workflows_workflow-loader

# Force reload
docker service update --force openfn-workflows_workflow-loader

# Manual workflow deployment
cd projects/openfn-workflows
./scripts/deploy-workflow.sh sftp-dhis2
```

#### DHIS2 Slow or Not Responding
```bash
# Check logs
docker service logs -f dhis2-instance_dhis2

# Check resource usage
docker stats $(docker ps -q -f name=dhis2)

# Increase memory if needed
docker service update --limit-memory 4G dhis2-instance_dhis2
```

#### SFTP Connection Refused
```bash
# Check if service is running
docker service ps sftp-storage_sftp-server

# Check port binding
netstat -tlnp | grep 2225

# Test connection
nc -zv localhost 2225
```

### Port Conflicts

If ports are already in use:

```bash
# Find process using port
sudo lsof -i :4000  # OpenFN
sudo lsof -i :8080  # DHIS2
sudo lsof -i :2225  # SFTP

# Change ports in .env file
OPENFN_PORT=4001
DHIS2_PORT=8081
SFTP_PORT=2226

# Redeploy services
./instant package down
./instant package up
```

### Logs and Debugging

```bash
# View service logs
docker service logs <service_name> --follow --tail 100

# Access service container
docker exec -it $(docker ps -q -f name=<service>) /bin/bash

# Check instant project status
./instant project status --verbose

# Enable debug logging
export INSTANT_DEBUG=true
export OPENFN_LOG_LEVEL=debug
```

## Next Steps

After successful setup:

1. **Explore OpenFN Workflows**: Navigate to http://localhost:4000 and review the loaded workflows
2. **Test Data Processing**: Upload a test Excel file to SFTP and monitor workflow execution
3. **Review Documentation**: Check the [project documentation](../README.md#documentation-index) for detailed guides
4. **Customize Configurations**: Modify file type mappings in `projects/openfn-workflows/configs/`

## Production Deployment

For production deployment considerations:

1. **Use Docker Secrets** for sensitive configuration
2. **Enable SSL/TLS** for all services
3. **Configure proper backup strategies**
4. **Set up monitoring and alerting**
5. **Implement log aggregation**
6. **Use external databases** (not containerized)
7. **Configure resource limits** appropriately

See the upcoming Production Deployment Guide for detailed instructions.

## Support and Resources

- **instant v2 Documentation**: https://github.com/openhie/instant-v2
- **Docker Documentation**: https://docs.docker.com/
- **OpenFN Documentation**: https://docs.openfn.org/
- **DHIS2 Documentation**: https://docs.dhis2.org/
- **Project Issues**: GitHub Issues page 