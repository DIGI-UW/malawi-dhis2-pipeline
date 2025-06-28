**DHIS2 Export Functionality with Multi-Format Support**

**Purpose:** Export ART supervision and health facility data from multiple CSV/XLSX file formats to the DHIS2 instance using a flexible, configuration-driven approach.

**Description:**

* Process multiple types of health data files including:
  - ART supervision data (quarterly and cumulative reports in long format)
  - Direct Queries reports (MoH quarterly reports)
  - Data Quality (DQ) reports for health facilities
* Implement a configuration-based mapping system that allows easy adaptation to new file formats without code changes
* Support both periodic scheduled imports and real-time imports triggered by SFTP file uploads

**Key Deliverables:**

### 1. **File Type Configuration System**
* **Configuration Structure:**
  - Individual configuration files for each file type (e.g., `art_data_config.json`, `dq_sites_config.json`)
  - Configuration schema supporting:
    - File pattern matching (regex or glob patterns)
    - Column mapping definitions (source column → DHIS2 data element)
    - Data transformation rules (value formatting, calculations)
    - Validation rules (required fields, data types, value ranges)
    - Period extraction patterns (date formatting rules)
    - Organization unit mapping strategies

### 2. **DHIS2 Metadata Mapping System**
* **Dynamic Mapping Configuration:**
  - Central metadata mapping file linking indicator names/codes to DHIS2 UIDs
  - Organization unit hierarchy mapping (facility names → DHIS2 org unit IDs)
  - Category option combo mappings for disaggregated data
  - Support for both exact and fuzzy matching algorithms
* **Auto-generated Org Unit List:**
  - Extract unique organization units from sample CSV/XLSX files
  - Generate preliminary mapping template for manual completion

### 3. **Multi-Format Data Import Pipeline**
* **File Processing Engine:**
  - Support for CSV, XLSX (multiple sheets), and XLS formats
  - Automatic file type detection based on extension and content
  - Robust error handling for malformed files
  - Progress tracking and resumable imports for large files
* **Data Transformation Module:**
  - Apply configuration-based column mappings
  - Handle different date/period formats (YYYYMM, YYYY-QQ, DD/MM/YYYY)
  - Aggregate or disaggregate data as needed
  - Calculate derived indicators based on configuration rules

### 4. **Workflow Automation System**
* **OpenFN Workflow Configuration:**
  - SFTP file watcher workflow (triggered on new file uploads)
  - Scheduled workflow (configurable interval, default 5 minutes for testing)
  - File processing queue management
  - Parallel processing support for multiple files
* **Workflow Components:**
  - SFTP file discovery and download
  - File type identification and configuration selection
  - Data extraction and validation
  - DHIS2 payload generation
  - Upload to DHIS2 with conflict resolution

### 5. **API Integration Module**
* **DHIS2 Data Management:**
  - Authenticated data submission using `/api/dataValueSets` endpoint
  - Intelligent conflict resolution (update vs. create)
  - Batch processing with configurable chunk sizes
  - Transaction rollback on critical errors
* **Data Overwrite Rules:**
  - Time-based protection (default: only update data < 3 months old)
  - Configurable time intervals per file type
  - Audit trail of all data modifications
  - Dry-run mode for testing

### 6. **Monitoring and Logging System**
* **Comprehensive Logging:**
  - File processing status (received, processing, completed, failed)
  - Data validation results with row-level error details
  - DHIS2 import summaries (created, updated, ignored, conflicts)
  - Performance metrics (processing time, records/second)
* **Alerting System:**
  - Email/webhook notifications for failures
  - Summary reports of daily/weekly processing

### 7. **Testing Infrastructure**
* **Automated Testing Framework:**
  - **Location:** `projects/indicator_workflow_testing/` directory
  - **API Tests:** Health checks, authentication, workflow validation (`tests/api-tests.sh`)
  - **Excel Tests:** Multi-sheet parsing and validation (`tests/excel-parsing-tests.js`)
  - **SFTP Tests:** File transfer and workflow integration (`tests/sftp-integration-tests.sh`)
  - **Integration Tests:** End-to-end data processing validation (`tests/integration-tests.js`)
  - **Test Runner:** Unified test execution with `./run-tests.sh`
* **Docker Swarm Test Environment:**
  - Pre-configured SFTP server with sample data files
  - Test DHIS2 instance with sample metadata
  - OpenFN instance with pre-loaded workflows
  - PostgreSQL database for state management
* **Test Data Sets:**
  - Sample files for each supported format
  - Test cases for edge conditions (empty files, missing columns, invalid data)
  - Performance test data (large files with 100k+ rows)

### 8. **User Documentation**
* **Configuration Guide:**
  - Step-by-step guide for adding new file type configurations
  - Column mapping reference with examples
  - Troubleshooting common issues
* **Operations Manual:**
  - Deployment instructions using Docker Swarm
  - Monitoring and maintenance procedures
  - Backup and recovery processes
* **API Reference:**
  - Configuration schema documentation
  - Workflow trigger endpoints
  - Status and monitoring endpoints

### 9. **Security and Compliance**
* **Data Protection:**
  - Encryption of data in transit (SFTP, HTTPS)
  - Secure credential management using Docker secrets
  - Access control for configuration files
  - PII data handling compliance

### 10. **Performance Optimization**
* **Scalability Features:**
  - Concurrent file processing
  - Memory-efficient streaming for large files
  - Caching of frequently used metadata mappings
  - Database connection pooling

**Success Criteria:**
- Successfully process all three sample file types
- Process files within 5 minutes of SFTP upload
