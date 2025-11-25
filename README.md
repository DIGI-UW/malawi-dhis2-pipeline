# Malawi DHIS2 HIV/TB Indicators Pipeline

## Overview

This project implements a flexible, configuration-driven pipeline for importing HIV/TB health indicators from various Excel/CSV formats into DHIS2. Built on OpenFN and Instant OpenHIE v2, it supports multiple data sources and SFTP-based file uploads.

### Key Features

- **Multi-Format Support**: Processes CSV/XLSX files with configuration-based column mapping
- **Flexible Data Sources**: Google Sheets API and SFTP file monitoring
- **Automated Processing**: Scheduled (cron) and event-driven (webhook) workflows
- **Data Validation**: Built-in validation rules and transformation capabilities
- **Time-Based Protection**: Configurable update windows to prevent accidental overwrites
- **Docker Swarm Deployment**: Production-ready containerized architecture

## Quick Navigation

### For Operators (Deployment & Configuration)
- **[Quick Start Guide](specs/001-dhis2-indicator-loading/quickstart.md)** - Deploy in 15 minutes
- **[Environment Setup](docs/environment-setup.md)** - Full installation guide
- **[Production Deployment](docs/production-deployment.md)** - Government instance setup
- **[Credential Configuration](#credential-configuration)** - DHIS2 & SFTP credentials

### For Developers (Technical Reference)
- **[Technical Specifications](specs/001-dhis2-indicator-loading/)** - SDD artifacts (spec, plan, tasks)
- **[Development Guide](docs/02-development-guide.md)** - Workflow development
- **[OpenFN Design Patterns](docs/07-openfn-design-compliance.md)** - Best practices
- **[Testing Strategy](docs/03-testing-strategy.md)** - Testing approach

## CI/CD

The project includes automated CI testing via GitHub Actions:

- **Environment Setup CI**: Tests the complete instant OpenHIE deployment
- **Workflow Tests CI**: Validates OpenFN workflows using CLI testing framework

View [CI Documentation](.github/workflows/README.md) for details.

### Running CI Tests Locally

Uses Docker to run GitHub Actions locally (no installation required):

```bash
# Prerequisites: Docker must be running
./scripts/run-ci-locally.sh              # Run all CI workflows
./scripts/run-ci-locally.sh --env-setup  # Environment setup only
./scripts/run-ci-locally.sh --workflow-tests  # Workflow tests only
./scripts/run-ci-locally.sh --list       # List available workflows
./scripts/run-ci-locally.sh --verbose    # Enable verbose output
./scripts/run-ci-locally.sh --help       # Show all options
```

**Note**: The script automatically builds a Docker image with `act` on first run. This may take a minute initially but subsequent runs are fast.

### Pre-push Hook (Optional)

To run basic checks before pushing:

```bash
# Enable the pre-push hook
git config core.hooksPath .githooks

# To disable it later
git config --unset core.hooksPath
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

## Credential Configuration

The pipeline requires two credentials in OpenFN for production deployment.

### DHIS2 Admin Credential (for metadata operations)
Configure in OpenFN UI → Projects → Credentials → `dhis2-credential`:
- **Host URL**: `https://your-dhis2-instance.gov.mw` (no trailing slash)
- **Username**: DHIS2 admin account
- **Password**: Admin password

### Combined SFTP+DHIS2 Credential (for data uploads)
Configure in OpenFN UI → Credentials → `combined-sftp-dhis2-credential`:
- **SFTP Host**: Your SFTP server IP/hostname
- **SFTP Port**: 2225 (default)
- **SFTP Username**: openfn
- **DHIS2 Host URL**: Same as above
- **DHIS2 Username**: `openfn_integration` (service account)
- **DHIS2 Password**: Integration user password

### DHIS2 Integration User Requirements
The `openfn_integration` user in DHIS2 needs:
- **Roles**: Data Entry (minimum) or ALL authority
- **Org Units**: Assigned to all facilities data will be imported to

See [quickstart.md](specs/001-dhis2-indicator-loading/quickstart.md) for step-by-step credential setup.

## Documentation

### 📚 Essential Guides

- **[Environment Setup Guide](docs/environment-setup.md)** - Detailed installation and configuration
- **[Quick Start Tutorial](docs/quick-start-tutorial.md)** - Get running in 15 minutes
- **[Testing Guide](docs/Testing-Guide-CSV-XLSX.md)** - Comprehensive testing procedures
- **[Troubleshooting Guide](docs/06-troubleshooting.md)** - Common issues and solutions

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

File type configurations are defined inline in `FILE_TYPE_CONFIGS` within [jobs/00-scan-sftp-for-changes.js](projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2/jobs/00-scan-sftp-for-changes.js). See [data-model.md](specs/001-dhis2-indicator-loading/data-model.md) for configuration structure.

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

Workflows are defined in `projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2/`:
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

## Configuration

### File Type Configuration

File type configurations are defined inline in `FILE_TYPE_CONFIGS` within [jobs/00-scan-sftp-for-changes.js](projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2/jobs/00-scan-sftp-for-changes.js).

Each configuration specifies:
- File patterns (glob matching)
- Column mappings (source → DHIS2 fields)
- Period format and extraction rules
- Category configurations for disaggregation

Example structure:
```javascript
{
  fileType: 'pepfar_tx_curr_csv',
  filePatterns: ['PEPFAR_TxCURR*.csv'],
  periodFormat: 'YYYY-Qx',
  columnMappings: {
    facility: ['site_id', 'facility_name'],
    indicator: 'TX_CURR',
    value: ['value', 'count']
  },
  periodExtraction: 'filename'
}
```

### Adding New File Types

1. Edit `FILE_TYPE_CONFIGS` in `projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2/jobs/00-scan-sftp-for-changes.js`
2. Add sample file to `projects/sftp/data/samples/` for testing
3. Rebuild workflow image: `./build-custom-images.sh openfn-workflows`
4. Deploy: `./mk.sh`

See [data-model.md](specs/001-dhis2-indicator-loading/data-model.md) for detailed configuration documentation.

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

For detailed troubleshooting, see the [Environment Setup Guide](docs/environment-setup.md#troubleshooting) or the [Troubleshooting Guide](docs/06-troubleshooting.md).

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
All workflow documentation has been consolidated in [`docs/`](docs/):

1. **[Overview](docs/01-overview.md)** - Project architecture and quick start
2. **[Development Guide](docs/02-development-guide.md)** - How to create and modify workflows
3. **[Testing Strategy](docs/03-testing-strategy.md)** - Comprehensive testing approach
4. **[SFTP to DHIS2 Testing Plan](docs/04-sftp-dhis2-testing-plan.md)** - Detailed testing plan
5. **[Docker Environment](docs/05-docker-environment.md)** - Docker setup and configuration
6. **[Troubleshooting Guide](docs/06-troubleshooting.md)** - Common issues and solutions
7. **[OpenFN Design Compliance](docs/07-openfn-design-compliance.md)** - Design patterns and best practices
8. **[DHIS2 Pattern Examples](docs/08-dhis2-pattern-examples.md)** - DHIS2 integration patterns

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

See the [Production Deployment Guide](docs/production-deployment.md) for deploying to government DHIS2 instances.