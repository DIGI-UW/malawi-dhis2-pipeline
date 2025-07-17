/**
 * Checks an SFTP directory for new or updated Excel files.
 * This job identifies files for large-file processing and passes them to the next
 * step. It keeps track of processed files to avoid duplication.
 */
list(
  '/data/excel-files',
  (file) => true,
  (state) => {
    console.log('Checking SFTP for new large Excel files...');
    
    const { data: sftpFiles, fileTracking = {} } = state;

    if (!Array.isArray(sftpFiles)) {
      console.error('Error: Invalid data structure from SFTP.');
      return { ...state, newFilesFound: false, error: 'Invalid SFTP response.' };
    }

    const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'];
    const LARGE_FILE_PATTERNS = [/ART.*data.*long.*format/i, /large.*data/i, /bulk.*import/i];
    
    const newFiles = sftpFiles.filter(file => {
      if (file.type !== '-') return false;

      const extension = file.name.slice(file.name.lastIndexOf('.'));
      if (!SUPPORTED_EXTENSIONS.includes(extension.toLowerCase())) return false;
      
      if (!LARGE_FILE_PATTERNS.some(pattern => pattern.test(file.name))) return false;

      const previousFile = fileTracking[file.name];
      return !previousFile || 
              previousFile.modifiedTime !== file.modifyTime ||
              previousFile.size !== file.size;
    });

    if (newFiles.length === 0) {
      console.log('No new files found. Stopping workflow.');
      return { ...state, newFilesFound: false, workflowComplete: true };
    }
    
    console.log(`Found ${newFiles.length} new/updated files to process.`);
    
    const newFilesMapped = newFiles.map(file => ({
      name: file.name,
      size: file.size,
      modifiedTime: file.modifyTime,
      path: `/data/excel-files/${file.name}`,
    }));

    // We only need to pass the list of new files and the file-tracking history.
    return {
      ...state,
      newFilesFound: true,
      newFiles: newFilesMapped,
      fileTracking, 
    };
  }
);