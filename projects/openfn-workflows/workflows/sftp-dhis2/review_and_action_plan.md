## SFTP-to-DHIS2 Workflow Review & Action Plan

### 1. Overview

This document outlines a review of the `sftp-dhis2` workflow, focusing on its ability to process files according to the `art_data_long_format.json` configuration and upload them to DHIS2. The review identified several critical issues in the data processing logic, configuration management, and DHIS2 payload generation.

The following sections detail the findings and the proposed plan to fix them.

### 2. Key Findings

The review surfaced four main areas of concern:

**A. In-memory File Handling:**
- **Issue:** The `download-sftp-files.js` job saves files to a temporary local path (`/tmp/openfn-downloads/`). However, each OpenFN job runs in an isolated environment, and the filesystem is not shared between jobs. The subsequent `process-excel-data.js` job cannot access this path.
- **Best Practice:** File content should be passed between jobs via the state object. The `get` operation in `@openfn/language-sftp` can return file content as a buffer when not provided with a second argument (a file path).

**B. Mocked & Incomplete Excel Parsing:**
- **Issue:** `process-excel-data.js` contains mocked logic for configuration loading and Excel parsing. It does not read external configuration files or process the downloaded file from the state. The core mapping logic based on `art_data_long_format.json` is not implemented.
- **Best Practice:** Jobs should be self-contained or receive all necessary information via the state. Excel parsing logic should be robust and use the provided `xlsx` library.

**C. Hardcoded DHIS2 Payload Values:**
- **Issue:** `generate-dhis2-payload.js` contains hardcoded values, such as `orgUnit: 'MW'`, which overrides the actual data extracted from the file. This prevents data from being assigned to the correct organization units.
- **Best Practice:** Payloads should be generated dynamically based entirely on the input data and configuration.

**D. Missing DHIS2 Category Option Combo Resolution:**
- **Issue:** The workflow correctly identifies disaggregations (like age and gender) but does not resolve them into the `categoryOptionCombo` UIDs required by DHIS2. The DHIS2 API will reject data values with unresolved category options.
- **Best Practice:** Before uploading, the workflow must map the combination of category options (e.g., "Female", "25-49") to a specific DHIS2 `categoryOptionCombo` UID. This typically requires an API call to DHIS2.

### 3. Action Plan

To address these issues, I will perform the following modifications:

1.  **Update `download-sftp-files.js`:**
    *   Modify the `get` operation to read the file content directly into the state as a buffer instead of saving it to a temporary local path. This makes the file content available to the next job.

2.  **Rewrite `process-excel-data.js`:**
    *   Embed the `art_data_long_format.json` configuration directly into the job for portability and to resolve the file access issue.
    *   Implement the Excel parsing logic using the `xlsx` library to read the file buffer from the state.
    *   Implement the column mapping logic to transform raw Excel rows into structured data based on the embedded configuration.
    *   Implement the data transformation and validation logic as specified in the configuration.

3.  **Refactor `generate-dhis2-payload.js`:**
    *   Remove the hardcoded `orgUnit: 'MW'` to ensure the correct organization unit from the data is used.
    *   Add a placeholder for the `categoryOptionCombo` resolution, clearly marking what is missing. The current implementation will group data values by their category options, preparing them for resolution in a future step (which is outside the scope of the current fix but is now made explicit).

4.  **Update Documentation (`README.md`):**
    *   Add a note about the new requirement for `categoryOptionCombo` resolution and how the configuration-driven approach works.

These changes will create a functional, robust, and more maintainable workflow that correctly processes SFTP data according to the specified format and prepares it for DHIS2 import.