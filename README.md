# Malawi DHIS2 HIV/TB Indicators Pipeline

## Overview

This project implements a flexible, configuration-driven pipeline for importing HIV/TB health indicators from various Excel/CSV formats into DHIS2. Built on OpenFN and Instant OpenHIE v2, it supports multiple data sources SFTP-based file uploads.

### Key Features

- **Multi-Format Support**: Processes CSV/XLSX files with configuration-based column mapping
- **Automated Processing**: Scheduled and event-driven initialization
- **Data Validation**: Built-in validation rules and transformation capabilities
- **Time-Based Protection**: Configurable update windows to prevent accidental overwrites
- **Docker Swarm Deployment**: Production-ready containerized deployment

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Data Sources  │     │   OpenFN        │     │   DHIS2         │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ • Excel/CSV     │     │ • Transformers  │     │ • Validation    │
│                 │     │ • Validators    │     │ • Storage       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   PostgreSQL    │
                        │ • State Mgmt    │
                        │ • Audit Trail   │
                        └─────────────────┘
```

## Quick Start

> **📖 For detailed setup instructions, see the [Environment Setup Guide](docs/environment-setup.md)**

### Prerequisites

- Docker 20.10+ with Swarm mode
- Node.js 18+ and npm
- Git 2.25+
- Ubuntu 20.04+ or similar Linux
- 4GB RAM, 20GB disk space

### 1. Clone and Setup

```bash
git clone https://github.com/your-org/malawi-dhis2-pipeline.git
cd malawi-dhis2-pipeline
cp .env.example .env
# Edit .env with your settings
```

### 2. Install instant CLI

```bash
./get-cli.sh linux
# Verify: ./instant --version
```

### 3. Build and Deploy

```bash
# Build custom Docker images
./build-custom-images.sh all

# Initialize and start all services
./build-image.sh

./instant project up --env-file .env
```

*Note: See `mk.sh` for examples of other useful instant cli commands*

### 4. Access Services

After ~5 minutes for initialization:

- **OpenFN**: http://localhost:4000 (root@openhim.org / instant101)
- **DHIS2**: http://localhost:8080 (admin / district)
- **SFTP**: sftp://localhost:2225 (openfn / instant101)

## Documentation

### 📚 Essential Guides

- **[Environment Setup Guide](docs/environment-setup.md)** - Detailed installation and configuration
- **[Quick Start Tutorial](docs/quick-start-tutorial.md)** - Get running in 15 minutes
- **[Testing Guide](docs/Testing-Guide-CSV-XLSX.md)** - Comprehensive testing procedures
- **[Troubleshooting Guide](projects/openfn-workflows/docs/06-troubleshooting.md)** - Common issues and solutions

### 🔧 Configuration & Development

- **[CSV/XLSX Integration Guide](docs/CSV-XLSX-Import-Integration.md)** - File format configuration
- **[OpenFN Workflow Sync](docs/openfn-workflow-sync.md)** - Workflow development and sync
- **[Google Sheets Setup](docs/google-sheets-setup.md)** - Google Sheets API configuration
- **[SFTP Excel Integration](docs/sftp-excel-integration.md)** - SFTP file processing

### 📦 Component Documentation

- **[OpenFN Workflows](projects/openfn-workflows/README.md)** - Workflow definitions and testing
- **[Testing Framework](projects/indicator_workflow_testing/README.md)** - Automated test suite
- **[Package Documentation](packages/)** - Individual service documentation

### 📋 Project Information

- **[Deliverables](docs/Deliverables.md)** - Project requirements and milestones
- **[Migration Guide](docs/migration-guide.md)** - PostgreSQL to Google Sheets migration

## Supported File Formats

The pipeline automatically detects and processes these file types:

- **ART Data**: `*ART*data*long*.xlsx` - ART supervision with age/gender disaggregation
- **DQ Sites**: `*Q*FY*DQ*sites*.xlsx` - Data quality reports with completeness scores
- **Direct Queries**: `*Direct*Queries*.xlsx` - MoH quarterly reports with multi-sheet support

Configuration files in `projects/openfn-workflows/configs/file-types/` define the mapping rules.

### Workflow Sync System

#### Quick Start:
```bash
# Check sync status
./packages/openfn/instant-workflow-sync.sh status

# Download workflows from UI
./packages/openfn/instant-workflow-sync.sh download

# Upload workflows to UI
./packages/openfn/instant-workflow-sync.sh upload

