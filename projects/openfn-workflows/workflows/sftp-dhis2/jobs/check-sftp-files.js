/**
 * Check SFTP directory for new or updated files
 * This job is triggered by cron to periodically check for changes
 */

// OpenFN functions are available directly, no imports needed
// The runtime provides: list, stat from @openfn/language-sftp
// and fn from @openfn/language-common

// Get directory from config or use default, then list files
// Use correct syntax: list(dirPath, filter, callback)
list(
  '/data/excel-files',
  // Filter function - return true for all files (no filtering)
  (file) => true,
  // Callback function - process the results
  (state) => {
    console.log('Processing files in SFTP directory: /data/excel-files');
    console.log('🔍 DEBUG: State keys:', Object.keys(state));
    console.log('🔍 DEBUG: State.data type:', typeof state.data);
    console.log('🔍 DEBUG: State.data value:', JSON.stringify(state.data, null, 2));
    
    const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'];
    const directory = '/data/excel-files/';
  
    // Get previous file tracking from state
    const previousFiles = state.fileTracking || {};
    const currentFiles = {};
    let newFilesFound = false;
    const newFiles = [];
    
    // Handle different possible data formats
    let fileList = [];
    
    if (state.data && Array.isArray(state.data)) {
        console.log(`✅ Found ${state.data.length} items in state.data array`);
        fileList = state.data;
    } else if (state.data && typeof state.data === 'object') {
        console.log('⚠️  state.data is an object, checking for files property');
        if (state.data.files && Array.isArray(state.data.files)) {
            console.log(`✅ Found ${state.data.files.length} items in state.data.files array`);
            fileList = state.data.files;
        } else {
            console.log('⚠️  state.data.files is not an array, checking other properties');
            console.log('🔍 DEBUG: state.data properties:', Object.keys(state.data));
        }
    } else if (state.data === undefined || state.data === null) {
        console.log('❌ state.data is undefined or null');
        return {
            ...state,
            newFilesFound: false,
            newFiles: [],
            currentFileList: {},
            lastChecked: new Date().toISOString(),
            workflowComplete: true,
            error: 'No data returned from SFTP list operation'
        };
    } else {
        console.log(`⚠️  Unexpected state.data type: ${typeof state.data}`);
        return {
            ...state,
            newFilesFound: false,
            newFiles: [],
            currentFileList: {},
            lastChecked: new Date().toISOString(),
            workflowComplete: true,
            error: `Unexpected data format: ${typeof state.data}`
        };
    }
    
    console.log(`📁 Processing ${fileList.length} items from directory`);
  
    // Process each file in the directory
    fileList.forEach((file, index) => {
        console.log(`🔍 DEBUG: Processing item ${index}:`, JSON.stringify(file, null, 2));
        
        if (file.type === 'file') {
            const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
            
            // Only process supported file types
            if (SUPPORTED_EXTENSIONS.includes(extension)) {
                const fileKey = file.name;
                const fileInfo = {
                    name: file.name,
                    size: file.size,
                    modifiedTime: file.modifiedTime || file.modifyTime, // Handle both property names
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
