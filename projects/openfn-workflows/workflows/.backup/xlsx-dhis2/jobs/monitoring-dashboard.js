/**
 * Monitoring Dashboard for Chunked Excel Processing
 * 
 * This job provides real-time monitoring and alerting for the chunked
 * Excel processing workflow to ensure data integrity and detect issues.
 * 
 * Dashboard Features:
 * - Real-time progress tracking
 * - Data integrity monitoring
 * - Chunk-level status visibility
 * - Alerting for failures and data loss
 * - Performance metrics and recommendations
 */

fn((state) => {
  console.log('📊 Generating monitoring dashboard...');
  
  // Extract monitoring data from state
  const chunkTracker = state.chunkTracker || {};
  const integrityCheck = state.dataIntegrityCheck || {};
  const retryTracker = state.retryTracker || {};
  const monitoringReport = state.monitoringReport || {};
  
  // Generate dashboard
  const dashboard = {
    timestamp: new Date().toISOString(),
    status: determineDashboardStatus(chunkTracker, integrityCheck),
    overview: generateOverview(chunkTracker, integrityCheck),
    progressTracking: generateProgressTracking(chunkTracker),
    dataIntegrity: generateDataIntegrityReport(integrityCheck),
    chunkDetails: generateChunkDetails(chunkTracker),
    retryAnalysis: generateRetryAnalysis(retryTracker),
    performanceMetrics: generatePerformanceMetrics(chunkTracker),
    alerts: generateAlerts(chunkTracker, integrityCheck),
    recommendations: generateRecommendations(chunkTracker, integrityCheck),
    healthScore: calculateHealthScore(chunkTracker, integrityCheck)
  };
  
  // Display dashboard
  displayDashboard(dashboard);
  
  // Generate alerts if necessary
  if (dashboard.alerts.length > 0) {
    generateAlerts(dashboard.alerts);
  }
  
  return {
    ...state,
    dashboard: dashboard,
    monitoringComplete: true
  };
});

/**
 * Determine overall dashboard status
 */
function determineDashboardStatus(chunkTracker, integrityCheck) {
  if (!chunkTracker.expectedChunks) {
    return 'INITIALIZING';
  }
  
  const completionRate = chunkTracker.expectedChunks > 0 ? 
    (chunkTracker.uploadedChunks / chunkTracker.expectedChunks) * 100 : 0;
  
  if (completionRate === 100) {
    return integrityCheck.integrityScore >= 95 ? 'COMPLETED' : 'COMPLETED_WITH_ISSUES';
  }
  
  if (chunkTracker.failedChunks > 0) {
    return 'PROCESSING_WITH_ERRORS';
  }
  
  return 'PROCESSING';
}

/**
 * Generate overview section
 */
function generateOverview(chunkTracker, integrityCheck) {
  const completionRate = chunkTracker.expectedChunks > 0 ? 
    (chunkTracker.uploadedChunks / chunkTracker.expectedChunks) * 100 : 0;
  
  return {
    fileInfo: chunkTracker.fileInfo || {},
    processingStarted: chunkTracker.startTime,
    totalChunks: chunkTracker.expectedChunks || 0,
    completedChunks: chunkTracker.uploadedChunks || 0,
    failedChunks: chunkTracker.failedChunks || 0,
    remainingChunks: Math.max(0, (chunkTracker.expectedChunks || 0) - (chunkTracker.uploadedChunks || 0) - (chunkTracker.failedChunks || 0)),
    completionRate: completionRate,
    dataIntegrityScore: integrityCheck.integrityScore || 0,
    totalDataRows: integrityCheck.sourceRows || 0,
    successfulRows: integrityCheck.uploadedRows || 0,
    lostRows: integrityCheck.totalLoss || 0
  };
}

/**
 * Generate progress tracking section
 */
