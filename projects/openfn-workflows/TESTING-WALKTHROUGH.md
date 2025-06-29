# OpenFN End-to-End Testing Walkthrough

This guide walks you through testing OpenFN workflows with **real SFTP files and a running DHIS2 instance** to ensure production readiness.

## Prerequisites

1. **Services Running**:
   ```bash
   # Start required services
   ./instant package up -n sftp-storage -d
   ./instant package up -n dhis2-instance -d
   ./instant package up -n openfn -d
   ```

2. **Install Dependencies**:
   ```bash
   sudo apt-get update
   sudo apt-get install sshpass jq
   ```

3. **Build Test Environment**:
   ```bash
   cd /home/ubuntu/code/malawi-dhis2-pipeline/projects/openfn-workflows
   docker build -f Dockerfile.test -t openfn-workflows-test .
   ```

## Step 1: Setup Real Excel Files

Use your actual Excel files for testing:

```bash
# Copy real Excel files and upload to SFTP
./scripts/setup-test-data.sh setup

# Or inspect the files first
./scripts/setup-test-data.sh inspect
```

This will use your real Excel files:
- `ART_data_long_format.xlsx` (29MB) - ART treatment data
- `Q2FY25_DQ_253_sites.xlsx` (3.1MB) - Data quality sites  
- `Direct Queries - Q1 2025 MoH Reports.xlsx` (4.0MB) - MoH reports

## Step 2: Run End-to-End Tests

Test with real infrastructure:

```bash
./scripts/test-end-to-end.sh full
```

This will:
- ✅ Verify all services are running
- 📂 List files available on SFTP
- 🔍 Test SFTP file detection
- 🌐 Test DHIS2 API connectivity

## Configuration

Override default settings with environment variables:
```bash
export SFTP_HOST=localhost
export SFTP_PORT=2225
export DHIS2_URL=http://localhost:8080
```

## Troubleshooting

### SFTP Issues
```bash
# Test manually
sftp -P 2225 malawi_user@localhost
```

### DHIS2 Issues  
```bash
# Test API
curl -u admin:district http://localhost:8080/api/system/info
```

## Expected Results

Successful tests show:
- Files detected on SFTP
- DHIS2 API accessible
- Workflows can process real data

## Step 3: Test DHIS2 Integration

Test that workflows can connect to DHIS2 and access the API:

```bash
./scripts/test-end-to-end.sh dhis2
```

This will:
- Test DHIS2 API authentication
- Check access to data elements
- Verify API connectivity

Expected output:
```
✅ DHIS2 API accessible (version: 2.40.4)
✅ Data elements accessible (count: 1250)
```

## Step 4: Test Individual Jobs (Optional)

Test specific workflow jobs with real configuration:

```bash
# Test SFTP file checking
docker run --rm \
  -v /home/ubuntu/code/malawi-dhis2-pipeline/projects/openfn-workflows:/app \
  -w /app \
  --network host \
  openfn-workflows-test \
  openfn "workflows/sftp-dhis2/jobs/check-sftp-files.js" \
  -i tests/e2e/sftp-check-input.json \
  -o tests/e2e/outputs/manual-sftp-test.json
```
 