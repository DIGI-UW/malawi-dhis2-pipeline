/**
 * Generate DHIS2 payload from processed Excel data
 * This job transforms Excel indicator data into DHIS2 dataValueSets format
 * Uses configuration-based metadata mappings
 */

// OpenFN functions are available directly, no imports needed
// The runtime provides: fn from @openfn/language-common

function generatePayload(processedFiles, metadata, timeWindow = 3) {
  console.log('Generating DHIS2 payload from processed Excel files...');
  console.log(`Time window for updates: ${timeWindow} months`);
  
  // Extract all data values from processed files
  const allDataValues = [];
  let totalRecords = 0;
  
  processedFiles.forEach(file => {
    console.log(`Processing file: ${file.fileName} (${file.excelData.type})`);
    console.log(`File contains ${file.excelData.data.length} data rows`);
    
    const config = file.excelData.config;
    
    file.excelData.data.forEach(row => {
      // Create DHIS2 data value from mapped row
      const dataValue = {
        dataElement: row.dataElement,
        orgUnit: row.orgUnit,
        period: row.period,
        value: row.value
      };
      
      // Add category options if present
      if (row.categoryOptions) {
        // This marks the data value as having disaggregations.
        // A later job would need to resolve these names to a DHIS2 categoryOptionCombo UID.
        dataValue.categoryOptions = row.categoryOptions;
      }
      
      // Add attribute options if present
      if (row.attributeOptions) {
        dataValue.attributeOptions = row.attributeOptions;
      }
      
      // Add comment if present
      if (row.comment) {
        dataValue.comment = row.comment;
      }
      
      // Add metadata for tracking
      dataValue.sourceFile = file.fileName;
      dataValue.sourceRow = row._rowNumber;
      
      allDataValues.push(dataValue);
      totalRecords++;
    });
  });
  
  console.log(`Extracted ${allDataValues.length} data values from ${totalRecords} total records`);
  
  // Filter data values based on time window
  const currentDate = new Date();
  const cutoffDate = new Date(currentDate);
  cutoffDate.setMonth(cutoffDate.getMonth() - timeWindow);
  
  const filteredDataValues = allDataValues.filter(dv => {
    // Parse period (assuming YYYYMM format)
    const period = dv.period;
    if (!period || period.length < 6) {
      console.warn(`Invalid period format: ${period}`);
      return false;
    }
    
    const year = parseInt(period.substring(0, 4));
    const month = parseInt(period.substring(4, 6));
    
    if (isNaN(year) || isNaN(month)) {
      console.warn(`Cannot parse period: ${period}`);
      return false;
    }
    
    const periodDate = new Date(year, month - 1);
    const isWithinWindow = periodDate >= cutoffDate;
    
    if (!isWithinWindow) {
      console.log(`Excluding data value for period ${period} (outside ${timeWindow} month window)`);
    }
    
    return isWithinWindow;
  });
  
  console.log(`Filtered to ${filteredDataValues.length} data values within ${timeWindow} months`);
  
  // Group by dataset if needed, and prepare for DHIS2 structure
  const dataSetGroups = {};
  filteredDataValues.forEach(dv => {
    // In a real scenario, you'd resolve this via a metadata mapping.
    // Here we'll use a placeholder or a default from config.
    const dataSetId = dv.dataSet || 'default';

    if (!dataSetGroups[dataSetId]) {
      dataSetGroups[dataSetId] = [];
    }

    // Clean up the data value for DHIS2 payload
    const cleanDataValue = {
      dataElement: dv.dataElement,
      orgUnit: dv.orgUnit,
      period: dv.period,
      value: dv.value,
    };

    // IMPORTANT: Category option combo resolution is required here.
    // DHIS2 needs a specific UID for the combination of category options.
    // This step is a placeholder to show where that logic would go.
    if (dv.categoryOptions) {
      // In a real implementation, you would look up the UID from DHIS2
      // based on the combination of options, e.g., { age: '25-49', gender: 'Female' }.
      // cleanDataValue.categoryOptionCombo = resolveCatOptCombo(dv.categoryOptions);
      console.warn(
        `Category options found for ${dv.dataElement} but combo resolution is not implemented.`,
        dv.categoryOptions
      );
    }
    
    if (dv.comment) {
      cleanDataValue.comment = dv.comment;
    }
    
    dataSetGroups[dataSetId].push(cleanDataValue);
  });
  
  // Create payload
  const payload = {
    dataValueSets: Object.entries(dataSetGroups).map(([dataSetId, dataValues]) => ({
      dataSet: dataSetId !== 'default' ? dataSetId : undefined,
      dataValues: dataValues,
      completeDate: new Date().toISOString(),
      // period and orgUnit are specified per data value, so no need to set them here
    })),
    metadata: {
      dataSource: 'SFTP Excel Import',
      generatedAt: new Date().toISOString(),
      totalDataValues: filteredDataValues.length,
      originalRecords: totalRecords,
      timeWindowMonths: timeWindow,
      processedFiles: processedFiles.map(f => ({
        fileName: f.fileName,
        type: f.excelData.type,
        recordCount: f.excelData.data.length,
        validation: f.excelData.validation
      }))
    }
  };
  
  console.log(`Generated DHIS2 payload with ${payload.dataValueSets.length} data value sets`);
  return payload;
}

// Main processing function
fn(state => {
  console.log('Starting DHIS2 payload generation...');
  
  // Check for processed Excel data
  if (!state.processedFiles || state.processedFiles.length === 0) {
    throw new Error('No processed Excel files found in state. Make sure process-excel-data job executed successfully.');
  }
  
  // Check for metadata
  if (!state.metadata) {
    console.warn('No metadata found in state. Data element and org unit mappings may not work correctly.');
    state.metadata = {};
  }
  
  console.log(`Processing ${state.processedFiles.length} Excel files for DHIS2 payload generation`);
  
  // Get time window from configuration or use default (3 months)
  const timeWindow = state.config?.updateTimeWindow || 3;
  
  // Generate the DHIS2 payload
  const payload = generatePayload(state.processedFiles, state.metadata, timeWindow);
  
  // Add processing summary
  const summary = {
    processedAt: new Date().toISOString(),
    filesProcessed: state.processedFiles.length,
    totalDataValues: payload.metadata.totalDataValues,
    dataValueSets: payload.dataValueSets.length,
    errors: state.processingErrors || []
  };
  
  console.log('Processing Summary:', JSON.stringify(summary, null, 2));
  
  // Validate payload before sending
  let hasValidationErrors = false;
  payload.dataValueSets.forEach((dvs, index) => {
    dvs.dataValues.forEach((dv, dvIndex) => {
      if (!dv.dataElement) {
        console.error(`Data value set ${index}, value ${dvIndex}: Missing dataElement`);
        hasValidationErrors = true;
      }
      if (!dv.orgUnit) {
        console.error(`Data value set ${index}, value ${dvIndex}: Missing orgUnit`);
        hasValidationErrors = true;
      }
      if (!dv.period) {
        console.error(`Data value set ${index}, value ${dvIndex}: Missing period`);
        hasValidationErrors = true;
      }
      if (dv.value === undefined || dv.value === null) {
        console.error(`Data value set ${index}, value ${dvIndex}: Missing value`);
        hasValidationErrors = true;
      }
    });
  });
  
  if (hasValidationErrors) {
    console.error('Payload validation errors detected. Review the logs above.');
  }
  
  console.log('Payload generation completed. Ready for DHIS2 upload.');
  
  return {
    ...state,
    payload: payload,
    dhis2Payload: payload, // For compatibility
    payloadGeneratedAt: new Date().toISOString(),
    summary: summary
  };
});
