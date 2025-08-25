/**
 * Process Excel Chunk - Transform Data for DHIS2
 * 
 * This job processes a single chunk of Excel data from state and transforms it
 * into structured format for DHIS2 upload.
 * 
 * OpenFN Best Practice:
 * - Simple job with clear scope
 * - Processes chunk data from state
 * - Transforms data for next step
 * - Manages memory efficiently
 */

fn((state) => {
  console.log('🔄 Starting Excel chunk data processing...');
  
  // Check if we have a chunk to process
  if (!state.chunks || state.chunks.length === 0) {
    console.log('⚠️  No chunks found in state. Skipping chunk processing.');
    return {
      ...state,
      processedChunk: null,
      continueProcessing: false,
      error: 'No chunks found for processing'
    };
  }
  
  // Get the single chunk to process
  const chunk = state.chunks[0];
  
  if (!chunk.data || !Array.isArray(chunk.data)) {
    console.error('❌ Chunk data is missing or invalid');
    return {
      ...state,
      processedChunk: {
        failed: true,
        error: 'Invalid chunk data structure',
        chunkId: chunk.chunkId
      },
      continueProcessing: false
    };
  }
  
  console.log(`📊 Processing chunk:`);
  console.log(`   Chunk ID: ${chunk.chunkId}`);
  console.log(`   File: ${chunk.fileName}`);
  console.log(`   Rows: ${chunk.startRow} to ${chunk.endRow} (${chunk.rowCount} rows)`);
  console.log(`   Data size: ${chunk.dataSize} bytes`);
  
  // Configuration for data transformation
  const CONFIG = {
    dataSet: 'necyFYLlEI0',
    orgUnit: 'drsiURo4DeK',
    period: '202501',
    categoryOptionCombo: 'HllvX50cXC0',
    attributeOptionCombo: 'HllvX50cXC0',
    columnMappings: {
      facility: {
        sourceColumns: ['Site', 'Facility', 'Health Facility'],
        targetField: 'orgUnit',
        required: true,
      },
      indicator: {
        sourceColumns: ['Indicator_name', 'Indicator Name', 'Data Element'],
        targetField: 'dataElement',
        required: true,
      },
      value: {
        sourceColumns: ['IndicatorValue', 'Value', 'Count'],
        targetField: 'value',
        required: true,
        dataType: 'numeric',
      },
      period: {
        sourceColumns: ['Quarter', 'Period', 'Reporting period'],
        targetField: 'period',
        required: false,
      }
    }
  };
  
  try {
    const rawData = chunk.data;
    const processedRows = [];
    const processingErrors = [];
    
    // Get headers and data rows
    const headers = rawData.length > 0 ? rawData[0] : [];
    const dataRows = rawData.slice(1);
    
    console.log(`📋 Headers found: ${headers.length} columns`);
    console.log(`📊 Data rows to process: ${dataRows.length}`);
    
    // Find column indices for mapping
    const columnIndices = {};
    Object.keys(CONFIG.columnMappings).forEach(fieldName => {
      const mapping = CONFIG.columnMappings[fieldName];
      let foundIndex = -1;
      
      for (const sourceCol of mapping.sourceColumns) {
        const index = headers.findIndex(header => 
          header && header.toString().toLowerCase().includes(sourceCol.toLowerCase())
        );
        if (index !== -1) {
          foundIndex = index;
          break;
        }
      }
      
      columnIndices[fieldName] = foundIndex;
      
      if (foundIndex === -1 && mapping.required) {
        console.warn(`⚠️  Required column not found: ${fieldName} (looking for: ${mapping.sourceColumns.join(', ')})`);
      }
    });
    
    console.log(`📍 Column mappings found:`, columnIndices);
    
    // Process each data row
    dataRows.forEach((row, rowIndex) => {
      try {
        // Extract values using column mappings
        const facility = columnIndices.facility !== -1 ? row[columnIndices.facility] : null;
        const indicator = columnIndices.indicator !== -1 ? row[columnIndices.indicator] : null;
        const value = columnIndices.value !== -1 ? row[columnIndices.value] : null;
        const period = columnIndices.period !== -1 ? row[columnIndices.period] : CONFIG.period;
        
        // Validate required fields
        if (!facility || !indicator || value === null || value === undefined) {
          processingErrors.push({
            rowIndex: rowIndex + 1,
            error: 'Missing required fields',
            details: { facility, indicator, value }
          });
          return;
        }
        
        // Convert value to number
        let numericValue = value;
        if (typeof value === 'string') {
          numericValue = parseFloat(value);
          if (isNaN(numericValue)) {
            processingErrors.push({
              rowIndex: rowIndex + 1,
              error: 'Invalid numeric value',
              value: value
            });
            return;
          }
        }
        
        // Create processed row
        const processedRow = {
          facility: facility,
          indicator: indicator,
          value: numericValue,
          period: period,
          originalRowIndex: rowIndex + 1
        };
        
        processedRows.push(processedRow);
        
      } catch (error) {
        processingErrors.push({
          rowIndex: rowIndex + 1,
          error: error.message
        });
      }
    });
    
    const successRate = dataRows.length > 0 ? (processedRows.length / dataRows.length) * 100 : 0;
    
    console.log(`✅ Chunk processing completed:`);
    console.log(`   Total rows processed: ${dataRows.length}`);
    console.log(`   Successful rows: ${processedRows.length}`);
    console.log(`   Error rows: ${processingErrors.length}`);
    console.log(`   Success rate: ${successRate.toFixed(1)}%`);
    
    // Log errors if any
    if (processingErrors.length > 0) {
      console.warn(`⚠️  Processing errors (first 3):`);
      processingErrors.slice(0, 3).forEach(error => {
        console.warn(`   Row ${error.rowIndex}: ${error.error}`);
      });
    }
    
    // Create processed chunk result
    const processedChunk = {
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      fileName: chunk.fileName,
      startRow: chunk.startRow,
      endRow: chunk.endRow,
      rowCount: chunk.rowCount,
      processedRows: processedRows,
      validRows: processedRows.length,
      errorRows: processingErrors.length,
      successRate: successRate,
      processingErrors: processingErrors,
      processedAt: new Date().toISOString(),
      failed: false
    };
    
    return {
      ...state,
      processedChunk: processedChunk,
      totalRowsProcessed: processedRows.length,
      CONFIG: CONFIG,
      // Clean up raw chunk data to save memory
      chunks: null
    };
    
  } catch (error) {
    console.error(`❌ Error processing chunk:`, error.message);
    
    const errorChunk = {
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      fileName: chunk.fileName,
      startRow: chunk.startRow,
      endRow: chunk.endRow,
      rowCount: chunk.rowCount,
      processedRows: [],
      validRows: 0,
      errorRows: chunk.rowCount,
      successRate: 0,
      processingErrors: [{ error: error.message }],
      processedAt: new Date().toISOString(),
      failed: true
    };
    
    return {
      ...state,
      processedChunk: errorChunk,
      totalRowsProcessed: 0,
      CONFIG: CONFIG,
      continueProcessing: false,
      // Clean up memory
      chunks: null
    };
  }
}); 