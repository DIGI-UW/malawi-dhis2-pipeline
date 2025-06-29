import { list } from '@openfn/language-sftp';

// Debug SFTP connection
console.log('Starting SFTP connection test...');
console.log('Configuration:', JSON.stringify(state.configuration, null, 2));

// Try the simplest possible operation
list('/', (state) => {
  console.log('List operation completed!');
  console.log('Files found:', state.data);
  return state;
}); 