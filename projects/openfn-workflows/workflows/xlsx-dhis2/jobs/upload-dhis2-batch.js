/**
 * Upload DHIS2 Batch to DHIS2 API
 * 
 * Hybrid approach: Standard DHIS2 adaptor pattern with enhanced logging
 * - Uses proven create("dataValueSets", ...) pattern
 * - Adds comprehensive logging for visibility
 * - Includes memory management
 * - Follows OpenFn best practices
 */

// Pre-upload validation and logging
fn((state) => {
  console.log('🚀 Starting DHIS2 batch upload...');
  
  // Validate payload exists
  if (!state.payload || !state.payload.dataValues) {
    console.warn('⚠️  No DHIS2 payload found. Skipping upload.');
    return {
      ...state,
      uploadSkipped: true,
      reason: 'No DHIS2 payload available for upload'
    };
  }
  
  const dataValuesCount = state.payload.dataValues.length;
  
  if (dataValuesCount === 0) {
    console.warn('⚠️  Payload contains no dataValues. Skipping upload.');
    return {
      ...state,
      uploadSkipped: true,
      reason: 'Empty payload - no dataValues to upload'
    };
  }
  
  // Log upload info
  console.log(`📦 Uploading DHIS2 batch:`);
  console.log(`   DataValues: ${dataValuesCount}`);
  console.log(`   Payload size: ${JSON.stringify(state.payload).length} bytes`);
  console.log(`   Dataset: ${state.payload.dataSet || 'N/A'}`);
  console.log(`   Period: ${state.payload.period || 'N/A'}`);
  console.log(`   OrgUnit: ${state.payload.orgUnit || 'N/A'}`);
  
  // Store metadata for post-upload processing
  const uploadMetadata = {
    startTime: Date.now(),
    dataValuesCount: dataValuesCount,
    payloadSize: JSON.stringify(state.payload).length
  };
  
  console.log('📤 Sending payload to DHIS2 using standard adaptor pattern...');
  
  return {
    ...state,
    uploadMetadata: uploadMetadata
  };
});

// Standard DHIS2 adaptor pattern - proven and reliable
create("dataValueSets", (state) => (state.payload));

// Post-upload result logging and cleanup
fn((state) => {
  const uploadTime = Date.now() - (state.uploadMetadata?.startTime || Date.now());
  
  // Check if upload was successful
  if (state.data && state.data.status) {
    console.log(`✅ DHIS2 upload completed in ${uploadTime}ms`);
    
    // Parse and log DHIS2 response
    const importCount = state.data.importCount || {};
    const conflicts = state.data.conflicts || [];
    
    console.log(`📈 Import Summary:`);
    console.log(`   Imported: ${importCount.imported || 0}`);
    console.log(`   Updated: ${importCount.updated || 0}`);
    console.log(`   Deleted: ${importCount.deleted || 0}`);
    console.log(`   Ignored: ${importCount.ignored || 0}`);
    console.log(`   Status: ${state.data.status}`);
    
    // Log conflicts if any
    if (conflicts.length > 0) {
      console.warn(`⚠️  Conflicts found: ${conflicts.length}`);
      conflicts.slice(0, 3).forEach((conflict, index) => {
        console.warn(`   Conflict ${index + 1}: ${conflict.object} - ${conflict.value}`);
      });
      if (conflicts.length > 3) {
        console.warn(`   ... and ${conflicts.length - 3} more conflicts`);
      }
    }
    
    // Create upload result for consolidation
    const uploadResult = {
      uploadSuccess: true,
      uploadedAt: new Date().toISOString(),
      uploadTimeMs: uploadTime,
      dataValuesCount: state.uploadMetadata?.dataValuesCount || 0,
      payloadSize: state.uploadMetadata?.payloadSize || 0,
      dhis2Response: {
        status: state.data.status,
        importCount: importCount,
        conflicts: conflicts,
        description: state.data.description
      }
    };
    
    console.log('🎉 Upload completed successfully!');
    
    // Clean up memory and return result
    return {
      ...state,
      uploadComplete: true,
      uploadResult: uploadResult,
      // Memory management: remove large objects
      payload: null,
      uploadMetadata: null,
      // Flag for workflow continuation
      nextStep: 'consolidate_results'
    };
  } else {
    // Upload failed
    console.error(`❌ DHIS2 upload failed after ${uploadTime}ms`);
    console.error('❌ Response:', state.data || 'No response data');
    
    const uploadError = {
      uploadSuccess: false,
      failedAt: new Date().toISOString(),
      uploadTimeMs: uploadTime,
      dataValuesCount: state.uploadMetadata?.dataValuesCount || 0,
      error: {
        message: 'DHIS2 upload failed',
        response: state.data || null
      }
    };
    
    // Clean up memory
    return {
      ...state,
      uploadFailed: true,
      uploadError: uploadError,
      success: false,
      // Memory management
      payload: null,
      uploadMetadata: null
    };
  }
});