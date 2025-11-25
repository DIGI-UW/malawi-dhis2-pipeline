# Implementation Plan: DHIS2 Indicator Loading Pipeline

**Branch**: `001-dhis2-indicator-loading` | **Date**: 2025-11-24 | **Spec**: [spec.md](./spec.md)

## Summary

Configuration-driven data integration pipeline that automates the import of HIV/TB health indicators from Excel/CSV files into DHIS2. Built on OpenFN (workflow automation) and Instant OpenHIE v2, deployed via Docker Swarm with SFTP-based file monitoring.

**Status**: Implementation complete. Polish tasks in progress.

## Technical Context

**Language/Version**: JavaScript (ES6+) via OpenFN workflow jobs
**Primary Dependencies**:
- OpenFN Lightning v2.8+ (workflow orchestration)
- Custom @openfn/language-sftp@2.1.0-custom adaptor
- Custom @openfn/language-dhis2@7.1.3-custom adaptor
- Docker Swarm (container orchestration)
- Instant OpenHIE v2 (deployment framework)

**Storage**:
- OpenFN internal state (workflow state persistence via `filesIndex`)
- DHIS2 PostgreSQL (indicator data storage)
- SFTP file system (source file storage)

**Testing**:
- Shell-based test runner (`projects/indicator_workflow_testing/run-tests.sh`)
- API connectivity tests
- SFTP integration tests
- End-to-end workflow tests

**Target Platform**: Linux server (Ubuntu 20.04+), Docker Swarm cluster
**Project Type**: Multi-service Docker Swarm deployment
**Constraints**: Must work with government DHIS2 instance, offline-capable after initial setup

## Constitution Check

*Note: Project constitution is a template - no specific gates enforced.*

The implementation follows OpenFN design principles documented in:
- `docs/07-openfn-design-compliance.md`
- `docs/08-dhis2-pattern-examples.md`

## Project Structure

### Documentation (this feature)

```text
specs/001-dhis2-indicator-loading/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Key decisions and alternatives
├── data-model.md        # Entity documentation
├── quickstart.md        # Handover quick start guide
└── checklists/
    └── requirements.md  # Validation checklist
```

### Source Code (repository root)

```text
projects/
├── openfn-workflows/
│   ├── workflows/upload-indicator-files-to-dhis2/
│   │   ├── project.yaml                    # Workflow definition
│   │   ├── jobs/
│   │   │   ├── 00-scan-sftp-for-changes.js    # SFTP scanning + FILE_TYPE_CONFIGS
│   │   │   ├── 01-check-and-setup-processing.js # Config validation
│   │   │   ├── 02-parse-excel-metadata.js     # Excel/CSV parsing
│   │   │   ├── 03-check-and-setup-metadata.js # DHIS2 metadata upsert
│   │   │   └── 04-process-all-chunks-sequentially.js # Data upload
│   │   └── test/                           # Workflow tests
│   └── configs/                            # File type configurations
│
├── openfn-custom-adaptors/                 # Git submodule
│   └── packages/
│       ├── sftp/                           # Custom SFTP adaptor
│       └── dhis2/                          # Custom DHIS2 adaptor
│
├── indicator_workflow_testing/             # Test framework
│   ├── run-tests.sh                        # Main test runner
│   └── tests/                              # Test implementations
│
└── sftp/
    └── data/
        ├── excel-files/                    # Production sample files
        └── samples/                        # Test samples by type

packages/
├── openfn/                                 # OpenFN Lightning deployment
├── dhis2-instance/                         # DHIS2 server config
├── sftp-storage/                           # SFTP server with bundled files
├── database-postgres/                      # PostgreSQL config
└── reverse-proxy-nginx/                    # Nginx proxy config

docs/                                        # Consolidated documentation
├── 01-overview.md                          # Project architecture
├── 02-development-guide.md                 # Workflow development
├── 03-testing-strategy.md                  # Testing approach
├── 06-troubleshooting.md                   # Common issues
├── 07-openfn-design-compliance.md          # Design patterns
├── 08-dhis2-pattern-examples.md            # DHIS2 patterns
├── environment-setup.md                    # Installation guide
├── production-deployment.md                # Production deployment guide
├── handover-notes.md                       # Technical handover notes
└── Deliverables.md                         # Original requirements
```

**Structure Decision**: Multi-project Docker Swarm deployment following Instant OpenHIE v2 patterns.

## Implementation History

### Development Timeline (from git history)

| Phase | Date Range | Key Work | Commits |
|-------|-----------|----------|---------|
| POC | 2025-06-05 | Initial pipeline implementation | 1 |
| Core Development | 2025-06-06 - 2025-06-30 | Workflow deployment, SFTP fixes | ~25 |
| Workflow Refinement | 2025-07-01 - 2025-07-31 | Testing, workflow updates, CI/CD | ~30 |
| Simplification | 2025-08-01 - 2025-09-30 | Chunking, memory efficiency, refactoring | ~25 |
| Production Readiness | 2025-10-01 - 2025-11-24 | Documentation, production deployment | ~25 |

**Total Commits**: 106
**Total Workflow LOC**: ~2,100 lines across 5 job files

### Key Milestones Achieved

