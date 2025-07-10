/**
 * Check SFTP directory for new or updated files
 * This job is triggered by cron to periodically check for changes
 * 
 * OpenFn Design Principles:
 * - Single responsibility: Only check for new files
 * - State immutability: Return new state objects
 * - Error handling: Graceful failure with clear messages
 * - Logging: Comprehensive but not excessive
 */

// OpenFN functions are available directly, no imports needed
// The runtime provides: list, stat from @openfn/language-sftp
// and fn from @openfn/language-common

// Get directory from config or use default, then list files
list(
  '/data/excel-files',
  // Filter function - return true for all files (no filtering)
  (file) => true,
  // Callback function - process the results
  (state) => {
    console.log('🔍 Checking SFTP directory for new files...');
    
const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'];
    const directory = '/data/excel-files/';
  
  // Get previous file tracking from state
  const previousFiles = state.fileTracking || {};
  const currentFiles = {};
  let newFilesFound = false;
  const newFiles = [];
    
    // Validate state.data structure
    if (!state.data || !Array.isArray(state.data)) {
      console.error('❌ Invalid data structure received from SFTP');
      return {
        ...state,
        newFilesFound: false,
        newFiles: [],
        currentFileList: {},
        lastChecked: new Date().toISOString(),
        workflowComplete: true,
        error: 'Invalid SFTP response structure'
      };
    }
    
    console.log(`📁 Found ${state.data.length} items in SFTP directory`);
  
  // Process each file in the directory
    state.data.forEach((file, index) => {
      // SFTP returns type: '-' for files, 'd' for directories
      if (file.type === '-') {
      const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      
      // Only process supported file types
      if (SUPPORTED_EXTENSIONS.includes(extension)) {
        const fileKey = file.name;
        const fileInfo = {
          name: file.name,
          size: file.size,
            modifiedTime: file.modifyTime,
            path: directory + file.name
        };
        
        currentFiles[fileKey] = fileInfo;
        
        // Check if this is a new file or has been modified
        const previousFile = previousFiles[fileKey];
          const isNewOrModified = !previousFile || 
            previousFile.modifiedTime !== fileInfo.modifiedTime ||
            previousFile.size !== fileInfo.size;
          
          if (isNewOrModified) {
            console.log(`🆕 New/updated file detected: ${fileKey}`);
          newFiles.push(fileInfo);
          newFilesFound = true;
          } else {
            console.log(`⏭️  Skipping unchanged file: ${fileKey}`);
        }
      }
    }
  });
  
    // Handle workflow completion logic
    if (!newFilesFound) {
      console.log('ℹ️  No new files found. Workflow will stop here.');
      return {
        ...state,
        newFilesFound: false,
        newFiles: [],
        currentFileList: currentFiles,
        lastChecked: new Date().toISOString(),
        workflowComplete: true,
        message: 'No new files to process'
      };
    }
    
    console.log(`✅ Found ${newFiles.length} new/updated files to process`);
  return {
    ...state,
    newFilesFound,
    newFiles,
    currentFileList: currentFiles,
    lastChecked: new Date().toISOString()
  };
  }
);