# Enable auto-sync watch mode
./packages/openfn/instant-workflow-sync.sh watch
```

#### Key Features:
- **Bidirectional Sync**: Download from UI or upload from code
- **Version Management**: Track changes with lock_version support
- **Conflict Resolution**: Automatic or manual conflict handling
- **Snapshot System**: Automatic backups before changes
- **Watch Mode**: Auto-sync on file changes

#### Configuration (in `.env`):
```bash
OPENFN_SYNC_MODE=manual              # manual|auto-download|auto-upload
OPENFN_CONFLICT_RESOLUTION=prompt    # prompt|local-wins|remote-wins
OPENFN_ENABLE_AUTO_SNAPSHOT=true     # Auto-create snapshots
```

See [Workflow Sync Documentation](docs/openfn-workflow-sync.md) for full details.

#### Workflow Loading Process

1. **Build Workflow Image**: `./build-custom-images.sh openfn-workflows`
   - Packages workflow files into Docker image
   - Includes YAML configurations and job definitions

2. **Deploy with Workflow Loading**: `./mk.sh`
   - Sets `OPENFN_LOAD_WORKFLOWS_ON_STARTUP=true`
   - Deploys workflow-loader service that reads from `/app/workflows/`
   - Uses OpenFN CLI to deploy via provisioning API

3. **Verify Deployment**: 
    ```bash
   # Test workflow loading
   cd projects/indicator_workflow_testing
   ./run-tests.sh --workflows
   
   # Check OpenFN UI
   # Navigate to http://localhost:4000
   ```

#### Workflow Structure

Workflows are defined in `projects/openfn-workflows/workflows/sftp-dhis2/`:
- `project.yaml` - Project configuration with workflows, jobs, triggers
- `jobs/` - Individual job definitions (.js files)
- `.versions/` - Downloaded workflow versions (auto-created)
- `.snapshots/` - Workflow snapshots (auto-created)
- `README.md` - Workflow documentation

#### Development Workflows

**Option 1: UI-First Development**
1. Make changes in OpenFN UI
2. Test workflows in UI
3. Download to code: `./packages/openfn/instant-workflow-sync.sh download`
4. Commit changes to git

**Option 2: Code-First Development**
1. Edit workflow files locally
2. Upload to test: `./packages/openfn/instant-workflow-sync.sh upload`
3. Test in UI
4. Commit changes to git

#### Key Environment Variables

- `OPENFN_LOAD_WORKFLOWS_ON_STARTUP=true` - Enables automatic loading
- `OPENFN_WORKFLOW_MANUAL_CLI=false` - Uses packaged workflows (not external files)
- `OPENFN_SYNC_MODE=manual` - Workflow sync mode
- `OPENFN_CONFLICT_RESOLUTION=prompt` - How to handle conflicts

#### Faster Development Iteration

For workflow changes without full rebuild:
```bash
# Quick sync and redeploy
./packages/openfn/instant-workflow-sync.sh upload
./instant package up -n openfn -d

