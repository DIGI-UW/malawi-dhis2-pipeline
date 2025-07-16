/**
 * Upload processed data to DHIS2
 * This job sends the generated dataValueSets payload to DHIS2 via the Web API
 * 
 * OpenFn Design Principles:
 * - Single responsibility: Upload data to DHIS2
 * - Error handling: Graceful failure with clear messages
 * - State immutability: Return new state objects
 * - Logging: Comprehensive upload tracking
 */

fn(state => {
  console.log('🚀 Starting DHIS2 upload for SFTP-processed data...');
  
  if (!state.payload) {
    console.error('❌ No payload found in state. Stopping workflow.');
    return {
      ...state,
      workflowComplete: true,
      error: 'No payload found in state. Ensure the generate-dhis2-payload job executed successfully.'
    };
  }
  
  console.log('📦 Preparing payload for DHIS2 upload...');
  console.log(`📊 Dataset: ${state.payload.dataSet}`);
  console.log(`📊 Period: ${state.payload.period}`);
  console.log(`📊 Org Unit: ${state.payload.orgUnit}`);
  console.log(`📊 Data Values: ${state.payload.dataValues?.length || 0}`);
  
  // Log sample data values for verification
  if (state.payload.dataValues && state.payload.dataValues.length > 0) {
    console.log('📋 Sample data values:', state.payload.dataValues.slice(0, 2));
  }
  
  return state;
});

// Upload to DHIS2 using the simple pattern from OpenFn examples
create("dataValueSets", (state) => {
  console.log('📤 Sending payload to DHIS2...');
  
  // Return the payload directly - DHIS2 adaptor will handle the rest
  return state.payload;
});
