# Feature Specification: DHIS2 Indicator Loading Pipeline

**Feature Branch**: `001-dhis2-indicator-loading`
**Created**: 2025-11-24
**Status**: Approved
**Input**: User description: "Automated pipeline for importing HIV/TB health indicators from Excel/CSV files into DHIS2"

## Clarifications

### Session 2025-11-24

- Q: Success metrics focus → A: Documentation completeness for handover, not performance metrics
- Q: Edge case complexity → A: Simplified to essential scenarios
- Q: Custom adaptors → A: Uses forked adaptors in openfn-custom-adaptors submodule

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Data Partner Uploads Indicator File (Priority: P1)

Data partners need to submit HIV/TB indicator data files (Excel/CSV) to the health information system without manual intervention. They upload files to a secure file server and expect the data to automatically appear in DHIS2.

**Why this priority**: This is the core functionality - without automated file uploads, the entire pipeline has no purpose. All other features depend on this capability.

**Independent Test**: Can be fully tested by uploading a sample Excel file to SFTP and verifying the data appears in DHIS2.

**Acceptance Scenarios**:

1. **Given** a data partner has a valid ART supervision Excel file, **When** they upload it to the SFTP server, **Then** the system automatically detects, processes, and imports the data into DHIS2
2. **Given** a data partner uploads a file that has already been processed, **When** the system detects the file, **Then** it skips reprocessing based on filesIndex state
3. **Given** a data partner uploads a file with an unsupported format, **When** the system scans the file, **Then** it skips the file and logs a warning message

---

### User Story 2 - System Administrator Adds New File Format (Priority: P2)

System administrators need to add support for new data file formats as health programs evolve. They should be able to configure new file types (column mappings, transformations, validation rules) without modifying workflow code.

**Why this priority**: The system must be extensible to accommodate changing requirements. Without configuration-driven formats, every new file type requires developer intervention.

**Independent Test**: Can be tested by adding a new entry to FILE_TYPE_CONFIGS in Job 0 and uploading a sample file that matches the new pattern.

**Acceptance Scenarios**:

1. **Given** a system administrator defines a new file type configuration specifying column mappings and file patterns, **When** a file matching that pattern is uploaded, **Then** the system processes it according to the new configuration
2. **Given** a new file format requires custom date parsing, **When** the administrator configures the date transformation rule, **Then** the system correctly parses and converts dates to DHIS2 period format (YYYYMM, YYYY-Qx)

---

### User Story 3 - System Administrator Deploys Pipeline to Production (Priority: P1)

System administrators need to deploy the pipeline to a production DHIS2 instance with proper credentials and security. They need clear guidance on credential configuration and permission requirements.

**Why this priority**: Deployment is essential for the system to deliver value. Clear documentation enables the local team to set up and maintain the system independently on the government DHIS2 instance.

**Independent Test**: Can be fully tested by following the deployment guide to set up a new instance and successfully processing a test file.

**Acceptance Scenarios**:

1. **Given** a system administrator follows the deployment guide, **When** they configure the pipeline with correct DHIS2 credentials in the OpenFN web UI, **Then** the system successfully connects and imports data
2. **Given** the DHIS2 service account lacks required permissions, **When** the system attempts to import data, **Then** it fails with a clear error message indicating which permissions are missing
3. **Given** the DHIS2 metadata (data elements, org units) does not exist, **When** the system attempts to process a file, **Then** it auto-creates the missing metadata (if configured) or reports exactly which mappings are missing

---

### User Story 4 - Data Consumer Views Imported Indicators (Priority: P3)

Health program managers need to view the imported HIV/TB indicators in DHIS2 dashboards. They expect data to be correctly disaggregated by age, gender, facility, and time period.

**Why this priority**: Data consumers are the ultimate beneficiaries, but their needs are met through DHIS2's existing reporting capabilities once data is correctly imported.

**Independent Test**: Can be tested by querying DHIS2 for imported data values and verifying disaggregation matches source file.

**Acceptance Scenarios**:

1. **Given** an ART data file with age/gender disaggregation has been processed, **When** a user queries DHIS2, **Then** they see data correctly disaggregated by all category options
2. **Given** multiple files from different time periods have been imported, **When** a user generates a trend report, **Then** data appears correctly organized by period

---

### User Story 5 - System Administrator Monitors Pipeline Health (Priority: P3)