# Full rebuild (if workflow structure changed)
./mk.sh
```

## Documentation Index

### 📋 Project Documentation

- **[Project Overview](DHIS2-Indicator-Pipeline-Project-Page.md)** - Business overview and project benefits
- **[Deliverables](docs/Deliverables.md)** - Project requirements and deliverables
- **[Testing Guide](docs/Testing-Guide-CSV-XLSX.md)** - Comprehensive testing procedures
- **[CSV/XLSX Integration Guide](docs/CSV-XLSX-Import-Integration.md)** - Configuration-based file processing

### 🔧 Setup Guides

- **[Google Sheets Setup](docs/google-sheets-setup.md)** - Google Sheets API configuration
- **[SFTP Excel Integration](docs/sftp-excel-integration.md)** - SFTP-based file processing
- **[OpenFN Workflow Sync](docs/openfn-workflow-sync.md)** - Bidirectional workflow synchronization
- **[OpenFN State Management](docs/openfn-state-management-guide.md)** - State management best practices
- **[OpenFN Testing Guide](docs/openfn-testing-guide.md)** - OpenFN-specific testing procedures

### 🧪 Testing & Validation

- **[Workflow Testing Framework](projects/indicator_workflow_testing/README.md)** - Automated testing suite for workflows
- **[Testing Guide](docs/Testing-Guide-CSV-XLSX.md)** - Comprehensive testing procedures
- **[API Testing](projects/indicator_workflow_testing/tests/)** - OpenFN API connectivity tests

### 🔄 Migration & History

- **[Migration Guide](docs/migration-guide.md)** - PostgreSQL to Google Sheets migration
- **[Refactoring Summary](docs/refactoring-summary.md)** - Summary of major changes

### 📦 Package Documentation

#### Core Packages
- **[OpenFN Package](packages/openfn/README.md)** - Workflow orchestration engine
- **[DHIS2 Instance](packages/dhis2-instance/README.md)** - DHIS2 server configuration
  - **[DHIS2 Database Setup](packages/dhis2-instance/importer/README.md)** - Database initialization
- **[PostgreSQL Database](packages/database-postgres/README.md)** - Database setup
- **[SFTP Storage](packages/sftp-storage/README.md)** - File storage and transfer
- **[Nginx Reverse Proxy](packages/reverse-proxy-nginx/README.md)** - Load balancing and routing

#### Workflow Components
- **[SFTP-DHIS2 Workflow](projects/openfn-workflows/workflows/sftp-dhis2/README.md)** - Main data import workflow
- **[Configuration Loader](projects/openfn-workflows/shared/config-loader.js)** - Dynamic configuration system

#### Other Resources
- **[Original OpenFN Setup](projects/original-openfn-setup/README.md)** - Legacy setup documentation
- **[Environment Variables](environment-variables.md)** - OpenFN environment variables reference
- **[Config Override Scripts](scripts/cmd/override-configs/README.md)** - Configuration management scripts

## Supported File Formats

The pipeline supports multiple file formats through configuration files:

### 1. ART Data Long Format
- **Pattern**: `*ART*data*long*.xlsx`
- **Config**: `configs/file-types/art_data_long_format.json`
- **Features**: Age/gender disaggregation, ART regimen tracking

### 2. Data Quality (DQ) Sites
- **Pattern**: `*Q*FY*DQ*sites*.xlsx`
- **Config**: `configs/file-types/dq_sites.json`
- **Features**: Quarterly reports, completeness scores, fiscal year handling

### 3. MoH Direct Queries
- **Pattern**: `*Direct*Queries*.xlsx`
- **Config**: `configs/file-types/moh_direct_queries.json`
- **Features**: Multi-sheet support, flexible date parsing, calculated indicators

## Configuration

### File Type Configuration

Each file type has a JSON configuration specifying:
- Column mappings (source → DHIS2 fields)
- Data transformations (dates, percentages, quarters)
- Validation rules (required fields, data types, ranges)
- DHIS2 import settings

Example structure:
```json
{
  "fileType": "identifier",
  "filePatterns": ["*.xlsx"],
  "columnMappings": {
    "indicator": {
      "sourceColumns": ["Indicator", "Data Element"],
      "targetField": "dataElement",
      "required": true
    }
  }
}
```

### Adding New File Types

1. Create configuration in `packages/openfn/importer/configs/file-types/`
2. Copy to workflows: `cp -r packages/openfn/importer/configs projects/openfn-workflows/`
3. Rebuild image: `./build-custom-images.sh openfn-workflows`

## Testing

The project includes a comprehensive testing framework for validating workflows and API functionality:

### Quick Testing
```bash
# Run all tests
./projects/indicator_workflow_testing/run-tests.sh

