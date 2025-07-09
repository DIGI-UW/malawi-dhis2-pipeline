/**
 * Download new or updated files from SFTP
 * This job is triggered either after check-sftp-files or directly by webhook
 */

// OpenFN functions are available directly, no imports needed
// The runtime provides: get from @openfn/language-sftp
// and fn from @openfn/language-common

// No longer saving to a local path
// const LOCAL_DOWNLOAD_PATH = '/tmp/openfn-downloads/';

fn((state) => {
  console.log('Starting file download process...');
  
  // Determine files to download
  let filesToDownload = [];
  
  if (state.newFiles && state.newFiles.length > 0) {
    // From cron check workflow
    filesToDownload = state.newFiles;
    console.log(`Processing ${filesToDownload.length} files from cron check`);
  } else if (state.data && state.data.filePath) {
    // From webhook trigger - single file
    filesToDownload = [{
      name: state.data.fileName || state.data.filePath.split('/').pop(),
      path: state.data.filePath,
      size: state.data.fileSize || null,
      modifiedTime: state.data.modifiedTime || new Date().toISOString()
    }];
    console.log(`Processing single file from webhook: ${filesToDownload[0].name}`);
  } else {
    console.log('No files specified for download');
    return {
      ...state,
      downloadedFiles: [],
      error: 'No files specified for download'
    };
  }
  
  return {
    ...state,
    filesToDownload,
    downloadedFiles: [],
    downloadStartTime: new Date().toISOString()
  };
});

// Download each file's content into state
fn((state) => {
  const downloadPromises = state.filesToDownload.map(async (file, index) => {
    console.log(`Downloading content of ${file.name}`);
    
    try {
      // Download the file content directly into a buffer
      const content = await get(file.path);
      
      console.log(`Successfully downloaded ${file.name}, size: ${content.length} bytes`);
      
      return {
        ...file,
        content, // Pass file content in state
        downloadTime: new Date().toISOString(),
        status: 'downloaded'
      };
    } catch (error) {
      console.error(`Failed to download ${file.name}:`, error);
      return {
        ...file,
        status: 'failed',
        error: error.message
      };
    }
  });
  
  return Promise.all(downloadPromises).then(results => {
    const successfulDownloads = results.filter(f => f.status === 'downloaded');
    const failedDownloads = results.filter(f => f.status === 'failed');
    
    console.log(`Download complete: ${successfulDownloads.length} successful, ${failedDownloads.length} failed`);
    
    // Note: File content is now in state. Be mindful of state size limits.
    // The buffer will be automatically handled by the OpenFN platform.
    
    return {
      ...state,
      downloadedFiles: successfulDownloads,
      failedDownloads,
      downloadCompleted: true
    };
  });
});
