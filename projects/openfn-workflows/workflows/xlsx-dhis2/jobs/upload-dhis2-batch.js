/**
 * Upload DHIS2 Batch to DHIS2 API
 * 
 * This job takes the generated DHIS2 dataValueSet payload and uploads it
 * to DHIS2 using the DHIS2 adaptor with proper error handling and retry logic.
 * 
 * Upload Strategy:
 * - Cleans payload of internal metadata
 * - Uses DHIS2 adaptor for reliable upload
 * - Implements retry logic for transient failures
 * - Provides detailed success/failure reporting
 */

fn((state) => {
  console.log('🚀 Starting DHIS2 batch upload...');
  
  // Validate that we have a payload to upload
  if (!state.payload || !state.payload.dataValues) {
    console.warn('⚠️  No DHIS2 payload found. Skipping upload.');
    return {
      ...state,
      uploadSkipped: true,
      reason: 'No DHIS2 payload available for upload'
    };
  }
  
  const payloadInfo = state.payloadInfo || {};
  const dataValuesCount = state.payload.dataValues.length;
  
  if (dataValuesCount === 0) {
    console.warn('⚠️  Payload contains no dataValues. Skipping upload.');
    return {
      ...state,
      uploadSkipped: true,
      reason: 'Empty payload - no dataValues to upload'
    };
  }
  
  console.log(`📦 Uploading DHIS2 batch:`);
  console.log(`   Total Chunks: ${payloadInfo.totalChunks || 'unknown'}`);
  console.log(`   DataValues: ${dataValuesCount}`);
  console.log(`   Payload Size: ${payloadInfo.payloadSizeMB?.toFixed(2)}MB`);
  
  const startTime = Date.now();
  
  try {
    // Clean the payload - remove internal metadata that shouldn't go to DHIS2
    const cleanPayload = {
      dataSet: state.payload.dataSet,
      orgUnit: state.payload.orgUnit,
      period: state.payload.period,
      completeDate: state.payload.completeDate,
      dataValues: state.payload.dataValues,
      attributeOptionCombo: state.payload.attributeOptionCombo
    };
    
    // Remove any internal metadata fields
    delete cleanPayload._batchMetadata;
    delete cleanPayload._chunkInfo;
    
    // Clean dataValues of any internal fields
    cleanPayload.dataValues = cleanPayload.dataValues.map(dv => ({
      dataElement: dv.dataElement,
      period: dv.period,
      orgUnit: dv.orgUnit,
      value: dv.value,
      categoryOptionCombo: dv.categoryOptionCombo,
      attributeOptionCombo: dv.attributeOptionCombo,
      comment: dv.comment,
      followUp: dv.followUp || false
    }));
    
    console.log('🔧 Cleaned payload prepared for DHIS2 upload');
    console.log('🔄 Initiating DHIS2 dataValueSet upload...');
    
    // Use DHIS2 adaptor to upload the dataValueSet
    return create('dataValueSets', cleanPayload, {
      // DHIS2 API options
      mergeMode: 'REPLACE',
      skipValidation: false,
      importStrategy: 'CREATE_AND_UPDATE',
      strictPeriods: false,
      strictDataElements: false,
      strictCategoryOptionCombos: false,
      strictAttributeOptionCombos: false,
      strictOrganisationUnits: false,
      requireCategoryOptionCombo: false,
      requireAttributeOptionCombo: false,
      
      // Additional options for large batch uploads
      timeout: 300000, // 5 minutes timeout
      maxRetries: 3,
      retryDelay: 5000 // 5 seconds
    })(state).then(result => {
      const uploadTime = Date.now() - startTime;
      
      console.log(`✅ DHIS2 upload completed in ${uploadTime}ms`);
      console.log('📊 Upload result:', result.data);
      
      // Parse DHIS2 response
      const dhis2Response = result.data;
      const importCount = dhis2Response.importCount || {};
      const conflicts = dhis2Response.conflicts || [];
      
      const uploadResult = {
        totalChunks: payloadInfo.totalChunks || 0,
        uploadSuccess: true,
        uploadedAt: new Date().toISOString(),
        uploadTimeMs: uploadTime,
        dataValuesCount: dataValuesCount,
        dhis2Response: {
          status: dhis2Response.status,
          importCount: importCount,
          conflicts: conflicts,
          description: dhis2Response.description
        }
      };
      
      // Log detailed results
      console.log(`📈 Import Summary:`);
      console.log(`   Imported: ${importCount.imported || 0}`);
      console.log(`   Updated: ${importCount.updated || 0}`);
      console.log(`   Deleted: ${importCount.deleted || 0}`);
      console.log(`   Ignored: ${importCount.ignored || 0}`);
      
      if (conflicts.length > 0) {
        console.warn(`⚠️  Conflicts found: ${conflicts.length}`);
        conflicts.slice(0, 5).forEach((conflict, index) => {
          console.warn(`   Conflict ${index + 1}: ${conflict.object} - ${conflict.value}`);
        });
        if (conflicts.length > 5) {
          console.warn(`   ... and ${conflicts.length - 5} more conflicts`);
        }
      }
      
      return {
        ...state,
        uploadComplete: true,
        uploadResult: uploadResult,
        // Remove payload to free memory
        payload: null,
        payloadInfo: null,
        // Flag for next step
        nextStep: 'consolidate_results'
      };
      
    }).catch(error => {
      const uploadTime = Date.now() - startTime;
      
      console.error(`❌ DHIS2 upload failed after ${uploadTime}ms`);
      console.error('❌ Error details:', error.message);
      
      // Enhanced error reporting
      const errorDetails = {
        totalChunks: payloadInfo.totalChunks || 0,
        uploadSuccess: false,
        failedAt: new Date().toISOString(),
        uploadTimeMs: uploadTime,
        dataValuesCount: dataValuesCount,
        error: {
          message: error.message,
          code: error.code,
          response: error.response?.data || null
        }
      };
      
      // Log specific error types
      if (error.response?.status === 409) {
        console.error('💡 Conflict error - data may already exist or have validation issues');
      } else if (error.response?.status === 400) {
        console.error('💡 Bad request - check data format and DHIS2 configuration');
      } else if (error.response?.status === 413) {
        console.error('💡 Payload too large - consider reducing chunk size');
      } else if (error.response?.status >= 500) {
        console.error('💡 Server error - DHIS2 may be experiencing issues');
      }
      
      return {
        ...state,
        uploadFailed: true,
        uploadError: errorDetails,
        success: false
      };
    });
    
  } catch (error) {
    const uploadTime = Date.now() - startTime;
    
    console.error(`❌ DHIS2 upload preparation failed after ${uploadTime}ms`);
    console.error('❌ Error details:', error.message);
    
    return {
      ...state,
      uploadFailed: true,
      uploadError: {
        totalChunks: payloadInfo.totalChunks || 0,
        uploadSuccess: false,
        failedAt: new Date().toISOString(),
        uploadTimeMs: uploadTime,
        error: {
          message: error.message,
          stage: 'preparation'
        }
      },
      success: false
    };
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