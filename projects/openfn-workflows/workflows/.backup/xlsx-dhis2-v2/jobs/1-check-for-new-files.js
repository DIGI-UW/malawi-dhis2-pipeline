/**
 * Job: 1. Check SFTP for New Excel Files
 * 
 * Description:
 * This job is triggered by a cron schedule to check an SFTP directory for new or 
 * updated Excel files. It identifies files that match predefined patterns for large 
 * file processing and passes them to the next step in the workflow.
 * 
 * OpenFn Principles:
 * - Single Responsibility: This job's sole purpose is to find new files.
 * - State Immutability: It returns a new state object with the findings.
 * - Clear Logging: Provides informative logs about its progress and decisions.
 */

// Use the SFTP `list` function to get a directory listing.
list(
  '/data/excel-files', // The directory to check on the SFTP server.
  file => true, // No initial filtering; process all items in the callback.
  state => {
    console.log('1. Checking SFTP for new Excel files...');
    
    // Define supported file extensions and patterns for large files.
    const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'];
    const LARGE_FILE_PATTERNS = [
      /ART.*data.*long.*format/i,
      /large.*data/i,
      /bulk.*import/i,
    ];
    
    // Retrieve the file tracking history from the previous state.
    const previousFiles = state.fileTracking || {};
    const currentFiles = {};
    const newFiles = [];
    let newFilesFound = false;

    // Ensure the data from the SFTP server is in the expected format.
    if (!state.data || !Array.isArray(state.data)) {
      console.error('  - Error: Invalid data structure from SFTP server.');
      return {
        ...state,
        newFilesFound: false,
        error: 'Invalid SFTP response structure.',
      };
    }
    
    console.log(`  - Found ${state.data.length} items in the SFTP directory.`);
    
    // Iterate over each item returned from the SFTP directory listing.
    state.data.forEach(file => {
      // We only care about files, not directories.
      if (file.type === '-') {
        const extension = file.name.substring(file.name.lastIndexOf('.'));
        
        // Check if the file has a supported Excel extension.
        if (SUPPORTED_EXTENSIONS.includes(extension.toLowerCase())) {
          // Check if the file name matches any of the large file patterns.
          if (LARGE_FILE_PATTERNS.some(pattern => pattern.test(file.name))) {
            const fileKey = file.name;
            const fileInfo = {
              name: file.name,
              size: file.size,
              modifiedTime: file.modifyTime,
              path: `/data/excel-files/${file.name}`,
            };
            
            currentFiles[fileKey] = fileInfo;
            
            // Determine if the file is new or has been modified.
            const previousFile = previousFiles[fileKey];
            const isNewOrModified = !previousFile || 
              previousFile.modifiedTime !== fileInfo.modifiedTime ||
              previousFile.size !== fileInfo.size;
            
            if (isNewOrModified) {
              console.log(`  - New/updated file found: ${fileKey} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
              newFiles.push(fileInfo);
              newFilesFound = true;
            } else {
              console.log(`  - Skipping unchanged file: ${fileKey}`);
            }
          } else {
            console.log(`  - Skipping file (does not match pattern): ${file.name}`);
          }
        } else {
          console.log(`  - Skipping non-Excel file: ${file.name}`);
        }
      }
    });
    
    // If no new files are found, end the workflow run here.
    if (!newFilesFound) {
      console.log('  - No new files found. Stopping workflow.');
      return {
        ...state,
        newFilesFound: false,
        workflowComplete: true,
        reason: 'No new files to process.',
      };
    }
    
    console.log(`  - Found ${newFiles.length} new/updated files to process.`);
    
    // Return the new state with the list of files to be processed.
    return {
      ...state,
      newFilesFound,
      newFiles,
      fileTracking: previousFiles, // Carry over file tracking history.
      lastChecked: new Date().toISOString(),
    };
  }
); 