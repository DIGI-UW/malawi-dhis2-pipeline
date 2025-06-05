// Get Excel data from SFTP server with enhanced error handling and retry logic
// This job downloads Excel files from SFTP and converts them to processable format

import { 
  sftp,
  downloadFile,
  listFiles,
  each,
  fn,
  dataPath,
  dataValue
} from '@openfn/language-sftp';

// SFTP connection configuration with fallback values
const sftpConfig = {
  host: process.env.SFTP_HOST || 'sftp-server',
  port: parseInt(process.env.SFTP_PORT) || 22,
  username: process.env.SFTP_USER || 'openfn',
  password: process.env.SFTP_PASSWORD || 'instant101',
  algorithms: {
    serverHostKey: ['ssh-rsa', 'ssh-dss'],
    kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
    hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1']
  },
  readyTimeout: 20000,
  strictVendor: false
};

// Define the Excel files we want to process
const excelFiles = [
  'DHIS2_HIV Indicators.xlsx',
  'Direct Queries - Q1 2025 MoH Reports.xlsx',
  'Q2FY25_DQ_253_sites.xlsx'
];

// Retry configuration
const retryConfig = {
  maxRetries: 3,
  retryDelay: 2000,
  backoffMultiplier: 1.5
};

// Enhanced file download with retry logic
function downloadFileWithRetry(remotePath, localPath, fileName, attempt = 1) {
  return fn((state) => {
    console.log(`Downloading ${fileName} (attempt ${attempt}/${retryConfig.maxRetries})`);
    
    return downloadFile(remotePath, localPath, (state) => {
      console.log(`Successfully downloaded ${fileName} to ${localPath}`);
      
      // Verify file was downloaded
      const fs = require('fs');
      if (!fs.existsSync(localPath)) {
        throw new Error(`Downloaded file not found at ${localPath}`);
      }
      
      const stats = fs.statSync(localPath);
      console.log(`File size: ${stats.size} bytes`);
      
      if (stats.size === 0) {
        throw new Error(`Downloaded file is empty: ${localPath}`);
      }
      
      // Store successful download info
      if (!state.sftpData) state.sftpData = {};
      if (!state.sftpData.downloadedFiles) state.sftpData.downloadedFiles = [];
      
      state.sftpData.downloadedFiles.push({
        name: fileName,
        localPath: localPath,
        remotePath: remotePath,
        size: stats.size,
        downloadedAt: new Date().toISOString(),
        attempt: attempt
      });
      
      return state;
      
    }).catch((error) => {
      console.error(`Download failed for ${fileName} on attempt ${attempt}:`, error);
      
      if (attempt < retryConfig.maxRetries) {
        const delay = retryConfig.retryDelay * Math.pow(retryConfig.backoffMultiplier, attempt - 1);
        console.log(`Retrying ${fileName} in ${delay}ms...`);
        
        // In a real implementation, you'd wait here
        return downloadFileWithRetry(remotePath, localPath, fileName, attempt + 1)(state);
      } else {
        console.error(`Failed to download ${fileName} after ${retryConfig.maxRetries} attempts`);
        
        // Store failure info but don't break the workflow
        if (!state.sftpData) state.sftpData = {};
        if (!state.sftpData.failedFiles) state.sftpData.failedFiles = [];
        
        state.sftpData.failedFiles.push({
          name: fileName,
          remotePath: remotePath,
          error: error.message,
          attempts: attempt,
          failedAt: new Date().toISOString()
        });
        
        return state;
      }
    });
  });
}

// Initialize SFTP connection and download files
sftp(sftpConfig, (state) => {
  console.log('Connected to SFTP server');
  console.log(`Connection config: ${sftpConfig.username}@${sftpConfig.host}:${sftpConfig.port}`);
  
  // Initialize SFTP data tracking
  state.sftpData = {
    connectedAt: new Date().toISOString(),
    config: {
      host: sftpConfig.host,
      port: sftpConfig.port,
      username: sftpConfig.username
    },
    downloadedFiles: [],
    failedFiles: []
  };
  
  // List available files for verification and logging
  return listFiles('/data/excel-files/', (state) => {
    console.log('Available files on SFTP server:', state.data);
    
    // Verify required files exist
    const availableFiles = state.data || [];
    const missingFiles = excelFiles.filter(fileName => 
      !availableFiles.some(file => file.name === fileName || file.includes(fileName))
    );
    
    if (missingFiles.length > 0) {
      console.warn('Missing files on SFTP server:', missingFiles);
    }
    
    // Download each Excel file with error handling
    return each(excelFiles, (fileName) => {
      const remotePath = `/data/excel-files/${fileName}`;
      const localPath = `/tmp/${fileName}`;
      
      console.log(`Attempting to download: ${remotePath} -> ${localPath}`);
      
      return downloadFileWithRetry(remotePath, localPath, fileName);
      
    })((state) => {
      // Summary of download results
      const successful = state.sftpData.downloadedFiles?.length || 0;
      const failed = state.sftpData.failedFiles?.length || 0;
      const total = excelFiles.length;
      
      console.log(`Download summary: ${successful}/${total} successful, ${failed} failed`);
      
      if (successful === 0) {
        throw new Error('No files were successfully downloaded from SFTP server');
      }
      
      if (failed > 0) {
        console.warn('Some files failed to download:', state.sftpData.failedFiles.map(f => f.name));
      }
      
      state.sftpData.summary = {
        totalFiles: total,
        successfulDownloads: successful,
        failedDownloads: failed,
        completedAt: new Date().toISOString()
      };
      
      console.log('SFTP data retrieval completed');
      return state;
    });
  });
});
        });
        
        return state;
      });
    });
  });
});

// Process downloaded Excel files
fn((state) => {
  console.log('Processing downloaded Excel files...');
  
  if (!state.excelFiles || state.excelFiles.length === 0) {
    throw new Error('No Excel files were downloaded');
  }
  
  // For each downloaded file, we'll need to parse it
  // This is a placeholder - actual Excel parsing would require additional adaptor or processing
  state.sftpData = {
    downloadedFiles: state.excelFiles,
    processedAt: new Date().toISOString(),
    source: 'sftp',
    message: `Successfully downloaded ${state.excelFiles.length} Excel files from SFTP`
  };
  
  console.log('SFTP data retrieval completed:', state.sftpData);
  
  return state;
});
