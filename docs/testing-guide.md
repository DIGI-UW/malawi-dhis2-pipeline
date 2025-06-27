# Comprehensive Testing Guide for Malawi DHIS2 Pipeline

This guide provides testing procedures for both Google Sheets and SFTP/CSV/XLSX data import workflows.

## Pre-Deployment Testing

### 1. Environment Validation

Before deploying, validate your environment setup:

```bash
# Check all environment variables
cat .env | grep -E "(GOOGLE_SHEETS|DHIS2|SFTP|OPENFN)"

# For Google Sheets workflow
npm run validate-sheets

# Verify Docker Swarm is initialized
docker info | grep Swarm
```

### 2. Build Custom Images

Build the required Docker images with embedded configurations:

```bash
# Build SFTP image with sample Excel files
./build-custom-images.sh sftp

# Build OpenFN workflows image with configurations
./build-custom-images.sh openfn-workflows
```

### 3. Configuration File Validation

Verify all configuration files are properly set up:

```bash
# Check workflow configurations
ls -la projects/openfn-workflows/workflows/sftp-dhis2/
ls -la projects/openfn-workflows/configs/file-types/

# Verify file type configurations exist
cat projects/openfn-workflows/configs/file-types/art_data_long_format.json
cat projects/openfn-workflows/configs/file-types/dq_sites.json
cat projects/openfn-workflows/configs/file-types/moh_direct_queries.json
```

## Deployment Testing

### 1. Deploy the Stack

```bash
# Initialize the project
./instant project init --env-file .env

# Deploy individual packages
./instant package init -n database-postgres
./instant package init -n dhis2-instance
./instant package init -n sftp-storage
./instant package init -n openfn
./instant package init -n reverse-proxy-nginx
```

### 2. Verify Services

```bash
# Check all services are running
docker service ls

# Expected services:
# - postgres
# - dhis2
# - sftp-server
# - openfn
# - openfn-worker
# - nginx
```

### 3. Access Services

Test access to each service:

```bash
# OpenFN
curl -f http://localhost:4000/health_check || echo "OpenFN not accessible"

# DHIS2
curl -f http://localhost:8080/api/me -u admin:district || echo "DHIS2 not accessible"

# SFTP (list files)
sftp -P 2225 openfn@localhost <<< "ls data/excel-files/"
```

## Workflow Testing

### A. Google Sheets Workflow

#### 1. Configure Credentials in OpenFN

