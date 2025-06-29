# OpenFN Workflows Documentation

## Overview

This documentation covers the complete development, testing, and deployment lifecycle for OpenFN workflows in the Malawi DHIS2 HIV/TB Indicators Pipeline project.

## Documentation Structure

1. **[Overview](01-overview.md)** - This document
2. **[Development Guide](02-development-guide.md)** - Workflow development best practices
3. **[Testing Strategy](03-testing-strategy.md)** - Comprehensive testing approach
4. **[SFTP to DHIS2 Testing Plan](04-sftp-dhis2-testing-plan.md)** - Specific testing plan for SFTP workflow
5. **[Docker Environment](05-docker-environment.md)** - Docker setup and configuration
6. **[Troubleshooting Guide](06-troubleshooting.md)** - Common issues and solutions

## Project Architecture

```
malawi-dhis2-pipeline/
├── projects/
│   ├── openfn-workflows/         # Workflow definitions and testing
│   │   ├── docs/                 # Consolidated documentation
│   │   ├── workflows/            # OpenFN workflow configurations
│   │   ├── configs/              # File type and metadata configs
│   │   ├── scripts/              # Utility scripts
│   │   └── docker/               # Docker configurations
│   └── indicator_workflow_testing/   # Testing framework
│       ├── TESTING-INDEX.md      # Comprehensive testing guide
│       ├── tests/                # Test implementations
│       └── fixtures/             # Test data
└── packages/                     # Infrastructure packages
    ├── openfn/                   # OpenFN Lightning
    ├── sftp-storage/             # SFTP server with bundled files
    └── dhis2-instance/           # DHIS2 server
```

## Key Concepts

### 1. Workflow Development Lifecycle

```mermaid
graph LR
    A[Create Workflow] --> B[Test with CLI]
    B --> C[Validate Logic]
    C --> D[Deploy to OpenFN]
    D --> E[Monitor in Production]
    C --> B
```

### 2. Testing Philosophy

- **Docker-First**: All testing runs in containers for consistency
- **Working Over Perfect**: Focus on tests that actually work
- **Progressive Testing**: CLI → Integration → Production
- **Real Data**: Use actual Excel files for testing

### 3. SFTP Integration Architecture

The SFTP to DHIS2 workflow processes health indicator data through these steps:

1. **File Detection**: Monitor SFTP for new Excel files
2. **File Download**: Retrieve files to local storage
3. **Data Processing**: Parse Excel data using file type configurations
4. **DHIS2 Transformation**: Convert to DHIS2 data value sets
5. **Upload**: Send data to DHIS2 API
6. **State Management**: Track processed files

## Quick Start

### Development Environment Setup

```bash
# 1. Build custom Docker images
cd /home/ubuntu/code/malawi-dhis2-pipeline
./build-custom-images.sh openfn-cli-test openfn

# 2. Start services
./instant package init -n sftp-storage -d
./instant package init -n dhis2-instance -d
./instant package init -n openfn -d

# 3. Test workflows
cd projects/indicator_workflow_testing
./run-tests.sh --cli-workflow
```

### Key Environment Variables

```bash
# SFTP Configuration
SFTP_HOST=172.17.0.1      # Docker bridge IP on Linux
SFTP_PORT=2225
SFTP_USER=openfn
SFTP_PASSWORD=instant101

# DHIS2 Configuration
DHIS2_URL=http://localhost:8080
DHIS2_USER=admin
DHIS2_PASS=district

# OpenFN Configuration
OPENFN_URL=http://localhost:4000
OPENFN_API_KEY=apiKey
```

## Important Discoveries

### SFTP Adaptor Docker Bundling Fix

The official `@openfn/language-sftp@2.0.14` package works perfectly when installed correctly. The "Invalid username" error was caused by broken pnpm symlinks in Docker builds, not the package itself.

**Key Point**: No modifications were made to the SFTP adaptor code. The issue was purely with how it was bundled in Docker images.

**Problem**: pnpm symlinks don't survive Docker layer copying
**Solution**: Use `npm install` instead of copying pnpm symlinks in Docker builds

### State Structure Requirements

OpenFN CLI requires credentials nested in the `configuration` object:

```json
{
  "data": [],
  "configuration": {
    "host": "172.17.0.1",
    "port": 2225,
    "username": "openfn",
    "password": "instant101"
  }
}
```

### CLI Project Structure

OpenFN CLI requires a specific directory structure:

```
project-dir/
├── openfn.json           # Project configuration
└── workflows/
    └── workflow-name/
        └── workflow-name.json  # Workflow definition
```

## Testing Resources

- **Testing Index**: See `projects/indicator_workflow_testing/TESTING-INDEX.md` for comprehensive testing documentation
- **Test Scripts**: Located in `projects/indicator_workflow_testing/tests/`
- **Fixtures**: Test data in `projects/indicator_workflow_testing/tests/fixtures/`

## Next Steps

1. Review the [Development Guide](02-development-guide.md) for workflow creation
2. Follow the [SFTP to DHIS2 Testing Plan](04-sftp-dhis2-testing-plan.md) for validation
3. Use the [Testing Strategy](03-testing-strategy.md) for comprehensive testing 