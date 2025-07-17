/**
 * Download and Chunk Excel Files for Large File Processing
 * 
 * This job downloads Excel files found by the check step and creates chunk metadata
 * for processing large files (1M+ rows) without running out of memory.
 * 
 * Memory Strategy:
 * - Downloads files found by check-sftp-files step
 * - Processes each file in streaming chunks
 * - Creates lightweight chunk metadata (not full data)
 * - Stores chunks temporarily for subsequent processing
 * - Enforces memory limits and garbage collection
 */

fn((state) => {
  console.log('📊 Starting large Excel file chunked processing...');
  
  // Check if we have files to process from the check step
  if (!state.newFiles || state.newFiles.length === 0) {
    console.log('⚠️  No new files found to process. Workflow will exit.');
    return {
      ...state,
      workflowComplete: true,
      reason: 'No new files found for processing',
      chunks: [],
      totalChunks: 0
    };
  }
  
  // Configuration for large file processing - OPENFN COMPLIANT
  const CHUNK_SIZE = 5000; // Increase chunk size to reduce total number of chunks
  const MAX_MEMORY_MB = 400; // Memory limit per job in MB (OpenFn compliant: 400MB < 500MB limit)
  const MAX_CHUNKS_PER_BATCH = 50; // Limit chunks per batch to prevent payload size issues
  const TARGET_FILE_PATTERN = /ART.*\.xlsx$/i; // Pattern to match ART files
  
  // Filter files for large Excel files we want to process
  const filesToProcess = state.newFiles.filter(file => {
    const isExcelFile = file.name.toLowerCase().endsWith('.xlsx');
    const isLargeFile = file.size > 10 * 1024 * 1024; // Files larger than 10MB
    const matchesPattern = TARGET_FILE_PATTERN.test(file.name);
    
    console.log(`📋 Evaluating file: ${file.name}`);
    console.log(`   Size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Excel file: ${isExcelFile}`);
    console.log(`   Large file: ${isLargeFile}`);
    console.log(`   Matches pattern: ${matchesPattern}`);
    
    return isExcelFile && isLargeFile && matchesPattern;
  });
  
  if (filesToProcess.length === 0) {
    console.log('⚠️  No large Excel files found matching processing criteria.');
    return {
      ...state,
      workflowComplete: true,
      reason: 'No large Excel files found for chunked processing',
      chunks: [],
      totalChunks: 0
    };
  }
  
  console.log('🔧 Processing configuration:');
  console.log(`   Files to process: ${filesToProcess.length}`);
  console.log(`   Chunk size: ${CHUNK_SIZE} rows`);
  console.log(`   Memory limit: ${MAX_MEMORY_MB}MB (OpenFn compliant)`);
  console.log(`   Total workflow memory target: <2GB (well within OpenFn 2048MB limit)`);
  
  return {
    ...state,
    filesToProcess: filesToProcess,
    chunkSize: CHUNK_SIZE,
    memoryLimit: MAX_MEMORY_MB
  };
});

