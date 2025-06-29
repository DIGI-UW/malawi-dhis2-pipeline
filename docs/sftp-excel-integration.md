# SFTP Excel/CSV Integration Guide

## Overview

This guide documents the configuration-driven SFTP to DHIS2 data pipeline that supports multiple Excel and CSV file formats. The system uses flexible configuration files to define how different file types should be processed, eliminating the need for code changes when adding new formats.

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   SFTP Server    │     │   OpenFN         │     │    DHIS2         │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ • Excel Files    │────▶│ • File Watcher   │────▶│ • Data Import    │
│ • CSV Files      │     │ • Config Loader  │     │ • Validation     │
│ • Auto-discovery │     │ • Transformers   │     │ • Storage        │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                                                            │
                                                                            ▼
                         ┌──────────────────┐
                         │  Configuration   │
                         ├──────────────────┤
                         │ • File Types     │
                         │ • Column Maps    │
                         │ • Metadata       │
                         └──────────────────┘
```

## Configuration System

### File Type Configuration

Each supported file type has a JSON configuration that defines:
- File name patterns for matching
- Column mappings (Excel columns → DHIS2 fields)
- Data transformations
- Validation rules
- DHIS2 import settings

#### Example: ART Data Configuration

```json
{
  "fileType": "art_data_long_format",
  "displayName": "ART Data Long Format",
  "filePatterns": ["*ART*data*long*.xlsx", "ART_data_long_format.xlsx"],
  "sheetConfig": {
    "targetSheet": 0,
    "headerRow": 1,
    "dataStartRow": 2
  },
  "columnMappings": {
    "facility": {
      "sourceColumns": ["Facility", "Health Facility", "Site"],
      "targetField": "orgUnit",
      "required": true
    },
    "indicator": {
      "sourceColumns": ["Indicator", "Data Element"],
      "targetField": "dataElement",
      "required": true
    },
    "value": {
      "sourceColumns": ["Value", "Count", "Total"],
      "targetField": "value",
      "required": true,
      "dataType": "numeric"
    }
  },
  "transformations": [
    {
      "field": "period",
      "type": "dateFormat",
      "from": ["MM/YYYY", "MM-YYYY"],
      "to": "YYYYMM"
    }
  ],
  "dataValidation": {
    "rules": [
      {
        "field": "value",
        "type": "numeric",
        "min": 0,
        "max": 999999
      }
    ]
  }
}
```

### Supported File Types

1. **ART Data Long Format** (`art_data_long_format.json`)
   - Pattern: `*ART*data*long*.xlsx`
   - Features: Age/gender disaggregation, ART regimen tracking

2. **Data Quality Sites** (`dq_sites.json`)
   - Pattern: `*Q*FY*DQ*sites*.xlsx`
   - Features: Quarterly reports, fiscal year conversion, completeness scores

3. **MoH Direct Queries** (`moh_direct_queries.json`)
   - Pattern: `*Direct*Queries*.xlsx`
   - Features: Multi-sheet support, flexible date parsing, calculated indicators

## Workflow Components

### 1. SFTP File Watcher (`check-sftp-files.js`)
- Monitors SFTP directory for new/modified files
- Filters for CSV/XLSX files
- Prevents duplicate processing

### 2. File Download (`download-sftp-files.js`)
- Downloads files from SFTP to local storage
- Handles retry logic for failed downloads
- Supports both scheduled and webhook triggers

### 3. Excel/CSV Processing (`process-excel-data.js`)
- Loads file type configurations dynamically
- Matches files to configurations using patterns
- Applies column mappings and transformations
- Validates data according to rules

### 4. DHIS2 Payload Generation (`generate-dhis2-payload.js`)
- Uses metadata mappings for org units and data elements
- Groups data by dataset
- Applies time-based filtering (default: 3 months)
- Supports multiple data value sets

### 5. DHIS2 Upload (`upload-to-dhis2.js`)
- Handles multiple dataset uploads
- Provides comprehensive error reporting
- Aggregates results across uploads

## Adding New File Types

### Step 1: Create Configuration File

Create a new JSON file in `packages/openfn/importer/configs/file-types/`:

```json
{
  "fileType": "new_format",
  "displayName": "New Data Format",
  "filePatterns": ["*pattern*.xlsx", "specific_name.csv"],
  "columnMappings": {
    "indicator": {
      "sourceColumns": ["Indicator Name", "Measure"],
      "targetField": "dataElement",
      "required": true
    },
    "value": {
      "sourceColumns": ["Value", "Result"],
      "targetField": "value",
      "required": true,
      "dataType": "numeric"
    }
  }
}
```

### Step 2: Deploy Configuration

```bash
# Copy to workflows directory
cp -r packages/openfn/importer/configs projects/openfn-workflows/

# Rebuild Docker image
./build-custom-images.sh openfn-workflows

