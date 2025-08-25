/**
 * Download new or updated files from SFTP
 * This job is triggered either after check-sftp-files or directly by webhook
 */

import { get } from '@openfn/language-sftp';
import { fn } from '@openfn/language-common';

// Configuration
const LOCAL_DOWNLOAD_PATH = '/tmp/openfn-downloads/';

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

// Download each file
fn((state) => {
  const downloadPromises = state.filesToDownload.map(async (file, index) => {
    const localPath = `${LOCAL_DOWNLOAD_PATH}${file.name}`;
    
    console.log(`Downloading ${file.name} to ${localPath}`);
    
    try {
      // Download the file
      await get(file.path, localPath);
      
      return {
        ...file,
        localPath,
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
    
    return {
      ...state,
      downloadedFiles: successfulDownloads,
      failedDownloads,
      downloadCompleted: true
    };
  });
});
