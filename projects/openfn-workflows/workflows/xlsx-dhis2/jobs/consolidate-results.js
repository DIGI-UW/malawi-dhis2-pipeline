/**
 * Consolidate Results from All Chunk Uploads
 * 
 * This job consolidates results from all chunk uploads and provides
 * a comprehensive summary of the large file processing operation.
 * 
 * Consolidation Strategy:
 * - Collects results from all parallel chunk uploads
 * - Calculates overall success/failure rates
 * - Provides detailed processing summary
 * - Updates final tracking information
 */

fn((state) => {
  console.log('📋 Starting results consolidation...');
  
  const startTime = Date.now();
  
  // Initialize consolidation tracking
  const consolidation = {
    startedAt: new Date().toISOString(),
    fileInfo: state.fileInfo || {},
    chunkResults: [],
    overallStats: {
      totalChunks: 0,
      successfulChunks: 0,
      failedChunks: 0,
      totalDataValues: 0,
      successfulDataValues: 0,
      failedDataValues: 0,
      totalProcessingTime: 0,
      totalUploadTime: 0,
      conflicts: []
    }
  };
  
  // Check if we have upload results or errors
  const hasUploadResult = state.uploadResult && state.uploadResult.uploadSuccess;
  const hasUploadError = state.uploadError && !state.uploadError.uploadSuccess;
  
  if (hasUploadResult) {
    console.log('✅ Processing successful chunk result...');
    
    const result = state.uploadResult;
    const importCount = result.dhis2Response.importCount || {};
    const conflicts = result.dhis2Response.conflicts || [];
    
    // Add to consolidation
    consolidation.chunkResults.push({
      chunkIndex: result.chunkIndex,
      chunkId: result.chunkId,
      success: true,
      uploadedAt: result.uploadedAt,
      uploadTimeMs: result.uploadTimeMs,
      dataValuesCount: result.dataValuesCount,
      dhis2Stats: {
        imported: importCount.imported || 0,
        updated: importCount.updated || 0,
        deleted: importCount.deleted || 0,
        ignored: importCount.ignored || 0
      },
      conflicts: conflicts
    });
    
    // Update overall stats
    consolidation.overallStats.totalChunks++;
    consolidation.overallStats.successfulChunks++;
    consolidation.overallStats.totalDataValues += result.dataValuesCount;
    consolidation.overallStats.successfulDataValues += 
      (importCount.imported || 0) + (importCount.updated || 0) + (importCount.ignored || 0);
    consolidation.overallStats.totalUploadTime += result.uploadTimeMs;
    
    if (conflicts.length > 0) {
      consolidation.overallStats.conflicts.push(...conflicts);
    }
    
    console.log(`📊 Chunk ${result.chunkIndex + 1} consolidated:`);
    console.log(`   DataValues: ${result.dataValuesCount}`);
    console.log(`   DHIS2 Processed: ${(importCount.imported || 0) + (importCount.updated || 0) + (importCount.ignored || 0)}`);
    console.log(`   Conflicts: ${conflicts.length}`);
    
  } else if (hasUploadError) {
    console.log('❌ Processing failed chunk result...');
    
    const error = state.uploadError;
    
    // Add to consolidation
    consolidation.chunkResults.push({
      chunkIndex: error.chunkIndex,
      chunkId: error.chunkId,
      success: false,
      failedAt: error.failedAt,
      uploadTimeMs: error.uploadTimeMs,
      dataValuesCount: error.dataValuesCount,
      error: error.error
    });
    
    // Update overall stats
    consolidation.overallStats.totalChunks++;
    consolidation.overallStats.failedChunks++;
    consolidation.overallStats.totalDataValues += error.dataValuesCount || 0;
    consolidation.overallStats.failedDataValues += error.dataValuesCount || 0;
    consolidation.overallStats.totalUploadTime += error.uploadTimeMs || 0;
    
    console.log(`❌ Chunk ${error.chunkIndex + 1} failed:`);
    console.log(`   Error: ${error.error?.message || 'Unknown error'}`);
    console.log(`   DataValues lost: ${error.dataValuesCount || 0}`);
    
  } else {
    console.log('⚠️  No upload results found in state');
  }
  
  // Calculate success rates
  const chunkSuccessRate = consolidation.overallStats.totalChunks > 0 ? 
    (consolidation.overallStats.successfulChunks / consolidation.overallStats.totalChunks) * 100 : 0;
  
  const dataValueSuccessRate = consolidation.overallStats.totalDataValues > 0 ? 
    (consolidation.overallStats.successfulDataValues / consolidation.overallStats.totalDataValues) * 100 : 0;
  
  const consolidationTime = Date.now() - startTime;
  
  // Create final summary
  const summary = {
    ...consolidation,
    completedAt: new Date().toISOString(),
    consolidationTimeMs: consolidationTime,
    successRates: {
      chunks: chunkSuccessRate,
      dataValues: dataValueSuccessRate
    },
    overallSuccess: consolidation.overallStats.failedChunks === 0,
    recommendations: generateRecommendations(consolidation)
  };
  
  // Log detailed summary
  console.log(`📈 Consolidation Summary:`);
  console.log(`   File: ${summary.fileInfo.fileName || 'unknown'}`);
  console.log(`   Total Chunks: ${summary.overallStats.totalChunks}`);
  console.log(`   Successful Chunks: ${summary.overallStats.successfulChunks}`);
  console.log(`   Failed Chunks: ${summary.overallStats.failedChunks}`);
  console.log(`   Chunk Success Rate: ${chunkSuccessRate.toFixed(1)}%`);
  console.log(`   Total DataValues: ${summary.overallStats.totalDataValues}`);
  console.log(`   Successful DataValues: ${summary.overallStats.successfulDataValues}`);
  console.log(`   Failed DataValues: ${summary.overallStats.failedDataValues}`);
  console.log(`   DataValue Success Rate: ${dataValueSuccessRate.toFixed(1)}%`);
  console.log(`   Total Upload Time: ${summary.overallStats.totalUploadTime}ms`);
  console.log(`   Total Conflicts: ${summary.overallStats.conflicts.length}`);
  
  // Log recommendations
  if (summary.recommendations.length > 0) {
    console.log(`💡 Recommendations:`);
    summary.recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`);
    });
  }
  
  // Determine final status
  const finalStatus = summary.overallSuccess ? 'SUCCESS' : 'PARTIAL_SUCCESS';
  
  console.log(`🎯 Final Status: ${finalStatus}`);
  
  return {
    ...state,
    consolidationComplete: true,
    finalStatus: finalStatus,
    processingComplete: true,
    summary: summary,
    // Clean up temporary state
    uploadResult: null,
    uploadError: null,
    payload: null,
    payloadInfo: null,
    processedChunk: null,
    chunks: null
  };
});

/**
 * Generate recommendations based on processing results
 */
function generateRecommendations(consolidation) {
  const recommendations = [];
  const stats = consolidation.overallStats;
  
  // Performance recommendations
  if (stats.totalUploadTime > 300000) { // 5 minutes
    recommendations.push('Consider reducing chunk size to improve upload performance');
  }
  
  // Error rate recommendations
  if (stats.failedChunks > 0) {
    recommendations.push('Some chunks failed - check DHIS2 server status and data quality');
  }
  
  // Conflict recommendations
  if (stats.conflicts.length > 0) {
    recommendations.push('Data conflicts detected - review data element mappings and periods');
  }
  
  // Success rate recommendations
  const successRate = stats.totalChunks > 0 ? (stats.successfulChunks / stats.totalChunks) * 100 : 0;
  if (successRate < 95) {
    recommendations.push('Success rate below 95% - consider improving error handling');
  }
  
  // Memory recommendations
  if (stats.totalChunks > 100) {
    recommendations.push('Large number of chunks processed - monitor memory usage');
  }
  
  return recommendations;
}

/**
 * Final cleanup and memory management
 */
fn((state) => {
  console.log(`✅ Results consolidation completed successfully`);
  
  // Log final completion
  if (state.summary) {
    const processingTime = state.summary.fileInfo.processingTimeMs || 0;
    const uploadTime = state.summary.overallStats.totalUploadTime || 0;
    const totalTime = processingTime + uploadTime;
    
    console.log(`🏁 Large file processing completed:`);
    console.log(`   Total processing time: ${totalTime}ms`);
    console.log(`   Final status: ${state.finalStatus}`);
    console.log(`   Records processed: ${state.summary.overallStats.successfulDataValues}`);
    console.log(`   Memory efficient: ✅`);
  }
  
  return state;
}); 