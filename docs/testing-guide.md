# Testing Guide for Google Sheets to DHIS2 Pipeline

This guide provides comprehensive testing procedures for the refactored Malawi DHIS2 Indicators project.

## Pre-Deployment Testing

### 1. Environment Validation

Before deploying, validate your environment setup:

```bash
# Check environment variables
cat .env | grep GOOGLE_SHEETS
cat .env | grep DHIS2

# Validate Google Sheets connection
npm run validate-sheets
```

### 2. Configuration File Validation

Verify all configuration files are properly updated:

```bash
# Check project configuration
cat packages/openfn/importer/workflows/reports-data-upload-workflow/project.yaml

# Verify state files exist
ls -la packages/openfn/importer/workflows/state/
```

Expected state files:
- `generate-dhis2-payload.json`
- `get-googlesheets-data.json`

### 3. Docker Environment Test

Test Docker Swarm deployment:

```bash
# Initialize Docker Swarm (if not already done)
docker swarm init

# Deploy the stack
docker stack deploy -c docker-compose.yml malawi_dhis2_stack

# Check service status
docker service ls
docker service logs malawi_dhis2_stack_openfn
```

## Post-Deployment Testing

### 1. OpenFn Instance Access

Verify OpenFn is running and accessible:

```bash
# Check if OpenFn is responding
curl -f http://localhost:4000/health || echo "OpenFn not accessible"

# Access OpenFn UI
open http://localhost:4000
```

### 2. Workflow Deployment

Deploy the Google Sheets workflow:

```bash
cd packages/openfn/importer/workflows/reports-data-upload-workflow/

# Set OpenFn endpoint and API key
export OPENFN_ENDPOINT=http://localhost:4000
export OPENFN_API_KEY=your_api_key

# Deploy the project
openfn deploy -c project.yaml
```

### 3. Credential Configuration

In the OpenFn UI, verify credentials are configured:
1. Navigate to Credentials section
2. Check for:
   - `admin@example.org-GoogleSheets` credential
   - `admin@example.org-DHIS2` credential

### 4. Manual Workflow Testing

#### Test Google Sheets Data Extraction

1. In OpenFn UI, navigate to the workflow
2. Manually trigger the `get-googlesheets-data` job
3. Check logs for:
   - Successful authentication
   - Data retrieval
   - Proper data structure

Expected log output:
```
✅ Successfully authenticated with Google Sheets
✅ Retrieved 150 rows from spreadsheet
✅ Found 25 HIV indicators with values
```

#### Test Payload Generation

1. Trigger the `generate-dhis2-payload` job
2. Verify logs show:
   - Indicator mapping success
   - DHIS2 payload creation
   - Data validation

Expected log output:
```
✅ Mapped 23 out of 25 indicators to DHIS2 data elements
✅ Generated payload with 23 data values
⚠️  2 indicators not mapped (see details below)
```

#### Test DHIS2 Upload

1. Trigger the `upload-to-dhis2` job
2. Check for successful upload

Expected log output:
```
✅ Successfully uploaded 23 data values to DHIS2
📊 Import summary: imported: 23, updated: 0, ignored: 0, deleted: 0
```

## Integration Testing

### 1. End-to-End Workflow Test

Run the complete workflow from Google Sheets to DHIS2:

```bash
# Trigger the workflow (via OpenFn CLI or UI)
# Monitor all three jobs in sequence:
# 1. get-googlesheets-data
# 2. generate-dhis2-payload  
# 3. upload-to-dhis2
```

### 2. Data Verification in DHIS2

1. Access your DHIS2 instance
2. Navigate to Data Entry or Reports
3. Verify the uploaded data appears correctly
4. Check data values match Google Sheets source

### 3. Error Handling Test

Test various error scenarios:

#### Invalid Google Sheets Access
1. Temporarily remove Google Sheets permissions
2. Run workflow and verify error handling
3. Check logs for appropriate error messages

#### DHIS2 Connection Issues  
1. Use invalid DHIS2 credentials
2. Run workflow and verify error handling
3. Ensure workflow fails gracefully

#### Data Validation Errors
1. Add invalid data to Google Sheets (non-numeric values)
2. Run workflow and verify data validation works
3. Check that invalid data is filtered out

