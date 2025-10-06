# OpenFN Workflow Management Guide

## Overview

This guide explains the improved workflow loading and management system for the Malawi DHIS2 Pipeline project. The system provides flexible workflow deployment with support for both automated and manual modes.

## Architecture

The workflow management system consists of several components:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   OpenFN        │     │   Workflow      │     │   Workflow      │
│   Instance      │◄────┤   Manager       │────►│   Container     │
│                 │     │   Container     │     │   (Manual CLI)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Workflow      │     │   Configuration │     │   Volume        │
│   Deployment    │     │   Files         │     │   Mounts        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Environment Variables

### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPENFN_LOAD_WORKFLOWS_ON_STARTUP` | Enable automatic workflow loading | `true` | No |
| `OPENFN_WORKFLOW_MANUAL_CLI` | Enable manual CLI mode | `true` | No |
| `OPENFN_ENDPOINT` | OpenFN instance URL | `http://openfn:4000` | Yes |
| `OPENFN_API_KEY` | OpenFN API key | `apiKey` | Yes |
| `OPENFN_ADMIN_USER` | Admin username | `root@openhim.org` | No |
| `OPENFN_ADMIN_PASSWORD` | Admin password | `instant101` | No |

### Workflow-Specific Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `WORKFLOW_NAME` | Specific workflow to deploy | `sftp-dhis2` | No |
| `WORKFLOW_PATH` | Path to workflows directory | `/app/workflows` | No |
| `DRY_RUN` | Enable dry run mode | `false` | No |
| `PACKAGE_LIFECYCLE` | Run as part of package lifecycle | `false` | No |

## Modes of Operation

### 1. Automatic Workflow Loading

When `OPENFN_LOAD_WORKFLOWS_ON_STARTUP=true`, workflows are automatically deployed during package initialization.

**Lifecycle:**
1. OpenFN service starts
2. User setup completes
3. Workflow loader container deploys
4. Workflows are deployed to OpenFN instance
5. Container exits after successful deployment

**Configuration:**
```bash
# Enable automatic loading
export OPENFN_LOAD_WORKFLOWS_ON_STARTUP=true

# Deploy specific workflow
export WORKFLOW_NAME=sftp-dhis2

# Use dry run mode for testing
export DRY_RUN=true
```

### 2. Manual CLI Mode

When `OPENFN_WORKFLOW_MANUAL_CLI=true`, a debug container starts with interactive shell access.

**Features:**
- Interactive bash shell
- Volume mounts for live editing
- Direct access to OpenFN CLI
- Network connectivity to OpenFN instance

**Usage:**
```bash
# Start manual CLI mode
export OPENFN_WORKFLOW_MANUAL_CLI=true
./packages/openfn/swarm.sh init

# Connect to debug container
docker exec -it openfn-workflow-debug /bin/bash

# Inside container, use entrypoint script
/app/entrypoint.sh deploy sftp-dhis2
/app/entrypoint.sh validate
/app/entrypoint.sh list
```

## Workflow Management Scripts

### Entrypoint Script (`/app/entrypoint.sh`)

The main workflow management script that handles all operations.

**Modes:**
- `list` - List available workflows
- `validate` - Validate workflow configurations
- `deploy` - Deploy workflow to OpenFN
- `pull` - Pull workflow from OpenFN

**Usage:**
```bash
# List all workflows
/app/entrypoint.sh list

# Validate specific workflow
/app/entrypoint.sh validate sftp-dhis2

# Deploy workflow
/app/entrypoint.sh deploy sftp-dhis2

# Pull workflow (for development)
/app/entrypoint.sh pull sftp-dhis2
```

### Individual Scripts

Each script provides specific functionality and can be run directly:

#### Deploy Script (`scripts/deploy-workflow.sh`)
```bash
# Deploy default workflow
./scripts/deploy-workflow.sh

# Deploy specific workflow
./scripts/deploy-workflow.sh sftp-dhis2

# Dry run deployment
DRY_RUN=true ./scripts/deploy-workflow.sh sftp-dhis2
```

#### Validate Script (`scripts/validate-workflow.sh`)
```bash
# Validate all workflows
./scripts/validate-workflow.sh

# Validate specific workflow
./scripts/validate-workflow.sh sftp-dhis2
```

#### List Script (`scripts/list-workflows.sh`)
```bash
# List all workflows
./scripts/list-workflows.sh
```

## Workflow Structure