In the OpenFN UI (http://localhost:4000):
1. Navigate to Credentials
2. Create Google Sheets credential:
   ```json
   {
     "type": "service_account",
     "project_id": "your-project",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
     "client_email": "your-service-account@project.iam.gserviceaccount.com"
   }
   ```
3. Create DHIS2 credential:
   ```json
   {
     "hostUrl": "http://dhis2:8080",
     "username": "admin",
     "password": "district"
   }
   ```

#### 2. Deploy Google Sheets Workflow

```bash
cd packages/openfn/importer/workflows/reports-data-upload-workflow/
export OPENFN_ENDPOINT=http://localhost:4000
export OPENFN_API_KEY=your_api_key
openfn deploy -c project.yaml
```

#### 3. Test Google Sheets Data Flow

1. **Manual Trigger**: In OpenFN UI, manually run the workflow
2. **Monitor Logs**: Check for successful data extraction
3. **Verify Upload**: Check DHIS2 for imported data

### B. SFTP/CSV/XLSX Workflow

#### 1. Configure SFTP Credentials in OpenFN

Create SFTP credential in OpenFN UI:
```json
{
  "host": "sftp-server",
  "port": 22,
  "username": "openfn",
  "password": "instant101"
}
```

#### 2. Deploy SFTP-DHIS2 Workflow

```bash
cd projects/openfn-workflows/workflows/sftp-dhis2/
./deploy.sh
```

#### 3. Verify Sample Files on SFTP

```bash
# Connect to SFTP and list files
sftp -P 2225 openfn@localhost
sftp> cd data/excel-files
sftp> ls
# Expected files:
# - ART_data_long_format.xlsx
# - Direct Queries - Q1 2025 MoH Reports.xlsx
# - Q2FY25_DQ_253_sites.xlsx
sftp> exit
```

#### 4. Test Automatic Processing

The workflow runs every 5 minutes (for testing). Monitor the logs:

```bash
# Watch OpenFN logs
docker service logs -f $(docker service ls --format "{{.Name}}" | grep openfn)

# Look for:
# ✓ Loaded 3 file type configurations
# ✓ File matched configuration: <type>
# ✓ Successfully processed: <filename> with <n> rows
# ✓ Generated DHIS2 payload with <n> data value sets
```

#### 5. Test Manual Triggers

```bash
# Manual trigger
curl -X POST http://localhost:4000/webhooks/manual-trigger \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# File change webhook
curl -X POST http://localhost:4000/webhooks/file-change-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/data/excel-files/ART_data_long_format.xlsx",
    "fileName": "ART_data_long_format.xlsx",
    "fileSize": 30236478,
    "modifiedTime": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

## Data Validation Testing

### 1. Test Each File Type

#### ART Data Long Format
- **File**: `ART_data_long_format.xlsx`
- **Expected**: Maps facility, indicator, value, period
- **Features**: Age/gender disaggregation

#### DQ Sites Report
- **File**: `Q2FY25_DQ_253_sites.xlsx`
- **Expected**: Converts fiscal quarters to months
- **Features**: Completeness scores

#### MoH Direct Queries
- **File**: `Direct Queries - Q1 2025 MoH Reports.xlsx`
- **Expected**: Processes multiple sheets
- **Features**: Flexible date parsing

### 2. Verify Processing Results

Check OpenFN logs for each file type:
```
✓ File ART_data_long_format.xlsx matched configuration: art_data_long_format
✓ Successfully processed: ART_data_long_format.xlsx with 1000 rows
✓ Applied transformations: dateFormat, numeric
✓ Validation passed: 1000/1000 rows valid
```

### 3. Check DHIS2 Import

1. Log into DHIS2 (http://localhost:8080)
2. Navigate to Data Entry
3. Select appropriate dataset and period
4. Verify imported values match source files

## Error Handling Testing

### 1. Invalid File Format
```bash
# Upload a malformed Excel file
echo "invalid data" > test.xlsx
scp -P 2225 test.xlsx openfn@localhost:data/excel-files/
# Check logs for error handling
```

### 2. Missing Required Columns
Test with Excel file missing required columns and verify:
- Appropriate error messages in logs
- Workflow continues processing other files
- Failed files are tracked

### 3. Data Validation Failures
Test with:
- Non-numeric values in numeric fields
- Invalid date formats
- Values outside allowed ranges

### 4. DHIS2 Connection Failures
```bash
# Temporarily stop DHIS2
docker service scale dhis2=0
# Run workflow and verify error handling
# Restart DHIS2
docker service scale dhis2=1
```

## Performance Testing

### 1. Large File Processing
```bash
# Generate large test file (10,000+ rows)
# Upload to SFTP
# Monitor processing time and memory usage
docker stats
```

### 2. Concurrent File Processing
```bash
# Upload multiple files simultaneously
# Verify parallel processing works correctly
# Check for resource conflicts
```

### 3. Processing Speed Benchmarks
- Expected: ~1000 rows/second
- Monitor: CPU and memory usage
- Check: Database connection pooling

## Configuration Testing

### 1. Add New File Type

Create new configuration:
```json
{
  "fileType": "test_format",
  "filePatterns": ["*test*.xlsx"],
  "columnMappings": {
    "indicator": {
      "sourceColumns": ["Test Indicator"],
      "targetField": "dataElement",
      "required": true
    }
  }
}
```

Deploy and test:
```bash
# Copy config to workflows
cp new_config.json projects/openfn-workflows/configs/file-types/
# Rebuild image
./build-custom-images.sh openfn-workflows
# Upload matching file and verify processing
```

### 2. Modify Existing Configuration
- Change column mappings
- Add new transformations
- Update validation rules
- Test without code changes

## Integration Testing

### 1. End-to-End Workflow Test

Run complete workflow from file upload to DHIS2:
```bash
# 1. Upload new file to SFTP
# 2. Wait for cron trigger (5 minutes)
# 3. Verify file downloaded
# 4. Check processing with correct config
# 5. Validate DHIS2 payload generation
# 6. Confirm successful upload
# 7. Verify data in DHIS2
```

### 2. Time Window Testing

Test the 3-month update window:
```bash
# Upload file with old data (>3 months)
# Verify data is filtered out
# Upload file with recent data
# Verify data is processed
```

## Troubleshooting Guide

### Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| "No configuration found for file" | Check file name matches patterns in config |
| "Required field not found" | Verify Excel column names match configuration |
| "Missing dataElement" | Update metadata mappings with valid DHIS2 UIDs |
| "Period outside time window" | Data older than 3 months is filtered out |
| "Cannot connect to SFTP" | Check SFTP service is running and credentials are correct |
| "DHIS2 upload failed" | Verify DHIS2 credentials and network connectivity |

### Debug Commands

```bash
# Check service logs
docker service logs $(docker service ls --format "{{.Name}}" | grep openfn)
docker service logs $(docker service ls --format "{{.Name}}" | grep sftp)
docker service logs $(docker service ls --format "{{.Name}}" | grep dhis2)

# Check file processing status
docker exec -it $(docker ps -q -f name=openfn) ls -la /tmp/

# Verify configurations loaded
docker exec -it $(docker ps -q -f name=openfn) ls -la /app/configs/

# Test SFTP connectivity
sftp -P 2225 -v openfn@localhost
```

## Test Checklist

### Pre-Deployment
- [ ] Environment variables configured
- [ ] Docker Swarm initialized
- [ ] Custom images built successfully
- [ ] Configuration files in place

### Deployment
- [ ] All services running
- [ ] Services accessible via expected URLs
- [ ] No errors in service logs

### Google Sheets Workflow
- [ ] Credentials configured in OpenFN
- [ ] Workflow deployed successfully
- [ ] Data extraction working
- [ ] DHIS2 upload successful

### SFTP/CSV/XLSX Workflow
- [ ] Sample files visible on SFTP
- [ ] Workflow deployed successfully
- [ ] Cron trigger executing (5 min)
- [ ] Files downloaded and processed
- [ ] Configuration matching working
- [ ] Data transformations applied
- [ ] DHIS2 payload generated
- [ ] Data uploaded to DHIS2

### Data Quality
- [ ] Validation rules enforced
- [ ] Error handling working
- [ ] Time window filtering correct
- [ ] No duplicate processing

### Performance
- [ ] Processing speed acceptable
- [ ] Memory usage reasonable
- [ ] Concurrent processing stable

## Cleanup

After testing:

```bash
# Scale down services
./instant package down -n openfn
./instant package down -n sftp-storage
./instant package down -n dhis2-instance

# Or destroy everything
./instant project destroy --env-file .env
```
