# Migration Guide: PostgreSQL to Google Sheets

This document outlines the migration from a PostgreSQL-based data extraction approach to a Google Sheets-based approach for the Malawi DHIS2 Indicators project.

## Overview of Changes

The refactoring replaced the PostgreSQL database dependency with a direct Google Sheets to DHIS2 pipeline, simplifying the architecture and reducing infrastructure complexity.

## Architecture Changes

### Before (PostgreSQL Approach)
```
[PostgreSQL Database] → [OpenMRS Adaptor] → [SQL Queries] → [DHIS2 Payload] → [DHIS2 Upload]
```

### After (Google Sheets Approach)
```
[Google Sheets] → [Google Sheets Adaptor] → [Data Processing] → [DHIS2 Payload] → [DHIS2 Upload]
```

## File Changes Summary

### Removed Files
- `packages/openfn/importer/workflows/reports-data-upload-workflow/jobs/sql.js`
- `packages/openfn/importer/workflows/reports-data-upload-workflow/jobs/get-report-data.js`
- `packages/openfn/importer/workflows/state/get-report-data.json`

### Modified Files

#### 1. Project Configuration
**File:** `packages/openfn/importer/workflows/reports-data-upload-workflow/project.yaml`

**Changes:**
- Updated workflow name to "reports-data-upload-workflow-google-sheets"
- Replaced `@openfn/language-openmrs` with `@openfn/language-googlesheets@3.0.13`
- Updated credential references to include Google Sheets credentials
- Modified job sequence to use `get-googlesheets-data.js`

**Before:**
```yaml
adaptors:
  - "@openfn/language-openmrs@latest"
  - "@openfn/language-common@latest"
  - "@openfn/language-dhis2@latest"

workflows:
  reports-data-upload-workflow:
    jobs:
      get-report-data:
        adaptor: "@openfn/language-openmrs@latest"
        credential: admin@example.org-OpenMRS
```

**After:**
```yaml
adaptors:
  - "@openfn/language-googlesheets@3.0.13"
  - "@openfn/language-common@latest"
  - "@openfn/language-dhis2@latest"

workflows:
  reports-data-upload-workflow-google-sheets:
    jobs:
      get-googlesheets-data:
        adaptor: "@openfn/language-googlesheets@3.0.13"
        credential: admin@example.org-GoogleSheets
```

#### 2. Data Extraction Job
**File:** `packages/openfn/importer/workflows/reports-data-upload-workflow/jobs/get-googlesheets-data.js`

**New Implementation:**
- Uses Google Sheets API for data retrieval
- Configurable column mapping
- Data validation and filtering
- Support for multiple data formats

**Key Features:**
```javascript
// Configurable data extraction
getValues({
  spreadsheetId: state.googleSheetsConfig.spreadsheetId,
  range: state.googleSheetsConfig.range,
  majorDimension: state.googleSheetsConfig.majorDimension,
  valueRenderOption: state.googleSheetsConfig.valueRenderOption
})

// Data processing and validation
.then((response) => {
  const rows = response.data.values || [];
  // Process and validate data
  return { ...state, extractedData: processedData };
})
```

#### 3. Payload Generation Job
**File:** `packages/openfn/importer/workflows/reports-data-upload-workflow/jobs/generate-dhis2-payload.js`

**Changes:**
- Updated to process Google Sheets data instead of SQL results
- Enhanced indicator mapping logic
- Added support for partial name matching
- Improved error handling and logging

**Key Changes:**
```javascript
// Before: Processing SQL results
const sqlResults = state.data;

// After: Processing Google Sheets data
const extractedData = state.extractedData || [];
```

#### 4. DHIS2 Upload Job
**File:** `packages/openfn/importer/workflows/reports-data-upload-workflow/jobs/upload-to-dhis2.js`

**Enhancements:**
- Better error handling
- Enhanced logging
- Improved response tracking
- More detailed success/failure reporting

### New Files

#### 1. Google Sheets State Configuration
**File:** `packages/openfn/importer/workflows/state/get-googlesheets-data.json`

**Purpose:** Configuration for Google Sheets data extraction and processing

**Structure:**
```json
{
  "googleSheetsConfig": {
    "spreadsheetId": "your-spreadsheet-id",
    "range": "Sheet1!A:F",
    "majorDimension": "ROWS",
    "valueRenderOption": "UNFORMATTED_VALUE"
  },
  "dataStructure": {
    "indicatorNameColumn": 0,
    "valueColumn": 1,
    "periodColumn": 2,
    "orgUnitColumn": 3,
    "ageGroupColumn": 4,
    "genderColumn": 5
  },
  "processingConfig": {
    "skipHeaderRow": true,
    "validateNumericValues": true,
    "filterEmptyRows": true,
    "logDataSample": true
  }
}
```

#### 2. Enhanced DHIS2 Payload State
**File:** `packages/openfn/importer/workflows/state/generate-dhis2-payload.json`

**Updates:**
- Added Google Sheets configuration section
- Enhanced indicator mappings with support for partial matching
- Improved DHIS2 payload structure

#### 3. Documentation Files
- `docs/google-sheets-setup.md`: Comprehensive Google Sheets setup guide
- `docs/testing-guide.md`: Testing procedures for the new pipeline
- `scripts/validate-google-sheets.js`: Validation script for Google Sheets connection

## Configuration Migration

