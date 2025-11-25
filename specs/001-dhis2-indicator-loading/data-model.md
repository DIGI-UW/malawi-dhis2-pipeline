# Data Model: DHIS2 Indicator Loading Pipeline

**Date**: 2025-11-24
**Context**: Entity documentation for implemented system

## Core Entities

### 1. Indicator File

**Description**: Health data file (CSV/XLSX) uploaded by data partners containing indicator values.

**Attributes**:
| Field | Type | Description |
|-------|------|-------------|
| fileName | string | Original file name (e.g., `ART_data_long_format.xlsx`) |
| filePath | string | SFTP path to file (e.g., `/data/ART_data_long_format.xlsx`) |
| fileType | string | Detected type from FILE_TYPE_CONFIGS (e.g., `art_data_long`) |
| modifyTime | timestamp | Last modified time from SFTP |
| size | number | File size in bytes |

**Source File Columns** (varies by file type):
| Column | Required | Description |
|--------|----------|-------------|
| Facility/Site | Yes | Health facility name |
| Period/Date | Yes | Reporting period |
| Indicator | Yes | Data element name/code |
| Value | Yes | Numeric value to import |
| Sex/Gender | Conditional | Disaggregation category |
| Age | Conditional | Disaggregation category |

**Lifecycle States**:
```
[New] → [Detected] → [Processing] → [Completed | Failed]
```

---

### 2. File Type Configuration

**Description**: Configuration defining how to process a category of files.

**Attributes**:
| Field | Type | Description |
|-------|------|-------------|
| fileType | string | Unique identifier (e.g., `art_data_long`) |
| filePatterns | array[string] | Glob patterns to match files |
| periodFormat | string | How to parse date/period column |
| columnMappings | object | Source column → target field mappings |
| categoryConfigs | array | Category and disaggregation definitions |

**Location**: Inline in `jobs/00-scan-sftp-for-changes.js` as `FILE_TYPE_CONFIGS`

**Example Structure (XLSX - ART Data)**:
```javascript
{
  fileType: 'art_data_long',
  filePatterns: ['*ART*data*long*.xlsx'],
  periodFormat: 'YYYYMM',
  columnMappings: {
    facility: ['Facility', 'Site', 'Health Facility'],
    indicator: ['Indicator', 'Data Element'],
    value: ['Value', 'Count', 'Number'],
    period: ['Period', 'Month', 'Date']
  },
  categoryConfigs: [
    { name: 'Sex', options: ['Male', 'Female'] },
    { name: 'Age', options: ['<15', '15+'] }
  ]
}
```

**Example Structure (PEPFAR CSV)**:
```javascript
{
  fileType: 'pepfar_tx_curr_csv',
  filePatterns: ['PEPFAR_TxCURR*.csv'],
  periodFormat: 'YYYY-Qx',
  columnMappings: {
    facility: ['site_id', 'facility_name'],
    indicator: 'TX_CURR',  // Fixed indicator name for this file type
    value: ['value', 'count']
  },
  periodExtraction: 'filename'  // Period extracted from filename pattern
}
```

**Example Structure (MOH CSV - Pending Config)**:
```javascript
{
  fileType: 'moh_cohort_report',
  filePatterns: ['MoH_CohortReport*.csv'],
  periodFormat: 'YYYY-Qx',
  columnMappings: {
    facility: ['site_id'],
    // Indicators derived from column headers (pivoted data format)
  },
  periodExtraction: 'filename',
  filenamePattern: 'MoH_{ReportType}_{YEAR}_{QUARTER}_{VERSION}_{TIMESTAMP}.csv'
}
```

### MOH CSV File Structure

**Filename Convention**: `MoH_{ReportType}_{YEAR}_{QUARTER}_{VERSION}_{TIMESTAMP}.csv`
- **ReportType**: CohortReport, RegimenDistribution, SurvivalAnalysis*, TPTNewInitiations
- **YEAR**: 4-digit year (e.g., 2025)
- **QUARTER**: Q1, Q2, Q3, Q4
- **VERSION**: File version identifier
- **TIMESTAMP**: Generation timestamp

**Common Columns Across MOH CSV Files**:
| Column | Description | Present In |
|--------|-------------|------------|
| site_id | Facility identifier | All MOH CSV files |
| Various indicators | Column headers represent indicator names | Varies by file type |

**Period Extraction**: Period (YYYY-Qx) is extracted from filename rather than a column.

---

### 3. filesIndex (Processing State)

**Description**: OpenFN state object tracking processing status per file.