# Run specific test suites
./projects/indicator_workflow_testing/run-tests.sh --api          # API connectivity tests
./projects/indicator_workflow_testing/run-tests.sh --excel       # Excel parsing tests
./projects/indicator_workflow_testing/run-tests.sh --sftp        # SFTP integration tests
./projects/indicator_workflow_testing/run-tests.sh --integration # End-to-end tests
```

### Manual Testing
- **Unit Tests**: `npm test`
- **Integration Tests**: See [Testing Guide](docs/Testing-Guide-CSV-XLSX.md)
- **Validation**: `npm run validate-sheets` (for Google Sheets)

### Testing Framework
- **[Automated Testing Suite](projects/indicator_workflow_testing/README.md)** - Comprehensive test framework
- **API Tests**: Health checks, authentication, workflow validation
- **Excel Tests**: Multi-sheet parsing and data transformation validation
- **SFTP Tests**: File transfer and workflow integration
- **Integration Tests**: End-to-end workflow execution with sample data

## Monitoring

- **OpenFN Dashboard**: Workflow execution status
- **DHIS2 Import Summary**: Data import results
- **Docker Service Logs**: `docker service logs <service_name>`

## Troubleshooting

For detailed troubleshooting, see the [Environment Setup Guide](docs/environment-setup.md#troubleshooting) or the [Troubleshooting Guide](projects/openfn-workflows/docs/06-troubleshooting.md).

Common quick fixes:

| Issue | Quick Solution |
|-------|----------------|
| Services not starting | Check logs: `docker service logs <service_name>` |
| Workflows not loading | Run: `docker service update --force openfn-workflows_workflow-loader` |
| DHIS2 not accessible | Wait 2-5 minutes for initialization |
| Port conflicts | Change ports in `.env` file |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Update documentation
5. Submit a pull request

## License

[License information]

## Support

- **Issues**: GitHub Issues
- **Documentation**: See [Documentation](#documentation) section above
- **instant v2**: https://github.com/openhie/instant-v2
- **OpenFN Community**: https://community.openfn.org/

## 🧩 Key Components

### 1. **Core Workflow Engine** (OpenFN Lightning)
- OpenFN Lightning v2.8+ with web UI and API
- Custom Docker images with working SFTP adaptor
- Automated workflow execution and monitoring

### 2. **SFTP File Storage**
- Secure file upload endpoint for partners
- Pre-loaded with sample Excel files for testing
- Automated file monitoring and processing

### 3. **DHIS2 Data Warehouse**
- DHIS2 v2.39+ configured for Malawi health programs
- Pre-configured metadata for HIV/TB indicators
- RESTful API for data import/export

### 4. **Testing Framework**
- Comprehensive test suite for all workflows
- Docker-based testing environment
- CLI and integration testing tools

## 📚 Documentation

### Workflow Development & Testing
All workflow documentation has been consolidated in [`projects/openfn-workflows/docs/`](projects/openfn-workflows/docs/):

1. **[Overview](projects/openfn-workflows/docs/01-overview.md)** - Project architecture and quick start
2. **[Development Guide](projects/openfn-workflows/docs/02-development-guide.md)** - How to create and modify workflows
3. **[Testing Strategy](projects/openfn-workflows/docs/03-testing-strategy.md)** - Comprehensive testing approach
4. **[SFTP to DHIS2 Testing Plan](projects/openfn-workflows/docs/04-sftp-dhis2-testing-plan.md)** - Detailed testing plan
5. **[Docker Environment](projects/openfn-workflows/docs/05-docker-environment.md)** - Docker setup and configuration
6. **[Troubleshooting Guide](projects/openfn-workflows/docs/06-troubleshooting.md)** - Common issues and solutions

### Testing Framework
For the complete testing framework documentation, see:
- [`projects/indicator_workflow_testing/TESTING-INDEX.md`](projects/indicator_workflow_testing/TESTING-INDEX.md)

### Other Documentation
- [`docs/Deliverables.md`](docs/Deliverables.md) - Project deliverables and milestones
- [`docs/MCP-SERVERS.md`](docs/MCP-SERVERS.md) - MCP server integration

## Supporting Documentation

- **[instant v2 Documentation](https://github.com/openhie/instant-v2)** - Infrastructure orchestration platform
- **[Docker Swarm Guide](https://docs.docker.com/engine/swarm/)** - Container orchestration
- **[OpenFN Platform Docs](https://docs.openfn.org/)** - Workflow automation platform
- **[DHIS2 Documentation](https://docs.dhis2.org/)** - Health information system

## Troubleshooting Setup

### Common Setup Issues

| Issue | Solution |
|-------|----------|
| Docker permission denied | Run `sudo usermod -aG docker $USER` and logout/login |
| instant CLI not found | Ensure `/usr/local/bin` is in your PATH or use `./instant` |
| Services failing to start | Check logs: `docker service logs <service_name>` |
| Port already in use | Change port mappings in `.env` file |
| Out of disk space | Run `docker system prune -a` to clean up |

### Service-Specific Issues

#### OpenFN Not Loading Workflows
```bash
# Check workflow loader logs
docker service logs openfn-workflows_workflow-loader

# Manually trigger workflow loading
cd packages/openfn/importer/workflows
docker service update --force openfn-workflows_workflow-loader
```

#### DHIS2 Not Accessible
```bash
# Check if service is running
docker service ps dhis2-instance_dhis2

# Wait for initialization (can take 2-5 minutes)
docker service logs -f dhis2-instance_dhis2 | grep "Server startup"
```

#### SFTP Files Not Visible
```bash
# Verify SFTP service has bundled files
docker exec $(docker ps -q -f name=sftp-server) ls -la /data/excel-files/

# Should see:
# - ART_data_long_format.xlsx
# - Direct Queries - Q1 2025 MoH Reports.xlsx
# - Q2FY25_DQ_253_sites.xlsx
```

## Production Deployment

> **Note**: Production deployment guide coming soon. The current setup is optimized for development and testing environments.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Update documentation
5. Submit a pull request