### Environment Variables

**New Variables Added:**
```bash
# Google Sheets API Configuration
GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----
GOOGLE_SHEETS_PROJECT_ID=your-google-cloud-project-id
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SHEETS_CLIENT_ID=your-client-id
GOOGLE_SHEETS_SPREADSHEET_ID=your-google-sheets-spreadsheet-id
```

**Variables Removed:**
- PostgreSQL-related variables (now optional for other services)
- OpenMRS-specific configurations

### Credential Setup

**Before:** OpenMRS database credentials
**After:** Google Sheets service account credentials

**Required Setup:**
1. Create Google Cloud project
2. Enable Google Sheets API
3. Create service account
4. Generate and download service account key
5. Share Google Sheets with service account email

## Data Structure Migration

### From SQL Tables to Google Sheets

**Before (SQL):**
- Complex relational database structure
- Multiple tables with joins
- SQL queries for data extraction
- Database-specific data types

**After (Google Sheets):**
- Simple tabular structure
- Single sheet with all required data
- API-based data retrieval
- Standard data types (string, number)

### Data Mapping Changes

**Indicator Mapping:**
- **Before:** Direct column selection from SQL results
- **After:** Configurable column mapping with flexible indicator name matching

**Example Migration:**
```javascript
// Before: SQL-based extraction
const indicators = state.data.map(row => ({
  name: row.indicator_name,
  value: row.indicator_value,
  period: row.reporting_period
}));

// After: Google Sheets-based extraction  
const indicators = state.extractedData
  .filter(row => row[state.dataStructure.indicatorNameColumn])
  .map(row => ({
    name: row[state.dataStructure.indicatorNameColumn],
    value: parseFloat(row[state.dataStructure.valueColumn]),
    period: row[state.dataStructure.periodColumn]
  }));
```

## Workflow Changes

### Job Sequence

**Before:**
1. `get-report-data.js` (SQL execution)
2. `generate-dhis2-payload.js` (SQL result processing)
3. `upload-to-dhis2.js` (DHIS2 upload)

**After:**
1. `get-googlesheets-data.js` (Google Sheets data retrieval)
2. `generate-dhis2-payload.js` (Google Sheets data processing)
3. `upload-to-dhis2.js` (DHIS2 upload with enhanced logging)

### State Management

**Enhanced State Structure:**
```javascript
{
  // Google Sheets configuration
  googleSheetsConfig: { ... },
  dataStructure: { ... },
  processingConfig: { ... },
  
  // Extracted data
  extractedData: [...],
  
  // DHIS2 configuration
  dhis2Config: { ... },
  indicatorMappings: { ... },
  
  // Generated payload
  dhis2Payload: { ... }
}
```

## Benefits of Migration

### 1. Simplified Architecture
- Eliminated PostgreSQL dependency
- Reduced infrastructure complexity
- Faster setup and deployment

### 2. Improved Accessibility
- Non-technical users can manage data in Google Sheets
- Real-time data updates without database management
- Better collaboration on data preparation

### 3. Enhanced Flexibility
- Configurable column mapping
- Support for multiple data formats
- Easy addition of new indicators

### 4. Better Maintainability
- Fewer moving parts
- Simpler debugging
- Reduced operational overhead

## Migration Checklist

For teams migrating existing implementations:

- [ ] ✅ Remove PostgreSQL dependencies
- [ ] ✅ Set up Google Cloud project and Sheets API
- [ ] ✅ Create service account credentials
- [ ] ✅ Migrate data from database to Google Sheets
- [ ] ✅ Update environment variables
- [ ] ✅ Configure indicator mappings
- [ ] ✅ Deploy updated workflows
- [ ] ✅ Test end-to-end pipeline
- [ ] ✅ Validate data in DHIS2
- [ ] ✅ Update documentation
- [ ] ✅ Train users on Google Sheets management

## Rollback Plan

If rollback to PostgreSQL approach is needed:

1. **Restore Files:**
   - Restore `sql.js` and `get-report-data.js` from backup
   - Restore `get-report-data.json` state file

2. **Update Configuration:**
   - Revert `project.yaml` to use OpenMRS adaptor
   - Update credential references

3. **Environment Variables:**
   - Restore PostgreSQL connection variables
   - Remove Google Sheets variables

4. **Redeploy:**
   - Deploy restored workflow configuration
   - Test PostgreSQL connectivity

## Support and Troubleshooting

### Common Migration Issues

1. **Google Sheets Permission Errors**
   - Verify service account has access to spreadsheet
   - Check API enabled in Google Cloud Console

2. **Data Format Differences**
   - Validate data types in Google Sheets
   - Update indicator mappings as needed

3. **Workflow Deployment Failures**
   - Check adaptor versions
   - Verify credential configuration

### Getting Help

- Review `docs/testing-guide.md` for comprehensive testing procedures
- Use `scripts/validate-google-sheets.js` for connection testing
- Check OpenFn logs for detailed error information
- Consult Google Sheets API documentation for advanced configurations

## Next Steps

After successful migration:

1. **Optimize Performance:** Fine-tune data retrieval and processing
2. **Enhance Monitoring:** Set up alerts and monitoring for the pipeline
3. **User Training:** Train data managers on Google Sheets best practices
4. **Documentation Updates:** Keep documentation current with any changes
5. **Regular Testing:** Establish regular testing schedule for data pipeline
