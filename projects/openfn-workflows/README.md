# OpenFN Workflows Testing Framework

## Overview

This Docker-based testing framework allows you to develop, test, and iterate on OpenFN workflows locally before deploying them to the OpenFN Lightning platform. It provides confidence that your workflows will work correctly when deployed.

## Quick Start

### 1. Build the Testing Environment

```bash
cd projects/openfn-workflows
npm run build
```

### 2. Test Individual Jobs

```bash
# Test all jobs
npm run test:jobs

# Validate syntax only
./scripts/test-jobs.sh validate

# Create test fixtures
./scripts/test-jobs.sh fixtures
```

### 3. Test Complete Workflows

```bash
# Test workflow configuration and execution
npm run test:workflows

# Full test suite with documentation
./scripts/test-workflows.sh full
```

### 4. Interactive Development

```bash
# Start interactive OpenFN CLI environment
npm run dev

# Run specific OpenFN commands
npm run cli -- job workflows/sftp-dhis2/jobs/check-sftp-files.js
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Docker Testing Environment                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   OpenFN CLI    │    │  Node.js 18     │                │
│  │   + Adaptors    │    │  + Testing      │                │
│  └─────────────────┘    │    Tools        │                │
│                         └─────────────────┘                │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Job Files     │    │  Test Fixtures  │                │
│  │   (.js)         │    │  (.json)        │                │
│  └─────────────────┘    └─────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
projects/openfn-workflows/
├── workflows/
│   └── sftp-dhis2/
│       ├── project.yaml          # Workflow configuration
│       ├── jobs/                 # Job definitions
│       │   ├── check-sftp-files.js
│       │   ├── download-sftp-files.js
│       │   ├── process-excel-data.js
│       │   ├── generate-dhis2-payload.js
│       │   ├── upload-to-dhis2.js
│       │   └── update-file-tracking.js
│       └── README.md
├── tests/
│   ├── fixtures/                 # Test input data
│   │   ├── default-input.json
│   │   ├── check-sftp-files-input.json
│   │   └── workflow-input.json
│   └── outputs/                  # Test results
│       ├── job-name-output.json
│       ├── job-name-log.txt
│       └── workflow-docs.md
├── scripts/
│   ├── test-jobs.sh             # Individual job testing
│   └── test-workflows.sh        # Workflow integration testing
├── Dockerfile.test              # Docker testing environment
├── package.json                 # NPM configuration
└── README.md                    # This file
```

## Testing Commands

### Job Testing

```bash
# Test all jobs with validation and execution
./scripts/test-jobs.sh test

# Validate job syntax only
./scripts/test-jobs.sh validate

# Create test fixtures for all jobs
./scripts/test-jobs.sh fixtures

# Build Docker testing image
./scripts/test-jobs.sh build

# Clean test outputs
./scripts/test-jobs.sh clean
```

### Workflow Testing

```bash
# Run integration tests
./scripts/test-workflows.sh test

# Validate workflow configuration
./scripts/test-workflows.sh validate

# Create workflow execution plan
./scripts/test-workflows.sh plan

# Test workflow execution
./scripts/test-workflows.sh execute

# Generate workflow documentation
./scripts/test-workflows.sh docs

# Run complete test suite
./scripts/test-workflows.sh full
```

### NPM Scripts

```bash
# Test commands
npm test                    # Run Jest tests
npm run test:jobs          # Test individual jobs
npm run test:workflows     # Test complete workflows
npm run test:coverage      # Test with coverage

# Development commands
npm run build              # Build Docker testing image
npm run dev                # Interactive development environment
npm run cli                # Run OpenFN CLI commands

# Validation commands
npm run validate           # Validate workflow configurations
npm run lint               # Lint job files
```

## Development Workflow

### 1. Create/Edit Jobs

Edit job files in `workflows/sftp-dhis2/jobs/`:

```javascript
// Example job structure
// OpenFN functions are available directly, no imports needed

fn((state) => {
  console.log('Processing data...');
  
  // Your job logic here
  
  return {
    ...state,
    processed: true
  };
});
```

### 2. Test Locally

```bash
# Test syntax
./scripts/test-jobs.sh validate

# Test execution with fixtures
./scripts/test-jobs.sh test

# Test complete workflow
./scripts/test-workflows.sh test
```

### 3. Create Test Fixtures

Create test input files in `tests/fixtures/`:

```json
{
  "data": {
    "message": "Test data"
  },
  "configuration": {
    "baseUrl": "https://test-dhis2.example.com/api",
    "username": "test_user",
    "password": "test_pass"
  }
}
```

### 4. Deploy to OpenFN

Once tests pass locally:

```bash
# Upload to OpenFN Lightning
cd ../..
./packages/openfn/instant-workflow-sync.sh upload

# Or rebuild and redeploy
./build-custom-images.sh openfn-workflows
./instant package up -n openfn -d
```

## OpenFN Job Syntax

### Correct Syntax (No Imports)

