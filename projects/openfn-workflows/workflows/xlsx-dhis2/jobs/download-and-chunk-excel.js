/**
 * Download and Process Excel File - One Chunk at a Time
 * 
 * This job downloads and processes ONE chunk from Excel files using streaming approach.
 * It reads only the current chunk (not the entire file) and sets up state for the next chunk.
 * 
 * OpenFN Best Practice:
 * - Simple job with clear scope
 * - Reads only current chunk from file 
 * - Communicates through state
 * - Uses workflow edges for looping
 */

fn((state) => {
  console.log('📊 Starting Excel chunk download and processing...');
  
  // Check if we have files to process (first run) or if we're continuing with chunks
  if (!state.fileInfo && (!state.newFiles || state.newFiles.length === 0)) {
    console.log('⚠️  No files found to process. Workflow will exit.');
    return {
      ...state,
      workflowComplete: true,
      reason: 'No files found for processing',
      continueProcessing: false
    };
  }
  
  // Configuration for chunk processing
  const CHUNK_SIZE = 5000;
  const TARGET_FILE_PATTERN = /ART.*\.xlsx$/i;
  
  // Initialize or get file info
  let fileInfo = state.fileInfo;
  let currentChunkIndex = state.currentChunkIndex || 0;
  
  // First run - select file to process
  if (!fileInfo) {
    console.log('🔍 First run - selecting file to process...');
    
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
      console.log('⚠️  No Excel files found matching processing criteria.');
      return {
        ...state,
        workflowComplete: true,
        reason: 'No Excel files found for processing',
        continueProcessing: false
      };
    }
    
    // Use first matching file
    fileInfo = filesToProcess[0];
    console.log(`📁 Selected file: ${fileInfo.name} (${(fileInfo.size / 1024 / 1024).toFixed(2)}MB)`);
  }
  
  console.log(`📦 Processing chunk ${currentChunkIndex + 1} from file: ${fileInfo.name}`);
  
  return {
    ...state,
    fileInfo: fileInfo,
    currentChunkIndex: currentChunkIndex,
    chunkSize: CHUNK_SIZE
  };
});

// Read current chunk from Excel file
fn(async (state) => {
  console.log(`📥 Reading chunk ${state.currentChunkIndex + 1} from Excel file...`);
  
  const skipRows = state.currentChunkIndex * state.chunkSize;
  const nrows = state.chunkSize;
  
  console.log(`📊 Chunk parameters:`);
  console.log(`   File: ${state.fileInfo.name}`);
  console.log(`   Skip rows: ${skipRows}`);
  console.log(`   Read rows: ${nrows}`);
  console.log(`   Chunk index: ${state.currentChunkIndex}`);
  
  try {
    // Read ONLY the current chunk from the file
    const xlsxFunction = getXLSX(state.fileInfo.path, {
      withHeader: state.currentChunkIndex === 0, // Only include headers on first chunk
      ignoreEmpty: true,
      skipRows: skipRows,
      nrows: nrows
    });
    
    if (!xlsxFunction || typeof xlsxFunction !== 'function') {
      throw new Error(`Failed to create Excel processor for chunk ${state.currentChunkIndex + 1}`);
    }
    
    const chunkResult = await xlsxFunction(state);
    
    // Extract the chunk data
    const chunkData = chunkResult.data && chunkResult.data.data ? chunkResult.data.data : [];
    
    if (!Array.isArray(chunkData)) {
      throw new Error(`Invalid chunk data format for chunk ${state.currentChunkIndex + 1}`);
    }
    
    console.log(`✅ Successfully read chunk ${state.currentChunkIndex + 1}:`);
    console.log(`   Rows read: ${chunkData.length}`);
    console.log(`   Data size: ${JSON.stringify(chunkData).length} bytes`);
    
    // If no data read, we've reached the end
    if (chunkData.length === 0) {
      console.log('🏁 Reached end of file - all chunks processed');
      return {
        ...state,
        allChunksProcessed: true,
        continueProcessing: false,
        chunks: [],
        totalChunksProcessed: state.currentChunkIndex
      };
    }
    
    // Create chunk metadata
    const chunkMetadata = {
      chunkId: `${state.fileInfo.name}_chunk_${state.currentChunkIndex}`,
      chunkIndex: state.currentChunkIndex,
      fileName: state.fileInfo.name,
      filePath: state.fileInfo.path,
      startRow: skipRows,
      endRow: skipRows + chunkData.length - 1,
      rowCount: chunkData.length,
      data: chunkData,
      dataSize: JSON.stringify(chunkData).length,
      createdAt: new Date().toISOString()
    };
    
    // Determine if we should continue processing
    const shouldContinue = chunkData.length === state.chunkSize; // If we got a full chunk, there might be more
    
    console.log(`📊 Chunk processing status:`);
    console.log(`   Current chunk: ${state.currentChunkIndex + 1}`);
    console.log(`   Rows in chunk: ${chunkData.length}`);
    console.log(`   Continue processing: ${shouldContinue}`);
    
    return {
      ...state,
      chunks: [chunkMetadata], // Single chunk for processing
      totalChunks: 1,
      currentChunkIndex: state.currentChunkIndex,
      nextChunkIndex: state.currentChunkIndex + 1,
      continueProcessing: shouldContinue,
      allChunksProcessed: !shouldContinue,
      chunkingComplete: true
    };
    
  } catch (error) {
    console.error(`❌ Error reading chunk ${state.currentChunkIndex + 1}:`, error.message);
    
    return {
      ...state,
      error: error.message,
      continueProcessing: false,
      allChunksProcessed: true,
      chunks: [],
      totalChunks: 0
    };
  }
}); 