function generateProgressTracking(chunkTracker) {
  const chunks = Object.values(chunkTracker.chunkStates || {});
  
  const statusCounts = {
    downloaded: 0,
    processed: 0,
    uploaded: 0,
    failed: 0,
    unknown: 0
  };
  
  chunks.forEach(chunk => {
    if (chunk.stages.uploaded) {
      statusCounts.uploaded++;
    } else if (chunk.stages.failed) {
      statusCounts.failed++;
    } else if (chunk.stages.processed) {
      statusCounts.processed++;
    } else if (chunk.stages.downloaded) {
      statusCounts.downloaded++;
    } else {
      statusCounts.unknown++;
    }
  });
  
  return {
    totalChunks: chunks.length,
    statusDistribution: statusCounts,
    progressPercentage: chunks.length > 0 ? (statusCounts.uploaded / chunks.length) * 100 : 0,
    recentActivity: chunks
      .filter(chunk => chunk.stages.uploaded || chunk.stages.failed)
      .sort((a, b) => {
        const aTime = new Date(chunk.stages.uploaded || chunk.stages.failed);
        const bTime = new Date(chunk.stages.uploaded || chunk.stages.failed);
        return bTime - aTime;
      })
      .slice(0, 5)
      .map(chunk => ({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        status: chunk.stages.uploaded ? 'UPLOADED' : 'FAILED',
        timestamp: chunk.stages.uploaded || chunk.stages.failed,
        rowCount: chunk.rowCount
      }))
  };
}

/**
 * Generate data integrity report
 */
function generateDataIntegrityReport(integrityCheck) {
  return {
    integrityScore: integrityCheck.integrityScore || 0,
    isAcceptable: integrityCheck.isAcceptable || false,
    sourceRows: integrityCheck.sourceRows || 0,
    processedRows: integrityCheck.processedRows || 0,
    uploadedRows: integrityCheck.uploadedRows || 0,
    lossBreakdown: {
      processingLoss: integrityCheck.processingLoss || 0,
      uploadLoss: integrityCheck.uploadLoss || 0,
      totalLoss: integrityCheck.totalLoss || 0
    },
    lossRates: {
      processingLossRate: integrityCheck.processingLossRate || 0,
      uploadLossRate: integrityCheck.uploadLossRate || 0,
      totalLossRate: integrityCheck.totalLossRate || 0
    },
    dataFlowEfficiency: integrityCheck.sourceRows > 0 ? 
      (integrityCheck.uploadedRows / integrityCheck.sourceRows) * 100 : 0
  };
}

/**
 * Generate chunk details section
 */
function generateChunkDetails(chunkTracker) {
  const chunks = Object.values(chunkTracker.chunkStates || {});
  
  return {
    totalChunks: chunks.length,
    chunkSummary: chunks.map(chunk => ({
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      rowCount: chunk.rowCount,
      status: getChunkStatus(chunk),
      processingTime: calculateProcessingTime(chunk),
      errorCount: chunk.errors ? chunk.errors.length : 0,
      stages: chunk.stages
    })),
    errorSummary: chunks
      .filter(chunk => chunk.errors && chunk.errors.length > 0)
      .map(chunk => ({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        errors: chunk.errors
      }))
  };
}

/**
 * Generate retry analysis section
 */
function generateRetryAnalysis(retryTracker) {
  if (!retryTracker.totalRetries) {
    return {
      hasRetries: false,
      message: 'No retry attempts made'
    };
  }
  
  const retrySuccessRate = retryTracker.totalRetries > 0 ? 
    (retryTracker.successfulRetries / retryTracker.totalRetries) * 100 : 0;
  
  return {
    hasRetries: true,
    totalRetries: retryTracker.totalRetries,
    successfulRetries: retryTracker.successfulRetries,
    failedRetries: retryTracker.failedRetries,
    retrySuccessRate: retrySuccessRate,
    retriedChunks: Object.keys(retryTracker.retriedChunks || {}).length,
    maxRetries: retryTracker.maxRetries,
    retryEffectiveness: retrySuccessRate >= 75 ? 'HIGH' : retrySuccessRate >= 50 ? 'MEDIUM' : 'LOW'
  };
}

/**
 * Generate performance metrics
 */
function generatePerformanceMetrics(chunkTracker) {
  const chunks = Object.values(chunkTracker.chunkStates || {});
  const completedChunks = chunks.filter(chunk => chunk.stages.uploaded);
  
  if (completedChunks.length === 0) {
    return {
      hasMetrics: false,
      message: 'No completed chunks to analyze'
    };
  }
  
  const processingTimes = completedChunks.map(chunk => calculateProcessingTime(chunk));
  const uploadTimes = completedChunks.map(chunk => chunk.uploadTimeMs || 0);
  
  const avgProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
  const avgUploadTime = uploadTimes.reduce((sum, time) => sum + time, 0) / uploadTimes.length;
  
  const totalRows = completedChunks.reduce((sum, chunk) => sum + chunk.rowCount, 0);
  const totalTime = processingTimes.reduce((sum, time) => sum + time, 0);
  const processingRate = totalTime > 0 ? (totalRows / totalTime) * 1000 : 0; // rows per second
  
  return {
    hasMetrics: true,
    completedChunks: completedChunks.length,
    averageProcessingTime: avgProcessingTime,
    averageUploadTime: avgUploadTime,
    totalProcessingTime: totalTime,
    processingRate: processingRate,
    performance: {
      rating: avgProcessingTime < 60000 ? 'EXCELLENT' : avgProcessingTime < 120000 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
      bottleneck: avgUploadTime > avgProcessingTime ? 'DHIS2_UPLOAD' : 'DATA_PROCESSING'
    }
  };
}

