# OpenFn Design Compliance Guide

## Overview

This document outlines how our Malawi DHIS2 pipeline workflows follow OpenFn's official design principles and best practices as documented in the [OpenFn Design Guide](https://docs.openfn.org/documentation/design/design-overview) and [Job Examples](https://docs.openfn.org/documentation/jobs/job-examples).

## OpenFn Design Principles Compliance

### ✅ **1. Single Responsibility Principle**

Each job in our workflow has a single, well-defined responsibility:

| Job | Responsibility | OpenFn Principle | DHIS2 Pattern |
|-----|---------------|------------------|---------------|
| `00-scan-sftp-for-changes.js` | Scan SFTP, select next file, load FILE_TYPE_CONFIGS | ✅ Single purpose | N/A |
| `01-check-and-setup-processing.js` | Validate configuration and prepare context | ✅ Single purpose | N/A |
| `02-parse-excel-metadata.js` | Parse Excel/CSV, build dhis2Structures | ✅ Single purpose | N/A |
| `03-check-and-setup-metadata.js` | Ensure DHIS2 metadata exists (upsert) | ✅ Single purpose | ✅ Follows DHIS2 metadata pattern |
| `04-process-all-chunks-sequentially.js` | Stream chunks to DHIS2 with resume support | ✅ Single purpose | ✅ Follows simple `create()` pattern |

### ✅ **2. State-Driven Design**

Our workflow follows OpenFn's state-driven approach:

```javascript
// Each job returns a new state object
return {
  ...state,
  payload: dataValueSet,
  workflowComplete: true
};
```

**DHIS2 Pattern Compliance**: Following the original OpenFn setup pattern:
```javascript
// Original pattern from projects/original-openfn-setup
create("dataValueSets", (state) => (state.payload));
```

### ✅ **3. Error Handling & Graceful Failure**

All jobs implement comprehensive error handling:

```javascript
if (!state.payload) {
  return {
    ...state,
    workflowComplete: true,
    error: 'No payload found in state.'
  };
}
```

**DHIS2 Pattern Compliance**: Following the error handling patterns from DHIS2 examples.

### ✅ **4. Configuration-Driven Approach**

Our workflow uses embedded configurations for flexibility:

```javascript
const CONFIG = {
  dataSet: 'necyFYLlEI0',
  orgUnit: 'drsiURo4DeK',
  period: '202501',
  dataElementMapping: {
    'ART_Patients_Total': 'IQTe97w6j5I',
    'ART_Patients_Male': 'b31fxPyPHdZ'
  }
};
```

**DHIS2 Pattern Compliance**: Following the mapping patterns from the original OpenFn setup.

### ✅ **5. DHIS2 API Compliance**

Our workflow follows the exact DHIS2 API patterns from OpenFn examples:

#### **Payload Structure**
```javascript
// Following DHIS2 API format from OpenFn examples
const dataValueSet = {
  dataSet: config.dataSet,
  period: config.period,
  orgUnit: config.orgUnit,
  completeDate: new Date().toISOString(),
  dataValues: dataValues
};
```

#### **Upload Pattern**
```javascript
// Simple upload pattern from OpenFn DHIS2 examples
create("dataValueSets", (state) => {
  return state.payload;
});
```

#### **Category Option Combo Handling**
```javascript
// Following DHIS2 category option combo pattern
const dataValue = {
  dataElement: dataElementId,
  period: period,
  orgUnit: orgUnit,
  value: value.toString(),
  categoryOptionCombo: config.categoryOptionCombo,
  attributeOptionCombo: config.attributeOptionCombo
};
```

### ✅ **6. Workflow Structure Compliance**

Our `project.yaml` follows OpenFn's declarative workflow format:

```yaml
workflows:
  UploadIndicatorFilesToDHIS2Workflow:
    name: Upload Indicator Files to DHIS2 Workflow
    concurrency: 1
    jobs:
      ScanSftpForChanges:
        name: Discover indicator files and manage workflow lock
        adaptor: '@openfn/language-sftp@2.1.0-custom'
        credential: sftp-credential
        body:
          path: ./jobs/00-scan-sftp-for-changes.js
      CheckAndSetupMetadata:
        name: Ensure DHIS2 metadata exists per file config
        adaptor: '@openfn/language-dhis2@7.1.3-custom'
        credential: dhis2-credential
        body:
          path: ./jobs/03-check-and-setup-metadata.js
      ProcessAllChunksSequentially:
        name: Stream chunks to DHIS2 with resume support
        adaptor: '@openfn/language-dhis2@7.1.3-custom'
        credential: combined-credential
        body:
          path: ./jobs/04-process-all-chunks-sequentially.js
```

**Note**: Uses custom forked adaptors (`@2.1.0-custom`, `@7.1.3-custom`) from `projects/openfn-custom-adaptors/`.


### ✅ **8. Credential Management**

Following OpenFn's credential management patterns:

