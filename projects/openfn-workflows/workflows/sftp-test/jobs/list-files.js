// Simple SFTP file listing job - uses platform credentials
// Username/password from credential, host/port from state config or defaults

// Initialize configuration with defaults if not provided
fn(state => {
  // Merge any provided configuration with defaults
  state.configuration = {
    host: "172.17.0.1",
    port: 2225,
    remoteDir: "/data/excel-files",
    ...state.configuration
  };
  
  console.log('=== SFTP Connection Test ===');
  console.log('Initializing with configuration:', {
    host: state.configuration.host,
    port: state.configuration.port,
    remoteDir: state.configuration.remoteDir
  });
  
  return state;
});

// List files from SFTP
list('/data/excel-files', state => {
  console.log('Connected to SFTP successfully!');
  console.log(`Host: ${state.configuration.host}:${state.configuration.port}`);
  console.log(`Remote Directory: ${state.configuration.remoteDir}`);
  console.log('');
  
  console.log(`Files found: ${state.data.length}`);
  console.log('========================');
  
  // List all files with details
  state.data.forEach((file, index) => {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log(`${index + 1}. ${file.name}`);
    console.log(`   Type: ${file.type}`);
    console.log(`   Size: ${sizeInMB} MB (${file.size} bytes)`);
    console.log(`   Modified: ${file.modifiedTime}`);
    console.log('');
  });
  
  // Filter for Excel files only
  const excelFiles = state.data.filter(file => 
    file.name.toLowerCase().endsWith('.xlsx') || 
    file.name.toLowerCase().endsWith('.xls')
  );
  
  console.log(`Excel files found: ${excelFiles.length}`);
  if (excelFiles.length > 0) {
    console.log('Excel files:');
    excelFiles.forEach(file => {
      console.log(`  - ${file.name}`);
    });
  }
  
  // Return enhanced state with results
  return {
    ...state,
    results: {
      success: true,
      timestamp: new Date().toISOString(),
      totalFiles: state.data.length,
      excelFiles: excelFiles.length,
      files: state.data.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
        modifiedTime: f.modifiedTime
      })),
      excelFilesList: excelFiles.map(f => f.name)
    }
  };
}); 