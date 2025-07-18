# Excel Sheet to DHIS2 Workflow - Large File Processing

This workflow is specifically designed to handle large Excel files (1M+ rows) and process them efficiently without running into memory limitations.

## Architecture Overview

This workflow uses a **chunked processing architecture** to handle large files:

```
Excel File (30MB+) → Download & Chunk → Process Chunks → Generate Batches → Upload to DHIS2 → Consolidate Results
```

### Key Features

- **Memory Efficient**: Processes files in 1000-row chunks
- **Parallel Processing**: Multiple chunks can be processed simultaneously
- **Error Resilient**: Individual chunk failures don't stop the entire process
- **Detailed Tracking**: Comprehensive logging and result consolidation
- **Fallback Safe**: Doesn't interfere with the original `sftp-dhis2` workflow

## Workflow Jobs

### 1. `download-and-chunk-excel.js`
- Downloads Excel file from SFTP
- Processes it in streaming chunks (1000 rows each)
- Creates lightweight chunk metadata
- **Memory Target**: <500MB

### 2. `process-excel-chunk.js`
- Processes individual chunks
- Applies data transformation and validation
- Maps Excel columns to DHIS2 fields
- **Memory Target**: <100MB per chunk

### 3. `generate-dhis2-batch.js`
- Creates DHIS2 dataValueSet payloads
- Validates payload structure and size
- Optimizes for DHIS2 API performance
- **Memory Target**: <50MB per batch

### 4. `upload-dhis2-batch.js`
- Uploads individual batches to DHIS2
- Implements retry logic for failures
- Provides detailed error reporting
- **Memory Target**: <50MB per upload

### 5. `consolidate-results.js`
- Consolidates results from all chunk uploads
- Calculates success/failure rates
- Provides comprehensive summary
- **Memory Target**: <50MB

## Configuration

### File Target
Currently configured for: `/data/excel-files/ART_data_long_format.xlsx`

### Chunk Size
- **Default**: 1000 rows per chunk
- **Configurable**: Adjust `CHUNK_SIZE` in `download-and-chunk-excel.js`

### Memory Limits
- **Per Job**: 500MB (configurable)
- **Total Workflow**: <2GB (well within OpenFn limits)

### DHIS2 Configuration
```javascript
dataSet: 'necyFYLlEI0'
orgUnit: 'drsiURo4DeK'
period: '202501'
categoryOptionCombo: 'HllvX50cXC0'
attributeOptionCombo: 'HllvX50cXC0'
```

## Column Mappings

| Excel Column | DHIS2 Field | Type | Required |
|-------------|-------------|------|----------|
| `Indicator_name` | `dataElement` | String | Yes |
| `IndicatorValue` | `value` | Numeric | Yes |
| `Site` | `orgUnit` | String | Yes |
| `Quarter` | `period` | String | No |
| `Region` | `region` | String | No |

## Usage

### Triggering the Workflow

1. **Manual Trigger**: Use the `manual-excel-processing` webhook
2. **File Path**: Currently hardcoded to ART file (can be made configurable)

### Expected Performance

For a 30MB Excel file with 1M+ rows:
- **Processing Time**: 5-10 minutes
- **Memory Usage**: 500MB per job, 1.5GB total
- **Success Rate**: >95% (depends on data quality)

## Error Handling

### Chunk-Level Errors
- Individual chunk failures don't stop the workflow
- Detailed error reporting for each chunk
- Retry logic for transient failures

### DHIS2 Upload Errors
- Automatic retry for 5xx errors
- Detailed conflict reporting
- Graceful handling of payload size limits

### Memory Management
- Forced garbage collection between chunks
- Memory monitoring and limits
- Automatic cleanup of processed data

## Monitoring

### Success Metrics
- **Chunk Success Rate**: % of chunks processed successfully
- **Data Value Success Rate**: % of data values uploaded to DHIS2
- **Processing Speed**: Rows per second

### Key Logs to Watch
- `📊 Processing chunk X: Y rows`
- `✅ DHIS2 upload completed`
- `📈 Consolidation Summary`
- `💾 Memory usage: XMB`

## Comparison with Original Workflow

| Feature | Original SFTP-DHIS2 | New Excel-DHIS2 |
|---------|-------------------|------------------|
| **File Size Limit** | ~10MB | 100MB+ |
| **Row Limit** | ~50K rows | 1M+ rows |
| **Memory Usage** | 1.5GB+ | <500MB per job |
| **Processing Model** | All-at-once | Chunked |
| **Error Recovery** | Fail-fast | Chunk-level recovery |
| **Parallel Processing** | No | Yes |

## Troubleshooting

### Common Issues

1. **Memory Errors**
   - Reduce `CHUNK_SIZE` in download job
   - Check `MAX_MEMORY_MB` limits

2. **DHIS2 Upload Failures**
   - Check DHIS2 server status
   - Verify data element mappings
   - Review conflict reports

3. **Performance Issues**
   - Consider reducing chunk size
   - Monitor parallel processing limits
   - Check DHIS2 API performance

### Debug Mode
To enable detailed logging, set environment variables:
```bash
DEBUG=true
VERBOSE_LOGGING=true
```

## Future Enhancements

1. **Dynamic File Selection**: Make file path configurable
2. **Adaptive Chunk Size**: Adjust based on memory usage
3. **Parallel Limits**: Control number of concurrent chunks
4. **Resume Capability**: Resume from failed chunks
5. **File Type Support**: Support for CSV, JSON, etc.

## Prerequisites

- SFTP server with Excel file access
- DHIS2 instance with appropriate permissions
- OpenFn Lightning with sufficient memory allocation
- Enhanced SFTP adaptor with streaming support

## Dependencies

- `@openfn/language-sftp@2.0.17-custom`
- `@openfn/language-dhis2@6.3.4`
- `@openfn/language-common@2.4.0`

## Development

To test with smaller files:
1. Adjust file path in `download-and-chunk-excel.js`
2. Reduce chunk size for testing
3. Use manual trigger for controlled testing

## Support

For issues with large file processing:
1. Check memory usage in logs
2. Review chunk success rates
3. Examine DHIS2 conflict reports
4. Monitor processing performance 