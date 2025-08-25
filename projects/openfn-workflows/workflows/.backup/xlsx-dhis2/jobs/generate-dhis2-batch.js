/**
 * Generate DHIS2 Batch Payload from a Single Processed Chunk
 * 
 * This job takes a single processed chunk and generates a DHIS2 dataValueSet payload
 * optimized for batch upload to DHIS2 API.
 * 
 * Payload Strategy:
 * - Creates standard DHIS2 dataValueSet structure from ONE chunk
 * - Includes batch metadata for tracking
 * - Validates payload size and structure
 * - Optimizes for DHIS2 API performance
 */

fn((state) => {
  console.log('🔄 Starting DHIS2 batch payload generation...');
  
  // Validate that we have a processed chunk
  if (!state.processedChunk || state.processedChunk.failed) {
    console.warn('⚠️  No valid processed chunk found. Skipping payload generation.');
    return {
      ...state,
      payloadGenerationSkipped: true,
      reason: 'No valid processed chunk available'
    };
  }
  
  const chunk = state.processedChunk;
  
  if (!chunk.processedRows || !Array.isArray(chunk.processedRows) || chunk.processedRows.length === 0) {
    console.warn('⚠️  No processed rows found in chunk. Skipping payload generation.');
    return {
      ...state,
      payloadGenerationSkipped: true,
      reason: 'No processed rows in chunk'
    };
  }
  
  console.log(`📦 Generating DHIS2 payload for single chunk:`);
  console.log(`   Chunk ID: ${chunk.chunkId}`);
  console.log(`   File: ${chunk.fileName}`);
  console.log(`   Processed rows: ${chunk.processedRows.length}`);
  
  const startTime = Date.now();
  
  try {
    // DHIS2 configuration
    const CONFIG = {
      dataSet: 'necyFYLlEI0',
      orgUnit: 'drsiURo4DeK',
      period: '202501',
      categoryOptionCombo: 'HllvX50cXC0',
      attributeOptionCombo: 'HllvX50cXC0'
    };
    
    // Generate dataValues array for DHIS2 from the single chunk
    const dataValues = [];
    let validDataValues = 0;
    let skippedDataValues = 0;
    
    chunk.processedRows.forEach((row, rowIndex) => {
      try {
        // Create DHIS2 dataValue structure
        const dataValue = {
          dataElement: row.indicator,  // indicator maps to dataElement
          period: row.period || CONFIG.period,
          orgUnit: row.facility || CONFIG.orgUnit,  // facility maps to orgUnit
          value: row.value.toString(),
          categoryOptionCombo: CONFIG.categoryOptionCombo,
          attributeOptionCombo: CONFIG.attributeOptionCombo,
          // Add metadata for tracking
          comment: `Chunk ${chunk.chunkIndex + 1}, Row ${row.originalRowIndex}`,
          followUp: false
        };
        
        // Basic validation
        if (!dataValue.dataElement || !dataValue.orgUnit || dataValue.value === 'undefined' || dataValue.value === 'null') {
          console.warn(`⚠️  Skipping invalid dataValue in row ${rowIndex}: missing dataElement, orgUnit, or value`);
          console.warn(`   dataElement: ${dataValue.dataElement}, orgUnit: ${dataValue.orgUnit}, value: ${dataValue.value}`);
          skippedDataValues++;
          return;
        }
        
        dataValues.push(dataValue);
        validDataValues++;
        
      } catch (error) {
        console.error(`❌ Error creating dataValue for row ${rowIndex}:`, error.message);
        skippedDataValues++;
      }
    });
    
    // Create DHIS2 dataValueSet structure
    const dataValueSet = {
      dataSet: CONFIG.dataSet,
      orgUnit: CONFIG.orgUnit,
      period: CONFIG.period,
      completeDate: new Date().toISOString(),
      dataValues: dataValues,
      attributeOptionCombo: CONFIG.attributeOptionCombo
    };
    
    // Validate payload size
    const payloadSize = JSON.stringify(dataValueSet).length;
    const payloadSizeMB = payloadSize / (1024 * 1024);
    
    console.log(`📊 DHIS2 payload generation completed:`);
    console.log(`   Single chunk processed: ${chunk.chunkId}`);
    console.log(`   Total dataValues: ${validDataValues}`);
    console.log(`   Skipped dataValues: ${skippedDataValues}`);
    console.log(`   Payload size: ${payloadSizeMB.toFixed(2)}MB`);
    
    // Check if payload exceeds reasonable size limits (should be small now)
    const MAX_PAYLOAD_SIZE_MB = 5;
    if (payloadSizeMB > MAX_PAYLOAD_SIZE_MB) {
      console.warn(`⚠️  Payload size ${payloadSizeMB.toFixed(2)}MB exceeds recommended limit ${MAX_PAYLOAD_SIZE_MB}MB`);
    }
    
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ DHIS2 payload generation completed in ${processingTime}ms`);
    console.log(`🎯 Payload ready for DHIS2 upload (${validDataValues} dataValues)`);
    
    return {
      ...state,
      payloadGenerationComplete: true,
      payload: dataValueSet,
      payloadInfo: {
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        fileName: chunk.fileName,
        validDataValues: validDataValues,
        skippedDataValues: skippedDataValues,
        payloadSizeMB: payloadSizeMB,
        generatedAt: new Date().toISOString(),
        processingTimeMs: processingTime
      },
      // Remove processed chunk data to free memory
      processedChunk: null,
      // Flag for next step
      nextStep: 'upload_dhis2_batch'
    };
    
  } catch (error) {
    console.error('❌ DHIS2 payload generation failed:', error.message);
    
    return {
      ...state,
      payloadGenerationFailed: true,
      error: {
        message: error.message,
        timestamp: new Date().toISOString()
      },
      success: false,
      // Clean up memory
      processedChunk: null
    };
  }
});

/**
 * Payload validation and cleanup
 */
fn((state) => {
  // Validate the generated payload
  if (state.payload && state.payload.dataValues) {
    const dataValuesCount = state.payload.dataValues.length;
    
    if (dataValuesCount === 0) {
      console.warn('⚠️  Generated payload contains no dataValues');
      return {
        ...state,
        validationWarning: 'Empty payload generated'
      };
    }
    
    // Sample validation - check first few dataValues
    const sampleSize = Math.min(3, dataValuesCount);
    console.log(`🔍 Validating sample of ${sampleSize} dataValues:`);
    
    for (let i = 0; i < sampleSize; i++) {
      const dataValue = state.payload.dataValues[i];
      
      if (!dataValue.dataElement || !dataValue.value || !dataValue.orgUnit) {
        console.warn(`⚠️  Invalid dataValue at index ${i}:`, {
          dataElement: dataValue.dataElement,
          value: dataValue.value,
          orgUnit: dataValue.orgUnit
        });
      } else {
        console.log(`✅ DataValue ${i + 1}: ${dataValue.dataElement} = ${dataValue.value}`);
      }
    }
    
    console.log(`✅ Payload validation completed: ${dataValuesCount} dataValues ready for DHIS2`);
  }
  
  console.log(`💾 Memory cleanup completed`);
  
  return state;
}); 