# SFTP to DHIS2 Workflow

This OpenFN workflow processes HIV indicator data from SFTP Excel files and uploads them to DHIS2. It supports both periodic cron-based checking and webhook-triggered processing for real-time file system change notifications.

## Features

- **Dual Trigger Support**: 
  - Cron trigger: Checks SFTP directory every 15 minutes for new/updated files
  - Webhook trigger: Processes files immediately when notified of changes
  - Manual trigger: For testing and manual execution

- **Smart File Processing**:
  - Automatic file type detection (HIV indicators, Direct queries)
  - Duplicate prevention through file tracking
  - Support for .xlsx and .xls files
  - Robust Excel parsing with validation

- **Enhanced Data Mapping**:
  - Fuzzy matching for indicator names
  - Support for multiple data formats
  - Comprehensive validation and error handling

## Workflow Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Cron Trigger  │    │ Webhook Trigger │    │ Manual Trigger  │
│   (15 min)      │    │ (File changes)  │    │ (Testing)       │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          v                      │                      v
┌─────────────────┐              │            ┌─────────────────┐
│ Check SFTP      │              │            │ Check SFTP      │
│ Files           │              │            │ Files           │
└─────────┬───────┘              │            └─────────┬───────┘
          │                      │                      │
          v                      v                      v
          └──────────────┐   ┌─────────────────┐   ┌────┘
                         │   │ Download SFTP   │   │
                         └──>│ Files           │<──┘
                             └─────────┬───────┘
                                       │
                                       v
                             ┌─────────────────┐
                             │ Process Excel   │
                             │ Data            │
                             └─────────┬───────┘
                                       │
                                       v
                             ┌─────────────────┐
                             │ Generate DHIS2  │
                             │ Payload         │
                             └─────────┬───────┘
                                       │
                                       v
                             ┌─────────────────┐
                             │ Upload to       │
                             │ DHIS2           │
                             └─────────┬───────┘
                                       │
                                       v
                             ┌─────────────────┐
                             │ Update File     │
                             │ Tracking        │
                             └─────────────────┘
```

## Job Descriptions

### 1. Check SFTP Files (`check-sftp-files.js`)
- Lists files in the SFTP directory
- Compares with previous file tracking state
- Identifies new or modified files
- Stops workflow if no changes detected

### 2. Download SFTP Files (`download-sftp-files.js`)
- Downloads new/updated files from SFTP
- Supports both cron-discovered and webhook-specified files
- Stores files locally for processing
- Handles download errors gracefully

### 3. Process Excel Data (`process-excel-data.js`)
- Parses Excel files using XLSX library
- Supports multiple data formats (HIV indicators, Direct queries)
- Validates data structure and content
- Extracts indicator values with metadata

### 4. Generate DHIS2 Payload (`generate-dhis2-payload.js`)
- Maps Excel indicators to DHIS2 data elements
- Uses fuzzy matching for indicator names
- Generates dataValueSets format
- Provides detailed matching statistics

### 5. Upload to DHIS2 (`upload-to-dhis2.js`)
- Sends data to DHIS2 via dataValueSets API
- Includes metadata for tracking
- Logs detailed upload results
- Handles DHIS2 response errors

### 6. Update File Tracking (`update-file-tracking.js`)
- Updates processing state for files
- Prevents duplicate processing
- Cleans up old tracking entries
- Maintains processing history

## Configuration

### Triggers

#### Cron Trigger
```yaml
cron-file-check:
  type: cron
  cron_expression: "*/15 * * * *"  # Every 15 minutes
  enabled: true
```

#### Webhook Trigger
```yaml
file-change-webhook:
  type: webhook
  enabled: true
```

Expected webhook payload:
```json
{
  "filePath": "/uploads/hiv-indicators/new-file.xlsx",
  "fileName": "new-file.xlsx",
  "fileSize": 12345,
  "modifiedTime": "2025-06-06T10:30:00Z"
}
```

### Credentials

The workflow requires these credential configurations:

1. **SFTP Credentials** (`sftp-credentials`)
   ```json
   {
     "host": "your-sftp-server.com",
     "port": 22,
     "username": "sftp-user",
     "password": "sftp-password",
     "privateKey": "optional-private-key"
   }
   ```

2. **DHIS2 Credentials** (`dhis2-credentials`)
   ```json
   {
     "hostUrl": "https://your-dhis2-instance.org",
     "username": "dhis2-user",
     "password": "dhis2-password"
   }
   ```

### File Structure

Expected SFTP directory structure:
```
/uploads/hiv-indicators/
├── DHIS2_HIV_Indicators_2025_06.xlsx
├── Direct_Queries_Q2FY25.xlsx
├── processed/
└── archive/
```

## File System Change Monitoring

While OpenFN doesn't have built-in file system watchers, you can implement external monitoring using:

1. **Linux inotify** (recommended for demo):
   ```bash
   #!/bin/bash
   inotifywait -m /path/to/sftp/uploads -e create,modify,move |
   while read path action file; do
     curl -X POST https://your-openfn-instance.com/webhooks/file-change-webhook \
       -H "Content-Type: application/json" \
       -d "{\"filePath\":\"$path$file\",\"fileName\":\"$file\",\"action\":\"$action\"}"
   done
   ```

2. **SFTP Server Hooks**: Configure your SFTP server to trigger webhooks on file operations

3. **External Monitoring Service**: Use tools like Watchdog (Python) or chokidar (Node.js)

## Testing

### Manual Testing
Use the manual trigger to test the workflow:
```bash
curl -X POST https://your-openfn-instance.com/webhooks/manual-trigger \
  -H "Content-Type: application/json" \
  -d "{\"test\": true}"
```

### Webhook Testing
Test file change notifications:
```bash
curl -X POST https://your-openfn-instance.com/webhooks/file-change-webhook \
  -H "Content-Type: application/json" \
  -d "{
    \"filePath\": \"/uploads/hiv-indicators/test-file.xlsx\",
    \"fileName\": \"test-file.xlsx\",
    \"fileSize\": 12345,
    \"modifiedTime\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }"
```

## Monitoring and Logs

The workflow provides comprehensive logging for:
- File discovery and changes
- Download progress and errors
- Excel parsing validation
- DHIS2 upload results
- File tracking updates

Use OpenFN's logging interface to monitor workflow execution and troubleshoot issues.

## Error Handling

The workflow includes robust error handling for:
- SFTP connection failures
- File download errors
- Excel parsing issues
- DHIS2 API errors
- Network timeouts

Failed processes are logged and can be retried manually or automatically depending on configuration.
