import { list } from '@openfn/language-sftp';

list('/', (state) => {
  console.log('SFTP connection successful! Files:', state.data);
  return state;
}); 