# Redeploy services
./instant package down -n openfn
./instant package init -n openfn
```

### Step 3: Test

Upload a file matching the pattern to SFTP and verify processing.

## Transformations

### Built-in Transformation Types

1. **Date Format**
   ```json
   {
     "field": "period",
     "type": "dateFormat",
     "from": ["MM/YYYY", "DD/MM/YYYY"],
     "to": "YYYYMM"
   }
   ```

2. **Quarter to Month**
   ```json
   {
     "field": "period",
     "type": "quarterToMonth",
     "from": ["Q1 FY25", "Q2FY25"],
     "fiscalYearStart": 7,
     "to": "YYYYMM"
   }
   ```

3. **Numeric**
   ```json
   {
     "field": "value",
     "type": "numeric",
     "removeCommas": true,
     "defaultValue": 0
   }
   ```

4. **Percentage**
   ```json
   {
     "field": "completeness",
     "type": "percentage",
     "from": "decimal",
     "to": "whole"
   }
   ```

## Metadata Mappings

### Organization Unit Mapping

Maps facility names to DHIS2 org unit IDs:

```json
{
  "mappings": [
    {
      "name": "Kamuzu Central Hospital",
      "code": "MW_KCH",
      "dhis2Id": "a1b2c3d4e5f6",
      "alternateNames": ["KCH", "Kamuzu Hospital"]
    }
  ]
}
```

### Data Element Mapping

Maps indicator names to DHIS2 data element IDs:

```json
{
  "hiv_indicators": [
    {
      "name": "Number of adults and children currently receiving ART",
      "code": "HIV_ART_CURR",
      "dhis2Id": "de1a2b3c4d5e",
      "alternateNames": ["Currently on ART", "ART Current"]
    }
  ]
}
```

## Triggers

### 1. Scheduled (Cron)
- Default: Every 5 minutes (testing) or 15 minutes (production)
- Checks for new/modified files
- Processes all pending files

### 2. Webhook
- Immediate processing when notified
- Supports file system watchers
- Useful for real-time updates

### 3. Manual
- Testing and debugging
- On-demand processing

## Error Handling

### File Processing Errors
- Invalid file format → Logged and skipped
- Missing required columns → Validation error
- Data type mismatches → Row-level warnings

### DHIS2 Upload Errors
- Network failures → Retry logic
- Invalid data elements → Logged conflicts
- Authentication issues → Workflow stops

### Recovery
- Failed files tracked in state
- Can be reprocessed manually
- Audit trail maintained

## Performance Considerations

### File Size Limits
- Tested up to 50MB files
- ~1000 rows/second processing speed
- Memory-efficient streaming for large files

### Concurrent Processing
- Multiple files processed in parallel
- Resource pooling for database connections
- Configurable batch sizes

### Optimization Tips
1. Use specific file patterns to reduce scanning
2. Enable data aggregation for summary data
3. Adjust time windows based on reporting cycles
4. Monitor memory usage for large files

## Monitoring

### OpenFN Dashboard
- Workflow execution status
- Processing times
- Error rates

### Log Analysis
```bash
# Check processing logs
docker service logs $(docker service ls --format "{{.Name}}" | grep openfn)

# Filter for specific file
docker service logs openfn | grep "ART_data"
```

### Success Metrics
- Files processed per hour
- Data values imported
- Error/warning rates
- Processing time trends

## Security

### SFTP Security
- SSH key authentication supported
- Encrypted file transfer
- Access control per user

### Data Protection
- Files deleted after processing
- No sensitive data in logs
- Audit trail for compliance

### Credential Management
- Stored in OpenFN credential vault
- Environment variables for Docker
- No hardcoded credentials

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| File not processed | Pattern mismatch | Check filename against config patterns |
| Column not found | Name mismatch | Verify Excel headers match config |
| Upload fails | Invalid DHIS2 ID | Update metadata mappings |
| Old data ignored | Time window | Adjust update window in config |

### Debug Steps

1. **Check File Discovery**
   ```bash
   # List files on SFTP
   sftp -P 2225 openfn@localhost
   sftp> ls data/excel-files/
   ```

2. **Verify Configuration Loading**
   ```bash
   # Check logs for config loading
   docker service logs openfn | grep "Loaded.*configurations"
   ```

3. **Test File Matching**
   ```bash
   # Check if file matched a config
   docker service logs openfn | grep "matched configuration"
   ```

4. **Review Processing Errors**
   ```bash
   # Check for validation errors
   docker service logs openfn | grep -E "(Error|Warning|Failed)"
   ```

## Best Practices

1. **Configuration Management**
   - Version control configurations
   - Document column mappings
   - Test with sample files

2. **File Naming**
   - Use consistent patterns
   - Include dates in filenames
   - Avoid special characters

3. **Data Quality**
   - Validate data before upload
   - Use appropriate data types
   - Handle missing values

4. **Performance**
   - Process files in off-peak hours
   - Archive processed files
   - Monitor resource usage

## Future Enhancements

1. **Email Notifications**
   - Processing summaries
   - Error alerts
   - Daily reports

2. **Data Archiving**
   - Automatic file archival
   - Compressed storage
   - Retention policies

3. **Advanced Mappings**
   - Calculated indicators
   - Data aggregation
   - Cross-file validation
