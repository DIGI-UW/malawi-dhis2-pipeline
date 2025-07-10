/**
 * Download files from SFTP using the working executeManual pattern
 * This job follows the proven pattern that works with our custom SFTP adaptor
 */

fn((state) => {
  console.log('🔧 Starting SFTP file download...');
  
  // For now, let's download a single test file to establish the working pattern
  const testFile = '/data/excel-files/ART_data_long_format.xlsx';
  
  console.log(`📄 Downloading test file: ${testFile}`);
  
  return executeManual(
    connect,
    getExcelFile(testFile)
  )(state).then(state => {
    console.log('✅ File download completed successfully');
    
    // Smart logging for large data objects
    if (state.data) {
      console.log('📊 File data summary:', {
        filePath: state.data.filePath,
        size: state.data.size,
        timestamp: state.data.timestamp,
        hasContent: !!state.data.content,
        contentLength: state.data.content?.length || 0
});

      // Show content preview if it exists
      if (state.data.content) {
        const contentPreview = state.data.content.toString().substring(0, 100);
        console.log('📄 Content preview:', contentPreview + (state.data.content.length > 100 ? '...' : ''));
      }
    } else {
      console.log('⚠️  No data received from download');
    }
    
    return {
      ...state,
      downloadCompleted: true,
      downloadedFile: state.data,
      success: true
    };
  }).catch(error => {
    console.error('❌ File download failed:', error.message);
    return {
      ...state,
      downloadCompleted: true,
      error: error.message,
      success: false
    };
  });
});