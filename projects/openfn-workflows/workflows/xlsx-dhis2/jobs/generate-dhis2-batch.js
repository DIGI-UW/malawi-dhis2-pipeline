/**
 * Generate DHIS2 Batch Payload from Processed Chunks
 * 
 * This job takes processed chunk data and generates a DHIS2 dataValueSet payload
 * optimized for batch upload to DHIS2 API.
 * 
 * Payload Strategy:
 * - Creates standard DHIS2 dataValueSet structure
 * - Includes batch metadata for tracking
 * - Validates payload size and structure
 * - Optimizes for DHIS2 API performance
 */

fn((state) => {
  console.log('🔄 Starting DHIS2 batch payload generation...');
  
  // Validate that we have processed chunk data
  if (!state.processedChunks || !Array.isArray(state.processedChunks) || state.processedChunks.length === 0) {
    console.warn('⚠️  No processed chunk data found. Skipping payload generation.');
    return {
      ...state,
      payloadGenerationSkipped: true,
      reason: 'No processed chunk data available'
    };
  }
  
  console.log(`📦 Generating DHIS2 payload for ${state.processedChunks.length} chunks`);
  
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
    
    // Generate dataValues array for DHIS2 from all processed chunks
    const dataValues = [];
    let validDataValues = 0;
    let skippedDataValues = 0;
    let totalProcessedRows = 0;
    
    state.processedChunks.forEach((chunk, chunkIndex) => {
      if (!chunk.processedRows || !Array.isArray(chunk.processedRows)) {
        console.warn(`⚠️  Chunk ${chunkIndex} has no processedRows data`);
        return;
      }
      
      chunk.processedRows.forEach((row, rowIndex) => {
        try {
          // Create DHIS2 dataValue structure
          const dataValue = {
            dataElement: row.dataElement,
            period: row.period || CONFIG.period,
            orgUnit: row.orgUnit || CONFIG.orgUnit,
            value: row.value.toString(),
            categoryOptionCombo: row.categoryOptionCombo || CONFIG.categoryOptionCombo,
            attributeOptionCombo: row.attributeOptionCombo || CONFIG.attributeOptionCombo,
            // Add metadata for tracking
            comment: `Chunk ${chunkIndex + 1}, Row ${row.originalRowIndex + 1}`,
            followUp: false,
            created: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          };
          
          // Basic validation
          if (!dataValue.dataElement || dataValue.value === 'undefined' || dataValue.value === 'null') {
            console.warn(`⚠️  Skipping invalid dataValue in chunk ${chunkIndex}, row ${rowIndex}: missing dataElement or value`);
            skippedDataValues++;
            return;
          }
          
          dataValues.push(dataValue);
          validDataValues++;
          totalProcessedRows++;
          
        } catch (error) {
          console.error(`❌ Error creating dataValue in chunk ${chunkIndex}, row ${rowIndex}:`, error.message);
          skippedDataValues++;
        }
      });
    });
    
    // Create DHIS2 dataValueSet structure
    const dataValueSet = {
      dataSet: CONFIG.dataSet,
      orgUnit: CONFIG.orgUnit,
      period: CONFIG.period,
      completeDate: new Date().toISOString(),
      dataValues: dataValues,
      // Add batch metadata
      attributeOptionCombo: CONFIG.attributeOptionCombo,
      // Custom metadata for tracking (will be removed before sending to DHIS2)
      _batchMetadata: {
        totalChunks: state.processedChunks.length,
        totalProcessedRows: totalProcessedRows,
        validDataValues: validDataValues,
        skippedDataValues: skippedDataValues,
        processingTimestamp: new Date().toISOString(),
        sourceFile: state.fileInfo ? state.fileInfo.fileName : 'unknown'
      }
    };
    
    // Validate payload size
    const payloadSize = JSON.stringify(dataValueSet).length;
    const payloadSizeMB = payloadSize / (1024 * 1024);
    
    console.log(`📊 DHIS2 payload generation completed:`);
    console.log(`   Total chunks processed: ${state.processedChunks.length}`);
    console.log(`   Total dataValues: ${validDataValues}`);
    console.log(`   Skipped dataValues: ${skippedDataValues}`);
    console.log(`   Payload size: ${payloadSizeMB.toFixed(2)}MB`);
    
    // Check if payload exceeds reasonable size limits
    const MAX_PAYLOAD_SIZE_MB = 5; // Conservative limit
    if (payloadSizeMB > MAX_PAYLOAD_SIZE_MB) {
      console.warn(`⚠️  Payload size ${payloadSizeMB.toFixed(2)}MB exceeds recommended limit ${MAX_PAYLOAD_SIZE_MB}MB`);
      
      // Could implement payload splitting here if needed
      return {
        ...state,
        payloadGenerationWarning: true,
        warning: `Payload size ${payloadSizeMB.toFixed(2)}MB exceeds recommended limit`,
        payload: dataValueSet,
        payloadInfo: {
          totalChunks: state.processedChunks.length,
          validDataValues: validDataValues,
          skippedDataValues: skippedDataValues,
          payloadSizeMB: payloadSizeMB,
          generatedAt: new Date().toISOString()
        }
      };
    }
    
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ DHIS2 payload generation completed in ${processingTime}ms`);
    console.log(`🎯 Payload ready for DHIS2 upload`);
    
    return {
      ...state,
      payloadGenerationComplete: true,
      payload: dataValueSet,
      payloadInfo: {
        totalChunks: state.processedChunks.length,
        validDataValues: validDataValues,
        skippedDataValues: skippedDataValues,
        payloadSizeMB: payloadSizeMB,
        generatedAt: new Date().toISOString(),
        processingTimeMs: processingTime
      },
      // Remove processed chunk data to free memory
      processedChunks: null,
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
      success: false
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
    const sampleSize = Math.min(5, dataValuesCount);
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