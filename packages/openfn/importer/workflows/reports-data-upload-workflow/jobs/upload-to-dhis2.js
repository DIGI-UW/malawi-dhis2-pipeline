// Upload processed data to DHIS2
// This job sends the generated dataValueSets payload to DHIS2 via the Web API

fn(state => {
  console.log('Starting DHIS2 upload...');
  
  if (!state.payload) {
    throw new Error('No payload found in state. Ensure the generate-dhis2-payload job executed successfully.');
  }
  
  console.log('Uploading payload to DHIS2:', JSON.stringify(state.payload, null, 2));
  console.log('Number of data values to upload:', state.payload.dataValues.length);
  
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
      source: "Google Sheets via OpenFn",
      workflow: "HIV-Indicators-GoogleSheets-to-DHIS2-Workflow",
      timestamp: new Date().toISOString()
    }
  };
  
  console.log('Sending enhanced payload to DHIS2...');
  return enhancedPayload;
});

fn(state => {
  console.log('DHIS2 upload completed successfully!');
  console.log('Response from DHIS2:', JSON.stringify(state.data, null, 2));
  
  // Log summary
  const response = state.data;
  if (response && response.summary) {
    console.log('Upload Summary:', {
      imported: response.summary.imported || 0,
      updated: response.summary.updated || 0,
      ignored: response.summary.ignored || 0,
      deleted: response.summary.deleted || 0
    });
  }
  
  return state;
});