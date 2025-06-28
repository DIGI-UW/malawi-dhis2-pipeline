# Malawi DHIS2 HIV/TB Indicators Pipeline

## Overview

This project implements a flexible, configuration-driven pipeline for importing HIV/TB health indicators from various Excel/CSV formats into DHIS2. Built on OpenFN and Instant OpenHIE v2, it supports multiple data sources including Google Sheets and SFTP-based file uploads.

### Key Features

- **Multi-Format Support**: Processes CSV/XLSX files with configuration-based column mapping
- **Flexible Data Sources**: Google Sheets API and SFTP file monitoring
- **Automated Processing**: Scheduled (cron) and event-driven (webhook) workflows
- **Data Validation**: Built-in validation rules and transformation capabilities
- **Time-Based Protection**: Configurable update windows to prevent accidental overwrites
- **Docker Swarm Deployment**: Production-ready containerized deployment

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Data Sources  │     │   OpenFN        │     │   DHIS2         │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ • Google Sheets │────▶│ • Workflows     │────▶│ • Data Import   │
│ • SFTP Files    │     │ • Transformers  │     │ • Validation    │
│ • Excel/CSV     │     │ • Validators    │     │ • Storage       │
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

### Prerequisites

- Docker and Docker Compose (with Swarm mode)
- Node.js and npm
- OpenFN CLI: `npm install -g @openfn/cli`

### Deployment Steps

```bash
# 1. Clone and setup
git clone <repository>
cd malawi-dhis2-pipeline

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Build custom images
./build-custom-images.sh sftp        # SFTP with sample data
./build-custom-images.sh openfn-workflows  # OpenFN with workflows

# 4. Initialize project
./instant project init --env-file .env

# 5. Access services
# OpenFN: http://localhost:4000
# DHIS2: http://localhost:8080
# SFTP: sftp://localhost:2225
```

### OpenFN Workflow Management

The system provides comprehensive workflow management with bidirectional sync between code and UI.

#### Workflow Sync System

**Quick Start:**
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

**Key Features:**
- **Bidirectional Sync**: Download from UI or upload from code
- **Version Management**: Track changes with lock_version support
- **Conflict Resolution**: Automatic or manual conflict handling
- **Snapshot System**: Automatic backups before changes
- **Watch Mode**: Auto-sync on file changes

**Configuration** (in `.env`):
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

Common issues and solutions:

| Issue | Solution |
|-------|----------|
| File not recognized | Check filename matches patterns in config |
| Column mapping errors | Verify Excel column names match configuration |
| DHIS2 upload failures | Check metadata UIDs and credentials |
| Old data not updating | Adjust time window settings (default: 3 months) |

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
- **Documentation**: This README and linked guides
- **Community**: [Community channels]