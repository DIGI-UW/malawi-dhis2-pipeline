# AGENTS.md - Malawi DHIS2 Pipeline

## Project Overview

Configuration-driven data integration pipeline for HIV/TB health indicators.
Built on OpenFN + Instant OpenHIE v2, deployed via Docker Swarm.

**Purpose**: Automate import of indicator data from Excel/CSV files into DHIS2 for Malawi health programs.

**Architecture**: SFTP file monitoring → OpenFN workflows → DHIS2 data warehouse

## Setup Commands

```bash
# Clone with submodules
git clone --recurse-submodules https://github.com/your-org/malawi-dhis2-pipeline.git
cd malawi-dhis2-pipeline

# Or initialize submodules after cloning
git submodule update --init --recursive

# Copy environment template
cp .env.example .env

# Build Docker images
./build-custom-images.sh all

# Deploy all services
./mk.sh

# Or use instant CLI directly
./instant project up --env-file .env
```

## Code Style

- **JavaScript ES6+** for OpenFN workflow jobs
- **Configuration-driven approach** using FILE_TYPE_CONFIGS
- **State-driven job design** per OpenFN patterns
- **Chunked processing** for memory efficiency with large files
- **YAML** for workflow definitions (project.yaml)

### Workflow Job Conventions

1. Jobs are numbered sequentially: `00-`, `01-`, `02-`, etc.
2. Each job receives and returns OpenFN state object
3. Use `state.filesIndex` for tracking file processing status
4. Implement resume capability via `lastSuccessfulChunk`

## Testing

```bash
# Run all tests
cd projects/indicator_workflow_testing && ./run-tests.sh

# Run specific test suites
./run-tests.sh --api          # API connectivity tests
./run-tests.sh --sftp         # SFTP integration tests
./run-tests.sh --integration  # End-to-end tests

# Run CI locally (requires Docker)
./scripts/run-ci-locally.sh
```

## File Type Configurations

**8 currently configured** + **6 pending MOH CSV configs**

Location: `projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2/jobs/00-scan-sftp-for-changes.js`

| Config Key | Data Source | Pattern | Format |
|------------|-------------|---------|--------|
| pepfar_tx_curr_csv | PEPFAR | PEPFAR_TxCURR*.csv | CSV |
| pepfar_tx_mmd_csv | PEPFAR | PEPFAR_TxCURRMMD*.csv | CSV |
| pepfar_tx_ml_csv | PEPFAR | PEPFAR_TxML*.csv | CSV |
| pepfar_tx_new_csv | PEPFAR | PEPFAR_TxNEW*.csv | CSV |
| pepfar_tx_rtt_csv | PEPFAR | PEPFAR_TxRTT*.csv | CSV |
| art_data_long_format | MOH/ART | ART_data_long*.xlsx | XLSX |
| dq_sites | MOH/DQ | *Q*FY*DQ*sites*.xlsx | XLSX |
| moh_direct_queries | MOH | *Direct*Queries*.xlsx | XLSX |

**Pending**: 6 MOH CSV configs (moh_cohort_report, moh_regimen_distribution, moh_survival_*, moh_tpt_initiations)

## Key Paths

| Path | Purpose |
|------|---------|
| `projects/openfn-workflows/workflows/` | Workflow definitions (project.yaml + jobs/) |
| `projects/openfn-custom-adaptors/packages/` | Custom SFTP/DHIS2 adaptors |
| `projects/sftp/data/samples/` | Sample data files for testing |
| `projects/indicator_workflow_testing/` | Test framework |
| `packages/` | Docker Swarm service configurations |
| `specs/` | Speckit SDD artifacts |
| `docs/` | Project documentation |

## Service Access (Development)

| Service | URL | Credentials |
|---------|-----|-------------|
| OpenFN | http://localhost:4000 | root@openhim.org / instant101 |
| DHIS2 | http://localhost:8080 | admin / district |
| SFTP | sftp://localhost:2225 | openfn / instant101 |

## Custom Adaptors

This project uses forked OpenFN adaptors with critical fixes:

- **@openfn/language-sftp@2.1.0-custom** - Authentication fixes
- **@openfn/language-dhis2@7.1.3-custom** - Metadata operations

Source: `projects/openfn-custom-adaptors/packages/`

## Workflow Jobs (5-job pipeline)

1. **00-scan-sftp-for-changes.js** - SFTP file detection + FILE_TYPE_CONFIGS
2. **01-check-and-setup-processing.js** - Config validation
3. **02-parse-excel-metadata.js** - Excel/CSV parsing
4. **03-check-and-setup-metadata.js** - DHIS2 metadata upsert
5. **04-process-all-chunks-sequentially.js** - Chunked data upload

## Documentation

- [Environment Setup](docs/environment-setup.md)
- [Production Deployment](docs/production-deployment.md)
- [Troubleshooting](docs/06-troubleshooting.md)
- [OpenFN Design Compliance](docs/07-openfn-design-compliance.md)
- [SDD Specifications](specs/001-dhis2-indicator-loading/)

## Quick Start Paths

### For Operators
Start with [quickstart.md](specs/001-dhis2-indicator-loading/quickstart.md) for:
- Step-by-step deployment
- Credential configuration
- Testing the pipeline

### For Developers
Start with [spec.md](specs/001-dhis2-indicator-loading/spec.md) for:
- Feature requirements
- Architecture decisions
- Implementation details

## Credential Configuration

Two OpenFN credentials required for production:
1. **dhis2-credential** - Admin access for metadata operations (Job 3)
2. **combined-sftp-dhis2-credential** - SFTP + integration user for data upload (Job 4)

See [quickstart.md § Step 4](specs/001-dhis2-indicator-loading/quickstart.md#step-4-configure-credentials-in-openfn) for configuration steps.
