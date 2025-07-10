/**
 * Download ART Excel file from SFTP using memory-efficient processing
 * Returns data structured for the process-excel-data job to handle
 */

fn((state) => {
  console.log('🔧 Starting ART Excel file download and processing...');
  
  // Download and process the ART Excel file
  const artFile = '/data/excel-files/ART_data_long_format.xlsx';
  
  console.log(`📄 Processing ART file: ${artFile}`);
  
  return executeManual(
    connect,
    getXLSX(artFile, {
      chunkSize: 500,           // Process in chunks for memory efficiency
      withHeader: true,         // First row contains headers
      ignoreEmpty: true         // Skip empty rows
    })
  )(state).then(state => {
    console.log('✅ ART Excel file processing completed successfully');
    
    // Structure data for process-excel-data job
    if (state.data) {
      console.log('📊 Excel processing summary:', {
        fileName: state.data.fileName,
        fileSize: state.data.fileSize,
        sheets: state.data.sheets,
        activeSheet: state.data.activeSheet,
        totalRows: state.data.totalRows,
        dataLength: state.data.data?.length || 0,
        processingMethod: state.data.metadata?.processingMethod
});

      // Show sample data
      if (state.data.data && state.data.data.length > 0) {
        console.log('📄 Sample data (first 2 rows):');
        state.data.data.slice(0, 2).forEach((row, index) => {
          console.log(`  Row ${index + 1}:`, JSON.stringify(row));
        });
        
        if (state.data.data.length > 2) {
          console.log(`  ... and ${state.data.data.length - 2} more rows`);
        }
      }

      // Structure data as array for process-excel-data job
      const downloadedFiles = [{
        name: artFile,
        status: 'downloaded',
        contentType: 'excel',
        rowCount: state.data.totalRows,
        content: state.data.data,  // Array of row objects
        metadata: {
          fileSize: state.data.fileSize,
          sheets: state.data.sheets,
          activeSheet: state.data.activeSheet,
          sheetRange: state.data.sheetRange,
          processingMethod: state.data.metadata?.processingMethod,
          processedAt: state.data.metadata?.processedAt
        }
      }];

      console.log(`📦 Prepared ${downloadedFiles.length} file(s) for processing`);
    
    return {
      ...state,
        downloadedFiles,
      downloadCompleted: true,
      success: true
    };
    } else {
      console.log('⚠️  No data received from Excel processing');
      return {
        ...state,
        downloadedFiles: [],
        downloadCompleted: true,
        error: 'No data received from Excel processing',
        success: false
      };
    }
  }).catch(error => {
    console.error('❌ ART Excel file processing failed:', error.message);
    return {
      ...state,
      downloadedFiles: [],
      downloadCompleted: true,
      error: error.message,
      success: false
    };
  });
});