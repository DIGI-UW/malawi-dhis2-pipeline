/**
 * Update file tracking state after successful processing
 * This job updates the tracking information for processed files to avoid reprocessing
 */

import { fn } from '@openfn/language-common';

fn(state => {
  console.log('Updating file tracking state...');
  
  if (!state.uploadCompleted) {
    console.log('Upload not completed successfully, skipping file tracking update');
    return state;
  }
  
  // Get current file tracking from state
  const currentFileTracking = state.fileTracking || {};
  const newFileTracking = { ...currentFileTracking };
  
  // Update tracking for successfully processed files
  if (state.processedFiles && state.processedFiles.length > 0) {
    state.processedFiles.forEach(file => {
      const fileKey = file.name;
      const trackingInfo = {
        name: file.name,
        size: file.size,
        modifiedTime: file.modifiedTime,
        path: file.path,
        processedAt: new Date().toISOString(),
        status: 'processed',
        uploadStatus: state.uploadSummary?.status || 'unknown',
        dhis2Summary: {
          imported: state.uploadSummary?.imported || 0,
          updated: state.uploadSummary?.updated || 0,
          ignored: state.uploadSummary?.ignored || 0
        }
      };
      
      newFileTracking[fileKey] = trackingInfo;
      console.log(`Updated tracking for file: ${fileKey}`);
    });
  }
  
  // Update tracking for files checked via cron (mark as checked)
  if (state.currentFileList) {
    Object.entries(state.currentFileList).forEach(([fileKey, fileInfo]) => {
      if (!newFileTracking[fileKey]) {
        // File exists but wasn't processed (no changes detected)
        newFileTracking[fileKey] = {
          ...fileInfo,
          lastChecked: new Date().toISOString(),
          status: 'checked'
        };
      }
    });
  }
  
  // Clean up old tracking entries (older than 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  Object.keys(newFileTracking).forEach(fileKey => {
    const fileInfo = newFileTracking[fileKey];
    const fileDate = new Date(fileInfo.processedAt || fileInfo.lastChecked || 0);
    
    if (fileDate < thirtyDaysAgo) {
      console.log(`Removing old tracking entry for: ${fileKey}`);
      delete newFileTracking[fileKey];
    }
  });
  
  // Summary of tracking updates
  const trackingSummary = {
    totalTrackedFiles: Object.keys(newFileTracking).length,
    newlyProcessed: state.processedFiles?.length || 0,
    lastUpdated: new Date().toISOString(),
    cleanupPerformed: true
  };
  
  console.log('File tracking update summary:', trackingSummary);
  
  // Update state with new file tracking
  return {
    ...state,
    fileTracking: newFileTracking,
    trackingSummary,
    workflowCompleted: true,
    completedAt: new Date().toISOString()
  };
});
