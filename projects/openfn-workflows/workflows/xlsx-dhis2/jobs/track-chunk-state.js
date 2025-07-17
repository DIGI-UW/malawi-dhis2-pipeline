/**
 * Track Chunk State and Detect Data Loss
 * 
 * This job maintains a comprehensive record of chunk processing state
 * and performs data integrity checks to detect any missing chunks or data loss.
 * 
 * Monitoring Strategy:
 * - Tracks each chunk through all processing stages
 * - Detects missing or failed chunks
 * - Provides reconciliation between source and destination
 * - Generates alerts for data integrity issues
 */

fn((state) => {
  console.log('📊 Starting chunk state tracking and data integrity check...');
  
  // Initialize or update chunk tracking state
  const chunkTracker = state.chunkTracker || {
    fileInfo: state.fileInfo || {},
    expectedChunks: 0,
    processedChunks: 0,
    uploadedChunks: 0,
    failedChunks: 0,
    chunkStates: {},
    dataIntegrity: {
      sourceRows: 0,
      processedRows: 0,
      uploadedRows: 0,
      lostRows: 0
    },
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
  
  // Update chunk state based on current step
  if (state.chunks && state.chunks.length > 0) {
    // Download step completed
    chunkTracker.expectedChunks = state.chunks.length;
    chunkTracker.dataIntegrity.sourceRows = state.fileInfo?.totalRows || 0;
    
    state.chunks.forEach(chunk => {
      chunkTracker.chunkStates[chunk.chunkId] = {
        chunkIndex: chunk.chunkIndex,
        chunkId: chunk.chunkId,
        rowCount: chunk.rowCount,
        startRow: chunk.startRow,
        endRow: chunk.endRow,
        stages: {
          downloaded: new Date().toISOString(),
          processed: null,
          payloadGenerated: null,
          uploaded: null,
          failed: null
        },
        errors: []
      };
    });
    
    console.log(`📋 Initialized tracking for ${chunkTracker.expectedChunks} chunks`);
  }
  
  // Update chunk state for processing step
  if (state.processedChunk) {
    const chunk = state.processedChunk;
    const chunkState = chunkTracker.chunkStates[chunk.chunkId];
    
    if (chunkState) {
      chunkState.stages.processed = new Date().toISOString();
      chunkState.processedRows = chunk.validRows;
      chunkState.errorRows = chunk.errorRows;
      chunkState.successRate = chunk.successRate;
      
      chunkTracker.processedChunks++;
      chunkTracker.dataIntegrity.processedRows += chunk.validRows;
      
      if (chunk.processingErrors) {
        chunkState.errors.push(...chunk.processingErrors);
      }
      
      console.log(`✅ Chunk ${chunk.chunkIndex + 1} processed: ${chunk.validRows} rows`);
    }
  }
  
  // Update chunk state for upload step
  if (state.uploadResult && state.uploadResult.uploadSuccess) {
    const result = state.uploadResult;
    const chunkState = chunkTracker.chunkStates[result.chunkId];
    
    if (chunkState) {
      chunkState.stages.uploaded = new Date().toISOString();
      chunkState.dhis2Response = result.dhis2Response;
      chunkState.uploadTimeMs = result.uploadTimeMs;
      
      const importCount = result.dhis2Response.importCount || {};
      const uploadedCount = (importCount.imported || 0) + (importCount.updated || 0) + (importCount.ignored || 0);
      
      chunkTracker.uploadedChunks++;
      chunkTracker.dataIntegrity.uploadedRows += uploadedCount;
      
      console.log(`✅ Chunk ${result.chunkIndex + 1} uploaded: ${uploadedCount} rows to DHIS2`);
    }
  }
  
  // Update chunk state for failed upload
  if (state.uploadError && !state.uploadError.uploadSuccess) {
    const error = state.uploadError;
    const chunkState = chunkTracker.chunkStates[error.chunkId];
    
    if (chunkState) {
      chunkState.stages.failed = new Date().toISOString();
      chunkState.errors.push(error.error);
      
      chunkTracker.failedChunks++;
      chunkTracker.dataIntegrity.lostRows += error.dataValuesCount || 0;
      
      console.log(`❌ Chunk ${error.chunkIndex + 1} failed: ${error.error.message}`);
    }
  }
  
  // Calculate data integrity metrics
  const integrityCheck = performDataIntegrityCheck(chunkTracker);
  
  // Generate monitoring report
  const monitoringReport = generateMonitoringReport(chunkTracker, integrityCheck);
  
  // Check for data loss or missing chunks
  const dataLossAlert = checkForDataLoss(chunkTracker, integrityCheck);
  
  console.log(`📊 Chunk State Summary:`);
  console.log(`   Expected Chunks: ${chunkTracker.expectedChunks}`);
  console.log(`   Processed Chunks: ${chunkTracker.processedChunks}`);
  console.log(`   Uploaded Chunks: ${chunkTracker.uploadedChunks}`);
  console.log(`   Failed Chunks: ${chunkTracker.failedChunks}`);
  console.log(`   Data Integrity: ${integrityCheck.integrityScore.toFixed(1)}%`);
  
  if (dataLossAlert.hasDataLoss) {
    console.warn(`🚨 DATA LOSS DETECTED:`);
    dataLossAlert.issues.forEach(issue => {
      console.warn(`   - ${issue}`);
    });
  }
  
  return {
    ...state,
    chunkTracker: chunkTracker,
    monitoringReport: monitoringReport,
    dataIntegrityCheck: integrityCheck,
    dataLossAlert: dataLossAlert
  };
});

/**
 * Perform comprehensive data integrity check
 */
function performDataIntegrityCheck(chunkTracker) {
  const integrity = chunkTracker.dataIntegrity;
  
  // Calculate data loss percentages
  const processingLoss = integrity.sourceRows - integrity.processedRows;
  const uploadLoss = integrity.processedRows - integrity.uploadedRows;
  const totalLoss = integrity.sourceRows - integrity.uploadedRows;
  
  const processingLossRate = integrity.sourceRows > 0 ? (processingLoss / integrity.sourceRows) * 100 : 0;
  const uploadLossRate = integrity.processedRows > 0 ? (uploadLoss / integrity.processedRows) * 100 : 0;
  const totalLossRate = integrity.sourceRows > 0 ? (totalLoss / integrity.sourceRows) * 100 : 0;
  
  const integrityScore = Math.max(0, 100 - totalLossRate);
  
  return {
    sourceRows: integrity.sourceRows,
    processedRows: integrity.processedRows,
    uploadedRows: integrity.uploadedRows,
    processingLoss: processingLoss,
    uploadLoss: uploadLoss,
    totalLoss: totalLoss,
    processingLossRate: processingLossRate,
    uploadLossRate: uploadLossRate,
    totalLossRate: totalLossRate,
    integrityScore: integrityScore,
    isAcceptable: integrityScore >= 95, // 95% threshold
    timestamp: new Date().toISOString()
  };
}

/**
 * Generate comprehensive monitoring report
 */
function generateMonitoringReport(chunkTracker, integrityCheck) {
  const report = {
    timestamp: new Date().toISOString(),
    fileInfo: chunkTracker.fileInfo,
    processingStatus: {
      totalChunks: chunkTracker.expectedChunks,
      completedChunks: chunkTracker.uploadedChunks,
      failedChunks: chunkTracker.failedChunks,
      remainingChunks: chunkTracker.expectedChunks - chunkTracker.uploadedChunks - chunkTracker.failedChunks,
      completionRate: chunkTracker.expectedChunks > 0 ? (chunkTracker.uploadedChunks / chunkTracker.expectedChunks) * 100 : 0
    },
    dataIntegrity: integrityCheck,
    chunkDetails: Object.values(chunkTracker.chunkStates).map(chunk => ({
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      rowCount: chunk.rowCount,
      status: getChunkStatus(chunk),
      errors: chunk.errors.length,
      processingTime: calculateProcessingTime(chunk),
      uploadTime: chunk.uploadTimeMs || 0
    })),
    issues: identifyIssues(chunkTracker),
    recommendations: generateRecommendations(chunkTracker, integrityCheck)
  };
  
  return report;
}

/**
 * Check for data loss and missing chunks
 */
function checkForDataLoss(chunkTracker, integrityCheck) {
  const issues = [];
  let hasDataLoss = false;
  
  // Check for missing chunks
  const missingChunks = chunkTracker.expectedChunks - chunkTracker.uploadedChunks - chunkTracker.failedChunks;
  if (missingChunks > 0) {
    issues.push(`${missingChunks} chunks are missing or still processing`);
    hasDataLoss = true;
  }
  
  // Check for data integrity issues
  if (integrityCheck.totalLossRate > 5) { // 5% threshold
    issues.push(`${integrityCheck.totalLossRate.toFixed(1)}% data loss detected (${integrityCheck.totalLoss} rows)`);
    hasDataLoss = true;
  }
  
  // Check for failed chunks
  if (chunkTracker.failedChunks > 0) {
    issues.push(`${chunkTracker.failedChunks} chunks failed to upload`);
    hasDataLoss = true;
  }
  
  // Check for chunks stuck in processing
  const stuckChunks = Object.values(chunkTracker.chunkStates).filter(chunk => 
    chunk.stages.downloaded && !chunk.stages.uploaded && !chunk.stages.failed
  );
  if (stuckChunks.length > 0) {
    issues.push(`${stuckChunks.length} chunks appear to be stuck in processing`);
    hasDataLoss = true;
  }
  
  return {
    hasDataLoss,
    issues,
    severity: hasDataLoss ? (integrityCheck.totalLossRate > 10 ? 'CRITICAL' : 'WARNING') : 'OK',
    timestamp: new Date().toISOString()
  };
}

/**
 * Helper functions
 */
function getChunkStatus(chunk) {
  if (chunk.stages.uploaded) return 'UPLOADED';
  if (chunk.stages.failed) return 'FAILED';
  if (chunk.stages.payloadGenerated) return 'UPLOADING';
  if (chunk.stages.processed) return 'PROCESSING';
  if (chunk.stages.downloaded) return 'DOWNLOADED';
  return 'UNKNOWN';
}

function calculateProcessingTime(chunk) {
  if (!chunk.stages.downloaded) return 0;
  const start = new Date(chunk.stages.downloaded);
  const end = new Date(chunk.stages.uploaded || chunk.stages.failed || new Date());
  return end.getTime() - start.getTime();
}

function identifyIssues(chunkTracker) {
  const issues = [];
  
  // Performance issues
  const avgProcessingTime = Object.values(chunkTracker.chunkStates)
    .filter(chunk => chunk.stages.uploaded)
    .reduce((sum, chunk) => sum + calculateProcessingTime(chunk), 0) / chunkTracker.uploadedChunks;
  
  if (avgProcessingTime > 300000) { // 5 minutes
    issues.push('High processing time detected');
  }
  
  // Error rate issues
  const errorRate = chunkTracker.expectedChunks > 0 ? (chunkTracker.failedChunks / chunkTracker.expectedChunks) * 100 : 0;
  if (errorRate > 5) {
    issues.push(`High error rate: ${errorRate.toFixed(1)}%`);
  }
  
  return issues;
}

function generateRecommendations(chunkTracker, integrityCheck) {
  const recommendations = [];
  
  if (integrityCheck.totalLossRate > 5) {
    recommendations.push('Review failed chunks and consider reprocessing');
  }
  
  if (chunkTracker.failedChunks > 0) {
    recommendations.push('Investigate DHIS2 upload failures');
  }
  
  return recommendations;
} 