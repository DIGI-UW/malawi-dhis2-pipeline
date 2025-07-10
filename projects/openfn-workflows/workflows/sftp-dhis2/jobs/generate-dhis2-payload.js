/**
 * Generate DHIS2 payload from processed Excel data
 * This job transforms Excel indicator data into DHIS2 dataValueSets format
 * 
 * OpenFn Design Principles:
 * - Single responsibility: Transform Excel data to DHIS2 format
 * - Configuration-driven: Use embedded mappings
 * - Error handling: Validate payload structure
 * - State immutability: Return new state objects
 */

// Configuration for ART data mapping
const CONFIG = {
  dataSet: 'necyFYLlEI0', // Default dataset ID
  orgUnit: 'drsiURo4DeK', // Default org unit ID
  period: '202501', // Default period (YYYYMM format)
  categoryOptionCombo: 'HllvX50cXC0', // Default category option combo
  attributeOptionCombo: 'HllvX50cXC0', // Default attribute option combo
  dataElementMapping: {
    // Map Excel column names to DHIS2 data element IDs
    'ART_Patients_Total': 'IQTe97w6j5I',
    'ART_Patients_Male': 'b31fxPyPHdZ', 
    'ART_Patients_Female': 'XMQfwO0ODSr',
    'ART_Patients_New': 'Yz7m8AH66in',
    'ART_Patients_Existing': 'Ius3vNNYVKm'
  }
};

function generateDataValueSet(processedFiles, config) {
  console.log('📊 Generating DHIS2 dataValueSet from processed Excel files...');
  
  const dataValues = [];
  let totalRecords = 0;
  
  processedFiles.forEach(file => {
    console.log(`📁 Processing file: ${file.fileName}`);
    
    if (!file.excelData || !file.excelData.data) {
      console.warn(`⚠️  Skipping file ${file.fileName} - no data found`);
      return;
    }
    
    file.excelData.data.forEach((row, index) => {
      // Map each row to DHIS2 data values
      Object.entries(row).forEach(([columnName, value]) => {
        const dataElementId = config.dataElementMapping[columnName];
        
        if (dataElementId && value !== null && value !== undefined && value !== '') {
      const dataValue = {
            dataElement: dataElementId,
            period: row.period || config.period,
            orgUnit: row.orgUnit || config.orgUnit,
            value: value.toString(),
            categoryOptionCombo: config.categoryOptionCombo,
            attributeOptionCombo: config.attributeOptionCombo
          };
          
          // Add comment if available
      if (row.comment) {
        dataValue.comment = row.comment;
      }
      
          dataValues.push(dataValue);
      totalRecords++;
        }
      });
    });
  });
  
  console.log(`📊 Generated ${dataValues.length} data values from ${totalRecords} records`);
  
  // Create the dataValueSet following DHIS2 API format
  const dataValueSet = {
    dataSet: config.dataSet,
    period: config.period,
    orgUnit: config.orgUnit,
      completeDate: new Date().toISOString(),
    dataValues: dataValues
  };
  
  return dataValueSet;
}

fn(state => {
  console.log('🚀 Starting DHIS2 payload generation...');
  
  if (!state.processedFiles || state.processedFiles.length === 0) {
    console.error('❌ No processed Excel files found in state. Stopping workflow.');
    return {
      ...state,
      workflowComplete: true,
      error: 'No processed Excel files found. Ensure the process-excel-data job executed successfully.'
    };
  }
  
  console.log(`📁 Found ${state.processedFiles.length} processed files`);
  
  try {
  // Generate the DHIS2 payload
    const dataValueSet = generateDataValueSet(state.processedFiles, CONFIG);
  
    // Validate the payload
    if (!dataValueSet.dataValues || dataValueSet.dataValues.length === 0) {
      console.error('❌ No data values generated. Stopping workflow.');
      return {
        ...state,
        workflowComplete: true,
        error: 'No data values could be generated from the processed files.'
      };
    }
    
    // Add metadata for tracking
    const payload = {
      ...dataValueSet,
      attribution: {
        source: 'SFTP Excel Import',
        workflow: 'HIV-Indicators-SFTP-to-DHIS2-Workflow',
        timestamp: new Date().toISOString(),
        processedFiles: state.processedFiles.map(f => f.fileName),
        totalDataValues: dataValueSet.dataValues.length
      }
    };
    
    console.log('✅ DHIS2 payload generated successfully');
    console.log(`📊 Dataset: ${payload.dataSet}`);
    console.log(`📊 Period: ${payload.period}`);
    console.log(`📊 Org Unit: ${payload.orgUnit}`);
    console.log(`📊 Data Values: ${payload.dataValues.length}`);
  
  return {
    ...state,
    payload: payload,
    dhis2Payload: payload, // For compatibility
      payloadGeneratedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Error generating DHIS2 payload:', error.message);
    return {
      ...state,
      workflowComplete: true,
      error: `Failed to generate DHIS2 payload: ${error.message}`
    };
  }
});
