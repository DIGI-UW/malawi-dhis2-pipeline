# OpenFN Workflow Development Guide

## Overview

This guide covers best practices for developing OpenFN workflows in the Malawi DHIS2 pipeline project.

## Workflow Structure

### Directory Layout

```
workflows/
└── sftp-dhis2/
    ├── project.yaml          # Workflow configuration
    ├── jobs/                 # Job definitions
    │   ├── check-sftp-files.js
    │   ├── download-sftp-files.js
    │   ├── process-excel-data.js
    │   ├── generate-dhis2-payload.js
    │   ├── upload-to-dhis2.js
    │   └── update-file-tracking.js
    ├── config.json           # Deployment configuration
    └── README.md            # Workflow documentation
```

### Project Configuration (project.yaml)

```yaml
name: sftp-dhis2
description: SFTP to DHIS2 data pipeline for HIV/TB indicators

workflows:
  sftp-dhis2:
    name: SFTP to DHIS2 Workflow
    jobs:
      CheckSFTPFiles:
        name: Check SFTP for New Files
        adaptor: '@openfn/language-sftp@latest'
        body:
          path: ./jobs/check-sftp-files.js
      # ... more jobs
    
    triggers:
      cron:
        type: cron
        cron_expression: "*/5 * * * *"  # Every 5 minutes
      webhook:
        type: webhook
        path: /webhooks/sftp-file-change
    
    edges:
      - source_trigger: cron
        target_job: CheckSFTPFiles
      - source_job: CheckSFTPFiles
        target_job: DownloadSFTPFiles
        condition_type: on_job_success
        condition_expression: state.newFilesFound === true
```

## Job Development

### OpenFN Job Syntax

```javascript
// OpenFN provides functions directly - no imports needed
fn(state => {
  console.log('Processing data...');
  return state;
});

// SFTP operations
list('/data/excel-files', state => {
  console.log('Files found:', state.data.length);
  return state;
});

// DHIS2 operations
create('dataValueSets', {
  dataValues: state.data.values
});
```

### State Management

Jobs communicate through state objects:

```javascript
// Input state from previous job
fn(state => {
  const { downloadedFiles } = state.data;
  
  // Process files
  const processedData = downloadedFiles.map(file => {
    // Processing logic
  });
  
  // Return state for next job
  return {
    ...state,
    data: {
      ...state.data,
      processedData
    }
  };
});
```

#### Advanced State Management Patterns

##### State Initialization

OpenFN workflows can initialize state through multiple approaches:

**1. Project Configuration (project.yaml)**
```yaml
workflows:
  sftp-dhis2:
    initial_state:
      fileTracking:
        lastScan: null
        processedFiles: {}
        failedFiles: []
      sftpConfig:
        directory: "/uploads/hiv-indicators/"
        supportedExtensions: [".xlsx", ".xls"]
      reportConfig:
        period: "202506"
        orgUnit: "MW_NATIONAL"
```

**2. Defensive Job-Level Initialization**
```javascript
fn(state => {
  // Defensive state initialization
  const fileTracking = state.fileTracking || {
    processedFiles: {},
    failedFiles: [],
    lastScan: null
  };
  
  const sftpConfig = state.sftpConfig || {
    directory: '/uploads/',
    supportedExtensions: ['.xlsx', '.xls'],
    retryAttempts: 3
  };
  
  // Merge initialized state
  return {
    ...state,
    fileTracking,
    sftpConfig
  };
});
```

##### State Persistence Patterns

**1. Incremental Updates**
```javascript
// Good: Update only what changed
fn(state => {
  const newFile = processFile(file);
  
  // Add to existing processed files
  state.fileTracking.processedFiles[file.name] = {
    processedAt: new Date().toISOString(),
    fileSize: file.size,
    recordCount: newFile.recordCount
  };
  
  return state;
});
```

**2. File Tracking with Timestamps**
```javascript
fn(state => {
  const now = new Date();
  const lastCheck = state.lastCheck ? new Date(state.lastCheck) : new Date(0);
  
  // Get files modified since last check
  const recentFiles = state.availableFiles.filter(file => {
    const fileModified = new Date(file.modifiedTime);
    return fileModified > lastCheck;
  });
  
  // Update cursor for next run
  state.lastCheck = now.toISOString();
  state.filesToProcess = recentFiles;
  
  return state;
});
```

