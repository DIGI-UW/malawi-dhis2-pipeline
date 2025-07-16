// SFTP Test Job using Custom Adaptor with Manual Connection Control
// This job demonstrates the enhanced logging and manual connection features

executeManual(
  // Step 1: Connect to SFTP server (with enhanced logging and URI handling)
  connect,
  
  // Step 2: List files in the excel-files directory
  fn(state => {
    console.log('🎯 JOB: Starting file listing operation...');
    console.log('🔍 JOB: Target directory: /data/excel-files');
    return state;
  }),
  
  list('/data/excel-files'),
  
  // Step 3: Process the results
  fn(state => {
    console.log('📊 JOB: Processing file listing results...');
    
    if (state.data && Array.isArray(state.data)) {
      const fileCount = state.data.length;
      console.log(`🎉 JOB: Successfully found ${fileCount} items in directory`);
      
      if (fileCount > 0) {
        // Categorize files
        const files = state.data.filter(item => item.type !== 'd');
        const dirs = state.data.filter(item => item.type === 'd');
        
        console.log(`📄 JOB: Files: ${files.length}, Directories: ${dirs.length}`);
        
        // Show details for first few files
        if (files.length > 0) {
          console.log('📋 JOB: Sample files:');
          files.slice(0, 5).forEach((file, index) => {
            const size = file.size ? ` (${(file.size / 1024).toFixed(1)}KB)` : '';
            const modified = file.modifyTime ? new Date(file.modifyTime).toISOString() : 'unknown';
            console.log(`  ${index + 1}. ${file.name}${size} - modified: ${modified}`);
          });
          
          if (files.length > 5) {
            console.log(`  ... and ${files.length - 5} more files`);
          }
        }
        
        // Store summary in state for potential further processing
        state.fileSummary = {
          totalItems: fileCount,
          fileCount: files.length,
          dirCount: dirs.length,
          sampleFiles: files.slice(0, 5).map(f => ({
            name: f.name,
            size: f.size,
            modified: f.modifyTime
          }))
        };
        
        console.log('✅ JOB: File summary stored in state.fileSummary');
      } else {
        console.log('📭 JOB: Directory is empty');
        state.fileSummary = { totalItems: 0, fileCount: 0, dirCount: 0, sampleFiles: [] };
      }
    } else {
      console.warn('⚠️  JOB: Unexpected data format received');
      console.warn('⚠️  JOB: Expected array, got:', typeof state.data);
    }
    
    return state;
  }),
  
  // Step 4: Disconnect from SFTP server
  fn(state => {
    console.log('🔌 JOB: Preparing to disconnect...');
    return state;
  }),
  
  disconnect,
  
  // Step 5: Final job summary
  fn(state => {
    console.log('🎉 JOB: SFTP operation completed successfully!');
    if (state.fileSummary) {
      console.log('📈 JOB: Final Summary:');
      console.log(`   - Total items: ${state.fileSummary.totalItems}`);
      console.log(`   - Files: ${state.fileSummary.fileCount}`);
      console.log(`   - Directories: ${state.fileSummary.dirCount}`);
    }
    console.log('✅ JOB: Job execution finished');
    return state;
  })
);