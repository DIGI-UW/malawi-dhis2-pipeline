/**
 * Check SFTP directory for new or updated files
 * This job is triggered by cron to periodically check for changes
 */

import { list, stat } from '@openfn/language-sftp';
import { fn } from '@openfn/language-common';

// Configuration
const SFTP_DIRECTORY = '/uploads/hiv-indicators/';
const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'];

list(SFTP_DIRECTORY, (state) => {
  console.log('Checking SFTP directory for new files...');
  
  // Get previous file tracking from state
  const previousFiles = state.fileTracking || {};
  const currentFiles = {};
  let newFilesFound = false;
  const newFiles = [];
  
  // Process each file in the directory
  state.data.forEach(file => {
    if (file.type === 'file') {
      const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      // Only process supported file types
      if (SUPPORTED_EXTENSIONS.includes(extension)) {
        const fileKey = file.name;
        const fileInfo = {
          name: file.name,
          size: file.size,
          modifiedTime: file.modifiedTime,
          path: SFTP_DIRECTORY + file.name
        };
        
        currentFiles[fileKey] = fileInfo;
        
        // Check if this is a new file or has been modified
        const previousFile = previousFiles[fileKey];
        if (!previousFile || 
            previousFile.modifiedTime !== fileInfo.modifiedTime ||
            previousFile.size !== fileInfo.size) {
          
          console.log(`New or updated file detected: ${fileKey}`);
          newFiles.push(fileInfo);
          newFilesFound = true;
        }
      }
    }
  });
  
  // Update state with findings
  return {
    ...state,
    newFilesFound,
    newFiles,
    currentFileList: currentFiles,
    lastChecked: new Date().toISOString()
  };
});

// If no new files found, stop the workflow
fn((state) => {
  if (!state.newFilesFound) {
    console.log('No new files found. Workflow will stop here.');
    return {
      ...state,
      workflowComplete: true
    };
  }
  
  console.log(`Found ${state.newFiles.length} new/updated files to process`);
  return state;
});
