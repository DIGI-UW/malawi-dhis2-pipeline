/**
 * Upload processed data to DHIS2
 * This job sends the generated dataValueSets payload to DHIS2 via the Web API
 * Supports both single dataValueSet and multiple dataValueSets formats
 */

import { create, fn, each } from '@openfn/language-dhis2';

fn(state => {
  console.log('Starting DHIS2 upload for SFTP-processed data...');
  
  if (!state.payload) {
    throw new Error('No payload found in state. Ensure the generate-dhis2-payload job executed successfully.');
  }
  
  console.log('Preparing SFTP-generated payload for DHIS2...');
  
  // Handle both old format (single dataValueSet) and new format (multiple dataValueSets)
  if (state.payload.dataValueSets) {
    // New format with multiple dataValueSets
    console.log(`Number of data value sets to upload: ${state.payload.dataValueSets.length}`);
    const totalValues = state.payload.dataValueSets.reduce((sum, dvs) => sum + (dvs.dataValues?.length || 0), 0);
    console.log(`Total data values across all sets: ${totalValues}`);
  } else if (state.payload.dataValues) {
    // Old format with single dataValueSet
    console.log(`Number of data values to upload: ${state.payload.dataValues.length}`);
    // Convert to new format for consistency
    state.payload = {
      dataValueSets: [state.payload],
      metadata: state.payload.metadata || {}
    };
  }
  
  console.log('Data source:', state.payload.metadata?.dataSource || 'SFTP Excel');
  console.log('Generated at:', state.payload.metadata?.generatedAt || new Date().toISOString());
  
  return state;
});

// Upload each dataValueSet to DHIS2
each("payload.dataValueSets", (state) => {
  const dataValueSet = state.data;
  const index = state.index || 0;
  
  console.log(`\nUploading data value set ${index + 1}/${state.payload.dataValueSets.length}`);
  console.log(`- Data values: ${dataValueSet.dataValues?.length || 0}`);
  console.log(`- Dataset: ${dataValueSet.dataSet || 'not specified'}`);
  console.log(`- Period: ${dataValueSet.period}`);
  console.log(`- Org Unit: ${dataValueSet.orgUnit}`);
  
  // Log sample data values for verification
  if (dataValueSet.dataValues?.length > 0) {
    console.log('Sample data values:', dataValueSet.dataValues.slice(0, 2));
  }
  
  return create("dataValueSets", (state) => {
    // Add metadata for better tracking
    const enhancedPayload = {
      ...dataValueSet,
      completeDate: dataValueSet.completeDate || new Date().toISOString(),
      attribution: {
        source: "SFTP Excel via OpenFn",
        workflow: "HIV-Indicators-SFTP-to-DHIS2-Workflow",
        timestamp: new Date().toISOString(),
        setIndex: index,
        totalSets: state.payload.dataValueSets.length,
        processedFiles: state.payload.metadata?.processedFiles || []
      }
    };
    
    console.log('Sending enhanced payload to DHIS2...');
    
    return enhancedPayload;
  })(state);
});

fn(state => {
  console.log('\nAll DHIS2 uploads completed!');
  
  // Aggregate upload results
  const uploadResults = state.references || [];
  let totalSummary = {
    status: 'completed',
    uploadedAt: new Date().toISOString(),
    totalSets: state.payload.dataValueSets.length,
    totalValues: 0,
    imported: 0,
    updated: 0,
    ignored: 0,
    deleted: 0,
    conflicts: [],
    errors: []
  };
  
  uploadResults.forEach((result, index) => {
    console.log(`\nResult for data value set ${index + 1}:`, JSON.stringify(result, null, 2));
    
    if (result && result.importCount) {
      totalSummary.imported += result.importCount.imported || 0;
      totalSummary.updated += result.importCount.updated || 0;
      totalSummary.ignored += result.importCount.ignored || 0;
      totalSummary.deleted += result.importCount.deleted || 0;
    }
    
    if (result && result.conflicts) {
      totalSummary.conflicts = totalSummary.conflicts.concat(result.conflicts);
    }
    
    if (result && result.status === 'ERROR') {
      totalSummary.errors.push({
        setIndex: index,
        error: result.description || 'Unknown error'
      });
    }
  });
  
  // Calculate total values processed
  totalSummary.totalValues = totalSummary.imported + totalSummary.updated + totalSummary.ignored;
  
  console.log('\nAggregated Upload Summary:', totalSummary);
  
  if (totalSummary.conflicts.length > 0) {
    console.warn(`Total conflicts: ${totalSummary.conflicts.length}`);
    console.warn('First 5 conflicts:', totalSummary.conflicts.slice(0, 5));
  }
  
  if (totalSummary.errors.length > 0) {
    console.error(`Total errors: ${totalSummary.errors.length}`);
    totalSummary.errors.forEach(err => {
      console.error(`Set ${err.setIndex + 1} error: ${err.error}`);
    });
  }
  
  // Store upload results in state for the next job
  return {
    ...state,
    uploadSummary: totalSummary,
    uploadCompleted: true,
    dhis2Responses: uploadResults
  };
});
