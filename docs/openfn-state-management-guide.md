# OpenFN State Management Guide

## Overview

This guide covers comprehensive state management patterns for OpenFN workflows in the malawi-dhis2-pipeline project. State management is crucial for maintaining data consistency across workflow runs, especially in cron-based jobs that need to track file processing and maintain cursor positions.

## Table of Contents

1. [State Management Fundamentals](#state-management-fundamentals)
2. [State Persistence Patterns](#state-persistence-patterns)
3. [Initial State Configuration](#initial-state-configuration)
4. [File Tracking State Management](#file-tracking-state-management)
5. [State Flow Between Operations](#state-flow-between-operations)
6. [Error Handling and State Recovery](#error-handling-and-state-recovery)
7. [State Testing Strategies](#state-testing-strategies)
8. [Best Practices](#best-practices)

## State Management Fundamentals

### Understanding OpenFN State

OpenFN state is a JSON object that persists between job executions within a workflow run. State serves multiple purposes:

- **Data Continuity**: Pass data between jobs in a workflow
- **Cursor Management**: Track processing positions (last processed file, timestamp)
- **Configuration Storage**: Hold runtime configuration and settings
- **Error Recovery**: Maintain context for retry mechanisms
- **Progress Tracking**: Monitor workflow execution progress

### State Lifecycle

```
Workflow Trigger → Initial State → Job 1 → Updated State → Job 2 → Final State
```

### State Structure Example

```javascript
{
  // File processing state
  "fileTracking": {
    "lastScan": "2025-06-06T10:30:00Z",
    "processedFiles": {
      "report_2025_06.xlsx": {
        "processedAt": "2025-06-06T10:15:00Z",
        "fileSize": 2048576,
        "recordCount": 1250
      }
    },
    "failedFiles": [],
    "scanHistory": []
  },
  
  // Configuration
  "sftpConfig": {
    "directory": "/uploads/hiv-indicators/",
    "supportedExtensions": [".xlsx", ".xls"]
  },
  
  // Processing results
  "processedData": [
    {
      "indicator": "HIV_POSITIVE",
      "value": 120,
      "period": "202506",
      "orgUnit": "MW_HEALTH_001"
    }
  ],
  
  // Workflow metadata
  "workflowMetadata": {
    "runId": "run_20250606_103000",
    "triggerType": "cron",
    "environment": "production"
  }
}
```

## State Persistence Patterns

### 1. Lazy State Evaluation

Only update state when necessary to avoid unnecessary persistence overhead:

```javascript
// Good: Lazy evaluation
fn((state) => {
  const currentFiles = getCurrentFiles();
  const lastKnownFiles = state.fileTracking?.knownFiles || {};
  
  // Only update if there are changes
  if (JSON.stringify(currentFiles) !== JSON.stringify(lastKnownFiles)) {
    state.fileTracking = {
      ...state.fileTracking,
      knownFiles: currentFiles,
      lastUpdated: new Date().toISOString()
    };
  }
  
  return state;
});
```

### 2. Incremental State Updates

Update state incrementally rather than replacing entire sections:

```javascript
// Good: Incremental updates
fn((state) => {
  const newProcessedFile = processFile(file);
  
  // Add to existing processed files without replacing the entire object
  state.fileTracking.processedFiles[file.name] = {
    processedAt: new Date().toISOString(),
    fileSize: file.size,
    recordCount: newProcessedFile.recordCount
  };
  
  return state;
});

// Bad: Full replacement
fn((state) => {
  const allProcessedFiles = { ...state.fileTracking.processedFiles };
  allProcessedFiles[file.name] = newFile;
  
  state.fileTracking = {
    processedFiles: allProcessedFiles  // Replaces entire tracking object
  };
  
  return state;
});
```

### 3. State Chunking for Large Datasets

Break large state objects into manageable chunks:

```javascript
fn((state) => {
  const CHUNK_SIZE = 100;
  const allRecords = state.largeDataset || [];
  
  // Process in chunks to avoid memory issues
  const chunks = [];
  for (let i = 0; i < allRecords.length; i += CHUNK_SIZE) {
    chunks.push(allRecords.slice(i, i + CHUNK_SIZE));
  }
  
  // Store chunk metadata instead of full data
  state.datasetMetadata = {
    totalRecords: allRecords.length,
    chunkCount: chunks.length,
    chunkSize: CHUNK_SIZE,
    lastProcessedChunk: 0
  };
  
  // Process first chunk
  state.currentChunk = chunks[0];
  delete state.largeDataset; // Remove large object
  
  return state;
});
```

## Initial State Configuration

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

## File Tracking State Management

### Cursor-Based File Processing

Track processed files to avoid reprocessing:

```javascript
fn((state) => {
  // Initialize file tracking cursor
  const fileTracking = state.fileTracking || {
    lastProcessedFile: null,
    lastProcessedTimestamp: null,
    processedFiles: {},
    processingErrors: []
  };
  
  // Get list of available files
  const availableFiles = state.availableFiles || [];
  
  // Filter out already processed files
  const newFiles = availableFiles.filter(file => {
    const isProcessed = fileTracking.processedFiles[file.name];
    const isNewer = !fileTracking.lastProcessedTimestamp || 
                   file.modifiedTime > fileTracking.lastProcessedTimestamp;
    
    return !isProcessed && isNewer;
  });
  
  console.log(`Found ${newFiles.length} new files to process`);
  
  // Update state with new files to process
  state.newFiles = newFiles;
  state.fileTracking = fileTracking;
  
  return state;
});
```

### Time-Based Cursor Management

Use timestamps for incremental processing:

```javascript
fn((state) => {
  const now = new Date();
  const lastCheck = state.lastCheck ? new Date(state.lastCheck) : new Date(0);
  
  // Get files modified since last check
  const recentFiles = state.availableFiles.filter(file => {
    const fileModified = new Date(file.modifiedTime);
    return fileModified > lastCheck;
  });
  
  console.log(`Processing files modified since ${lastCheck.toISOString()}`);
  
  // Update cursor for next run
  state.lastCheck = now.toISOString();
  state.filesToProcess = recentFiles;
  
  return state;
});
```

### State-Based File Deduplication

Prevent duplicate processing with checksums:

```javascript
fn((state) => {
  const fileHashes = state.fileHashes || {};
  const newFileHashes = {};
  
  const filesToProcess = state.availableFiles.filter(file => {
    // Calculate file hash (simplified example)
    const fileHash = `${file.name}_${file.size}_${file.modifiedTime}`;
    newFileHashes[file.name] = fileHash;
    
    // Check if file has changed since last processing
    const previousHash = fileHashes[file.name];
    return !previousHash || previousHash !== fileHash;
  });
  
  // Update file hashes in state
  state.fileHashes = { ...fileHashes, ...newFileHashes };
  state.filesToProcess = filesToProcess;
  
  console.log(`${filesToProcess.length} files have changed since last run`);
  return state;
});
```

## State Flow Between Operations

### Sequential Job State Passing

```javascript
// Job 1: Check SFTP Files
list('/uploads/', (state) => {
  state.availableFiles = state.data;
  state.checkComplete = true;
  return state;
});

// Job 2: Download Files (uses state from Job 1)
fn((state) => {
  if (!state.checkComplete) {
    throw new Error('File check not completed');
  }
  
  const filesToDownload = state.availableFiles.slice(0, 5); // Limit batch size
  state.downloadQueue = filesToDownload;
  state.downloadStarted = true;
  
  return state;
});

// Job 3: Process Downloaded Files
fn((state) => {
  if (!state.downloadStarted) {
    throw new Error('Download not started');
  }
  
  const processedFiles = state.downloadQueue.map(file => ({
    ...file,
    processedAt: new Date().toISOString(),
    status: 'processed'
  }));
  
  state.processedFiles = processedFiles;
  state.processingComplete = true;
  
  return state;
});
```

### Conditional State Flow

```javascript
// Conditional processing based on state
fn((state) => {
  if (state.errorCount > 3) {
    // Switch to error recovery mode
    state.processingMode = 'recovery';
    state.retryQueue = state.failedFiles;
    
    console.log('Switching to error recovery mode');
  } else if (state.newFiles.length > 100) {
    // Switch to batch processing mode
    state.processingMode = 'batch';
    state.batchSize = 10;
    
    console.log('Switching to batch processing mode');
  } else {
    // Normal processing mode
    state.processingMode = 'normal';
    state.batchSize = 5;
  }
  
  return state;
});
```

### State Aggregation Patterns

```javascript
// Aggregate results from multiple operations
fn((state) => {
  const processingSummary = {
    totalFiles: state.totalFiles || 0,
    processedFiles: state.processedFiles?.length || 0,
    failedFiles: state.failedFiles?.length || 0,
    processingTime: Date.now() - new Date(state.startTime).getTime(),
    successRate: 0
  };
  
  if (processingSummary.totalFiles > 0) {
    processingSummary.successRate = 
      (processingSummary.processedFiles / processingSummary.totalFiles) * 100;
  }
  
  // Store aggregated metrics
  state.processingSummary = processingSummary;
  
  // Update historical metrics
  const historicalMetrics = state.historicalMetrics || [];
  historicalMetrics.push({
    ...processingSummary,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 30 runs
  state.historicalMetrics = historicalMetrics.slice(-30);
  
  return state;
});
```

## Error Handling and State Recovery

### Error State Management

```javascript
fn((state) => {
  try {
    // Risky operation
    const result = processFile(file);
    
    // Success: update success metrics
    state.successCount = (state.successCount || 0) + 1;
    state.lastSuccess = new Date().toISOString();
    
    return state;
    
  } catch (error) {
    // Error: update error state
    state.errorCount = (state.errorCount || 0) + 1;
    state.lastError = {
      message: error.message,
      timestamp: new Date().toISOString(),
      file: file.name
    };
    
    // Add to retry queue if retryable
    if (isRetryableError(error)) {
      state.retryQueue = state.retryQueue || [];
      state.retryQueue.push({
        file,
        error: error.message,
        retryCount: 0,
        maxRetries: 3
      });
    }
    
    // Don't throw - continue workflow
    return state;
  }
});
```

### State Recovery Patterns

```javascript
// Recovery job that processes failed items
fn((state) => {
  const retryQueue = state.retryQueue || [];
  const recoveredItems = [];
  const permanentFailures = [];
  
  retryQueue.forEach(item => {
    try {
      if (item.retryCount < item.maxRetries) {
        // Attempt recovery
        const result = retryOperation(item);
        
        recoveredItems.push({
          ...item,
          status: 'recovered',
          recoveredAt: new Date().toISOString()
        });
        
      } else {
        // Mark as permanent failure
        permanentFailures.push({
          ...item,
          status: 'permanent_failure',
          failedAt: new Date().toISOString()
        });
      }
      
    } catch (error) {
      // Increment retry count
      item.retryCount += 1;
      item.lastRetryError = error.message;
    }
  });
  
  // Update state
  state.recoveredItems = recoveredItems;
  state.permanentFailures = permanentFailures;
  state.retryQueue = retryQueue.filter(item => 
    item.retryCount < item.maxRetries && 
    !recoveredItems.find(r => r.file.name === item.file.name)
  );
  
  console.log(`Recovered ${recoveredItems.length} items, ${permanentFailures.length} permanent failures`);
  return state;
});
```

### Circuit Breaker State

```javascript
fn((state) => {
  const circuitBreaker = state.circuitBreaker || {
    failureCount: 0,
    lastFailureTime: null,
    state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
    threshold: 5,
    timeout: 60000 // 1 minute
  };
  
  const now = Date.now();
  
  // Check if circuit should be reset
  if (circuitBreaker.state === 'OPEN' && 
      circuitBreaker.lastFailureTime &&
      (now - new Date(circuitBreaker.lastFailureTime).getTime()) > circuitBreaker.timeout) {
    circuitBreaker.state = 'HALF_OPEN';
    console.log('Circuit breaker entering HALF_OPEN state');
  }
  
  // Skip processing if circuit is open
  if (circuitBreaker.state === 'OPEN') {
    console.log('Circuit breaker is OPEN, skipping processing');
    state.circuitBreaker = circuitBreaker;
    return state;
  }
  
  try {
    // Attempt processing
    const result = riskyOperation();
    
    // Success: reset circuit breaker
    if (circuitBreaker.state === 'HALF_OPEN') {
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failureCount = 0;
      console.log('Circuit breaker reset to CLOSED');
    }
    
  } catch (error) {
    // Failure: update circuit breaker
    circuitBreaker.failureCount += 1;
    circuitBreaker.lastFailureTime = new Date().toISOString();
    
    if (circuitBreaker.failureCount >= circuitBreaker.threshold) {
      circuitBreaker.state = 'OPEN';
      console.log('Circuit breaker tripped to OPEN state');
    }
    
    throw error; // Re-throw to fail the job
  }
  
  state.circuitBreaker = circuitBreaker;
  return state;
});
```

## State Testing Strategies

### Unit Testing State Functions

```javascript
// test-state-management.js
const { initializeState, updateFileTracking, validateState } = require('./state-utils');

describe('State Management', () => {
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
  
  test('should update file tracking correctly', () => {
    const state = { fileTracking: { processed: {} } };
    const file = { name: 'test.xlsx', size: 1024 };
    
    const updated = updateFileTracking(state, file);
    
    expect(updated.fileTracking.processed['test.xlsx']).toBeDefined();
    expect(updated.fileTracking.processed['test.xlsx'].fileSize).toBe(1024);
  });
  
  test('should validate required state properties', () => {
    const invalidState = { fileTracking: {} };
    
    expect(() => validateState(invalidState))
      .toThrow('Missing required state properties');
  });
  
  test('should handle state migration', () => {
    const oldState = { version: '1.0.0', processedFiles: ['file1.xlsx'] };
    const migrated = migrateState(oldState);
    
    expect(migrated.version).toBe('2.0.0');
    expect(migrated.fileTracking.processed).toContain('file1.xlsx');
  });
});
```

### Integration Testing with CLI

```bash
#!/bin/bash
# test-state-integration.sh

echo "Testing state management with OpenFN CLI..."

# Test 1: Empty state initialization
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
console.log('✅ Empty state initialization test passed');
"

# Test 2: State persistence between jobs
echo '{"fileTracking": {"processed": {"existing.xlsx": {"processedAt": "2025-06-06T10:00:00Z"}}}}' > test-partial-state.json
openfn jobs/check-sftp-files.js \
  --state test-partial-state.json \
  --dry-run \
  --output test-partial-output.json

# Verify existing state preserved and new state added
node -e "
const state = require('./test-partial-output.json');
console.assert(state.fileTracking.processed['existing.xlsx'], 'Existing state not preserved');
console.assert(state.sftpConfig, 'New state not added');
console.log('✅ State persistence test passed');
"

# Test 3: State size limits
echo '{"largeArray": ' > test-large-state.json
node -e "console.log(JSON.stringify(Array(10000).fill('test')))" >> test-large-state.json
echo '}' >> test-large-state.json

# This should handle large state gracefully
openfn jobs/check-sftp-files.js \
  --state test-large-state.json \
  --dry-run \
  --output test-large-output.json

echo "✅ Large state handling test completed"

# Test 4: Error recovery state
echo '{"errorCount": 3, "retryQueue": [{"file": {"name": "failed.xlsx"}, "retryCount": 1}]}' > test-error-state.json
openfn jobs/error-recovery.js \
  --state test-error-state.json \
  --dry-run \
  --output test-error-output.json

node -e "
const state = require('./test-error-output.json');
console.assert(state.retryQueue, 'Retry queue should be present');
console.log('✅ Error recovery state test passed');
"

# Cleanup
rm test-*.json

echo "All state management tests passed!"
```

### State Performance Testing

```javascript
// performance-test-state.js
const fs = require('fs');
const { performance } = require('perf_hooks');

function testStatePerformance() {
  console.log('🚀 State Performance Testing');
  
  // Test 1: Large state object performance
  const largeState = {
    fileTracking: {
      processed: {}
    }
  };
  
  // Add 10,000 processed files
  const start1 = performance.now();
  for (let i = 0; i < 10000; i++) {
    largeState.fileTracking.processed[`file_${i}.xlsx`] = {
      processedAt: new Date().toISOString(),
      fileSize: Math.floor(Math.random() * 1000000),
      recordCount: Math.floor(Math.random() * 1000)
    };
  }
  const end1 = performance.now();
  
  console.log(`✅ Large state creation: ${(end1 - start1).toFixed(2)}ms`);
  
  // Test 2: State serialization performance
  const start2 = performance.now();
  const serialized = JSON.stringify(largeState);
  const end2 = performance.now();
  
  console.log(`✅ State serialization: ${(end2 - start2).toFixed(2)}ms (${serialized.length} chars)`);
  
  // Test 3: State deserialization performance
  const start3 = performance.now();
  const deserialized = JSON.parse(serialized);
  const end3 = performance.now();
  
  console.log(`✅ State deserialization: ${(end3 - start3).toFixed(2)}ms`);
  
  // Test 4: State file I/O performance
  const start4 = performance.now();
  fs.writeFileSync('test-large-state.json', serialized);
  const end4 = performance.now();
  
  const start5 = performance.now();
  const fromFile = JSON.parse(fs.readFileSync('test-large-state.json', 'utf8'));
  const end5 = performance.now();
  
  console.log(`✅ State file write: ${(end4 - start4).toFixed(2)}ms`);
  console.log(`✅ State file read: ${(end5 - start5).toFixed(2)}ms`);
  
  // Test 5: State update performance
  const start6 = performance.now();
  
  // Simulate adding 100 new files
  for (let i = 10000; i < 10100; i++) {
    largeState.fileTracking.processed[`new_file_${i}.xlsx`] = {
      processedAt: new Date().toISOString(),
      fileSize: Math.floor(Math.random() * 1000000),
      recordCount: Math.floor(Math.random() * 1000)
    };
  }
  
  const end6 = performance.now();
  console.log(`✅ State incremental update: ${(end6 - start6).toFixed(2)}ms`);
  
  // Cleanup
  fs.unlinkSync('test-large-state.json');
  
  console.log('\n📊 Performance Summary:');
  console.log(`- Large state (10K files) creation: ${(end1 - start1).toFixed(2)}ms`);
  console.log(`- Serialization: ${(end2 - start2).toFixed(2)}ms`);
  console.log(`- File I/O: ${(end4 - start4 + end5 - start5).toFixed(2)}ms`);
  console.log(`- Incremental updates: ${(end6 - start6).toFixed(2)}ms`);
}

testStatePerformance();
```

## Best Practices

### 1. Always Use Defensive Patterns

```javascript
// Good: Defensive initialization
const fileTracking = state.fileTracking || {};
const config = state.config || getDefaultConfig();

// Bad: Assumes state exists
const fileTracking = state.fileTracking;
const config = state.config;
```

### 2. Validate Critical State Properties

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

### 3. Use State Versioning

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

### 4. Document State Schema

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

### 5. Monitor State Size

```javascript
fn((state) => {
  // Monitor state size to prevent performance issues
  const stateSize = JSON.stringify(state).length;
  const maxStateSize = 1000000; // 1MB limit
  
  if (stateSize > maxStateSize) {
    console.warn(`State size (${stateSize} bytes) exceeds recommended limit (${maxStateSize} bytes)`);
    
    // Implement state cleanup
    state = cleanupState(state);
  }
  
  state.metadata = {
    ...state.metadata,
    stateSize,
    lastSizeCheck: new Date().toISOString()
  };
  
  return state;
});

function cleanupState(state) {
  // Remove old historical data
  if (state.historicalMetrics && state.historicalMetrics.length > 50) {
    state.historicalMetrics = state.historicalMetrics.slice(-30);
  }
  
  // Archive old processed files
  if (state.fileTracking?.processed) {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    Object.keys(state.fileTracking.processed).forEach(fileName => {
      const fileData = state.fileTracking.processed[fileName];
      if (new Date(fileData.processedAt) < cutoffDate) {
        delete state.fileTracking.processed[fileName];
      }
    });
  }
  
  return state;
}
```

### 6. Use Immutable State Updates

```javascript
// Good: Immutable update
fn((state) => {
  return {
    ...state,
    fileTracking: {
      ...state.fileTracking,
      processed: {
        ...state.fileTracking.processed,
        [fileName]: fileData
      }
    }
  };
});

// Bad: Direct mutation
fn((state) => {
  state.fileTracking.processed[fileName] = fileData;
  return state;
});
```

### 7. Implement State Checkpointing

```javascript
fn((state) => {
  // Create checkpoint every 100 processed files
  const processedCount = Object.keys(state.fileTracking?.processed || {}).length;
  
  if (processedCount > 0 && processedCount % 100 === 0) {
    state.checkpoints = state.checkpoints || [];
    
    // Create checkpoint
    const checkpoint = {
      timestamp: new Date().toISOString(),
      processedCount,
      fileTrackingSnapshot: JSON.parse(JSON.stringify(state.fileTracking))
    };
    
    state.checkpoints.push(checkpoint);
    
    // Keep only last 10 checkpoints
    if (state.checkpoints.length > 10) {
      state.checkpoints = state.checkpoints.slice(-10);
    }
    
    console.log(`Created checkpoint at ${processedCount} processed files`);
  }
  
  return state;
});
```

This comprehensive state management guide provides all the patterns and practices needed for robust state handling in your OpenFN workflows, separated from testing concerns to maintain clear documentation boundaries.
