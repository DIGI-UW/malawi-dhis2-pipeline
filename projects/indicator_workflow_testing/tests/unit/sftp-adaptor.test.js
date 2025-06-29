const { expect } = require('chai');
const { execute, list } = require('@openfn/language-sftp');

describe('SFTP Adaptor Unit Tests', () => {
  describe('list() function', () => {
    it('should create a valid operation', () => {
      const operation = list('/test/path');
      expect(operation).to.be.a('function');
    });

    it('should handle state correctly', () => {
      const state = {
        configuration: {
          host: 'test-host',
          port: 22,
          username: 'test-user',
          password: 'test-pass'
        },
        data: null
      };

      // Test that the operation returns a function
      const operation = list('/');
      expect(operation).to.be.a('function');
      
      // In real tests, you'd mock the SFTP connection
      // For now, just verify the operation structure
    });
  });
}); 