**3. State-Based Deduplication**
```javascript
fn(state => {
  const fileHashes = state.fileHashes || {};
  const newFileHashes = {};
  
  const filesToProcess = state.availableFiles.filter(file => {
    // Calculate file hash
    const fileHash = `${file.name}_${file.size}_${file.modifiedTime}`;
    newFileHashes[file.name] = fileHash;
    
    // Check if file has changed
    const previousHash = fileHashes[file.name];
    return !previousHash || previousHash !== fileHash;
  });
  
  // Update file hashes
  state.fileHashes = { ...fileHashes, ...newFileHashes };
  state.filesToProcess = filesToProcess;
  
  return state;
});
```

##### Error Handling with State

**1. Error State Management**
```javascript
fn(state => {
  try {
    const result = processFile(file);
    
    // Success: update metrics
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
    
    // Add to retry queue
    state.retryQueue = state.retryQueue || [];
    state.retryQueue.push({
      file,
      error: error.message,
      retryCount: 0
    });
    
    return state;
  }
});
```

**2. Circuit Breaker Pattern**
```javascript
fn(state => {
  const circuitBreaker = state.circuitBreaker || {
    failureCount: 0,
    state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
    threshold: 5,
    timeout: 60000
  };
  
  // Check if circuit should reset
  if (circuitBreaker.state === 'OPEN') {
    const timeSinceFailure = Date.now() - circuitBreaker.lastFailureTime;
    if (timeSinceFailure > circuitBreaker.timeout) {
      circuitBreaker.state = 'HALF_OPEN';
    }
  }
  
  // Skip if circuit is open
  if (circuitBreaker.state === 'OPEN') {
    console.log('Circuit breaker OPEN, skipping processing');
    return state;
  }
  
  try {
    // Process normally
    processRiskyOperation();
    
    // Reset on success
    if (circuitBreaker.state === 'HALF_OPEN') {
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failureCount = 0;
    }
    
  } catch (error) {
    circuitBreaker.failureCount++;
    circuitBreaker.lastFailureTime = Date.now();
    
    if (circuitBreaker.failureCount >= circuitBreaker.threshold) {
      circuitBreaker.state = 'OPEN';
    }
    
    throw error;
  }
  
  state.circuitBreaker = circuitBreaker;
  return state;
});
```

##### State Performance Considerations

**1. Chunking Large Datasets**
```javascript
fn(state => {
  const CHUNK_SIZE = 100;
  const allRecords = state.largeDataset || [];
  
  // Process in chunks
  const chunks = [];
  for (let i = 0; i < allRecords.length; i += CHUNK_SIZE) {
    chunks.push(allRecords.slice(i, i + CHUNK_SIZE));
  }
  
  // Store metadata instead of full data
  state.datasetMetadata = {
    totalRecords: allRecords.length,
    chunkCount: chunks.length,
    lastProcessedChunk: 0
  };
  
  // Process first chunk
  state.currentChunk = chunks[0];
  delete state.largeDataset; // Remove large object
  
  return state;
});
```

**2. State Cleanup**
```javascript
fn(state => {
  // Process data
  const results = processData(state.data);
  
  // Clean state before passing
  return {
    ...state,
    data: results,
    // Remove sensitive/temporary data
    configuration: {},
    tempData: undefined,
    largeArrays: undefined
  };
});
```

### Error Handling

