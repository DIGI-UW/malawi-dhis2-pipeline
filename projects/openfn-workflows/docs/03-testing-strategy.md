# OpenFN Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for OpenFN workflows, from individual job testing to full production validation.

## Testing Philosophy

1. **Docker-First**: All tests run in containers for consistency
2. **Progressive Testing**: Start simple, increase complexity
3. **Real Data**: Use actual Excel files for validation
4. **Working Over Perfect**: Focus on tests that actually work

## Testing Levels

### Level 1: Unit Testing (Individual Jobs)

Test each job in isolation with mock data.

```bash
# Test single job
cd projects/indicator_workflow_testing

docker run --rm -it \
  -v "$(pwd):/workspace" \
  openfn-cli-test:latest \
  openfn /workspace/../openfn-workflows/workflows/sftp-dhis2/jobs/check-sftp-files.js \
    -a sftp@2.0.14 \
    -s /workspace/tests/fixtures/sftp-test-input.json \
    -o output.json
```

### Level 2: Integration Testing (Workflow Steps)

Test job sequences with state passing.

```bash
# Run the proven working tests
./run-tests.sh --cli-workflow

# This runs:
# - test-sftp-working-command.sh (30s connectivity test)
# - test-simple-sftp-job.sh (inline job test)
# - test-sftp-dhis2-workflow.sh (complete workflow)
```

### Level 3: End-to-End Testing (Full Pipeline)

Test complete workflow with real services.

```bash
# Start services
./instant package init -n sftp-storage -d
./instant package init -n dhis2-instance -d
./instant package init -n openfn -d

# Run end-to-end test
cd projects/openfn-workflows
./scripts/test-end-to-end.sh full
```

### Level 4: Production Testing

Test in production-like environment with monitoring.

## Test Infrastructure

### Docker Images

```bash
# Build test images
./build-custom-images.sh openfn-cli-test openfn

# Images created:
# - openfn-cli-test:latest (CLI testing with working SFTP)
# - openfn-custom:latest (Lightning with working SFTP)
```

### Test Data

Located in `projects/indicator_workflow_testing/tests/fixtures/`:

```json
// sftp-test-input.json - Proven working configuration
{
  "data": [],
  "configuration": {
    "host": "172.17.0.1",
    "port": 2225,
    "username": "openfn",
    "password": "instant101"
  }
}
```

### Test Scripts

Located in `projects/indicator_workflow_testing/tests/`:

```
cli/
├── test-sftp-working-command.sh    # ⭐ Proven SFTP test (30s)
├── test-simple-sftp-job.sh         # Simple inline job test
└── test-sftp-dhis2-workflow.sh     # Complete workflow test
```

## Testing Workflows

### Quick Validation (2 minutes)

```bash
cd projects/indicator_workflow_testing
./run-tests.sh --cli-workflow
```

Expected output:
```
✅ CLI SFTP Basic tests passed
✅ CLI Simple Job tests passed
✅ CLI SFTP Workflow tests passed
```

### Full Test Suite (5 minutes)

```bash
./run-tests.sh

# Runs:
# - CLI workflow tests
# - API connectivity tests
# - Excel parsing tests
# - Integration tests
```

### Manual Testing

#### Test SFTP Connection

```bash
docker run --rm -it openfn-cli-test:latest /bin/sh -c "
  openfn /tmp/test.js -a sftp@2.0.14 -s /fixtures/sftp-test-input.json
"
```

#### Test Excel Processing

```bash
# List Excel files via SFTP
./tests/cli/test-sftp-working-command.sh

# Should show:
# - ART_data_long_format.xlsx (30.2MB)
# - Direct Queries - Q1 2025 MoH Reports.xlsx (4.2MB)
# - Q2FY25_DQ_253_sites.xlsx (3.2MB)
```

## Test Patterns

### Pattern 1: Connectivity Testing

```javascript
// Test basic SFTP connection
list('/data/excel-files', state => {
  console.log('Connected:', state.data.length > 0);
  return state;
});
```