1. **POC Complete** (June 2025): Basic SFTP-to-DHIS2 data flow working
2. **Workflow Stabilization** (July 2025): CI/CD, testing framework, routing
3. **Chunking Architecture** (August 2025): Memory-efficient processing for large files
4. **Configuration System** (September 2025): FILE_TYPE_CONFIGS for multi-format support
5. **Production Deployment** (October 2025): GHII successfully deployed on their servers
6. **Documentation** (November 2025): Specification and handover docs

## Completed Work Summary

### FR-001 to FR-013 Implementation Status

| Requirement | Status | Implementation Location |
|-------------|--------|------------------------|
| FR-001: SFTP file detection | ✅ Done | Job 00, cron trigger in project.yaml |
| FR-002: CSV/XLSX support | ✅ Done | Job 02, xlsx-stream parsing |
| FR-003: Configuration-driven mappings | ✅ Done | FILE_TYPE_CONFIGS in Job 00 |
| FR-004: Data validation | ✅ Done | Job 02, Job 04 validation logic |
| FR-005: Date transformation | ✅ Done | Job 02, normalizePeriod() |
| FR-006: Org unit mapping | ✅ Done | Job 03, upsert logic |
| FR-007: DHIS2 metadata auto-create | ✅ Done | Job 03, createCategories/DataElements |
| FR-008: Chunked processing | ✅ Done | Job 04, state.lastSuccessfulChunk |
| FR-009: File status tracking | ✅ Done | state.filesIndex throughout |
| FR-010: Resume capability | ✅ Done | Job 04, chunk tracking |
| FR-011: OpenFN logging | ✅ Done | Run history in OpenFN UI |
| FR-012: Credential error messages | ✅ Done | Job 03, fail-fast errors |
| FR-013: Custom adaptors | ✅ Done | openfn-custom-adaptors submodule |

### Supported File Types

**Currently Configured (8 types):**

| Config Key | Source | Pattern | Status |
|------------|--------|---------|--------|
| pepfar_tx_curr_csv | PEPFAR | PEPFAR_TxCURR*.csv | ✅ Working |
| pepfar_tx_mmd_csv | PEPFAR | PEPFAR_TxCURRMMD*.csv | ✅ Working |
| pepfar_tx_ml_csv | PEPFAR | PEPFAR_TxML*.csv | ✅ Working |
| pepfar_tx_new_csv | PEPFAR | PEPFAR_TxNEW*.csv | ✅ Working |
| pepfar_tx_rtt_csv | PEPFAR | PEPFAR_TxRTT*.csv | ✅ Working |
| art_data_long_format | MOH/ART | ART_data_long*.xlsx | ✅ Working |
| dq_sites | MOH/DQ | *Q*FY*DQ*sites*.xlsx | ✅ Working |
| moh_direct_queries | MOH | *Direct*Queries*.xlsx | ✅ Working |

**Pending MOH CSV Types (6 types):**

| Proposed Key | Pattern | Sample Available | Status |
|--------------|---------|------------------|--------|
| moh_cohort_report | MoH_CohortReport*.csv | ✅ | Pending config |
| moh_regimen_distribution | MoH_RegimenDistribution*.csv | ✅ | Pending config |
| moh_survival_general | MoH_SurvivalAnalysisGeneral*.csv | ✅ | Pending config |
| moh_survival_women | MoH_SurvivalAnalysisWomen*.csv | ✅ | Pending config |
| moh_survival_children | MoH_SurvivalAnalysisChildren*.csv | ✅ | Pending config |
| moh_tpt_initiations | MoH_TPTNewInitiations*.csv | ✅ | Pending config |

### Test Data Available

**XLSX Files** - `projects/sftp/data/excel-files/`:
- `ART_data_long_format.xlsx`
- `Q2FY25_DQ_253_sites.xlsx`
- `Direct Queries - Q1 2025 MoH Reports.xlsx`

**PEPFAR CSV** - `projects/sftp/data/samples/pepfar/`:
- `PEPFAR_TxCURR_*.csv`
- `PEPFAR_TxCURRMMD_*.csv`
- `PEPFAR_TxML_*.csv`
- `PEPFAR_TxNEW_*.csv`
- `PEPFAR_TxRTT_*.csv`

**MOH CSV (pending configs)** - `projects/sftp/data/samples/moh/`:
- `MoH_CohortReport_*.csv`
- `MoH_RegimenDistributionByWeight_*.csv`
- `MoH_SurvivalAnalysisGeneral_*.csv`
- `MoH_SurvivalAnalysisWomen_*.csv`
- `MoH_SurvivalAnalysisChildren_*.csv`
- `MoH_TPTNewInitiations_*.csv`

## Polish Tasks

See [tasks.md](./tasks.md) for detailed task list. Key areas:

- Production deployment documentation
- Credential configuration guides
- FILE_TYPE_CONFIGS customization guide
- MOH CSV file type configs (6 types)

### Deployment Notes

1. **Government Instance**: Credentials must point to correct DHIS2 URL
2. **Service Account**: openfn_integration user needs org unit assignment
3. **Metadata**: DHIS2 metadata UIDs must match or be auto-created

## Complexity Tracking

| Decision | Why Needed | Simpler Alternative |
|----------|------------|---------------------|
| Custom adaptors | Official adaptors had auth issues | Would require upstream fixes |
| 5-job workflow | Separate concerns, resumability | Single job would lose state on failure |
| FILE_TYPE_CONFIGS inline | Quick iteration during development | External JSON files (planned refactor) |