```javascript
fn(state => {
  try {
    // Main logic
    return state;
  } catch (error) {
    console.error('Job failed:', error.message);
    return {
      ...state,
      errors: {
        ...state.errors,
        jobName: error.message
      }
    };
  }
});

## Configuration Management

### File Type Configurations

Located in `configs/file-types/`:

```json
{
  "fileType": "art_data_long_format",
  "filePatterns": ["*ART*data*long*.xlsx"],
  "columnMappings": {
    "facility": {
      "sourceColumns": ["Facility", "facility"],
      "targetField": "orgUnit",
      "required": true
    },
    "value": {
      "sourceColumns": ["Value", "value"],
      "targetField": "value",
      "dataType": "numeric"
    }
  }
}
```

### Metadata Mappings

Located in `configs/metadata/`:

```json
{
  "mappingType": "dataElements",
  "mappings": {
    "HIV_ART_CURR": {
      "name": "Currently on ART",
      "dhis2Id": "de1a2b3c4d5e",
      "alternateNames": ["ART Current", "Active ART"]
    }
  }
}
```

## Development Workflow

### 1. Create New Workflow

```bash
cd projects/openfn-workflows/workflows
mkdir my-workflow
cd my-workflow

# Create project.yaml
cat > project.yaml << 'EOF'
name: my-workflow
description: My new workflow

workflows:
  my-workflow:
    name: My Workflow
    jobs:
      FirstJob:
        name: First Job
        adaptor: '@openfn/language-common@latest'
        body:
          path: ./jobs/first-job.js
EOF

# Create jobs directory
mkdir jobs
```

### 2. Develop Jobs

```bash
# Create job file
cat > jobs/first-job.js << 'EOF'
// Job logic here
fn(state => {
  console.log('Job starting...');
  // Your logic
  return state;
});
EOF
```

### 3. Test Locally with CLI

```bash
cd projects/indicator_workflow_testing

# Test individual job
docker run --rm -it \
  -v "$(pwd):/workspace" \
  openfn-cli-test:latest \
  openfn /workspace/../openfn-workflows/workflows/my-workflow/jobs/first-job.js \
    -a common@latest \
    -s /workspace/tests/fixtures/default-input.json \
    -o output.json
```

### 4. Test as Complete Workflow

See [Testing Strategy](03-testing-strategy.md) for comprehensive testing approaches.

## Workflow Sync System

The project includes a comprehensive **Workflow Sync Manager** that provides bidirectional synchronization between your local workflow code and the OpenFN UI. This is crucial for maintaining consistency across development environments and enabling both code-first and UI-first development workflows.

### Key Features

- **Bidirectional Sync**: Download workflows from UI or upload from local code
- **Version Management**: Track workflow versions with conflict detection
- **Conflict Resolution**: Automatic or manual conflict resolution strategies
- **Snapshot System**: Automatic snapshots before changes for safety
- **Package Integration**: Seamless integration with deployment lifecycle
- **Watch Mode**: Auto-sync workflows on changes
- **State Tracking**: Maintain sync state across deployments

### Quick Start

#### Check Sync Status
```bash
./packages/openfn/workflow-sync.sh status
```

#### Download Workflows from UI
```bash
# Download all workflows
./packages/openfn/workflow-sync.sh download

# Download specific workflow
./packages/openfn/workflow-sync.sh download sftp-dhis2
```

#### Upload Workflows to UI
```bash
# Upload all workflows
./packages/openfn/workflow-sync.sh upload

# Upload specific workflow
./packages/openfn/workflow-sync.sh upload sftp-dhis2
```

#### Enable Auto-Sync
```bash
# Start watch mode
./packages/openfn/workflow-sync.sh watch
```

### Configuration

Configure workflow sync behavior through environment variables in your `.env` file:

```bash
# Sync Mode Configuration
OPENFN_SYNC_MODE=manual                    # manual|auto-download|auto-upload
OPENFN_SYNC_INTERVAL=300                   # Sync interval in seconds (for watch mode)
OPENFN_CONFLICT_RESOLUTION=prompt          # prompt|local-wins|remote-wins
OPENFN_ENABLE_AUTO_SNAPSHOT=true           # Enable automatic snapshots
OPENFN_SYNC_ON_DEPLOY=true                 # Sync check on deployment
OPENFN_SYNC_ON_STARTUP=false               # Sync on package startup

