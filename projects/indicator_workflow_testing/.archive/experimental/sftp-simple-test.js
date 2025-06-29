/**
 * Simple SFTP Connection Test
 * Tests basic SFTP connectivity and file listing
 */

import { list } from '@openfn/language-sftp';

// Test SFTP connection by listing root directory
list('/', (state) => {
  console.log('✅ SFTP Connection successful!');
  console.log(`Found ${state.data.length} items in root directory`);
  
  state.data.forEach(item => {
    console.log(`- ${item.type}: ${item.name}`);
  });
  
  return {
    ...state,
    testResult: 'success',
    itemCount: state.data.length
  };
}); 