System administrators need to monitor the pipeline's operational status, view processing logs, and troubleshoot failures.

**Why this priority**: Monitoring is essential for production operations but is secondary to core data processing functionality.

**Independent Test**: Can be tested by triggering both successful and failed imports and verifying all events are logged via OpenFN Activity tab.

**Acceptance Scenarios**:

1. **Given** the pipeline is processing files, **When** an administrator checks the OpenFN Activity tab, **Then** they see the status of workflow runs (success, failure, pending)
2. **Given** a file processing fails, **When** the administrator reviews the run logs, **Then** they see error details and can identify the cause

---

### Edge Cases

- **Invalid data values**: System validates data and rejects invalid rows while processing valid ones; invalid rows are logged with details
- **Missing required columns**: System logs missing column names and skips the file
- **DHIS2 unavailable**: Workflow fails with error; administrator can manually re-trigger via OpenFN UI
- **Duplicate data uploads**: System uses CREATE_AND_UPDATE import strategy - newer values overwrite existing ones for the same org unit/period/indicator

## Data Sources & File Types

### Data Sources

| Source | Description | Format |
|--------|-------------|--------|
| **PEPFAR** | HIV treatment indicators from PEPFAR program | CSV |
| **MOH/ART** | Ministry of Health ART supervision data | XLSX |
| **MOH/DQ** | Data quality reports from MOH | XLSX |
| **MOH CSV** | MOH quarterly reports (pending configs) | CSV |

### Currently Configured File Types (8)

| Config Key | Source | Pattern | Description |
|------------|--------|---------|-------------|
| pepfar_tx_curr_csv | PEPFAR | PEPFAR_TxCURR*.csv | TX_CURR treatment current |
| pepfar_tx_mmd_csv | PEPFAR | PEPFAR_TxCURRMMD*.csv | TX_MMD multi-month dispensing |
| pepfar_tx_ml_csv | PEPFAR | PEPFAR_TxML*.csv | TX_ML treatment loss |
| pepfar_tx_new_csv | PEPFAR | PEPFAR_TxNEW*.csv | TX_NEW new on treatment |
| pepfar_tx_rtt_csv | PEPFAR | PEPFAR_TxRTT*.csv | TX_RTT return to treatment |
| art_data_long_format | MOH/ART | ART_data_long*.xlsx | ART supervision data |
| dq_sites | MOH/DQ | *Q*FY*DQ*sites*.xlsx | Data quality reports |
| moh_direct_queries | MOH | *Direct*Queries*.xlsx | Direct query reports |

### Pending MOH CSV File Types (6)

| Config Key | Pattern | Sample File |
|------------|---------|-------------|
| moh_cohort_report | MoH_CohortReport*.csv | MoH_CohortReport_2025_Q1_*.csv |
| moh_regimen_distribution | MoH_RegimenDistribution*.csv | MoH_RegimenDistributionByWeight_*.csv |
| moh_survival_general | MoH_SurvivalAnalysisGeneral*.csv | MoH_SurvivalAnalysisGeneral_*.csv |
| moh_survival_women | MoH_SurvivalAnalysisWomen*.csv | MoH_SurvivalAnalysisWomen_*.csv |
| moh_survival_children | MoH_SurvivalAnalysisChildren*.csv | MoH_SurvivalAnalysisChildren_*.csv |
| moh_tpt_initiations | MoH_TPTNewInitiations*.csv | MoH_TPTNewInitiations_*.csv |

**MOH CSV Filename Convention**: `MoH_{ReportType}_{YEAR}_{QUARTER}_{VERSION}_{TIMESTAMP}.csv`

### Sample Data Locations

- PEPFAR CSV: `projects/sftp/data/samples/pepfar/`
- MOH CSV (pending): `projects/sftp/data/samples/moh/`
- XLSX files: `projects/sftp/data/excel-files/`

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically detect new files uploaded to the SFTP server via scheduled cron trigger
- **FR-002**: System MUST support multiple file formats: CSV (PEPFAR, MOH) and XLSX (ART Data, DQ Sites, Direct Queries)
- **FR-003**: System MUST process files according to configuration-defined column mappings (FILE_TYPE_CONFIGS in Job 0)
- **FR-004**: System MUST validate data against configured rules (required fields, data types)
- **FR-005**: System MUST transform dates and periods to DHIS2-compatible format (YYYYMM, YYYY-Qx)
- **FR-006**: System MUST map facility names to DHIS2 organization unit IDs (via Job 3 upsert logic)
- **FR-007**: System MUST auto-create missing DHIS2 metadata (org units, data elements, categories) using admin credentials
- **FR-008**: System MUST handle large files through chunked processing with per-chunk state tracking
- **FR-009**: System MUST track file processing status in state.filesIndex (status, lastSuccessfulChunk)
- **FR-010**: System MUST support resume capability for interrupted processing using lastSuccessfulChunk tracking
- **FR-011**: System MUST log all import operations via OpenFN run history for troubleshooting
- **FR-012**: System MUST provide clear error messages when credential configuration is incorrect
- **FR-013**: System MUST use custom SFTP and DHIS2 adaptors from the openfn-custom-adaptors submodule

