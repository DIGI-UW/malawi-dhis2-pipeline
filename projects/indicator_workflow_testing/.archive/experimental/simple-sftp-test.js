// Simple SFTP connection test
// Just try to connect and list files in the root directory

// OpenFN functions are available directly, no imports needed
list('/', (state) => {
  console.log('SFTP connection successful!');
  console.log('Files found:', state.data);
  return state;
}); 