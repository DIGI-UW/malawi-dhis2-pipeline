# OpenFN Testing and Development Guide

*Last Updated: June 6, 2025*

This guide provides comprehensive guidance on testing OpenFN workflows and SFTP-based triggering strategies for the malawi-dhis2-pipeline project.

> **Note:** For detailed information on state management in OpenFN workflows, see the dedicated [OpenFN State Management Guide](./openfn-state-management-guide.md).

## Table of Contents

1. [Testing Best Practices](#testing-best-practices)
2. [SFTP Triggering Strategies](#sftp-triggering-strategies)
3. [Development Workflow](#development-workflow)
4. [Examples and Code Samples](#examples-and-code-samples)

## Testing Best Practices

### Within OpenFN Testing

#### CLI-Based Development Testing

Use the OpenFN CLI for local development and testing:

```bash
# Local testing with CLI
openfn job.js -s state.json -a sftp --log info

# Dry run validation
openfn deploy . --dry-run --log info

# Compile and inspect generated code
openfn compile jobs/check-sftp-files.js -a @openfn/language-sftp

# Validate workflow configuration
openfn validate project.yaml
```

#### Multi-Environment Testing Strategy

- **Development**: Use volume mounts for rapid iteration
- **Staging**: Deploy to test OpenFN instance
- **Production**: Full deployment with monitoring

#### Testing with Container Volume Mounts

```bash
# Development mode with live code updates
docker run --rm \
  -v $(pwd)/workflows:/app/workflows \
  -e OPENFN_ENDPOINT="http://localhost:4000" \
  -e WORKFLOW_NAME="sftp-dhis2" \
  -e MODE="deploy" \
  -e DRY_RUN="true" \
  openfn-workflows:latest

# Validation mode
docker run --rm \
  -v $(pwd)/workflows:/app/workflows \
  -e MODE="validate" \
  openfn-workflows:latest
```

### Outside OpenFN Testing (Development)

#### Unit Testing Individual Jobs

```javascript
// test-job.js
const { execute } = require('@openfn/runtime');
const job = require('./jobs/check-sftp-files.js');

// Mock state for testing
const mockState = {
  fileTracking: {},
  data: [
    { 
      name: 'test.xlsx', 
      type: 'file', 
      size: 1024, 
      modifiedTime: '2024-01-01T10:00:00Z' 
    }
  ]
};

// Execute and test
execute(job, mockState).then(result => {
  console.log('Job result:', result);
  // Add assertions here
}).catch(error => {
  console.error('Job failed:', error);
});
```

#### State-Based Testing Scenarios

```javascript
// Test different state scenarios
const testScenarios = [
  { 
    name: 'empty-state', 
    state: {} 
  },
  { 
    name: 'existing-files', 
    state: { 
      fileTracking: { 
        'file1.xlsx': {
          name: 'file1.xlsx',
          size: 1024,
          modifiedTime: '2024-01-01T10:00:00Z'
        }
      } 
    } 
  },
  { 
    name: 'webhook-trigger', 
    state: { 
      data: { 
        filePath: '/uploads/new.xlsx',
        fileName: 'new.xlsx',
        fileSize: 2048
      } 
    } 
  }
];

testScenarios.forEach(scenario => {
  console.log(`Testing: ${scenario.name}`);
  // Run job with scenario.state
});
```

#### Integration Testing

Use the existing integration test framework:

```bash
# Run comprehensive integration tests
./projects/indicator_workflow_testing/deploy-and-test-sftp-integration.sh

# Test SFTP connectivity
./projects/indicator_workflow_testing/test-sftp-integration.sh
```

## SFTP Triggering Strategies

### 1. Cron-Based Polling (Current Implementation)

**Configuration:**
```yaml
# In project.yaml
triggers:
  cron-file-check:
    type: cron
    cron_expression: "*/15 * * * *"  # Every 15 minutes
    enabled: true
```

**Pros:**
- Simple and reliable
- Works with any SFTP server
- No external dependencies
- Consistent resource usage

**Cons:**
- Processing delay (up to 15 minutes)
- Resource usage even when no files
- Less responsive to urgent changes

### 2. Webhook-Based Real-Time Triggers

#### External File System Monitoring

Create a monitoring script for real-time file detection:

```bash
#!/bin/bash
# enhanced-sftp-monitor.sh
# Enhanced version for production use

SFTP_DIR="${1:-/uploads/hiv-indicators/}"
WEBHOOK_URL="${2:-http://localhost:4000/webhooks/file-change-webhook}"
LOG_FILE="/var/log/sftp-monitor.log"

# Install inotify if not available
if ! command -v inotifywait &> /dev/null; then
    echo "Installing inotify-tools..."
    sudo apt-get update && sudo apt-get install -y inotify-tools
fi

echo "Starting SFTP file monitor..." | tee -a "$LOG_FILE"
echo "Monitoring: $SFTP_DIR" | tee -a "$LOG_FILE"
echo "Webhook: $WEBHOOK_URL" | tee -a "$LOG_FILE"

# Monitor with recursive watching and detailed events
inotifywait -m "$SFTP_DIR" -r \
  -e create,modify,moved_to,close_write \
  --format '%w%f %e %T' \
  --timefmt '%Y-%m-%dT%H:%M:%S' |
while read filepath event timestamp; do
  filename=$(basename "$filepath")
  
  # Log all events
  echo "[$timestamp] Event: $event on $filepath" | tee -a "$LOG_FILE"
  
  # Only process Excel files
  if [[ "$filename" =~ \.(xlsx|xls)$ ]]; then
    echo "[$timestamp] Processing Excel file: $filename" | tee -a "$LOG_FILE"
    
    # Get file info
    if [ -f "$filepath" ]; then
      filesize=$(stat -c%s "$filepath")
      modtime=$(stat -c %Y "$filepath")
      modtime_iso=$(date -u -d @"$modtime" +"%Y-%m-%dT%H:%M:%SZ")
      
      # Trigger webhook with retry logic
      for attempt in 1 2 3; do
        if curl -X POST "$WEBHOOK_URL" \
          -H "Content-Type: application/json" \
          -d "{
            \"filePath\": \"$filepath\",
            \"fileName\": \"$filename\",
            \"fileSize\": $filesize,
            \"modifiedTime\": \"$modtime_iso\",
            \"event\": \"$event\",
            \"timestamp\": \"${timestamp}Z\"
          }" \
          --max-time 10 \
          --silent \
          --fail; then
          echo "[$timestamp] Webhook triggered successfully for $filename" | tee -a "$LOG_FILE"
          break
        else
          echo "[$timestamp] Webhook attempt $attempt failed for $filename" | tee -a "$LOG_FILE"
          sleep 2
        fi
      done
    fi
  else
    echo "[$timestamp] Ignoring non-Excel file: $filename" | tee -a "$LOG_FILE"
  fi
done
```

#### Usage:
```bash
# Start monitoring
./enhanced-sftp-monitor.sh /path/to/sftp/uploads http://openfn:4000/webhooks/file-change-webhook

# Run as systemd service (recommended for production)
sudo systemctl enable sftp-monitor
sudo systemctl start sftp-monitor
```

### 3. SFTP Server Integration

If you control the SFTP server, implement server-side hooks:

```bash
# post-upload.sh - triggered by SFTP server on file upload
#!/bin/bash
UPLOADED_FILE="$1"
OPENFN_WEBHOOK="http://openfn:4000/webhooks/file-change-webhook"

# Only trigger for Excel files
if [[ "$UPLOADED_FILE" =~ \.(xlsx|xls)$ ]]; then
  curl -X POST "$OPENFN_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{
      \"filePath\": \"$UPLOADED_FILE\",
      \"fileName\": \"$(basename "$UPLOADED_FILE")\",
      \"action\": \"upload\",
      \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
    }"
fi
```

### 4. Hybrid Approach (Recommended)

Combine multiple strategies for maximum robustness:

```yaml
# In project.yaml
triggers:
  # Primary: Real-time webhook processing
  file-change-webhook:
    type: webhook
    enabled: true
    
  # Backup: Regular polling for missed files
  cron-file-check:
    type: cron
    cron_expression: "*/15 * * * *"
    enabled: true
    
  # Recovery: Manual intervention capability
  manual-trigger:
    type: webhook
    enabled: true

edges:
  # Webhook flow (immediate processing)
  file-change-webhook->Download-SFTP-Files:
    source_trigger: file-change-webhook
    target_job: DownloadSFTPFiles
    condition_type: always
    
  # Cron flow (includes file checking)
  cron-file-check->Check-SFTP-Files:
    source_trigger: cron-file-check
    target_job: CheckSFTPFiles
    condition_type: always
    
  # Manual testing flow
  manual-trigger->Check-SFTP-Files:
    source_trigger: manual-trigger
    target_job: CheckSFTPFiles
    condition_type: always
```

## Development Workflow

### Local Development Setup

1. **Volume Mount Development:**
```bash
# Quick iteration with volume mounts
docker run --rm \
  -v $(pwd)/workflows:/app/workflows \
  -e OPENFN_ENDPOINT="http://localhost:4000" \
  -e WORKFLOW_NAME="sftp-dhis2" \
  -e MODE="deploy" \
  openfn-workflows:latest
```

2. **Validation Mode:**
```bash
# Validate without deploying
docker run --rm \
  -v $(pwd)/workflows:/app/workflows \
  -e MODE="validate" \
  openfn-workflows:latest
```

### Testing Pipeline

1. **Unit Tests**: Test individual operations with mock state
2. **Integration Tests**: Test complete workflow with test data
3. **End-to-End Tests**: Full deployment with real SFTP and DHIS2
4. **Performance Tests**: Batch processing and error handling

### Debugging and Monitoring

#### Enable Detailed Logging

```javascript
// In your jobs, use comprehensive logging
fn(state => {
  console.log('=== Job Start ===');
  console.log('Input state keys:', Object.keys(state));
  console.log('Processing files:', state.newFiles?.length || 0);
  
  // Your processing logic here
  
  console.log('=== Job Complete ===');
  console.log('Output state keys:', Object.keys(state));
  return state;
});
```

#### Monitor Workflow Execution

```bash
# View OpenFN logs
docker service logs openfn_openfn --follow

# View SFTP server logs
docker service logs sftp-storage_sftp-server --follow

# Check workflow container logs
docker ps --filter "name=workflow" --format "table {{.Names}}\t{{.Status}}"
```

## Examples and Code Samples

### Testing Manual Triggers

```bash
# Test manual workflow trigger
curl -X POST http://localhost:4000/webhooks/manual-trigger \
  -H "Content-Type: application/json" \
  -d '{"test": true, "source": "manual"}'

# Test webhook with file data
curl -X POST http://localhost:4000/webhooks/file-change-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "filePath": "/uploads/hiv-indicators/test-file.xlsx",
    "fileName": "test-file.xlsx",
    "fileSize": 12345,
    "modifiedTime": "2025-06-06T10:00:00Z"
  }'
```

### Error Handling Patterns

```javascript
// Robust error handling in jobs
get('/api/data')
  .then(state => {
    console.log('Data fetched successfully');
    return state;
  })
  .catch((error, state) => {
    console.error('API call failed:', error.message);
    
    // Log error but continue workflow
    state.errors = state.errors || [];
    state.errors.push({
      operation: 'get',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    return state;  // Continue execution
  });
```

### Performance Testing

```javascript
// Monitor job performance
fn(state => {
  const startTime = Date.now();
  const fileCount = state.newFiles?.length || 0;
  
  console.log(`Starting to process ${fileCount} files`);
  
  // Your processing logic
  
  const processingTime = Date.now() - startTime;
  const filesPerSecond = fileCount / (processingTime / 1000);
  
  console.log(`Processed ${fileCount} files in ${processingTime}ms`);
  console.log(`Performance: ${filesPerSecond.toFixed(2)} files/second`);
  
  state.performance = {
    filesProcessed: fileCount,
    processingTimeMs: processingTime,
    filesPerSecond: filesPerSecond
  };
  
  return state;
});
```

## Best Practices Summary

1. **State Management**: Always return state, use lazy evaluation with `$`
2. **Error Handling**: Use `.catch()` for graceful degradation
3. **Testing**: Implement multiple testing layers (unit, integration, e2e)
4. **Monitoring**: Use comprehensive logging and metrics
5. **Triggers**: Combine cron and webhook approaches for robustness
6. **Development**: Use volume mounts for rapid iteration
7. **Performance**: Monitor and optimize batch processing

## Related Documentation

- [SFTP Excel Integration Guide](./sftp-excel-integration.md)
- [Testing Guide](./testing-guide.md)
- [OpenFN Official Documentation](https://docs.openfn.org/)
- [Project README](../README.md)

---

*This guide is part of the malawi-dhis2-pipeline project documentation. For questions or updates, please refer to the project repository.*

## Initial State Configuration

OpenFN workflows require proper initial state setup, especially for file tracking in cron-based jobs. This section covers all approaches used in this project for configuring default/initial state.

### Overview of State Initialization Approaches

OpenFN workflows can initialize state through multiple patterns:

1. **Project Configuration** (`project.yaml`) - Modern approach
2. **Separate State Files** - Legacy approach (used in original project)
3. **Job-Level Defensive Initialization** - Runtime patterns
4. **Hybrid Approaches** - Combining multiple methods

### 1. Project Configuration Approach

#### Basic State in project.yaml

```yaml
# In project.yaml
workflows:
  sftp-dhis2:
    name: "SFTP to DHIS2 Integration"
    jobs:
      CheckSFTPFiles:
        adaptor: "@openfn/language-sftp@latest"
        body: ./jobs/check-sftp-files.js
        # Initialize default state for the workflow
        initial_state:
          fileTracking: {}
          processedFiles: []
          lastCheck: null
          sftpConfig:
            directory: "/uploads/hiv-indicators/"
            supportedExtensions: [".xlsx", ".xls"]
          reportConfig:
            period: "202506"
            orgUnit: "MW_NATIONAL"
            catAttrCombo: "HllvX50cXC0"
```

#### Advanced State Configuration

```yaml
# Complex initial state for file tracking workflows
workflows:
  sftp-dhis2:
    initial_state:
      # File tracking state
      fileTracking:
        lastScan: null
        processedFiles: {}
        failedFiles: []
        scanHistory: []
      
      # SFTP configuration
      sftpConfig:
        host: "sftp-server"
        port: 22
        directory: "/uploads/hiv-indicators/"
        supportedExtensions: [".xlsx", ".xls"]
        retryAttempts: 3
        timeout: 30000
      
      # Report configuration for DHIS2
      reportConfig:
        dataSet: "necyFYLlEI0"
        period: "202506"
        orgUnit: "drsiURo4DeK"
        catAttrCombo: "HllvX50cXC0"
        
        # Indicator mapping for DHIS2 data elements
        indicatorMapping:
          "HIV_POSITIVE": "abc123def456"
          "TB_CASES": "xyz789ghi012"
          
        # Organization unit mapping
        orgUnitMapping:
          "Site_001": "MW_HEALTH_001"
          "Site_002": "MW_HEALTH_002"
      
      # Workflow metadata
      workflowMetadata:
        version: "1.0.0"
        lastUpdated: null
        environment: "production"
        
    jobs:
      CheckSFTPFiles:
        # Jobs inherit the workflow's initial_state
        adaptor: "@openfn/language-sftp@latest"
        body: ./jobs/check-sftp-files.js
```

### 2. Separate State Files (Legacy Pattern)

The original project used separate JSON files for each job's initial state:

#### File Structure
```
workflows/
  state/
    get-report-data.json
    generate-dhis2-payload.json
```

#### Example State Files

**`workflows/state/get-report-data.json`**
```json
{
  "reportUuid": "27b977d2-02bf-4ef9-b512-9b9c495962b8",
  "startDate": "2025-05-01",
  "endDate": "2025-05-31",
  "dataFilters": {
    "includeArchived": false,
    "minDataQuality": 0.8
  }
}
```

**`workflows/state/generate-dhis2-payload.json`**
```json
{
  "reportConfig": {
    "catAttrCombo": "HllvX50cXC0",
    "dataSet": "necyFYLlEI0",
    "period": "202504",
    "orgUnit": "drsiURo4DeK",
    "reportUuid": "27b977d2-02bf-4ef9-b512-9b9c495962b8",
    "startDate": "2025-05-01",
    "endDate": "2025-05-31",
    "hivStagesReportMapping": {
      "Rapport sur les stades 3 et 4 du VIH en RDC.Mâles": "IQTe97w6j5I",
      "Rapport sur les stades 3 et 4 du VIH en RDC.Femmes": "b31fxPyPHdZ",
      "Rapport sur les stades 3 et 4 du VIH en RDC.Tout": "XMQfwO0ODSr",
      "Rapport sur les stades 3 et 4 du VIH en RDC.Moins de 1 an": "Yz7m8AH66in",
      "Rapport sur les stades 3 et 4 du VIH en RDC.1 à 4 ans": "Ius3vNNYVKm",
      "Rapport sur les stades 3 et 4 du VIH en RDC.5 à 9 ans": "xNtnllzbIGc",
      "Rapport sur les stades 3 et 4 du VIH en RDC.10 à 14 ans": "rmBvQxaGg5f",
      "Rapport sur les stades 3 et 4 du VIH en RDC.15 à 19 ans": "hbNT17TWRYF",
      "Rapport sur les stades 3 et 4 du VIH en RDC.20 à 24 ans": "xgycWMkqpHn",
      "Rapport sur les stades 3 et 4 du VIH en RDC.25 à 49 ans": "IDkk0WXXMQn",
      "Rapport sur les stades 3 et 4 du VIH en RDC.50 ans et plus": "hehguNKaht5"
    }
  }
}
```

#### Using State Files with CLI

```bash
# Run job with specific state file
openfn jobs/get-report-data.js \
  --state workflows/state/get-report-data.json \
  --credentials credentials/dhis2.json \
  --output output/report-data.json

# Chain jobs with state files
openfn jobs/generate-dhis2-payload.js \
  --state workflows/state/generate-dhis2-payload.json \
  --input output/report-data.json \
  --credentials credentials/dhis2.json \
  --output output/dhis2-payload.json
```

### 3. Job-Level Defensive Initialization

Current workflow implementation uses defensive state initialization patterns:

#### File Tracking Example

```javascript
// In check-sftp-files.js
import { list, stat } from '@openfn/language-sftp';
import { fn } from '@openfn/language-common';

// Configuration constants
const SFTP_DIRECTORY = '/uploads/hiv-indicators/';
const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'];

list(SFTP_DIRECTORY, (state) => {
  console.log('Checking SFTP directory for new files...');
  
  // Defensive state initialization
  const previousFiles = state.fileTracking || {};
  const sftpConfig = state.sftpConfig || {
    directory: SFTP_DIRECTORY,
    supportedExtensions: SUPPORTED_EXTENSIONS,
    lastCheck: null
  };
  
  // Initialize tracking arrays
  const currentFiles = {};
  let newFilesFound = false;
  const newFiles = [];
  
  // ... rest of job logic
});
```

#### Complex State Initialization

```javascript
// In process-excel-data.js
fn((state) => {
  console.log('Processing Excel files with state initialization...');
  
  // Initialize comprehensive state structure
  const workflowState = {
    // File processing state
    downloadedFiles: state.downloadedFiles || [],
    processedFiles: state.processedFiles || [],
    failedFiles: state.failedFiles || [],
    
    // Processing configuration
    excelConfig: state.excelConfig || {
      sheetMappings: {
        'HIV Indicators': 'hiv_indicators',
        'Direct Queries': 'direct_queries',
        'DQ Sites': 'dq_sites'
      },
      validationRules: {
        requiredColumns: ['Indicator', 'Value'],
        dataTypes: {
          'Value': 'number',
          'Period': 'string'
        }
      }
    },
    
    // Data transformation settings
    transformationConfig: state.transformationConfig || {
      orgUnitMapping: {},
      indicatorMapping: {},
      defaultValues: {
        period: '202506',
        orgUnit: 'MW_NATIONAL'
      }
    },
    
    // Processing metadata
    processingMetadata: state.processingMetadata || {
      startTime: new Date().toISOString(),
      version: '1.0.0',
      batchId: generateBatchId()
    }
  };
  
  // Merge initialized state back
  Object.assign(state, workflowState);
  
  // ... processing logic
});

function generateBatchId() {
  return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

### 4. Hybrid Configuration Approaches

#### Environment-Based State

```javascript
// Dynamic state initialization based on environment
fn((state) => {
  const environment = process.env.NODE_ENV || 'development';
  const baseConfig = state.baseConfig || {};
  
  // Environment-specific state initialization
  const envConfigs = {
    development: {
      sftpConfig: {
        host: 'localhost',
        port: 2222,
        directory: '/test-data/',
        retryAttempts: 1
      },
      dhis2Config: {
        baseUrl: 'http://localhost:8080',
        orgUnit: 'TEST_ORG'
      },
      debugMode: true
    },
    
    staging: {
      sftpConfig: {
        host: 'staging-sftp.example.com',
        port: 22,
        directory: '/staging-uploads/',
        retryAttempts: 3
      },
      dhis2Config: {
        baseUrl: 'https://staging-dhis2.example.com',
        orgUnit: 'MW_STAGING'
      },
      debugMode: false
    },
    
    production: {
      sftpConfig: {
        host: 'sftp.malawi-dhis2.org',
        port: 22,
        directory: '/uploads/hiv-indicators/',
        retryAttempts: 5
      },
      dhis2Config: {
        baseUrl: 'https://dhis2.malawi.org',
        orgUnit: 'MW_NATIONAL'
      },
      debugMode: false
    }
  };
  
  // Merge environment-specific config
  const environmentConfig = envConfigs[environment] || envConfigs.development;
  Object.assign(state, {
    ...baseConfig,
    ...environmentConfig,
    environment,
    configLoadedAt: new Date().toISOString()
  });
  
  console.log(`Initialized state for environment: ${environment}`);
  return state;
});
```

#### Conditional State Loading

```javascript
// Load different state configurations based on trigger type
fn((state) => {
  const triggerType = state.triggerType || 'manual';
  
  let stateConfig = {};
  
  switch (triggerType) {
    case 'cron':
      stateConfig = {
        processingMode: 'batch',
        fileFilters: {
          maxAge: 86400000, // 24 hours
          minSize: 1024     // 1KB minimum
        },
        retryConfig: {
          maxRetries: 3,
          retryDelay: 5000
        }
      };
      break;
      
    case 'webhook':
      stateConfig = {
        processingMode: 'realtime',
        fileFilters: {
          maxAge: null,     // Process any file
          minSize: 0
        },
        retryConfig: {
          maxRetries: 1,
          retryDelay: 1000
        }
      };
      break;
      
    case 'manual':
      stateConfig = {
        processingMode: 'interactive',
        fileFilters: {
          maxAge: null,
          minSize: 0
        },
        retryConfig: {
          maxRetries: 5,
          retryDelay: 2000
        },
        debugMode: true
      };
      break;
  }
  
  // Merge trigger-specific configuration
  state.triggerConfig = stateConfig;
  state.triggerType = triggerType;
  
  console.log(`State configured for trigger type: ${triggerType}`);
  return state;
});
```

### State Initialization Best Practices

#### 1. Always Use Defensive Patterns

```javascript
// Good: Defensive initialization
const fileTracking = state.fileTracking || {};
const config = state.config || getDefaultConfig();

// Bad: Assumes state exists
const fileTracking = state.fileTracking;
const config = state.config;
```

#### 2. Validate Critical State Properties

```javascript
fn((state) => {
  // Validate required state properties
  const requiredProperties = ['sftpConfig', 'reportConfig'];
  const missingProperties = requiredProperties.filter(prop => !state[prop]);
  
  if (missingProperties.length > 0) {
    throw new Error(`Missing required state properties: ${missingProperties.join(', ')}`);
  }
  
  // Validate state structure
  if (state.sftpConfig && !state.sftpConfig.directory) {
    throw new Error('sftpConfig.directory is required');
  }
  
  return state;
});
```

#### 3. Use State Versioning

```javascript
// State migration pattern
fn((state) => {
  const currentVersion = '2.0.0';
  const stateVersion = state.version || '1.0.0';
  
  if (stateVersion !== currentVersion) {
    console.log(`Migrating state from ${stateVersion} to ${currentVersion}`);
    state = migrateState(state, stateVersion, currentVersion);
  }
  
  state.version = currentVersion;
  return state;
});

function migrateState(state, fromVersion, toVersion) {
  if (fromVersion === '1.0.0' && toVersion === '2.0.0') {
    // Migrate v1 to v2
    return {
      ...state,
      fileTracking: state.processedFiles || {},
      newFormat: true
    };
  }
  return state;
}
```

#### 4. Document State Schema

```javascript
/**
 * Expected State Schema for SFTP-DHIS2 Workflow
 * 
 * @typedef {Object} WorkflowState
 * @property {Object} fileTracking - File processing tracking
 * @property {string[]} fileTracking.processedFiles - Array of processed file names
 * @property {Object[]} fileTracking.failedFiles - Array of failed file objects
 * @property {string} fileTracking.lastCheck - ISO timestamp of last check
 * 
 * @property {Object} sftpConfig - SFTP connection configuration
 * @property {string} sftpConfig.host - SFTP server hostname
 * @property {number} sftpConfig.port - SFTP server port
 * @property {string} sftpConfig.directory - Target directory path
 * 
 * @property {Object} reportConfig - DHIS2 report configuration
 * @property {string} reportConfig.period - Reporting period (YYYYMM)
 * @property {string} reportConfig.orgUnit - Organization unit ID
 * @property {string} reportConfig.dataSet - DHIS2 dataset ID
 */
```

### Testing State Initialization

#### Unit Testing State Functions

```javascript
// test-state-initialization.js
const { initializeState, validateState } = require('./state-utils');

describe('State Initialization', () => {
  test('should initialize empty state with defaults', () => {
    const state = {};
    const initialized = initializeState(state);
    
    expect(initialized.fileTracking).toBeDefined();
    expect(initialized.sftpConfig).toBeDefined();
    expect(initialized.reportConfig).toBeDefined();
  });
  
  test('should preserve existing state properties', () => {
    const state = {
      fileTracking: { processed: ['file1.xlsx'] },
      customProperty: 'test'
    };
    
    const initialized = initializeState(state);
    
    expect(initialized.fileTracking.processed).toEqual(['file1.xlsx']);
    expect(initialized.customProperty).toBe('test');
  });
  
  test('should validate required state properties', () => {
    const invalidState = { fileTracking: {} };
    
    expect(() => validateState(invalidState))
      .toThrow('Missing required state properties');
  });
});
```

#### Integration Testing with CLI

```bash
#!/bin/bash
# test-state-integration.sh

echo "Testing state initialization with CLI..."

# Test with empty state
echo "{}" > test-empty-state.json
openfn jobs/check-sftp-files.js \
  --state test-empty-state.json \
  --dry-run \
  --output test-output.json

# Verify state was properly initialized
node -e "
const state = require('./test-output.json');
console.assert(state.fileTracking, 'fileTracking not initialized');
console.assert(state.sftpConfig, 'sftpConfig not initialized');
console.log('✅ State initialization test passed');
"

# Test with partial state
echo '{"fileTracking": {"processed": ["existing.xlsx"]}}' > test-partial-state.json
openfn jobs/check-sftp-files.js \
  --state test-partial-state.json \
  --dry-run \
  --output test-partial-output.json

# Verify existing state preserved and new state added
node -e "
const state = require('./test-partial-output.json');
console.assert(state.fileTracking.processed.includes('existing.xlsx'), 'Existing state not preserved');
console.assert(state.sftpConfig, 'New state not added');
console.log('✅ Partial state preservation test passed');
"

# Cleanup
rm test-*.json

echo "All state initialization tests passed!"
```
