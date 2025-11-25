# SFTP to DHIS2 Workflow Testing Plan

## Overview

This document provides a comprehensive testing plan for validating the SFTP to DHIS2 workflow, covering both cron-triggered and webhook-triggered scenarios.

## Workflow Requirements (from Deliverables)

### Core Functionality
1. **File Detection**: Monitor SFTP for new Excel/CSV files
2. **Multi-Format Support**: Process ART data, Direct Queries, and DQ sites files
3. **Configuration-Based**: Use JSON configs for flexible mapping
4. **Scheduled Processing**: Cron trigger (every 5 minutes)
5. **Event-Driven**: Webhook trigger for real-time processing
6. **Time-Based Protection**: Only update data < 3 months old

### Expected File Types
- `ART_data_long_format.xlsx` - ART supervision data
- `Direct Queries - Q1 2025 MoH Reports.xlsx` - MoH quarterly reports
- `Q2FY25_DQ_253_sites.xlsx` - Data quality reports

## Testing Phases

### Phase 1: CLI Testing (Local Validation)

#### 1.1 Individual Job Testing

```bash
cd projects/indicator_workflow_testing

# Test 1: SFTP Connection
./tests/cli/test-sftp-working-command.sh
# Expected: Lists 3 Excel files, connection successful

# Test 2: File Detection Logic
docker run --rm -it \
  -v "$(pwd):/workspace" \
  openfn-cli-test:latest \
  openfn /workspace/../openfn-workflows/workflows/sftp-dhis2/jobs/check-sftp-files.js \
    -a sftp@2.0.14 \
    -s /workspace/tests/fixtures/sftp-test-input.json \
    -o outputs/check-files-output.json

# Verify: newFilesFound = true, newFiles array populated
```

#### 1.2 Workflow Integration Testing

```bash
# Test complete workflow
./tests/cli/test-sftp-dhis2-workflow.sh

# Expected outputs:
# ✅ SFTP files detected
# ✅ Files downloaded
# ✅ Excel data parsed
# ✅ DHIS2 payload generated
```

#### 1.3 Data Processing Testing

```javascript
// Test fixture for ART data
{
  "data": {
    "downloadedFiles": [{
      "name": "ART_data_long_format.xlsx",
      "localPath": "/tmp/ART_data_long_format.xlsx"
    }]
  },
  "configuration": {}
}
```

```bash
# Test Excel processing job
docker run --rm -it \
  -v "$(pwd):/workspace" \
  openfn-cli-test:latest \
  openfn /workspace/../openfn-workflows/workflows/sftp-dhis2/jobs/process-excel-data.js \
    -a common@latest \
    -s /workspace/tests/fixtures/excel-processing-input.json \
    -o outputs/process-excel-output.json
```

### Phase 2: Environment Testing (Full Stack)

#### 2.1 Setup Test Environment

```bash
# 1. Start all services
cd /home/ubuntu/code/malawi-dhis2-pipeline
./instant package init -n sftp-storage -d
./instant package init -n dhis2-instance -d
./instant package init -n openfn -d

# 2. Verify services
docker service ls
# Expected: All services showing 1/1 replicas
```

#### 2.2 Cron Trigger Testing

```bash
# 1. Deploy workflow with cron trigger
cd projects/openfn-workflows
./scripts/deploy-workflow.sh sftp-dhis2

# 2. Monitor cron execution (every 5 minutes)
docker service logs -f openfn_openfn | grep -E "(SFTP|Workflow|cron)"

# 3. Verify file processing
# - Place new file in SFTP
# - Wait for cron trigger
# - Check OpenFN job history
```

**Test Scenarios:**
1. **New File Detection**
   - Add `test_ART_data.xlsx` to SFTP
   - Wait 5 minutes for cron
   - Verify workflow triggers

2. **No New Files**
   - Keep SFTP unchanged
   - Verify workflow exits early
   - Check state: `newFilesFound = false`

3. **Multiple Files**
   - Add all 3 file types
   - Verify all processed in sequence

#### 2.3 Webhook Trigger Testing

```bash
# 1. Get webhook URL from OpenFN
curl http://localhost:4000/api/workflows | jq '.data[] | select(.name=="sftp-dhis2") | .triggers'

# 2. Test webhook trigger
curl -X POST http://localhost:4000/webhooks/sftp-file-change \
  -H "Content-Type: application/json" \
  -d '{
    "event": "file_added",
    "file": "new_ART_data.xlsx",
    "path": "/data/excel-files/"
  }'

# 3. Monitor webhook execution
docker service logs -f openfn_openfn | grep -E "(webhook|trigger)"
```

**Test Scenarios:**
1. **File Added Event**
   ```json
   {
     "event": "file_added",
     "file": "test_file.xlsx",
     "timestamp": "2024-01-01T00:00:00Z"
   }
   ```

2. **File Modified Event**
   ```json
   {
     "event": "file_modified",
     "file": "existing_file.xlsx",
     "oldSize": 1024,
     "newSize": 2048
   }
   ```

3. **Batch Upload Event**
   ```json
   {
     "event": "batch_upload",
     "files": ["file1.xlsx", "file2.xlsx", "file3.xlsx"]
   }
   ```

### Phase 3: Data Validation Testing

#### 3.1 File Type Configuration Testing

```bash
# Test each file type configuration
cd projects/openfn-workflows

# 1. ART Data Long Format
./tests/test-file-type.sh art_data_long_format.json ART_data_long_format.xlsx

# 2. Direct Queries
./tests/test-file-type.sh moh_direct_queries.json "Direct Queries - Q1 2025 MoH Reports.xlsx"

# 3. DQ Sites
./tests/test-file-type.sh dq_sites.json Q2FY25_DQ_253_sites.xlsx
```