## Performance Testing

### 1. Large Dataset Test

Test with larger datasets:

```bash
# Create test data with 1000+ rows
# Run workflow and monitor:
# - Memory usage
# - Processing time
# - Success rate
```

### 2. Concurrent Execution Test

Test multiple workflow instances:

```bash
# Trigger multiple workflow runs
# Monitor for:
# - Resource conflicts
# - Data consistency
# - System stability
```

## Troubleshooting Common Issues

### Google Sheets Authentication Errors

```bash
# Check service account permissions
# Verify API is enabled
# Test with validation script
npm run validate-sheets
```

### DHIS2 Upload Failures

```bash
# Check DHIS2 connectivity
curl -u username:password https://your-dhis2-instance/api/me

# Verify data element UIDs
# Check import payload format
```

### OpenFn Deployment Issues

```bash
# Check OpenFn logs
docker service logs malawi_dhis2_stack_openfn

# Verify project deployment
openfn project:list

# Check workflow configuration
openfn workflow:list
```

## Test Data Setup

### Sample Google Sheets Structure

Create a test spreadsheet with this structure:

| Indicator Name | Value | Period | Org Unit | Age Group | Gender |
|---------------|-------|---------|----------|-----------|---------|
| Number of adults and children currently receiving ART | 1250 | 202312 | Site001 | 15+ | All |
| Number of adults and children newly enrolled on ART | 85 | 202312 | Site001 | 15+ | All |
| Number of adults and children who died while on ART | 12 | 202312 | Site001 | 15+ | All |

### Test DHIS2 Instance

Ensure your test DHIS2 instance has:
- Proper data elements configured
- Organization units set up
- User permissions for data import
- API access enabled

## Automated Testing

### Create Test Scripts

```bash
# Create automated test script
cat > test-pipeline.sh << 'EOF'
#!/bin/bash
set -e

echo "🧪 Running automated pipeline tests..."

# 1. Validate environment
npm run validate-sheets

# 2. Deploy workflow
cd packages/openfn/importer/workflows/reports-data-upload-workflow/
openfn deploy -c project.yaml

# 3. Run workflow
# (Add workflow execution commands here)

# 4. Verify results
# (Add verification commands here)

echo "✅ All tests passed!"
EOF

chmod +x test-pipeline.sh
```

### Continuous Integration

For CI/CD integration, create `.github/workflows/test.yml`:

```yaml
name: Test Google Sheets Pipeline
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm install
      - run: npm run validate-sheets
        env:
          GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: ${{ secrets.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL }}
          GOOGLE_SHEETS_PRIVATE_KEY: ${{ secrets.GOOGLE_SHEETS_PRIVATE_KEY }}
          # ... other environment variables
```

## Test Checklist

Before marking the refactoring complete, ensure:

- [ ] ✅ Environment variables configured correctly
- [ ] ✅ Google Sheets connection validated
- [ ] ✅ Docker Swarm deployment successful
- [ ] ✅ OpenFn instance accessible
- [ ] ✅ Credentials configured in OpenFn
- [ ] ✅ Workflow deployed successfully
- [ ] ✅ Google Sheets data extraction works
- [ ] ✅ Indicator mapping successful
- [ ] ✅ DHIS2 payload generation correct
- [ ] ✅ DHIS2 upload successful
- [ ] ✅ Data appears correctly in DHIS2
- [ ] ✅ Error handling works properly
- [ ] ✅ Performance is acceptable
- [ ] ✅ Documentation is updated
- [ ] ✅ Legacy files removed

## Support and Debugging

### Log Locations

- OpenFn logs: `docker service logs malawi_dhis2_stack_openfn`
- Workflow logs: Available in OpenFn UI under Runs section
- Google Sheets validation: `npm run validate-sheets`

### Common Commands

```bash
# Restart OpenFn service
docker service update --force malawi_dhis2_stack_openfn

# View real-time logs
docker service logs -f malawi_dhis2_stack_openfn

# Check service health
docker service ps malawi_dhis2_stack_openfn

# Redeploy workflow
cd packages/openfn/importer/workflows/reports-data-upload-workflow/
openfn deploy -c project.yaml --force
```