### Pattern 2: Data Validation

```javascript
// Validate Excel parsing
fn(state => {
  const { processedData } = state;
  
  console.log('Validation results:');
  console.log('- Records processed:', processedData.length);
  console.log('- Valid records:', processedData.filter(r => r.isValid).length);
  console.log('- Invalid records:', processedData.filter(r => !r.isValid).length);
  
  return state;
});
```

### Pattern 3: Error Simulation

```javascript
// Test error handling
fn(state => {
  if (!state.data || state.data.length === 0) {
    throw new Error('No data to process');
  }
  return state;
});
```

## Common Test Scenarios

### 1. New File Detection

```bash
# Test: SFTP has new files
# Expected: newFilesFound = true, files listed
./tests/cli/test-sftp-working-command.sh
```

### 2. File Download

```bash
# Test: Download detected files
# Expected: Files downloaded to local storage
./tests/cli/test-simple-sftp-job.sh
```

### 3. Excel Processing

```bash
# Test: Parse multi-sheet Excel files
# Expected: Data extracted from all sheets
./run-tests.sh --excel
```

### 4. DHIS2 Payload Generation

```bash
# Test: Transform to DHIS2 format
# Expected: Valid dataValueSets created
./tests/cli/test-sftp-dhis2-workflow.sh
```

## Debugging Failed Tests

### Check Docker Images

```bash
docker images | grep openfn
# Should show:
# openfn-cli-test:latest
# openfn-custom:latest
```

### Check Service Connectivity

```bash
# SFTP
nc -zv 172.17.0.1 2225

# DHIS2
curl -u admin:district http://localhost:8080/api/system/info

# OpenFN
curl http://localhost:4000/health_check
```

### View Test Logs

```bash
# CLI test logs
cat tests/cli/outputs/sftp-check-log.txt

# Service logs
docker service logs sftp-storage_sftp-server
docker service logs openfn_openfn
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Invalid username" | Old Docker images | Rebuild: `./build-custom-images.sh openfn-cli-test` |
| "Connection refused" | Wrong host IP | Linux: use `172.17.0.1`, Mac/Win: use `host.docker.internal` |
| "TypeError: fn is not a function" | Complex syntax | Use simple syntax: `list('/path', callback)` |
| "No module found" | Missing adaptors | Ensure Docker image has adaptors installed |

## Test Metrics

### Success Criteria

- **Unit Tests**: All jobs execute without errors
- **Integration Tests**: State passes correctly between jobs
- **End-to-End Tests**: Files processed from SFTP to DHIS2
- **Performance**: Workflow completes within 5 minutes

### Key Indicators

```bash
# Check test results
cat projects/indicator_workflow_testing/test-results.log

# Expected:
# API: PASS
# Excel Parsing: PASS
# SFTP Basic: PASS
# Integration: PASS
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: Test OpenFN Workflows

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build test environment
        run: |
          ./build-custom-images.sh openfn-cli-test
      
      - name: Run tests
        run: |
          cd projects/indicator_workflow_testing
          ./run-tests.sh --cli-workflow
```

## Best Practices

1. **Always test with real data structures**
   - Use actual Excel files
   - Test with production-like file sizes
   - Include edge cases (empty sheets, missing columns)

2. **Test incrementally**
   - Start with connectivity
   - Add data processing
   - Finally test full pipeline

3. **Monitor test performance**
   - Track execution times
   - Identify bottlenecks
   - Optimize slow operations

4. **Document test results**
   - Save test outputs
   - Track success/failure patterns
   - Update fixtures as needed

## Resources

- [Testing Index](../../indicator_workflow_testing/TESTING-INDEX.md) - Comprehensive testing documentation
- [Development Guide](02-development-guide.md) - Workflow development practices
- [SFTP Testing Plan](04-sftp-dhis2-testing-plan.md) - Specific SFTP workflow testing 