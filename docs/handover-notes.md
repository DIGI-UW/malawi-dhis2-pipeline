# DHIS2 Pipeline Handover & Maintenance Notes

## System Overview
This project uses OpenFn to ingest indicator files (XLSX & CSV) from an SFTP server, parse metadata, prepare DHIS2 metadata structures (OrgUnits, Data Elements, Categories), and upload data values.

## Current Implementation Status

### Workflow Structure
- **Job 0 (`00-scan-sftp-for-changes.js`)**: Scans SFTP, manages locking, and holds the **centralized configuration** (`FILE_TYPE_CONFIGS`).
- **Job 1 (`01-check-and-setup-processing.js`)**: Validates the configuration selected by Job 0.
- **Job 2 (`02-parse-excel-metadata.js`)**: Parses file headers and metadata to build DHIS2 structures.
- **Job 3 (`03-check-and-setup-metadata.js`)**: Creates/Verifies DHIS2 metadata (Categories, Data Elements, Data Sets, Org Units).
- **Job 4 (`04-process-all-chunks-sequentially.js`)**: Streams file chunks, maps data to DHIS2 values, and uploads them.

### Known Technical Debt

1.  **PEPFAR MMD Hardcoded Logic:**
    *   **Issue:** Special handling for `pepfar_tx_mmd_csv` is hardcoded in Job 3 (lines 69-88) and Job 4 (lines 402-425).
    *   **Job 3:** Injects "MMD Duration" category manually.
    *   **Job 4:** Splits a single CSV row into 3 data values (<3, 3-5, >=6 months).
    *   **Refactoring Goal:** This should be configuration-driven. The `FILE_TYPE_CONFIGS` schema should be extended to support `multiValueMapping` or `splitMapping` to avoid hardcoding file types in the job logic.

2.  **Utility Duplication:**
    *   Functions like `generateCodeFromName`, `normalizePeriod`, `mapColumns` are repeated across Job 2, 3, and 4.
    *   *Status:* `generateCodeFromName` has been standardized to use `globalThis.util` if available, with a consistent fallback.

3.  **Adaptor Logic in Jobs:**
    *   Job 3 contains significant DHIS2 API orchestration logic (`createCategories`, `createDataElements`, etc.) that ideally belongs in the `@openfn/language-dhis2` adaptor.

## Historical Troubleshooting & Key Learnings (October 2025)

### Data Element & Category Combo Issues
**Problem:** Duplicate data values were being created in DHIS2 because all data used the default category option combo (`HllvX50cXC0`) instead of being disaggregated.

**Root Cause:** `createDataElements()` in Job 3 was not assigning the custom category combo to data elements at creation time. In DHIS2, disaggregation is defined at the Data Element level.

**Fix Implemented:**
- Updated `createDataElements` to accept `categoryCombinationId`.
- Payload now includes `categoryCombo: { id: categoryCombinationId }`.

**Key Lessons:**
1.  **Category combos belong to data elements**, not datasets.
2.  **Disaggregation is defined at data element level** in DHIS2.
3.  **Always assign categoryCombo when creating data elements** that need disaggregation.

## Refactoring Plan (Future Work)

### Priority 1: Move DHIS2 Metadata Operations to Adaptor
Migrate `createCategories`, `createDataElements`, `createDataSet`, `checkAndCreateIntegrationUser` to the adaptor to simplify Job 3.

### Priority 2: Centralize Configuration
Move `FILE_TYPE_CONFIGS` from Job 0 to a dedicated JSON file or adaptor configuration to separate config from logic.

### Priority 3: Generalize MMD Logic
Remove `if (fileType === 'pepfar_tx_mmd_csv')` checks by implementing a generic "row-splitting" configuration feature.