**Attributes**:
| Field | Type | Description |
|-------|------|-------------|
| status | enum | `pending`, `processing`, `metadata-ready`, `completed`, `failed` |
| lastSuccessfulChunk | number | Index of last successfully uploaded chunk (for resume) |
| dhis2Mappings | object | Resolved DHIS2 UIDs for this file |
| lastProcessedAt | timestamp | When processing last occurred |
| summary | object | Final processing summary (rows, errors) |

**State Transitions**:
```
pending → processing → metadata-ready → completed
                 ↓              ↓
              failed         failed
```

**Persistence**: Stored in OpenFN workflow state between job executions

---

### 4. DHIS2 Metadata Mapping

**Description**: Runtime lookup tables linking source names to DHIS2 UIDs.

**Structure**:
```javascript
dhis2Mappings = {
  orgUnits: {
    "Facility Name": "dhis2OrgUnitId123"
  },
  dataElements: {
    "INDICATOR_CODE": "dhis2DataElementId456"
  },
  categories: {
    "Sex/Male": "categoryOptionId789"
  },
  categoryOptionCombos: {
    "Male+<15": "cocId012",
    "Female+15+": "cocId345"
  },
  dataSetId: "dataSetId678"
}
```

**Generation**: Built by Job 03 (`check-and-setup-metadata.js`) via DHIS2 API queries

---

### 5. DHIS2 Structures (Parsed Metadata)

**Description**: Intermediate representation of DHIS2 entities derived from file parsing.

**Structure**:
```javascript
dhis2Structures = {
  orgUnits: [
    { name: "Facility A", code: "FAC_A", parent: "MW" }
  ],
  categories: [
    {
      name: "Sex",
      options: [
        { name: "Male", code: "MALE" },
        { name: "Female", code: "FEMALE" }
      ]
    }
  ],
  dataElements: [
    { name: "TX_CURR", code: "TX_CURR", categoryCombo: "Sex_Age" }
  ]
}
```

**Generation**: Built by Job 02 (`parse-excel-metadata.js`) from unique values in file

---

## Relationships

```
┌─────────────────────┐
│   Indicator File    │
│   (source data)     │
└──────────┬──────────┘
           │ matches
           ▼
┌─────────────────────┐
│ File Type Config    │
│ (processing rules)  │
└──────────┬──────────┘
           │ generates
           ▼
┌─────────────────────┐         ┌─────────────────────┐
│  DHIS2 Structures   │────────▶│ DHIS2 Metadata      │
│  (parsed entities)  │ creates │ Mapping (UIDs)      │
└─────────────────────┘         └──────────┬──────────┘
                                           │ used by
                                           ▼
                                ┌─────────────────────┐
                                │    Data Upload      │
                                │  (dataValueSets)    │
                                └─────────────────────┘
```

---

## DHIS2 Data Model (Target)

### Organization Unit
| Field | Type | DHIS2 API Field |
|-------|------|-----------------|
| name | string | name |
| code | string | code (generated from name) |
| parent | reference | parent.id |
| shortName | string | shortName (= name) |

### Data Element
| Field | Type | DHIS2 API Field |
|-------|------|-----------------|
| name | string | name |
| code | string | code (generated) |
| categoryCombo | reference | categoryCombo.id |
| domainType | enum | domainType = "AGGREGATE" |
| valueType | enum | valueType = "NUMBER" |
| aggregationType | enum | aggregationType = "SUM" |

### Category Option Combo
| Field | Type | Description |
|-------|------|-------------|
| name | string | Combination name (e.g., "Male, <15") |
| id | string | DHIS2 UID |
| categoryOptions | array | Component category options |

### Data Value (Upload Target)
| Field | Type | Description |
|-------|------|-------------|
| dataElement | string | DHIS2 Data Element UID |
| period | string | DHIS2 period format (e.g., "202511") |
| orgUnit | string | DHIS2 Org Unit UID |
| categoryOptionCombo | string | DHIS2 COC UID |
| value | string | Numeric value as string |

---

## Validation Rules

### File Validation
- File must match at least one pattern in FILE_TYPE_CONFIGS
- File must have all required columns per config
- File must have at least one data row

### Data Row Validation
- Facility name must be non-empty
- Period must be parseable to DHIS2 format
- Value must be numeric or empty (empty = skip)
- Indicator must exist in config or be auto-creatable

### DHIS2 Validation
- Org unit parent (Malawi, code=MW) must exist
- Category combo must be valid for data element
- User must have write access to org units
