// SFTP List Files Job - Working Around URI Issue
// This job fixes the SFTP URI issue without requiring a custom adaptor

fn(state => {
  console.log('🔧 Starting SFTP List Files with URI fix...');
  
  // Fix the URI issue by stripping prefixes from host in credentials
  const fixedCredentials = {
    ...state.configuration,
    host: state.configuration.host.replace(/^(sftp|ftp):\/\//, ''),
    port: state.configuration.port || 22,
  };
  
  console.log(`📡 Original host: ${state.configuration.host}`);
  console.log(`🔧 Fixed host: ${fixedCredentials.host}`);
  console.log(`🔌 Port: ${fixedCredentials.port}`);
  
  // Update state with fixed credentials for this execution
  return {
    ...state,
    configuration: fixedCredentials
  };
});

list('/data/excel-files', state => {
  console.log(`📁 Found ${state.data?.length || 0} files`);
  
  if (state.data && state.data.length > 0) {
    console.log('📄 Files found:');
    state.data.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name} (${file.size} bytes, ${file.modifyTime})`);
    });
  } else {
    console.log('📭 No files found in /data/excel-files directory');
  }
  
  return state;
}); 