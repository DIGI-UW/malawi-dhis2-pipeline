/**
 * Check SFTP directory for new or updated files
 * This job is triggered by cron to periodically check for changes
 */

// OpenFN functions are available directly, no imports needed
// The runtime provides: list, stat from @openfn/language-sftp
// and fn from @openfn/language-common

// Get directory from config or use default, then list files
// Use simple syntax that works with our custom adaptor
list('/data/excel-files', (state) => {
    console.log('Processing files in SFTP directory: /data/excel-files');
    
const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'];
    const directory = '/data/excel-files/';
  
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
            path: directory + file.name
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
  
    // Handle workflow completion logic
    if (!newFilesFound) {
      console.log('No new files found. Workflow will stop here.');
      return {
        ...state,
        newFilesFound: false,
        newFiles: [],
        currentFileList: currentFiles,
        lastChecked: new Date().toISOString(),
        workflowComplete: true
      };
    }
    
    console.log(`Found ${newFiles.length} new/updated files to process`);
  return {
    ...state,
    newFilesFound,
    newFiles,
    currentFileList: currentFiles,
    lastChecked: new Date().toISOString()
  };
  }
);