Each workflow follows the OpenFN v2 structure:

```
workflows/
└── sftp-dhis2/
    ├── project.yaml          # Workflow definition
    ├── jobs/                 # Job files
    │   ├── check-sftp-files.js
    │   ├── download-sftp-files.js
    │   ├── process-excel-data.js
    │   ├── generate-dhis2-payload.js
    │   └── upload-to-dhis2.js
    ├── state/                # State files (optional)
    │   ├── sftp-config.json
    │   └── dhis2-config.json
    └── configs/              # Configuration files
        └── file-types/
            ├── art_data_long_format.json
            ├── dq_sites.json
            └── moh_direct_queries.json
```

## Deployment Process

### 1. Environment Validation
- Check required environment variables
- Validate workflow path and files
- Verify OpenFN connectivity

### 2. OpenFN Readiness Check
- Wait for OpenFN API to be available
- Verify authentication credentials
- Check service health

### 3. Workflow Deployment
- Validate workflow configuration
- Create deployment config
- Execute OpenFN deploy command
- Verify deployment success

### 4. Post-Deployment
- Log deployment results
- Handle errors gracefully
- Maintain container lifecycle

## Troubleshooting

### Common Issues

#### 1. OpenFN Not Ready
**Symptoms:** Timeout waiting for OpenFN API
**Solutions:**
- Check OpenFN service status: `docker service ls | grep openfn`
- Verify network connectivity
- Check OpenFN logs: `docker service logs openfn_openfn`

#### 2. Authentication Failures
**Symptoms:** API key or user credentials rejected
**Solutions:**
- Verify API key in OpenFN UI
- Check admin user setup
- Ensure credentials are properly escaped

#### 3. Workflow Validation Errors
**Symptoms:** YAML syntax or job file errors
**Solutions:**
- Run validation: `./scripts/validate-workflow.sh`
- Check YAML syntax
- Verify JavaScript job files

#### 4. Network Connectivity Issues
**Symptoms:** Cannot connect to OpenFN endpoint
**Solutions:**
- Check Docker network configuration
- Verify service discovery
- Use external endpoint for manual mode

### Debug Commands

```bash
# Check OpenFN service status
docker service ls | grep openfn

# View OpenFN logs
docker service logs openfn_openfn

# Check workflow container logs
docker service logs openfn_workflow-loader

# Test OpenFN connectivity
curl -f http://openfn:4000/users/log_in

# Connect to debug container
docker exec -it openfn-workflow-debug /bin/bash

# Validate workflow manually
/app/entrypoint.sh validate sftp-dhis2
```

## Best Practices

### 1. Development Workflow
1. Use manual CLI mode for development
2. Edit workflows in mounted volumes
3. Validate before deployment
4. Test with dry run mode

### 2. Production Deployment
1. Use automatic loading mode
2. Validate all workflows before deployment
3. Monitor deployment logs
4. Set up proper error handling

### 3. Configuration Management
1. Use environment variables for configuration
2. Keep sensitive data in Docker secrets
3. Version control workflow configurations
4. Document workflow dependencies

### 4. Monitoring and Logging
1. Monitor workflow execution status
2. Set up log aggregation
3. Configure error alerts
4. Track deployment success rates

## Integration with OpenFN v2

The workflow management system is designed to work with [OpenFN v2](https://docs.openfn.org/documentation/build/workflows) and follows the platform's conventions:

- **Workflow Structure**: Uses OpenFN v2 project.yaml format
- **Job Files**: JavaScript-based job definitions
- **Authentication**: Supports API key and user credentials
- **Deployment**: Uses OpenFN CLI for deployment
- **Monitoring**: Integrates with OpenFN history and logs

## Security Considerations

### 1. Credential Management
- Store API keys in Docker secrets
- Use environment variables for configuration
- Avoid hardcoded credentials in scripts

### 2. Network Security
- Use internal Docker networks
- Restrict external access
- Implement proper firewall rules

### 3. Access Control
- Limit container permissions
- Use read-only volume mounts where possible
- Implement proper user authentication

## References

- [OpenFN v2 Documentation](https://docs.openfn.org/documentation/build/workflows)
- [OpenFN CLI Guide](https://docs.openfn.org/documentation/cli)
- [OpenFN Troubleshooting](https://docs.openfn.org/documentation/monitor-history/troubleshooting)
- [OpenFn Community Forum](https://community.openfn.org/) 