# Directory Configuration
OPENFN_WORKFLOW_BASE_DIR=projects/openfn-workflows/workflows
OPENFN_STATE_DIR=.openfn-sync
```

### Sync Modes

1. **Manual Mode** (default)
   - Requires explicit sync commands
   - Full control over when syncs happen

2. **Auto-Download Mode**
   - Automatically downloads UI changes
   - Local changes require manual upload

3. **Auto-Upload Mode**
   - Automatically uploads local changes
   - UI changes require manual download

### Conflict Resolution Strategies

1. **Prompt** (default)
   - Interactive prompt when conflicts detected
   - Choose resolution per conflict

2. **Local-Wins**
   - Always use local code version
   - Overwrites UI changes

3. **Remote-Wins**
   - Always use UI version
   - Overwrites local changes

### Development Lifecycle Integration

#### Option A: UI-First Development
1. Make changes in OpenFN UI
2. Test workflows in UI
3. Download to code:
   ```bash
   ./packages/openfn/workflow-sync.sh download
   ```
4. Commit changes to git

#### Option B: Code-First Development
1. Edit workflow files locally
2. Upload to test:
   ```bash
   ./packages/openfn/workflow-sync.sh upload
   ```
3. Test in UI
4. Commit changes to git

#### Option C: Hybrid Development
1. Use watch mode for continuous sync:
   ```bash
   ./packages/openfn/workflow-sync.sh watch
   ```
2. Work in both UI and code simultaneously
3. Conflicts are automatically resolved based on your strategy

### Deployment Process

The sync system integrates with the package deployment lifecycle:

```bash
# Check for conflicts before deployment
./packages/openfn/workflow-sync.sh sync

# Deploy with automatic sync check
./instant package up -n openfn
```

### Directory Structure

```
projects/openfn-workflows/workflows/
├── sftp-dhis2/
│   ├── project.yaml           # Workflow configuration
│   ├── jobs/                  # Job definitions
│   ├── .versions/             # Downloaded versions
│   │   ├── server-2025-01-01_12-00-00.json
│   │   └── latest-*.json
│   └── .snapshots/            # Workflow snapshots
│       ├── 2025-01-01_12-00-00/
│       │   ├── metadata.json
│       │   ├── project.yaml
│       │   └── jobs/
│       └── latest -> 2025-01-01_12-00-00
└── .openfn-sync/              # Sync state files
    └── sftp-dhis2.state.json
```

### Advanced Usage

#### Creating Manual Snapshots
```bash
# Create snapshot before major changes
./packages/openfn/workflow-sync.sh snapshot sftp-dhis2 "Before major refactor"
```

#### Extracting Workflows
```bash
# Extract workflow from downloaded state file
./packages/openfn/workflow-sync.sh extract \
  projects/openfn-workflows/workflows/sftp-dhis2/.versions/latest-project.json \
  extracted-workflow/
```

#### Package Lifecycle Hooks

The workflow sync integrates automatically with package deployment:

```bash
# Pre-deployment hook (automatic if OPENFN_SYNC_ON_DEPLOY=true)
./packages/openfn/workflow-sync.sh hook pre-deploy

# Post-deployment hook
./packages/openfn/workflow-sync.sh hook post-deploy

# Startup hook (automatic if OPENFN_SYNC_ON_STARTUP=true)
./packages/openfn/workflow-sync.sh hook startup
```

### Troubleshooting Sync Issues

#### Common Issues

1. **Workflow Not Found**
   - Ensure workflow name in project.yaml matches OpenFN project name
   - Check if project exists in OpenFN UI

2. **Version Conflicts**
   - Use `sync` command to check conflicts
   - Choose appropriate resolution strategy
   - Create snapshot before resolving

3. **Upload Failures**
   - Check if OpenFN service is running
   - Verify API credentials in .env
   - Check Docker logs: `docker service logs openfn_openfn`

#### Debug Commands

```bash
# Check OpenFN service status
docker service ls | grep openfn

