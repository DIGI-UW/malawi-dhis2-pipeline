/**
 * Check SFTP directory for new or updated Excel files for large file processing
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
    console.log('🔍 Checking SFTP directory for new large Excel files...');
    
    const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'];
    const directory = '/data/excel-files/';
    
    // File patterns for large file processing (focus on ART files and similar)
    const LARGE_FILE_PATTERNS = [
      /ART.*data.*long.*format/i,
      /ART.*supervision/i,
      /large.*data/i,
      /bulk.*import/i,
      /.*_data_long_format/i
    ];
    
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
          // Check if file matches large file patterns
          const matchesPattern = LARGE_FILE_PATTERNS.some(pattern => 
            pattern.test(file.name)
          );
          
          if (matchesPattern) {
            const fileKey = file.name;
            const fileInfo = {
              name: file.name,
              size: file.size,
              modifiedTime: file.modifyTime,
              path: directory + file.name,
              sizeCategory: file.size > 10 * 1024 * 1024 ? 'large' : 'normal' // > 10MB is large
            };
            
            currentFiles[fileKey] = fileInfo;
            
            // Check if this is a new file or has been modified
            const previousFile = previousFiles[fileKey];
            const isNewOrModified = !previousFile || 
              previousFile.modifiedTime !== fileInfo.modifiedTime ||
              previousFile.size !== fileInfo.size;
            
            if (isNewOrModified) {
              console.log(`🆕 New/updated large file detected: ${fileKey}`);
              console.log(`📊 File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
              newFiles.push(fileInfo);
              newFilesFound = true;
            } else {
              console.log(`⏭️  Skipping unchanged file: ${fileKey}`);
            }
          } else {
            console.log(`⏭️  Skipping file (doesn't match large file patterns): ${file.name}`);
          }
        } else {
          console.log(`⏭️  Skipping non-Excel file: ${file.name}`);
        }
      }
    });
    
    // Handle workflow completion logic
    if (!newFilesFound) {
      console.log('ℹ️  No new large files found. Workflow will stop here.');
      return {
        ...state,
        newFilesFound: false,
        newFiles: [],
        currentFileList: currentFiles,
        lastChecked: new Date().toISOString(),
        workflowComplete: true,
        message: 'No new large files to process'
      };
    }
    
    console.log(`✅ Found ${newFiles.length} new/updated large files to process`);
    
    // Log file details for large file processing
    newFiles.forEach(file => {
      console.log(`📊 File: ${file.name} - Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    });
    
    return {
      ...state,
      newFilesFound,
      newFiles,
      currentFileList: currentFiles,
      lastChecked: new Date().toISOString(),
      largeFileProcessing: true // Flag for chunked processing
    };
  }
); 