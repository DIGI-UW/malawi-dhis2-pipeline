/**
 * Test job for XLSX download functionality
 * This job tests the new getXLSX function with a sample Excel file
 */

fn((state) => {
  console.log('🧪 Starting XLSX download test...');
  
  // Test configuration
  const testFile = '/test-data/sample.xlsx'; // Adjust path as needed
  
  return {
    ...state,
    testFile,
    testStartTime: new Date().toISOString()
  };
});

fn((state) => {
  console.log(`📊 Testing getXLSX with file: ${state.testFile}`);
  
  try {
    // Test basic XLSX download with default options
    const result = getXLSX(state.testFile);
    
    console.log('✅ Basic XLSX download test completed');
    console.log('📊 Result data type:', typeof result.data);
    
    if (Array.isArray(result.data)) {
      console.log('📊 Number of rows:', result.data.length);
      if (result.data.length > 0) {
        console.log('📊 Sample row:', result.data[0]);
        console.log('📊 Available columns:', Object.keys(result.data[0]));
      }
    }
    
    return {
      ...state,
      testResult: result.data,
      testStatus: 'success',
      testEndTime: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ XLSX download test failed:', error.message);
    
    return {
      ...state,
      testError: error.message,
      testStatus: 'failed',
      testEndTime: new Date().toISOString()
    };
  }
});

fn((state) => {
  console.log(`🧪 Testing getXLSX with custom options...`);
  
  try {
    // Test XLSX download with custom options
    const customResult = getXLSX(state.testFile, {
      sheetName: 'Sheet1',  // Specify sheet name
      headerRow: 1,         // Use first row as headers
      raw: false,           // Parse as structured data
      range: null           // Read entire sheet
    });
    
    console.log('✅ Custom XLSX download test completed');
    console.log('📊 Custom result data type:', typeof customResult.data);
    
    if (Array.isArray(customResult.data)) {
      console.log('📊 Custom result rows:', customResult.data.length);
    }
    
    return {
      ...state,
      customTestResult: customResult.data,
      customTestStatus: 'success'
    };
    
  } catch (error) {
    console.error('❌ Custom XLSX download test failed:', error.message);
    
    return {
      ...state,
      customTestError: error.message,
      customTestStatus: 'failed'
    };
  }
});

fn((state) => {
  console.log('🧪 XLSX download test summary:');
  console.log(`   Basic test: ${state.testStatus}`);
  console.log(`   Custom test: ${state.customTestStatus}`);
  
  if (state.testStatus === 'success') {
    console.log('✅ All XLSX tests passed!');
  } else {
    console.log('❌ Some XLSX tests failed');
  }
  
  return state;
}); 