# View sync state
cat .openfn-sync/*.state.json | jq .

# List all versions
find projects/openfn-workflows/workflows -name "*.json" -path "*/.versions/*" -ls

# Check workflow loader logs
docker service logs openfn_workflow-loader
```

### Best Practices

1. **Always Create Snapshots**
   - Before major changes
   - Before resolving conflicts
   - Keep `OPENFN_ENABLE_AUTO_SNAPSHOT=true`

2. **Use Version Control**
   - Commit workflow changes to git
   - Include `.versions/` in `.gitignore`
   - Track `.snapshots/` for important milestones

3. **Test Before Production**
   - Use separate environments
   - Test workflows in UI before deployment
   - Verify sync status before deploying

4. **Regular Syncs**
   - Run sync checks regularly
   - Use watch mode during active development
   - Download UI changes promptly

## Best Practices

### 1. Keep Jobs Focused

Each job should have a single responsibility:
- ✅ `check-sftp-files.js` - Only checks for new files
- ✅ `download-sftp-files.js` - Only downloads files
- ❌ `process-everything.js` - Too broad

### 2. Use Configuration Files

Don't hardcode mappings in jobs:
```javascript
// ✅ Good - Load from config
const configs = loadFileTypeConfigs();
const metadata = loadMetadataMappings();

// ❌ Bad - Hardcoded
const mapping = {
  "Facility": "orgUnit",
  "Value": "value"
};
```

### 3. Handle Edge Cases

```javascript
fn(state => {
  const files = state.data || [];
  
  // Handle empty results
  if (files.length === 0) {
    console.log('No files to process');
    return { ...state, newFilesFound: false };
  }
  
  // Continue processing
  return state;
});
```

### 4. Log Appropriately

```javascript
fn(state => {
  console.log(`Processing ${state.data.length} files`);
  
  state.data.forEach((file, index) => {
    console.log(`[${index + 1}/${state.data.length}] Processing: ${file.name}`);
    // Process file
  });
  
  console.log('Processing complete');
  return state;
});
```

### 5. Clean State Before Passing

```javascript
fn(state => {
  // Process data
  const results = processData(state.data);
  
  // Clean sensitive data before passing to next job
  return {
    ...state,
    data: results,
    configuration: {} // Don't pass credentials
  };
});
```

## Common Patterns

### File Processing Pattern

```javascript
// Job 1: Check for files
list('/path', state => {
  const newFiles = state.data.filter(file => 
    !state.fileTracking[file.name]
  );
  
  return {
    ...state,
    newFiles,
    newFilesFound: newFiles.length > 0
  };
});

// Job 2: Download files (conditional)
each('$.newFiles[*]', 
  get(state => state.data.path, '/tmp/downloads')
);

// Job 3: Process files
fn(state => {
  const processedData = state.downloadedFiles.map(file => {
    // Parse and transform
  });
  
  return { ...state, processedData };
});
```

### DHIS2 Upload Pattern

```javascript
// Generate payload
fn(state => {
  const dataValueSets = {
    dataValues: state.processedData.map(item => ({
      dataElement: item.indicator,
      value: item.value,
      period: item.period,
      orgUnit: item.orgUnit
    }))
  };
  
  return { ...state, dataValueSets };
});

// Upload to DHIS2
create('dataValueSets', state => state.dataValueSets);
```

## Debugging Tips

### 1. Use Console Logging

```javascript
fn(state => {
  console.log('State at start:', JSON.stringify(state, null, 2));
  
  // Your logic
  
  console.log('State at end:', JSON.stringify(state, null, 2));
  return state;
});
```

### 2. Test with Mock Data

Create test fixtures that simulate real scenarios:

```json
{
  "data": [
    {
      "name": "test-file.xlsx",
      "size": 1024,
      "modifiedTime": "2024-01-01T00:00:00Z"
    }
  ],
  "configuration": {
    "host": "test-sftp",
    "username": "test"
  }
}
```

### 3. Use Step Caching

When testing workflows:

```bash
openfn workflow.json --cache-steps
# Results saved in .cli-cache/<workflow>/<step>.json
```

## Resources

- [OpenFN Documentation](https://docs.openfn.org/)
- [Language Adaptors](https://docs.openfn.org/adaptors)
- [Job Writing Guide](https://docs.openfn.org/documentation/jobs/job-writing-guide)
- [Testing Strategy](03-testing-strategy.md)
- [SFTP Testing Plan](04-sftp-dhis2-testing-plan.md) 