```yaml
credentials:
  sftp-credential:
    name: "sftp-test-credential"
    owner: "root@openhim.org"
  dhis2-credential:
    name: "dhis2-credential"
    owner: "root@openhim.org"
```

**DHIS2 Pattern Compliance**: Following the credential structure from the original OpenFn setup.

## Comparison with OpenFn DHIS2 Examples

### **Original OpenFn Setup Pattern**
```javascript
// From projects/original-openfn-setup
function generatePayload(reportData, state) {
  const { catAttrCombo, period, orgUnit, hivStagesReportMapping, dataSet } = state.reportConfig;
  
  const payload = {
    dataSet: dataSet,
    period: period,
    orgUnit: orgUnit,
    dataValues: []
  };

  Object.entries(reportData).forEach(([key, value]) => {
    payload.dataValues.push({
      dataElement: hivStagesReportMapping[key],
      period: period,
      orgUnit: orgUnit,
      categoryOptionCombo: catAttrCombo,
      attributeOptionCombo: catAttrCombo,
      value: value.toString()
    });
  });

  return payload;
}
```

### **Our Implementation Pattern**
```javascript
// Our implementation following the same pattern
function generateDataValueSet(processedFiles, config) {
  const dataValues = [];
  
  processedFiles.forEach(file => {
    file.excelData.data.forEach((row, index) => {
      Object.entries(row).forEach(([columnName, value]) => {
        const dataElementId = config.dataElementMapping[columnName];
        
        if (dataElementId && value !== null && value !== undefined && value !== '') {
          const dataValue = {
            dataElement: dataElementId,
            period: row.period || config.period,
            orgUnit: row.orgUnit || config.orgUnit,
            value: value.toString(),
            categoryOptionCombo: config.categoryOptionCombo,
            attributeOptionCombo: config.attributeOptionCombo
          };
          
          dataValues.push(dataValue);
        }
      });
    });
  });
  
  return {
    dataSet: config.dataSet,
    period: config.period,
    orgUnit: config.orgUnit,
    completeDate: new Date().toISOString(),
    dataValues: dataValues
  };
}
```

## Key Improvements Made

### **1. Simplified Upload Pattern**
- **Before**: Complex multi-step upload with error aggregation
- **After**: Simple `create("dataValueSets", (state) => state.payload)` pattern
- **Benefit**: Follows OpenFn's established DHIS2 upload patterns

### **2. Streamlined Payload Generation**
- **Before**: Complex time-window filtering and multiple dataValueSets
- **After**: Single dataValueSet with proper DHIS2 structure
- **Benefit**: Matches DHIS2 API expectations and OpenFn examples

### **3. Configuration-Driven Mapping**
- **Before**: Hardcoded mappings scattered throughout code
- **After**: Centralized configuration object with clear mappings
- **Benefit**: Easier maintenance and follows OpenFn configuration patterns

### **4. Error Handling Alignment**
- **Before**: Complex error aggregation and reporting
- **After**: Simple error handling with `workflowComplete: true`
- **Benefit**: Follows OpenFn's error handling best practices

## Compliance Checklist

- ✅ **Single Responsibility**: Each job has one clear purpose (5 jobs: scan, setup, parse, metadata, upload)
- ✅ **State Immutability**: Jobs return new state objects with `filesIndex` tracking
- ✅ **Error Handling**: Graceful failure with `workflowComplete: true` and error details
- ✅ **Configuration-Driven**: FILE_TYPE_CONFIGS define all file processing rules
- ✅ **DHIS2 API Compliance**: Uses `create("dataValueSets", ...)` with CREATE_AND_UPDATE strategy
- ✅ **OpenFn Patterns**: Uses established OpenFn job patterns with conditional edges
- ✅ **Credential Management**: Proper credential structure (sftp-credential, dhis2-credential, combined-credential)
- ✅ **Workflow Structure**: Declarative project.yaml format with cron triggers
- ✅ **Adaptor Usage**: Custom adaptors (@openfn/language-sftp@2.1.0-custom, @openfn/language-dhis2@7.1.3-custom)
- ✅ **Resumable Processing**: Chunk-based with `lastSuccessfulChunk` tracking
- ✅ **Documentation**: Comprehensive inline documentation and SDD specs

## Conclusion

Our Malawi DHIS2 pipeline workflow fully complies with OpenFn's design principles and follows the established DHIS2 patterns from the official OpenFn examples. The workflow is:

1. **Maintainable**: Clear separation of concerns and configuration-driven
2. **Reliable**: Comprehensive error handling and graceful failure
3. **Standards-Compliant**: Follows DHIS2 API patterns and OpenFn best practices
4. **Documented**: Clear inline documentation and design principles
5. **Testable**: Modular structure allows for easy testing and debugging

The workflow successfully bridges the gap between SFTP file processing and DHIS2 data integration while maintaining full compliance with OpenFn's design philosophy and DHIS2's API requirements. 