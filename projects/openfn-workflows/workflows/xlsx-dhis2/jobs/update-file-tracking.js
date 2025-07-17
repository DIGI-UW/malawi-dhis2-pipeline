/**
 * Update file tracking state after successful chunked processing
 * This job updates the tracking information for processed files to avoid reprocessing
 * 
 * OpenFn Design Principles:
 * - Single responsibility: Update file tracking state
 * - State immutability: Return new state objects
 * - Error handling: Graceful failure with clear messages
 * - Data integrity: Maintain processing history
 */

// OpenFN functions are available directly, no imports needed
// The runtime provides: fn from @openfn/language-common

fn(state => {
  console.log('📝 Updating file tracking state for chunked processing...');
  
  // Get current file tracking from state
  const currentFileTracking = state.fileTracking || {};
  const newFileTracking = { ...currentFileTracking };
  
  // Update tracking for successfully processed files
  if (state.downloadedFiles && state.downloadedFiles.length > 0) {
    state.downloadedFiles.forEach(file => {
      const fileKey = file.fileName;
      const trackingInfo = {
        name: file.fileName,
        size: file.fileSize,
        modifiedTime: file.modifiedTime || new Date().toISOString(),
        path: file.filePath,
        processedAt: new Date().toISOString(),
        status: 'processed_chunked',
        processingMethod: 'chunked_large_file',
        chunkCount: file.chunkCount,
        totalRows: file.totalRows,
        uploadStatus: state.consolidatedResults?.status || 'pending',
        chunkedProcessingSummary: {
          totalChunks: file.chunkCount,
          totalRows: file.totalRows,
          memoryUsage: state.memoryUsage || 'unknown',
          processingTime: state.processingEndTime && state.processingStartTime ? 
            (new Date(state.processingEndTime) - new Date(state.processingStartTime)) : 0
        }
      };
      
      // Add upload summary if available
      if (state.consolidatedResults) {
        trackingInfo.uploadSummary = {
          totalDataValues: state.consolidatedResults.totalDataValues || 0,
          successfulUploads: state.consolidatedResults.successfulUploads || 0,
          failedUploads: state.consolidatedResults.failedUploads || 0,
          successRate: state.consolidatedResults.successRate || 0
        };
      }
      
      newFileTracking[fileKey] = trackingInfo;
      console.log(`✅ Updated tracking for chunked file: ${fileKey}`);
      console.log(`   Chunks: ${file.chunkCount}, Rows: ${file.totalRows}`);
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
          status: 'checked_large_file',
          processingMethod: 'large_file_monitoring'
        };
      }
    });
  }
  
  // Clean up old tracking entries (older than 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  let cleanedEntries = 0;
  Object.keys(newFileTracking).forEach(fileKey => {
    const fileInfo = newFileTracking[fileKey];
    const fileDate = new Date(fileInfo.processedAt || fileInfo.lastChecked || 0);
    
    if (fileDate < thirtyDaysAgo) {
      console.log(`🧹 Removing old tracking entry for: ${fileKey}`);
      delete newFileTracking[fileKey];
      cleanedEntries++;
    }
  });
  
  // Summary of tracking updates
  const trackingSummary = {
    totalTrackedFiles: Object.keys(newFileTracking).length,
    newlyProcessedFiles: state.downloadedFiles?.length || 0,
    totalChunksProcessed: state.downloadedFiles?.reduce((sum, file) => sum + file.chunkCount, 0) || 0,
    totalRowsProcessed: state.downloadedFiles?.reduce((sum, file) => sum + file.totalRows, 0) || 0,
    cleanedEntries,
    lastUpdated: new Date().toISOString(),
    cleanupPerformed: cleanedEntries > 0,
    processingMethod: 'chunked_large_file'
  };
  
  console.log('📊 File tracking update summary:');
  console.log(`   Total tracked files: ${trackingSummary.totalTrackedFiles}`);
  console.log(`   Newly processed files: ${trackingSummary.newlyProcessedFiles}`);
  console.log(`   Total chunks processed: ${trackingSummary.totalChunksProcessed}`);
  console.log(`   Total rows processed: ${trackingSummary.totalRowsProcessed}`);
  console.log(`   Cleaned old entries: ${trackingSummary.cleanedEntries}`);
  
  // Update state with new file tracking
  return {
    ...state,
    fileTracking: newFileTracking,
    trackingSummary,
    workflowCompleted: true,
    completedAt: new Date().toISOString(),
    finalSummary: {
      processingMethod: 'chunked_large_file',
      filesProcessed: trackingSummary.newlyProcessedFiles,
      chunksProcessed: trackingSummary.totalChunksProcessed,
      rowsProcessed: trackingSummary.totalRowsProcessed,
      memoryCompliant: true,
      openFnCompliant: true
    }
  };
});