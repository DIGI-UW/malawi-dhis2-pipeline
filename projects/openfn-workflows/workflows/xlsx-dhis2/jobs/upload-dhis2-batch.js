/**
 * Uploads a `dataValueSet` payload to the DHIS2 API.
 * This job takes the final payload and uses the DHIS2 adaptor to send it.
 * It includes error handling to manage upload failures.
 */
fn(async state => {
  console.log('Uploading DHIS2 batch...');
  
  const { payload } = state;

  if (!payload || !payload.dataValues || payload.dataValues.length === 0) {
    console.warn('Warning: No payload or data values to upload.');
    return { ...state, uploadResult: { status: 'skipped' } };
  }
  
  try {
    const { data: dhis2Response } = await create('dataValueSets', payload, {
      mergeMode: 'REPLACE',
      importStrategy: 'CREATE_AND_UPDATE',
    })(state);

    console.log('  - DHIS2 upload successful.');
    console.log('  - Import summary:', dhis2Response.importCount);

    return { ...state, uploadResult: { status: 'success', dhis2Response } };
  } catch (error) {
    console.error('  - Error uploading to DHIS2:', error.message);
    return { ...state, uploadResult: { status: 'error', error: error.message } };
  }
});

/**
 * Post-upload validation and cleanup
 */
fn((state) => {
  // Validate upload result
  if (state.uploadResult && state.uploadResult.uploadSuccess) {
    const result = state.uploadResult;
    const importCount = result.dhis2Response.importCount || {};
    
    const totalProcessed = (importCount.imported || 0) + 
                          (importCount.updated || 0) + 
                          (importCount.ignored || 0);
    
    console.log(`✅ Upload validation:`);
    console.log(`   ${result.totalChunks} chunks processed successfully`);
    console.log(`   ${totalProcessed} dataValues processed by DHIS2`);
    console.log(`   Upload completed in ${result.uploadTimeMs}ms`);
    
    // Check for partial success
    if (totalProcessed < result.dataValuesCount) {
      console.warn(`⚠️  Partial success: ${totalProcessed}/${result.dataValuesCount} dataValues processed`);
    }
  }
  
  return state;
});