```javascript
// ✅ Correct - OpenFN runtime provides functions directly
fn((state) => {
  console.log('Processing...');
  return state;
});

// ✅ Correct - SFTP operations
list('/uploads/', (state) => {
  console.log('Files:', state.data);
  return state;
});

// ✅ Correct - DHIS2 operations
create('dataValueSets', {
  dataValues: state.data.values
});
```

### Incorrect Syntax (With Imports)

```javascript
// ❌ Incorrect - Don't use imports in OpenFN jobs
import { fn } from '@openfn/language-common';
import { list } from '@openfn/language-sftp';

// This will cause runtime errors in OpenFN
```

## Test Fixtures

### Default Input

```json
{
  "data": {},
  "configuration": {
    "hostUrl": "test.example.com",
    "username": "test_user",
    "password": "test_pass",
    "baseUrl": "https://test-dhis2.example.com/api"
  }
}
```

### SFTP Test Input

```json
{
  "data": [
    {
      "name": "test-file.xlsx",
      "type": "file",
      "size": 1024,
      "modifiedTime": "2024-01-01T12:00:00Z"
    }
  ],
  "fileTracking": {},
  "configuration": {
    "hostUrl": "test-sftp.example.com",
    "username": "test_user",
    "password": "test_pass"
  }
}
```

### DHIS2 Test Input

```json
{
  "data": {
    "dataValues": [
      {
        "dataElement": "TEST_DE_001",
        "period": "202401",
        "orgUnit": "TEST_OU_001",
        "value": "100"
      }
    ]
  },
  "configuration": {
    "baseUrl": "https://test-dhis2.example.com/api",
    "username": "test_user",
    "password": "test_pass"
  }
}
```

## Continuous Integration

### GitHub Actions Integration

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
          cd projects/openfn-workflows
          npm run build
      
      - name: Test jobs
        run: |
          cd projects/openfn-workflows
          npm run test:jobs
      
      - name: Test workflows
        run: |
          cd projects/openfn-workflows
          npm run test:workflows
```

### Pre-commit Hooks

```bash
#!/bin/bash
# .git/hooks/pre-commit

cd projects/openfn-workflows

# Validate syntax
./scripts/test-jobs.sh validate
if [ $? -ne 0 ]; then
    echo "Job validation failed. Please fix syntax errors."
    exit 1
fi

# Test workflows
./scripts/test-workflows.sh validate
if [ $? -ne 0 ]; then
    echo "Workflow validation failed. Please fix configuration errors."
    exit 1
fi

echo "All tests passed!"
```

## Troubleshooting

### Common Issues

1. **Import Errors**
   ```
   Failed to import module "@openfn/language-common"
   ```
   **Solution:** Remove ES6 import statements. OpenFN provides functions directly.

2. **Syntax Errors**
   ```
   SyntaxError: Unexpected token 'import'
   ```
   **Solution:** Use OpenFN-specific syntax without imports.

3. **Docker Build Fails**
   ```
   Error: Cannot find module '@openfn/cli'
   ```
   **Solution:** Rebuild the Docker image: `npm run build`

### Debug Commands

```bash
# Check Docker image
docker images | grep openfn-workflows-test

# Run interactive shell in container
docker run -it --rm -v $(pwd):/app openfn-workflows-test sh

# Check OpenFN CLI version
npm run cli -- --version

# Validate specific job
npm run cli -- job workflows/sftp-dhis2/jobs/check-sftp-files.js --dry-run
```

### Logs and Outputs

- **Job logs:** `tests/outputs/job-name-log.txt`
- **Job outputs:** `tests/outputs/job-name-output.json`
- **Workflow docs:** `tests/outputs/workflow-docs.md`
- **Workflow plan:** `tests/outputs/workflow-plan.json`

## Best Practices

1. **Test Early and Often**
   - Test jobs individually before integration
   - Use meaningful test fixtures
   - Validate syntax before testing execution

2. **Use Proper OpenFN Syntax**
   - No ES6 imports in job files
   - Use OpenFN-provided functions directly
   - Follow OpenFN documentation patterns

3. **Mock External Dependencies**
   - Use test fixtures for external data
   - Mock file system operations
   - Provide test credentials

4. **Document Your Workflows**
   - Generate documentation with `./scripts/test-workflows.sh docs`
   - Keep README files updated
   - Comment complex job logic

5. **Version Control**
   - Commit job files and configurations
   - Exclude test outputs (`.gitignore`)
   - Track test fixtures for reproducibility

## Resources

- [OpenFN Documentation](https://docs.openfn.org/)
- [OpenFN CLI Documentation](https://docs.openfn.org/documentation/cli)
- [OpenFN Adaptors](https://docs.openfn.org/adaptors)
- [DHIS2 Language Adaptor](https://docs.openfn.org/adaptors/packages/dhis2-docs)
- [SFTP Language Adaptor](https://docs.openfn.org/adaptors/packages/sftp-docs) 