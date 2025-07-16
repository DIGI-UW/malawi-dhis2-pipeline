# Excel Sheet to DHIS2 Workflow (Simplified)

This workflow is designed to process large Excel files and upload their data to DHIS2 in an efficient, memory-safe manner. It's built to be understandable and maintainable, especially for developers new to the project.

## Simplified Architecture

The workflow has been refactored into a clear, four-step process. This streamlined design improves readability and makes it easier to follow the flow of data.

```
1. Check for New Files → 2. Process File in Chunks → 3. Consolidate Results → 4. Update File Tracking
```

### Key Improvements

- **Simplicity**: The number of jobs has been reduced from ten to four, making the workflow easier to grasp.
- **Clarity**: The logic within each job has been simplified, with improved commenting to explain each step.
- **Efficiency**: Core functionality remains, but the streamlined process is more efficient and easier to debug.

## Workflow Jobs

### 1. `1-check-for-new-files.js`
- **Purpose**: Checks an SFTP directory for new or updated Excel files based on predefined patterns.
- **Trigger**: Runs on a CRON schedule (e.g., every 5 minutes).
- **Output**: A list of new files to be processed.

### 2. `2-process-file-chunks.js`
- **Purpose**: Reads each new Excel file in chunks, transforms the data, and uploads it to DHIS2. This job is memory-efficient as it does not load the entire file at once.
- **Core Logic**:
  - Uses `getXLSX` to stream the file.
  - Maps Excel columns to DHIS2 fields for each chunk.
  - Uploads each chunk to DHIS2 using `create('dataValueSets', ...)`.
- **Output**: Results of the chunk processing, including successes and failures.

### 3. `3-consolidate-results.js`
- **Purpose**: Gathers the results from the chunk processing job and creates a summary of the entire operation.
- **Metrics**: Calculates success rates for both chunks and individual data values.
- **Output**: A final consolidation summary.

### 4. `4-update-file-tracking.js`
- **Purpose**: Marks the processed file with its outcome in the `fileTracking` state to prevent it from being reprocessed.
- **State Management**: Ensures the workflow is idempotent and maintains a history of processed files.
- **Output**: The final, updated state of the workflow.

## Configuration

### DHIS2 Parameters
The DHIS2 configuration is managed within `2-process-file-chunks.js`:
```javascript
const DHIS2_CONFIG = {
  dataSet: 'necyFYLlEI0',
  orgUnit: 'drsiURo4DeK',
  period: '202501',
};
```

### Column Mappings
Data mapping is also handled in `2-process-file-chunks.js`. Here's an example of how Excel columns are mapped to DHIS2 data values:
```javascript
const dataValues = chunk.map(row => ({
  dataElement: row['Indicator_name'],
  orgUnit: row['Site'] || DHIS2_CONFIG.orgUnit,
  period: row['Quarter'] || DHIS2_CONFIG.period,
  value: row['IndicatorValue'],
}));
```

## How to Use

### Triggers
- **Automated**: The workflow is triggered by a CRON job that checks for new files.
- **Manual**: You can manually trigger the workflow via a webhook to the `2-process-file-chunks` job for testing or ad-hoc processing.

### Customization
- **File Patterns**: To change which files are processed, modify the `LARGE_FILE_PATTERNS` in `1-check-for-new-files.js`.
- **Chunk Size**: Adjust the `CHUNK_SIZE` in `2-process-file-chunks.js` to balance memory usage and the number of DHIS2 API calls.
- **DHIS2 Mapping**: Update the `DHIS2_CONFIG` and the column mapping logic in `2-process-file-chunks.js` to fit your specific DHIS2 implementation.

## Development and Troubleshooting

### Logging
Each job provides clear and informative logs. The job number prefix (e.g., "1.", "2.") helps you follow the workflow's progress in the logs.

### Common Issues
- **SFTP Connection**: Ensure that the SFTP credentials and server address are correctly configured in your OpenFn project.
- **DHIS2 Permissions**: The DHIS2 user needs the necessary permissions to create and update data value sets.
- **Data Mapping**: If you see errors during the `2-process-file-chunks` job, double-check that the Excel column names match what's expected in the mapping logic.

This refactored workflow should be much easier to work with. If you have any questions, the simplified structure and improved logging are there to help guide you. 