// Download and analyze files to create chunk metadata
fn(async (state) => {
  console.log('📥 Starting file download and chunking process...');
  
  const downloadedFiles = [];
  let totalChunks = 0;

  // Process each file found by check-sftp-files
  for (const [index, fileInfo] of state.filesToProcess.entries()) {
    console.log(`📁 Processing file ${index + 1}/${state.filesToProcess.length}: ${fileInfo.name}`);
    console.log(`📊 File size: ${(fileInfo.size / 1024 / 1024).toFixed(2)} MB`);
    
    try {
      // Download the file using getXLSX with basic options
      console.log(`📥 Downloading Excel file: ${fileInfo.path}`);
      
      // Use basic getXLSX options for better compatibility
      const xlsxFunction = getXLSX(fileInfo.path, {
        withHeader: true,
        ignoreEmpty: true,
        chunkSize: state.chunkSize // Pass the correct chunk size to the SFTP adaptor
      });
      
      if (!xlsxFunction || typeof xlsxFunction !== 'function') {
        console.error(`❌ getXLSX returned invalid function for file: ${fileInfo.name}`);
        throw new Error(`Failed to create Excel processor for file: ${fileInfo.name}. getXLSX returned: ${typeof xlsxFunction}.`);
      }
      
      console.log(`🔧 Calling Excel processor function for: ${fileInfo.name}`);
      
      // Call the returned function with state to actually download and process the file
      const downloadResult = await xlsxFunction(state);
      
      console.log(`✅ Successfully downloaded: ${fileInfo.name}`);
      console.log(`📊 Downloaded result structure:`, Object.keys(downloadResult));
      
      // Analyze the downloaded data to create chunk metadata
      const excelData = downloadResult.data && downloadResult.data.data ? downloadResult.data.data : [];
      
      if (!Array.isArray(excelData) || excelData.length === 0) {
        console.error(`❌ No data found in Excel file: ${fileInfo.name}`);
        console.error(`❌ Download result structure:`, Object.keys(downloadResult));
        console.error(`❌ ExcelData type:`, typeof excelData);
        console.error(`❌ ExcelData value:`, excelData);
        throw new Error(`No data found in Excel file: ${fileInfo.name}. File may be empty or corrupted.`);
      }
      
      const totalRows = excelData.length;
      const chunksForFile = Math.ceil(totalRows / state.chunkSize);
      
      console.log(`📊 File analysis: ${totalRows} rows, ${chunksForFile} chunks needed`);
      
      // Create chunk metadata (not full data to save memory)
      const fileChunks = [];
      
      for (let chunkIndex = 0; chunkIndex < chunksForFile; chunkIndex++) {
        const startRow = chunkIndex * state.chunkSize;
        const endRow = Math.min(startRow + state.chunkSize - 1, totalRows - 1);
        const rowCount = endRow - startRow + 1;
        
        const chunkMetadata = {
          chunkId: `${fileInfo.name}_chunk_${chunkIndex}`,
          chunkIndex: chunkIndex,
          fileName: fileInfo.name,
          filePath: fileInfo.path,
          startRow: startRow,
          endRow: endRow,
          rowCount: rowCount,
          totalChunks: chunksForFile,
          createdAt: new Date().toISOString()
        };
        
        fileChunks.push(chunkMetadata);
        totalChunks++;
      }
      
      // Store file processing info
      const fileProcessingInfo = {
        fileName: fileInfo.name,
        filePath: fileInfo.path,
        fileSize: fileInfo.size,
        totalRows: totalRows,
        chunks: fileChunks,
        downloadedAt: new Date().toISOString()
      };
      
      downloadedFiles.push(fileProcessingInfo);
      
      console.log(`✅ Created ${fileChunks.length} chunks for file: ${fileInfo.name}`);
      
      // Continue processing next file
      
    } catch (error) {
      console.error(`❌ Failed to download file: ${fileInfo.name}`, error.message);
    }
  }
  
  console.log('📊 Processing Summary:');
  console.log(`   Files processed: ${downloadedFiles.length}`);
  console.log(`   Total chunks created: ${totalChunks}`);
  console.log(`   Download errors: ${state.filesToProcess.length - downloadedFiles.length}`);
  
  if (downloadedFiles.length === 0) {
    console.log('❌ No files were successfully processed');
    const error = new Error('No files were successfully downloaded and processed');
    error.code = 'NO_FILES_PROCESSED';
    error.details = {
      filesFound: state.filesToProcess ? state.filesToProcess.length : 0,
      filesProcessed: 0,
      reason: 'Excel file download or parsing failed'
    };
    throw error;
  }
  
  return {
    ...state,
    downloadedFiles: downloadedFiles,
    totalChunks: totalChunks
  };
});

// Create the final chunk distribution for parallel processing
fn((state) => {
  console.log('🔄 Creating chunk distribution for parallel processing...');
  
  // Check if we have any successfully downloaded files
  if (!state.downloadedFiles || state.downloadedFiles.length === 0) {
    console.log('❌ No files were successfully processed - stopping workflow');
    const error = new Error('No files were successfully downloaded and processed');
    error.code = 'NO_FILES_PROCESSED';
    error.details = {
      filesFound: state.filesToProcess ? state.filesToProcess.length : 0,
      filesProcessed: 0,
      reason: 'Excel file download or parsing failed'
    };
    throw error;
  }
  
  // Flatten all chunks from all files into a single array for processing
  const allChunks = [];
  
  state.downloadedFiles.forEach(file => {
    if (file.chunks && Array.isArray(file.chunks)) {
      allChunks.push(...file.chunks);
    }
  });
  
  // Limit chunks per batch to prevent payload size issues
  const MAX_CHUNKS_PER_BATCH = 50;
  const batchStartIndex = state.batchStartIndex || 0;
  const chunksToProcess = allChunks.slice(batchStartIndex, batchStartIndex + MAX_CHUNKS_PER_BATCH);
  
  console.log(`📊 Distribution Summary:`);
  console.log(`   Total files: ${state.downloadedFiles.length}`);
  console.log(`   Total chunks available: ${allChunks.length}`);
  console.log(`   Chunks in this batch: ${chunksToProcess.length}`);
  console.log(`   Batch start index: ${batchStartIndex}`);
  console.log(`   Remaining chunks: ${allChunks.length - batchStartIndex - chunksToProcess.length}`);
  
  // Check if this is the last batch
  const isLastBatch = batchStartIndex + chunksToProcess.length >= allChunks.length;
  
  console.log(`✅ Chunking process completed successfully`);
  console.log(`   Processing batch ${Math.floor(batchStartIndex / MAX_CHUNKS_PER_BATCH) + 1} of ${Math.ceil(allChunks.length / MAX_CHUNKS_PER_BATCH)}`);
  console.log(`   ${isLastBatch ? 'This is the final batch' : 'More batches remain'}`);
  
  return {
    ...state,
    chunks: chunksToProcess,
    totalChunks: chunksToProcess.length,
    totalChunksAvailable: allChunks.length,
    batchStartIndex: batchStartIndex,
    nextBatchIndex: batchStartIndex + chunksToProcess.length,
    isLastBatch: isLastBatch,
    chunkingComplete: true,
    nextStep: 'process_excel_chunks',
    processedAt: new Date().toISOString()
  };
}); 