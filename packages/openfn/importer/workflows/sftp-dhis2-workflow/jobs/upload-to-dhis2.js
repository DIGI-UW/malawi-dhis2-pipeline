/**
 * Upload processed data to DHIS2
 * This job sends the generated dataValueSets payload to DHIS2 via the Web API
 */

import { create, fn } from '@openfn/language-dhis2';

fn(state => {
  console.log('Starting DHIS2 upload for SFTP-processed data...');
  
  if (!state.payload) {
    throw new Error('No payload found in state. Ensure the generate-dhis2-payload job executed successfully.');
  }
  
  console.log('Uploading SFTP-generated payload to DHIS2...');
  console.log('Number of data values to upload:', state.payload.dataValues.length);
  console.log('Data source:', state.payload.dataSource);
  console.log('Generated at:', state.payload.generatedAt);
  
  // Log sample data values for verification
  if (state.payload.dataValues.length > 0) {
    console.log('Sample data values:', state.payload.dataValues.slice(0, 3));
  }
  
  return state;
});

// Upload data to DHIS2 using the dataValueSets endpoint
create("dataValueSets", (state) => {
  const payload = state.payload;
  
  // Add metadata for better tracking
  const enhancedPayload = {
    ...payload,
    completeDate: new Date().toISOString(),
    attribution: {
      source: "SFTP Excel via OpenFn",
      workflow: "HIV-Indicators-SFTP-to-DHIS2-Workflow",
      timestamp: new Date().toISOString(),
      triggerType: state.triggerType || 'unknown',
      processedFiles: payload.metadata?.processedFiles || []
    }
  };
  
  console.log('Sending enhanced SFTP payload to DHIS2...');
  console.log('Enhanced payload summary:', {
    dataSet: enhancedPayload.dataSet,
    period: enhancedPayload.period,
    orgUnit: enhancedPayload.orgUnit,
    dataValuesCount: enhancedPayload.dataValues.length,
    matchingStats: enhancedPayload.matchingStats
  });
  
  return enhancedPayload;
});

fn(state => {
  console.log('DHIS2 upload completed successfully!');
  console.log('Response from DHIS2:', JSON.stringify(state.data, null, 2));
  
  // Log detailed summary
  const response = state.data;
  let uploadSummary = {
    status: 'completed',
    uploadedAt: new Date().toISOString(),
    totalValues: state.payload.dataValues.length
  };
  
  if (response && response.summary) {
    uploadSummary = {
      ...uploadSummary,
      imported: response.summary.imported || 0,
      updated: response.summary.updated || 0,
      ignored: response.summary.ignored || 0,
      deleted: response.summary.deleted || 0,
      total: response.summary.total || 0
    };
    
    console.log('DHIS2 Upload Summary:', uploadSummary);
    
    // Log any conflicts or errors
    if (response.conflicts && response.conflicts.length > 0) {
      console.warn('Upload conflicts detected:', response.conflicts.slice(0, 5));
    }
    
    if (response.importSummaries) {
      response.importSummaries.forEach((summary, index) => {
        if (summary.status === 'ERROR') {
          console.error(`Import error ${index + 1}:`, summary.description);
        }
      });
    }
  }
  
  // Store upload results in state for the next job
  return {
    ...state,
    uploadSummary,
    uploadCompleted: true,
    dhis2Response: response
  };
});