### Key Entities

- **Indicator File**: Health data file (CSV/XLSX) containing rows of indicator values with columns for facility, period, indicator name, disaggregations, and value
- **File Type Configuration**: Inline configuration in Job 0 (FILE_TYPE_CONFIGS) defining file patterns, column mappings, transformations, and validation rules
- **filesIndex**: State object tracking processing status per file (status, lastSuccessfulChunk, dhis2Mappings)
- **DHIS2 Metadata Mapping**: Runtime lookup tables linking source names/codes to DHIS2 UIDs for org units, data elements, and category option combos (built by Job 3)

## Success Criteria *(mandatory)*

### Documentation & Handover Readiness

- **SC-001**: Deployment guide enables local team to configure pipeline on a new DHIS2 instance without developer assistance
- **SC-002**: Credential configuration steps (OpenFN web UI, DHIS2 permissions) are documented with clear step-by-step instructions
- **SC-003**: Troubleshooting guide covers common deployment failures (wrong URL, missing permissions, metadata mismatches)
- **SC-004**: Sample test files are provided for each supported file type (8 configured: PEPFAR CSV, ART Data, DQ Sites, Direct Queries; 6 pending: MOH CSV types)
- **SC-005**: Local team can independently add support for new file formats using configuration documentation

### Functional Completeness

- **SC-006**: All 8 configured file formats (5 PEPFAR CSV + 3 XLSX) process successfully with correct disaggregation
- **SC-007**: Failed imports produce actionable error messages visible in OpenFN Activity logs
- **SC-008**: System correctly creates DHIS2 metadata (org units, data elements, category combos) when processing new data

## Implementation Notes

### Custom Adaptors

The pipeline uses forked/customized OpenFN adaptors in the `projects/openfn-custom-adaptors` submodule:

- **@openfn/language-sftp**: Handles SFTP file operations (list, getCSV, stream)
- **@openfn/language-dhis2**: Handles DHIS2 API operations (create, update, get with proper authentication)

These adaptors include fixes for SFTP authentication handling and enhanced DHIS2 metadata operations.

### Workflow Structure

The pipeline consists of four chained jobs (numbered 0-4 in code):

1. **Job 0 (scan)**: Scan SFTP for files, select next file, load FILE_TYPE_CONFIGS
2. **Job 1 (setup)**: Validate configuration and prepare processing context
3. **Job 2 (parse)**: Parse Excel/CSV metadata, build dhis2Structures
4. **Job 3 (metadata)**: Create/resolve DHIS2 metadata using admin credentials
5. **Job 4 (upload)**: Stream chunks and upload data values using integration user credentials

### Credential Configuration

Two credential types required in OpenFN:

- **dhis2-credential (admin)**: For metadata creation (Job 3) - must point to target DHIS2 server URL
- **combined-sftp-dhis2-credential**: SFTP access + integration user for data upload (Job 4)

**Critical for government deployment**: Credentials must be updated in OpenFN web UI to point to the correct government DHIS2 server URL with valid service account credentials.

## Assumptions

- SFTP server is accessible from the pipeline and file uploads are authenticated
- DHIS2 instance is running and accessible with valid admin credentials for initial metadata setup
- Service account (openfn_integration) can be configured with data import permissions on target org units
- File formats follow consistent column naming conventions within each file type
- Network connectivity between Docker services is reliable

## Out of Scope

- Source data validation at the partner level (garbage in, garbage out)
- Bi-directional sync (this is one-way import only)
- Real-time streaming (batch file processing only)
- Mobile data collection interfaces
- Custom DHIS2 dashboards or visualizations
- User authentication for data partners beyond SFTP credentials
