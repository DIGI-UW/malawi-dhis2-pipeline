/**
 * Consolidate Results from Single Chunk Upload
 * 
 * This job consolidates results from a single chunk upload and determines
 * whether to continue processing the next chunk or complete the workflow.
 * 
 * OpenFN Best Practice:
 * - Simple job with clear scope
 * - Tracks individual chunk results
 * - Controls workflow looping through state
 * - Manages memory efficiently
 */

fn((state) => {
  console.log('📋 Starting chunk results consolidation...');
  
  const startTime = Date.now();
  
  // Initialize or get consolidation tracking
  const consolidation = state.consolidation || {
    startedAt: new Date().toISOString(),
    fileInfo: state.fileInfo || {},
    chunkResults: [],
    overallStats: {
      totalChunksProcessed: 0,
      totalRowsProcessed: 0,
      totalSuccessfulUploads: 0,
      totalFailedUploads: 0,
      totalValidRows: 0,
      totalErrorRows: 0
    }
  };
  
  // Get current chunk info
  const currentChunkIndex = state.currentChunkIndex || 0;
  const uploadSuccess = state.uploadSuccess !== false; // Default to true if not specified
  const processedChunk = state.processedChunk;
  
  console.log(`📊 Consolidating results for chunk ${currentChunkIndex + 1}:`);
  console.log(`   Upload success: ${uploadSuccess}`);
  console.log(`   Processed chunk: ${processedChunk ? processedChunk.chunkId : 'None'}`);
  
  // Add current chunk results to consolidation
  if (processedChunk) {
    const chunkResult = {
      chunkIndex: currentChunkIndex,
      chunkId: processedChunk.chunkId,
      fileName: processedChunk.fileName,
      success: uploadSuccess && !processedChunk.failed,
      validRows: processedChunk.validRows || 0,
      errorRows: processedChunk.errorRows || 0,
      uploadSuccess: uploadSuccess,
      processedAt: processedChunk.processedAt,
      uploadedAt: new Date().toISOString()
    };
    
    consolidation.chunkResults.push(chunkResult);
    
    // Update overall stats
    consolidation.overallStats.totalChunksProcessed++;
    consolidation.overallStats.totalRowsProcessed += processedChunk.validRows || 0;
    consolidation.overallStats.totalValidRows += processedChunk.validRows || 0;
    consolidation.overallStats.totalErrorRows += processedChunk.errorRows || 0;
    
    if (uploadSuccess && !processedChunk.failed) {
      consolidation.overallStats.totalSuccessfulUploads++;
    } else {
      consolidation.overallStats.totalFailedUploads++;
    }
    
    console.log(`✅ Chunk ${currentChunkIndex + 1} consolidated:`);
    console.log(`   Valid rows: ${processedChunk.validRows || 0}`);
    console.log(`   Error rows: ${processedChunk.errorRows || 0}`);
    console.log(`   Upload success: ${uploadSuccess}`);
  }
  
  // Determine if we should continue processing
  const shouldContinue = state.continueProcessing === true && !state.allChunksProcessed;
  const nextChunkIndex = currentChunkIndex + 1;
  
  console.log(`📊 Consolidation summary:`);
  console.log(`   Chunks processed: ${consolidation.overallStats.totalChunksProcessed}`);
  console.log(`   Total rows processed: ${consolidation.overallStats.totalRowsProcessed}`);
  console.log(`   Successful uploads: ${consolidation.overallStats.totalSuccessfulUploads}`);
  console.log(`   Failed uploads: ${consolidation.overallStats.totalFailedUploads}`);
  console.log(`   Continue processing: ${shouldContinue}`);
  console.log(`   Next chunk index: ${nextChunkIndex}`);
  
  if (shouldContinue) {
    console.log(`🔄 Continuing to process chunk ${nextChunkIndex + 1}...`);
    
    return {
      ...state,
      consolidation: consolidation,
      currentChunkIndex: nextChunkIndex,
      continueProcessing: true,
      allChunksProcessed: false,
      // Clean up current chunk data to save memory
      processedChunk: null,
      uploadSuccess: null,
      payload: null,
      chunks: null,
      // Keep file info for next chunk
      fileInfo: state.fileInfo,
      CONFIG: state.CONFIG
    };
  } else {
    console.log('🏁 All chunks processed - workflow complete!');
    
    const finalStats = {
      ...consolidation.overallStats,
      completedAt: new Date().toISOString(),
      totalProcessingTime: startTime ? Date.now() - startTime : 0,
      successRate: consolidation.overallStats.totalChunksProcessed > 0 
        ? (consolidation.overallStats.totalSuccessfulUploads / consolidation.overallStats.totalChunksProcessed) * 100 
        : 0
    };
    
    console.log(`📊 Final workflow summary:`);
    console.log(`   Total chunks processed: ${finalStats.totalChunksProcessed}`);
    console.log(`   Total rows processed: ${finalStats.totalRowsProcessed}`);
    console.log(`   Successful uploads: ${finalStats.totalSuccessfulUploads}`);
    console.log(`   Failed uploads: ${finalStats.totalFailedUploads}`);
    console.log(`   Success rate: ${finalStats.successRate.toFixed(1)}%`);
    console.log(`   Processing time: ${finalStats.totalProcessingTime}ms`);
    
    return {
      ...state,
      consolidation: consolidation,
      finalStats: finalStats,
      workflowComplete: true,
      continueProcessing: false,
      allChunksProcessed: true,
      // Clean up all processing data
      processedChunk: null,
      uploadSuccess: null,
      payload: null,
      chunks: null,
      currentChunkIndex: null,
      nextChunkIndex: null
    };
  }
}); 