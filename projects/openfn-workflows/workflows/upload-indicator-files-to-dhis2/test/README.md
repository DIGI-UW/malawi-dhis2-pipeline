# DHIS2 Workflow Testing

This directory contains testing and verification tools for the OpenFN DHIS2 upload workflow.

## Overview

The test suite includes:
- **API debugging scripts**: Direct DHIS2 API testing to isolate workflow issues
- **Data verification scripts**: Validate uploaded data values and disaggregation
- **Test data**: Sample files and expected results

## Quick Start

### Verify Data Upload

After running the workflow, verify that data was correctly uploaded to DHIS2:

```bash
cd projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2

# Run verification with default settings (localhost:8080)
./test/verify-data-upload.sh

# Or specify DHIS2 endpoint
DHIS2_URL=http://dhis2:8080 ./test/verify-data-upload.sh

# With custom credentials
DHIS2_URL=http://dhis2:8080 DHIS2_USER=admin DHIS2_PASS=district ./test/verify-data-upload.sh
```

### What It Verifies

The verification script checks:
1. ✓ Total data values (expected: 781)
2. ✓ Unique organization units (~21 facilities)
3. ✓ Unique category option combos (55 disaggregations)
4. ✓ No duplicate values
5. ✓ No default combo usage (ensures proper disaggregation)
6. ✓ Value distribution statistics
7. ✓ Sample disaggregations (sex + age groups)

### Understanding Results

**PASS Status**: All verifications passed
- 781 data values uploaded
- 55 unique category combos used
- No duplicates or errors
- Proper disaggregation by sex and age

**FAIL Status**: Issues detected
- Check `test/dhis2-api-results/verification-summary.txt` for details
- Review individual test results in `test/dhis2-api-results/`

## Test Scripts

### `verify-data-upload.sh`

Comprehensive verification of uploaded data values.

**Usage:**
```bash
./test/verify-data-upload.sh
```

**Environment Variables:**
- `DHIS2_URL` - DHIS2 instance URL (default: http://localhost:8080)
- `DHIS2_USER` - Admin username (default: admin)
- `DHIS2_PASS` - Admin password (default: district)

**Output:**
- Results saved to `test/dhis2-api-results/`
- Summary report: `verification-summary.txt`
- Detailed JSON responses for each test

**Exit Codes:**
- 0: All tests passed
- 1: One or more tests failed

### `dhis2-api-debug.sh`

Debug script for testing DHIS2 API metadata operations (categories, combos, etc).

**Usage:**
```bash
./test/dhis2-api-debug.sh
```

## Expected Test Data

### TX_CURR Upload (2025Q2)

**File:** `PEPFAR_TxCURR_2025_Q2_Cleaned_v3_20250805160300.csv`

**Expected Results:**
- Total rows: 781
- Data element: TX_CURR (qGKa4asLplN)
- Period: 2025Q2
- Disaggregations: 55 unique (sex × age group combinations)
- Organization units: 21 facilities

**Sample Disaggregations:**
- Male + 50-54 years
- Female + 15-19 years
- Male + All ages
- FNP (Female, Non-Pregnant) + various age groups
- FBF (Female, Breastfeeding) + various age groups

## Troubleshooting

### Connection Issues

**Error:** "DHIS2 connection failed"

**Solution:**
1. Verify DHIS2 is running: `docker ps | grep dhis2`
2. Check URL is correct: `curl http://localhost:8080/api/me`
3. Verify credentials are correct

### No Data Found

**Error:** "Total data values: 0 (expected: 781)"

**Possible Causes:**
1. Workflow hasn't run yet or failed
2. Wrong period specified in script
3. Data was uploaded to different data set

**Solution:**
1. Check workflow logs: `projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2/logs/openfn.log.txt`
2. Verify data set ID in DHIS2 matches script
3. Check period format matches workflow output

### Duplicate Values

**Error:** "Found N duplicate combinations"

**Explanation:** Same data (orgUnit + categoryOptionCombo) uploaded multiple times

**Solution:**
1. Review workflow logic for duplicate processing
2. Check if data was re-uploaded without clearing previous values
3. Use DHIS2 UI to inspect duplicates: Analytics → Data Visualizer

### Default Combo Usage

**Warning:** "Found N values using default combo"

**Explanation:** Some data lacks proper disaggregation (sex + age)

**Possible Causes:**
1. Missing category mappings in file configuration
2. Category option combo not found/created
3. Data rows missing sex or age values

**Solution:**
1. Review category option combo creation in Job 3 logs
2. Check `state_into_job_4.json` for categoryOptionCombos mappings
3. Verify source CSV has complete sex/age data

## API Endpoints Used

The verification script queries these DHIS2 API endpoints:

### Authentication
```
GET /api/me
```

### Data Values
```
GET /api/dataValueSets?dataSet={id}&period={period}
GET /api/dataValues?dataElement={id}&period={period}&paging=false
GET /api/dataValues?dataElement={id}&period={period}&orgUnit={id}&paging=false
GET /api/dataValues?dataElement={id}&period={period}&categoryOptionCombo={id}&paging=false
```

### Metadata
```
GET /api/categoryOptionCombos/{id}?fields=id,name,categoryOptions[id,name,code]
```

## Advanced Usage

### Custom Period Testing

To test a different period, modify the script:

```bash
# Edit PERIOD variable in verify-data-upload.sh
PERIOD="2025Q3"  # Change from 2025Q2
```

### Specific Facility Testing

Test a single facility:

```bash
# In verify-data-upload.sh, change SAMPLE_ORG
SAMPLE_ORG="DHLIhAqjErN"  # Area 25 Urban Health Centre
```

### Export All Data Values

Extract all uploaded data to JSON:

```bash
curl -s -u admin:district "http://localhost:8080/api/dataValues?dataElement=qGKa4asLplN&period=2025Q2&paging=false" \
  | python3 -m json.tool > all-tx-curr-data.json
```

## Integration with CI/CD

The verification script can be integrated into automated testing:

```bash
#!/bin/bash
# Deploy and verify workflow

# 1. Deploy workflow changes
./deploy-workflow.sh

# 2. Run workflow
./run-workflow.sh

# 3. Verify results
cd projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2
if ./test/verify-data-upload.sh; then
    echo "✓ Verification passed - deployment successful"
    exit 0
else
    echo "✗ Verification failed - rolling back"
    ./rollback-workflow.sh
    exit 1
fi
```

## Contributing

When adding new test files:
1. Place test data in `test/fixtures/`
2. Update expected values in verification scripts
3. Document new tests in this README
4. Ensure scripts are executable (`chmod +x`)

## Support

For issues with:
- **Workflow**: Check OpenFN logs in `logs/openfn.log.txt`
- **DHIS2**: Check DHIS2 logs in `logs/dhis2.log.txt`
- **Verification**: Check test results in `test/dhis2-api-results/`