/**
 * Generate alerts
 */
function generateAlerts(chunkTracker, integrityCheck) {
  const alerts = [];
  
  // Data integrity alerts
  if (integrityCheck.totalLossRate > 10) {
    alerts.push({
      level: 'CRITICAL',
      type: 'DATA_LOSS',
      message: `High data loss detected: ${integrityCheck.totalLossRate.toFixed(1)}% (${integrityCheck.totalLoss} rows)`,
      timestamp: new Date().toISOString()
    });
  } else if (integrityCheck.totalLossRate > 5) {
    alerts.push({
      level: 'WARNING',
      type: 'DATA_LOSS',
      message: `Moderate data loss detected: ${integrityCheck.totalLossRate.toFixed(1)}% (${integrityCheck.totalLoss} rows)`,
      timestamp: new Date().toISOString()
    });
  }
  
  // Chunk failure alerts
  if (chunkTracker.failedChunks > 0) {
    const failureRate = chunkTracker.expectedChunks > 0 ? 
      (chunkTracker.failedChunks / chunkTracker.expectedChunks) * 100 : 0;
    
    if (failureRate > 20) {
      alerts.push({
        level: 'CRITICAL',
        type: 'HIGH_FAILURE_RATE',
        message: `High chunk failure rate: ${failureRate.toFixed(1)}% (${chunkTracker.failedChunks} chunks)`,
        timestamp: new Date().toISOString()
      });
    } else if (failureRate > 10) {
      alerts.push({
        level: 'WARNING',
        type: 'MODERATE_FAILURE_RATE',
        message: `Moderate chunk failure rate: ${failureRate.toFixed(1)}% (${chunkTracker.failedChunks} chunks)`,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Stuck chunks alert
  const chunks = Object.values(chunkTracker.chunkStates || {});
  const stuckChunks = chunks.filter(chunk => 
    chunk.stages.downloaded && !chunk.stages.uploaded && !chunk.stages.failed
  );
  
  if (stuckChunks.length > 0) {
    alerts.push({
      level: 'WARNING',
      type: 'STUCK_CHUNKS',
      message: `${stuckChunks.length} chunks appear to be stuck in processing`,
      timestamp: new Date().toISOString()
    });
  }
  
  return alerts;
}

/**
 * Generate recommendations
 */
function generateRecommendations(chunkTracker, integrityCheck) {
  const recommendations = [];
  
  // Data integrity recommendations
  if (integrityCheck.totalLossRate > 5) {
    recommendations.push('Review data transformation logic to reduce processing errors');
    recommendations.push('Check DHIS2 data element mappings for validation issues');
  }
  
  // Performance recommendations
  const chunks = Object.values(chunkTracker.chunkStates || {});
  const completedChunks = chunks.filter(chunk => chunk.stages.uploaded);
  
  if (completedChunks.length > 0) {
    const avgProcessingTime = completedChunks.reduce((sum, chunk) => 
      sum + calculateProcessingTime(chunk), 0) / completedChunks.length;
    
    if (avgProcessingTime > 120000) { // 2 minutes
      recommendations.push('Consider reducing chunk size to improve processing speed');
    }
  }
  
  // Retry recommendations
  if (chunkTracker.failedChunks > 0) {
    recommendations.push('Enable retry mechanism for failed chunks');
    recommendations.push('Investigate root cause of chunk failures');
  }
  
  return recommendations;
}

/**
 * Calculate overall health score
 */
function calculateHealthScore(chunkTracker, integrityCheck) {
  let score = 100;
  
  // Data integrity impact (40% weight)
  const integrityImpact = (100 - (integrityCheck.integrityScore || 0)) * 0.4;
  score -= integrityImpact;
  
  // Chunk failure impact (30% weight)
  if (chunkTracker.expectedChunks > 0) {
    const failureRate = (chunkTracker.failedChunks / chunkTracker.expectedChunks) * 100;
    const failureImpact = failureRate * 0.3;
    score -= failureImpact;
  }
  
  // Performance impact (20% weight)
  const chunks = Object.values(chunkTracker.chunkStates || {});
  const completedChunks = chunks.filter(chunk => chunk.stages.uploaded);
  
  if (completedChunks.length > 0) {
    const avgProcessingTime = completedChunks.reduce((sum, chunk) => 
      sum + calculateProcessingTime(chunk), 0) / completedChunks.length;
    
    if (avgProcessingTime > 180000) { // 3 minutes
      score -= 15;
    } else if (avgProcessingTime > 120000) { // 2 minutes
      score -= 10;
    }
  }
  
  // Stuck chunks impact (10% weight)
  const stuckChunks = chunks.filter(chunk => 
    chunk.stages.downloaded && !chunk.stages.uploaded && !chunk.stages.failed
  );
  
  if (stuckChunks.length > 0 && chunkTracker.expectedChunks > 0) {
    const stuckRate = (stuckChunks.length / chunkTracker.expectedChunks) * 100;
    const stuckImpact = stuckRate * 0.1;
    score -= stuckImpact;
  }
  
  return {
    score: Math.max(0, Math.min(100, score)),
    rating: score >= 90 ? 'EXCELLENT' : score >= 75 ? 'GOOD' : score >= 60 ? 'FAIR' : 'POOR',
    factors: {
      dataIntegrity: integrityCheck.integrityScore || 0,
      chunkFailureRate: chunkTracker.expectedChunks > 0 ? 
        (chunkTracker.failedChunks / chunkTracker.expectedChunks) * 100 : 0,
      performanceRating: completedChunks.length > 0 ? 'CALCULATED' : 'PENDING',
      stuckChunks: stuckChunks.length
    }
  };
}

/**
 * Display dashboard in console
 */
function displayDashboard(dashboard) {
  console.log('\n📊 ==================== MONITORING DASHBOARD ====================');
  console.log(`🕐 Timestamp: ${dashboard.timestamp}`);
  console.log(`📈 Status: ${dashboard.status}`);
  console.log(`🏥 Health Score: ${dashboard.healthScore.score.toFixed(1)}/100 (${dashboard.healthScore.rating})`);
  
  // Overview section
  console.log('\n📋 OVERVIEW:');
  console.log(`   File: ${dashboard.overview.fileInfo.fileName || 'Unknown'}`);
  console.log(`   Total Chunks: ${dashboard.overview.totalChunks}`);
  console.log(`   Completed: ${dashboard.overview.completedChunks} (${dashboard.overview.completionRate.toFixed(1)}%)`);
  console.log(`   Failed: ${dashboard.overview.failedChunks}`);
  console.log(`   Remaining: ${dashboard.overview.remainingChunks}`);
  
  // Data integrity section
  console.log('\n🔍 DATA INTEGRITY:');
  console.log(`   Integrity Score: ${dashboard.dataIntegrity.integrityScore.toFixed(1)}%`);
  console.log(`   Source Rows: ${dashboard.dataIntegrity.sourceRows.toLocaleString()}`);
  console.log(`   Uploaded Rows: ${dashboard.dataIntegrity.uploadedRows.toLocaleString()}`);
  console.log(`   Lost Rows: ${dashboard.dataIntegrity.lossBreakdown.totalLoss.toLocaleString()}`);
  
  // Performance section
  if (dashboard.performanceMetrics.hasMetrics) {
    console.log('\n⚡ PERFORMANCE:');
    console.log(`   Processing Rate: ${dashboard.performanceMetrics.processingRate.toFixed(1)} rows/sec`);
    console.log(`   Avg Processing Time: ${(dashboard.performanceMetrics.averageProcessingTime / 1000).toFixed(1)}s`);
    console.log(`   Avg Upload Time: ${(dashboard.performanceMetrics.averageUploadTime / 1000).toFixed(1)}s`);
    console.log(`   Rating: ${dashboard.performanceMetrics.performance.rating}`);
  }
  
  // Alerts section
  if (dashboard.alerts.length > 0) {
    console.log('\n🚨 ALERTS:');
    dashboard.alerts.forEach(alert => {
      const icon = alert.level === 'CRITICAL' ? '🔴' : '🟡';
      console.log(`   ${icon} ${alert.level}: ${alert.message}`);
    });
  }
  
  // Recommendations section
  if (dashboard.recommendations.length > 0) {
    console.log('\n💡 RECOMMENDATIONS:');
    dashboard.recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. ${rec}`);
    });
  }
  
  console.log('📊 ============================================================\n');
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