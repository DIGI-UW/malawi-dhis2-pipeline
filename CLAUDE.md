# Malawi DHIS2 Pipeline - Development Guidelines

## Project Overview

Configuration-driven data integration pipeline for HIV/TB health indicators from Excel/CSV files into DHIS2. Built on OpenFN + Instant OpenHIE v2, deployed via Docker Swarm.

## Active Technologies

- **JavaScript (ES6+)** - OpenFN workflow jobs
- **YAML** - Workflow definitions (project.yaml)
- **Docker Swarm** - Container orchestration
- **Instant OpenHIE v2** - Deployment framework

## Project Structure

```text
/
├── AGENTS.md                    # AI agent context (agents.md standard)
├── CLAUDE.md                    # This file
├── README.md                    # Project overview
├── docs/                        # Consolidated documentation
│   ├── 01-overview.md
│   ├── 02-development-guide.md
│   ├── 03-testing-strategy.md
│   ├── 04-sftp-dhis2-testing-plan.md
│   ├── 05-docker-environment.md
│   ├── 06-troubleshooting.md
│   ├── 07-openfn-design-compliance.md
│   ├── 08-dhis2-pattern-examples.md
│   ├── environment-setup.md
│   ├── production-deployment.md
│   └── handover-notes.md
├── specs/                       # Speckit SDD artifacts
│   └── 001-dhis2-indicator-loading/
│       ├── spec.md
│       ├── plan.md
│       ├── tasks.md
│       ├── data-model.md
│       └── quickstart.md
├── projects/
│   ├── openfn-workflows/        # Main workflow code
│   │   └── workflows/upload-indicator-files-to-dhis2/
│   │       ├── project.yaml     # Workflow definition
│   │       └── jobs/            # 5-job pipeline
│   ├── openfn-custom-adaptors/  # Git submodule
│   │   └── packages/
│   │       ├── sftp/            # @openfn/language-sftp@2.1.0-custom
│   │       └── dhis2/           # @openfn/language-dhis2@7.1.3-custom
│   ├── indicator_workflow_testing/  # Test framework
│   └── sftp/data/samples/       # Sample test data
└── packages/                    # Docker Swarm services
    ├── openfn/
    ├── dhis2-instance/
    ├── sftp-storage/
    ├── database-postgres/
    └── reverse-proxy-nginx/
```

## Commands

```bash
# Setup
git submodule update --init --recursive
cp .env.example .env
./build-custom-images.sh all
./mk.sh

# Testing
cd projects/indicator_workflow_testing && ./run-tests.sh
./run-tests.sh --api          # API tests
./run-tests.sh --sftp         # SFTP tests
./run-tests.sh --integration  # End-to-end

# CI locally
./scripts/run-ci-locally.sh
```

## Code Style

- **JavaScript**: ES6+ with OpenFN state-driven patterns
- **Jobs**: Numbered sequentially (00-, 01-, 02-, etc.)
- **State management**: Use `state.filesIndex` for file tracking
- **Resume capability**: Implement via `lastSuccessfulChunk`

## File Type Configurations

FILE_TYPE_CONFIGS location: `projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2/jobs/00-scan-sftp-for-changes.js`

### Currently Configured (12 types)

| Config Key | Source | Pattern | Format |
|------------|--------|---------|--------|
| pepfar_tx_curr_csv | PEPFAR | PEPFAR_TxCURR*.csv | CSV |
| pepfar_tx_mmd_csv | PEPFAR | PEPFAR_TxCURRMMD*.csv | CSV |
| pepfar_tx_ml_csv | PEPFAR | PEPFAR_TxML*.csv | CSV |
| pepfar_tx_new_csv | PEPFAR | PEPFAR_TxNEW*.csv | CSV |
| pepfar_tx_rtt_csv | PEPFAR | PEPFAR_TxRTT*.csv | CSV |
| art_data_long_format | MOH/ART | ART_data_long*.xlsx | XLSX |
| dq_sites | MOH/DQ | *Q*FY*DQ*sites*.xlsx | XLSX |
| moh_direct_queries | MOH | *Direct*Queries*.xlsx | XLSX |
| moh_cohort_report_csv | MOH | MoH_CohortReport*.csv | CSV |
| moh_regimen_distribution_csv | MOH | MoH_RegimenDistributionByWeight*.csv | CSV |
| moh_survival_analysis_csv | MOH | MoH_SurvivalAnalysis*.csv | CSV |
| moh_tpt_initiations_csv | MOH | MoH_TPTNewInitiations*.csv | CSV |

### MOH CSV Sample Files

Sample files in `projects/sftp/data/samples/moh/`:
- MoH_CohortReport_*.csv - Quarterly cohort reports with registration indicators
- MoH_RegimenDistributionByWeight_*.csv - Regimen distribution by gender/age/weight
- MoH_SurvivalAnalysis*.csv - Survival analysis (General, Women, Children variants)
- MoH_TPTNewInitiations_*.csv - TB Preventive Therapy initiations

Filename convention: `MoH_{ReportType}_{YEAR}_{QUARTER}_{VERSION}_{TIMESTAMP}.csv`

## 5-Job Workflow Pipeline

1. **00-scan-sftp-for-changes.js** - SFTP scanning + FILE_TYPE_CONFIGS
2. **01-check-and-setup-processing.js** - Configuration validation
3. **02-parse-excel-metadata.js** - Excel/CSV parsing
4. **03-check-and-setup-metadata.js** - DHIS2 metadata upsert
5. **04-process-all-chunks-sequentially.js** - Chunked data upload

## Key Documentation

- [Environment Setup](docs/environment-setup.md)
- [Production Deployment](docs/production-deployment.md)
- [Troubleshooting](docs/06-troubleshooting.md)
- [OpenFN Design Compliance](docs/07-openfn-design-compliance.md)
- [SDD Specification](specs/001-dhis2-indicator-loading/spec.md)

## Service Access (Dev)

| Service | URL | Credentials |
|---------|-----|-------------|
| OpenFN | http://localhost:4000 | root@openhim.org / instant101 |
| DHIS2 | http://localhost:8080 | admin / district |
| SFTP | sftp://localhost:2225 | openfn / instant101 |

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
