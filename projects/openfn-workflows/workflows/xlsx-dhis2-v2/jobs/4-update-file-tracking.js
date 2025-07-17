/**
 * Job: 4. Update File Tracking State
 *
 * Description:
 * This job is the final step in the workflow. It updates the file tracking
 * state to mark the file as processed, preventing it from being picked up
 * in future runs. It uses the results from the consolidation step to record
 * the outcome.
 *
 * OpenFn Principles:
 * - State Management: Ensures the workflow's state is correctly managed.
 * - Idempotency: Prevents reprocessing of the same file.
 * - Finality: Concludes the workflow with a clear status update.
 */

fn(state => {
  console.log('4. Updating file tracking state...');

  const { newFile, fileTracking, consolidationSummary } = state;

  if (!newFile) {
    console.log('  - No file was processed. Skipping file tracking update.');
    return state;
  }

  // Update the tracking information for the processed file.
  const updatedFileTracking = {
    ...fileTracking,
    [newFile.name]: {
      name: newFile.name,
      size: newFile.size,
      modifiedTime: newFile.modifyTime,
      processedAt: new Date().toISOString(),
      status: 'processed',
      consolidation: consolidationSummary,
    },
  };

  console.log(`  - File ${newFile.name} marked as processed.`);
  
  // Clean up old tracking entries (older than 30 days).
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  let cleanedEntries = 0;
  Object.keys(updatedFileTracking).forEach(fileKey => {
    const fileInfo = updatedFileTracking[fileKey];
    const fileDate = new Date(fileInfo.processedAt || 0);
    
    if (fileDate < thirtyDaysAgo) {
      delete updatedFileTracking[fileKey];
      cleanedEntries++;
    }
  });

  if (cleanedEntries > 0) {
    console.log(`  - Cleaned up ${cleanedEntries} old tracking entries.`);
  }

  // Return the final state with the updated tracking information.
  return {
    ...state,
    fileTracking: updatedFileTracking,
    workflowCompleted: true,
  };
}); 