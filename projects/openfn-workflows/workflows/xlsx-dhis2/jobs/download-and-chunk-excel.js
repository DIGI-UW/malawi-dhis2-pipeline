/**
 * Downloads an Excel file from SFTP and prepares chunk metadata for processing.
 * This job reads the total number of rows and creates metadata for each chunk,
 * allowing subsequent jobs to process the file in a memory-efficient way.
 */
fn(async state => {
  console.log('Starting Excel file download and chunking...');
  
  const { newFiles, chunkSize = 5000 } = state;
  let allChunks = [];

  for (const file of newFiles) {
    console.log(`  - Processing file: ${file.name}`);
    
    // Download the file to get the row count for chunking.
    const { data } = await getXLSX(file.path, { withHeader: true })(state);
    const excelData = data && data.data ? data.data : [];

    if (excelData.length === 0) {
      console.warn(`  - Warning: No data found in file: ${file.name}.`);
      continue;
    }

    const totalRows = excelData.length;
    const totalChunks = Math.ceil(totalRows / chunkSize);
    console.log(`  - ${totalRows} rows found, preparing ${totalChunks} chunks.`);

    // Create metadata for each chunk without loading the data into state.
    const fileChunks = Array.from({ length: totalChunks }, (_, i) => {
      const startRow = i * chunkSize;
      const endRow = Math.min(startRow + chunkSize - 1, totalRows - 1);
      return {
        chunkId: `${file.name}_chunk_${i}`,
        fileName: file.name,
        filePath: file.path,
        startRow,
        endRow,
        rowCount: endRow - startRow + 1,
      };
    });
    
    allChunks = allChunks.concat(fileChunks);
  }

  if (allChunks.length === 0) {
    console.log('No chunks were created. Stopping workflow.');
    return { ...state, workflowComplete: true };
  }

  console.log(`Created a total of ${allChunks.length} chunks for processing.`);
  
  // Return the chunks to be processed in the next job.
  return { ...state, chunks: allChunks };
}); 