#### 3.2 DHIS2 Payload Validation

```javascript
// Expected DHIS2 payload structure
{
  "dataValueSets": {
    "dataValues": [
      {
        "dataElement": "de1a2b3c4d5e",
        "period": "202501",
        "orgUnit": "a1b2c3d4e5f6",
        "value": "125",
        "categoryOptionCombo": "xyz123"
      }
    ]
  }
}
```

```bash
# Validate generated payloads
cat outputs/generate-dhis2-payload-output.json | jq '.dataValueSets.dataValues | length'
# Expected: > 0 data values

# Check required fields
cat outputs/generate-dhis2-payload-output.json | jq '.dataValueSets.dataValues[0] | keys'
# Expected: ["dataElement", "period", "orgUnit", "value"]
```

#### 3.3 Time Window Protection Testing

```javascript
// Test with old data (> 3 months)
{
  "data": {
    "processedData": [{
      "period": "202310",  // Old period
      "value": 100,
      "dataElement": "test"
    }]
  }
}

// Expected: Data filtered out, not sent to DHIS2
```

### Phase 4: Performance Testing

#### 4.1 Load Testing

```bash
# Add multiple large files to SFTP
for i in {1..10}; do
  cp ART_data_long_format.xlsx "test_file_$i.xlsx"
  scp "test_file_$i.xlsx" openfn@localhost:/data/excel-files/
done

# Monitor processing time
time ./scripts/test-end-to-end.sh full
# Expected: < 5 minutes for all files
```

#### 4.2 Concurrent Processing

```bash
# Trigger multiple webhooks simultaneously
for i in {1..5}; do
  curl -X POST http://localhost:4000/webhooks/sftp-file-change \
    -H "Content-Type: application/json" \
    -d "{\"file\": \"concurrent_$i.xlsx\"}" &
done

# Check for race conditions
docker service logs openfn_openfn | grep -i error
```

### Phase 5: Error Handling Testing

#### 5.1 Connection Failures

```bash
# Stop SFTP service
docker service scale sftp-storage_sftp-server=0

# Trigger workflow
curl -X POST http://localhost:4000/webhooks/sftp-file-change

# Expected: Graceful failure, error logged
docker service logs openfn_openfn | grep -i "connection"
```

#### 5.2 Invalid File Testing

```bash
# Upload corrupted Excel file
echo "not excel data" > corrupted.xlsx
scp corrupted.xlsx openfn@localhost:/data/excel-files/

# Trigger processing
# Expected: Error caught, workflow continues
```

#### 5.3 DHIS2 Upload Failures

```bash
# Stop DHIS2
docker service scale dhis2-instance_dhis2=0

# Run workflow
# Expected: Upload fails, state preserved for retry
```

## Test Checklist

### Pre-Deployment Checklist

- [ ] All CLI tests pass (`./run-tests.sh --cli-workflow`)
- [ ] Docker images built (`openfn-cli-test:latest`, `openfn-custom:latest`)
- [ ] Services running (SFTP, DHIS2, OpenFN)
- [ ] Test data available in SFTP

### Cron Trigger Tests

- [ ] Workflow triggers every 5 minutes
- [ ] New files detected and processed
- [ ] No files scenario handled gracefully
- [ ] State tracking prevents reprocessing
- [ ] Logs show successful execution

### Webhook Trigger Tests

- [ ] Webhook endpoint accessible
- [ ] File added events trigger workflow
- [ ] File modified events handled
- [ ] Batch upload events processed
- [ ] Invalid events rejected

### Data Processing Tests

- [ ] ART data file processed correctly
- [ ] Direct Queries multi-sheet handling works
- [ ] DQ sites file parsed successfully
- [ ] Column mappings applied
- [ ] Data transformations work
- [ ] DHIS2 payloads valid

### Error Handling Tests

- [ ] SFTP connection failures handled
- [ ] Invalid Excel files don't crash workflow
- [ ] Missing columns logged as warnings
- [ ] DHIS2 failures allow retry
- [ ] Time window protection works

### Performance Tests

- [ ] Single file < 1 minute
- [ ] 10 files < 5 minutes
- [ ] Memory usage stable
- [ ] No race conditions

## Success Metrics

1. **Functional Success**
   - All 3 file types process correctly
   - Data appears in DHIS2
   - Time-based protection works

2. **Performance Success**
   - Files process within 5 minutes of upload
   - Concurrent processing works
   - No memory leaks

3. **Reliability Success**
   - 100% uptime during test period
   - All errors handled gracefully
   - State tracking prevents duplicates

## Troubleshooting Guide

### Common Issues

1. **"Invalid username" error**
   - Rebuild Docker images
   - Check SFTP credentials in state

2. **Files not detected**
   - Verify SFTP path: `/data/excel-files/`
   - Check file permissions
   - Verify state tracking

3. **DHIS2 upload fails**
   - Check DHIS2 connectivity
   - Verify metadata UIDs
   - Check payload structure

4. **Workflow doesn't trigger**
   - Check cron expression
   - Verify webhook registration
   - Check OpenFN logs

## Next Steps

1. **After CLI Testing**: Deploy to test environment
2. **After Environment Testing**: Run 24-hour stability test
3. **After Validation**: Deploy to production with monitoring
4. **Post-Deployment**: Set up alerts and monitoring dashboards 