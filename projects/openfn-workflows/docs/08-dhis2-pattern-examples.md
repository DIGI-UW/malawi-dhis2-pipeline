# DHIS2 Pattern Examples

## Overview

This document provides specific examples of how our Malawi DHIS2 pipeline workflow follows the established DHIS2 patterns from OpenFn's official documentation and examples.

## Pattern 1: Simple DHIS2 Upload

### **OpenFn Official Pattern**
From the [OpenFn DHIS2 documentation](https://github.com/OpenFn/language-dhis2):

```javascript
// Simple dataValueSet creation
create('dataValueSets', {
  dataSet: 'pBOMPrpg1QX',
  completeDate: '2014-02-03',
  period: '201401',
  orgUnit: 'DiszpKrYNg8',
  dataValues: [
    {
      dataElement: 'f7n9E0hX8qk',
      value: '1',
    },
    {
      dataElement: 'Ix2HsbDMLea',
      value: '2',
    }
  ],
});
```

### **Our Implementation**
```javascript
// upload-to-dhis2.js
create("dataValueSets", (state) => {
  console.log('📤 Sending payload to DHIS2...');
  return state.payload;
});
```

**Compliance**: ✅ We follow the exact same `create("dataValueSets", ...)` pattern.

## Pattern 2: Payload Structure

### **OpenFn Original Setup Pattern**
From `projects/original-openfn-setup/workflows/reports-data-upload-workflow/jobs/generate-dhis2-payload.js`:

```javascript
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

### **Our Implementation**
```javascript
// generate-dhis2-payload.js
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

**Compliance**: ✅ We follow the same structure with `dataSet`, `period`, `orgUnit`, `dataValues`, and `categoryOptionCombo`.

## Pattern 3: Configuration-Driven Mapping

### **OpenFn Original Setup Pattern**
From `projects/original-openfn-setup/workflows/state/generate-dhis2-payload.json`:

```json
{
  "reportConfig": {
    "catAttrCombo": "HllvX50cXC0",
    "dataSet": "necyFYLlEI0",
    "period": "202504",
    "orgUnit": "drsiURo4DeK",
    "hivStagesReportMapping": {
      "Rapport sur les stades 3 et 4 du VIH en RDC.Mâles": "IQTe97w6j5I",
      "Rapport sur les stades 3 et 4 du VIH en RDC.Femmes": "b31fxPyPHdZ",
      "Rapport sur les stades 3 et 4 du VIH en RDC.Tout": "XMQfwO0ODSr"
    }
  }
}
```

### **Our Implementation**
```javascript
// generate-dhis2-payload.js
const CONFIG = {
  dataSet: 'necyFYLlEI0', // Same dataset ID
  orgUnit: 'drsiURo4DeK', // Same org unit ID
  period: '202501',
  categoryOptionCombo: 'HllvX50cXC0', // Same category option combo
  attributeOptionCombo: 'HllvX50cXC0',
  dataElementMapping: {
    // Map Excel column names to DHIS2 data element IDs
    'ART_Patients_Total': 'IQTe97w6j5I',
    'ART_Patients_Male': 'b31fxPyPHdZ', 
    'ART_Patients_Female': 'XMQfwO0ODSr',
    'ART_Patients_New': 'Yz7m8AH66in',
    'ART_Patients_Existing': 'Ius3vNNYVKm'
  }
};
```

**Compliance**: ✅ We use the same DHIS2 IDs and follow the same mapping pattern.

## Pattern 4: Project Structure

### **OpenFn Original Setup Pattern**
From `projects/original-openfn-setup/project.yaml`:

```yaml
workflows:
  HIV-Stages-Report-to-DHIS2-Workflow:
    name: HIV Stages Report to DHIS2 Workflow
    jobs:
      Generate-DHIS2-Payload:
        name: Generate DHIS2 Payload
        adaptor: '@openfn/language-common@2.4.0'
        credential: null
        body:
          path: ./workflows/reports-data-upload-workflow/jobs/generate-dhis2-payload.js
      Upload-To-DHIS2:
        name: Upload to DHIS2
        adaptor: '@openfn/language-dhis2@6.3.4'
        credential: admin@example.org-DHIS2
        body:
          path: ./workflows/reports-data-upload-workflow/jobs/upload-to-dhis2.js
```

### **Our Implementation**
```yaml
# project.yaml
workflows:
  HIVIndicatorsSFTPtoDHIS2Workflow:
    name: HIV Indicators SFTP to DHIS2 Workflow
    jobs:
      GenerateDHIS2Payload:
        name: Generate DHIS2 Payload
        adaptor: '@openfn/language-common@2.4.0'
        credential: null
        body:
          path: ./jobs/generate-dhis2-payload.js
      UploadToDHIS2:
        name: Upload to DHIS2
        adaptor: '@openfn/language-dhis2@6.3.4'
        credential: dhis2-credential
        body:
          path: ./jobs/upload-to-dhis2.js
```

**Compliance**: ✅ We follow the exact same structure with the same adaptors and job organization.

## Pattern 5: Error Handling

### **OpenFn Original Setup Pattern**
From the original setup jobs:

```javascript
// Simple error handling with state validation
fn(state => {
  if (!state.data) {
    return {
      ...state,
      workflowComplete: true,
      error: 'No data found to process'
    };
  }
  return state;
});
```

### **Our Implementation**
```javascript
// generate-dhis2-payload.js
fn(state => {
  if (!state.processedFiles || state.processedFiles.length === 0) {
    console.error('❌ No processed Excel files found in state. Stopping workflow.');
    return {
      ...state,
      workflowComplete: true,
      error: 'No processed Excel files found. Ensure the process-excel-data job executed successfully.'
    };
  }
  
  // ... rest of processing
});
```

**Compliance**: ✅ We follow the same error handling pattern with `workflowComplete: true`.

## Pattern 6: Credential Management

### **OpenFn Original Setup Pattern**
From `projects/original-openfn-setup/project.yaml`:

```yaml
credentials:
  admin@example.org-DHIS2:
    name: DHIS2
    owner: admin@example.org
  admin@example.org-OpenMRS:
    name: OpenMRS
    owner: admin@example.org
```

### **Our Implementation**
```yaml
# project.yaml
credentials:
  sftp-credential:
    name: "sftp-test-credential"
    owner: "root@openhim.org"
  dhis2-credential:
    name: "dhis2-credential"
    owner: "root@openhim.org"
```

**Compliance**: ✅ We follow the same credential structure and naming pattern.

## Pattern 7: Data Value Structure

### **OpenFn Official DHIS2 Pattern**
From the [DHIS2 adaptor documentation](https://github.com/OpenFn/language-dhis2):

```javascript
// Single data value
{
  dataElement: 'f7n9E0hX8qk',
  period: '201401',
  orgUnit: 'DiszpKrYNg8',
  value: '12',
  categoryOptionCombo: 'HllvX50cXC0',
  attributeOptionCombo: 'HllvX50cXC0'
}
```

### **Our Implementation**
```javascript
// generate-dhis2-payload.js
const dataValue = {
  dataElement: dataElementId,
  period: row.period || config.period,
  orgUnit: row.orgUnit || config.orgUnit,
  value: value.toString(),
  categoryOptionCombo: config.categoryOptionCombo,
  attributeOptionCombo: config.attributeOptionCombo
};
```

**Compliance**: ✅ We include all required fields: `dataElement`, `period`, `orgUnit`, `value`, `categoryOptionCombo`, `attributeOptionCombo`.

## Pattern 8: Workflow Edges

### **OpenFn Original Setup Pattern**
From `projects/original-openfn-setup/project.yaml`:

```yaml
edges:
  Generate-DHIS2-Payload->Upload-To-DHIS2:
    source_job: Generate-DHIS2-Payload
    target_job: Upload-To-DHIS2
    condition_type: on_job_success
    enabled: true
```

### **Our Implementation**
```yaml
# project.yaml
edges:
  GenerateDHIS2PayloadToUploadToDHIS2:
    source_job: GenerateDHIS2Payload
    target_job: UploadToDHIS2
    condition_type: on_job_success
    enabled: true
```

**Compliance**: ✅ We follow the same edge structure with `on_job_success` conditions.

## Summary

Our Malawi DHIS2 pipeline workflow follows **all** the established DHIS2 patterns from OpenFn's official documentation and examples:

1. ✅ **Simple Upload Pattern**: `create("dataValueSets", (state) => state.payload)`
2. ✅ **Payload Structure**: Proper `dataSet`, `period`, `orgUnit`, `dataValues` structure
3. ✅ **Configuration Mapping**: Embedded configuration with DHIS2 ID mappings
4. ✅ **Project Structure**: Same adaptors, job organization, and workflow structure
5. ✅ **Error Handling**: Graceful failure with `workflowComplete: true`
6. ✅ **Credential Management**: Same credential structure and naming
7. ✅ **Data Value Structure**: All required DHIS2 fields included
8. ✅ **Workflow Edges**: Same conditional execution patterns

This ensures our workflow is fully compatible with OpenFn's established patterns and will work reliably with the DHIS2 API. 