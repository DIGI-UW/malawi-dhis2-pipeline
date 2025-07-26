// SFTP List Files Job - Working Around URI Issue
// This job fixes the SFTP URI issue without requiring a custom adaptor

list('/data/excel-files', null, state => {
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