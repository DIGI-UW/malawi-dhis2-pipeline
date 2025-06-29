#!/usr/bin/env node

// Debug wrapper for OpenFN SFTP testing
// This script modifies the adaptor after OpenFN installs it

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== OpenFN SFTP Debug Wrapper ===');

// First, let OpenFN install the adaptors
console.log('Installing OpenFN adaptors...');
execSync('openfn --version', { stdio: 'inherit' });

// Find the installed adaptor
const possiblePaths = [
  '/tmp/repo/@openfn/language-sftp/dist/index.cjs',
  '/usr/local/lib/node_modules/@openfn/language-sftp/dist/index.cjs',
  './node_modules/@openfn/language-sftp/dist/index.cjs'
];

let adaptorPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    adaptorPath = p;
    break;
  }
}

if (!adaptorPath) {
  console.error('Could not find OpenFN SFTP adaptor to modify');
  process.exit(1);
}

console.log(`Found adaptor at: ${adaptorPath}`);

// Read and modify the adaptor
let content = fs.readFileSync(adaptorPath, 'utf8');

// Add comprehensive debugging
const debugCode = `
console.log('=== OPENFN SFTP DEBUG ===');
console.log('Config received:', JSON.stringify(state.configuration, null, 2));
console.log('Config type:', typeof state.configuration);
console.log('Config keys:', Object.keys(state.configuration));
console.log('ssh2-sftp-client version:', require('ssh2-sftp-client/package.json').version);
console.log('========================');
`;

// Replace the connect call
content = content.replace(
  'return sftp.connect(state.configuration)',
  debugCode + 'return sftp.connect(state.configuration)'
);

// Write back the modified version
fs.writeFileSync(adaptorPath, content);
console.log('Enhanced debugging injected successfully');

// Now run the actual test
console.log('Running OpenFN test with debugging...');
execSync('openfn workflows/sftp-dhis2/jobs/check-sftp-files.js --adaptor @openfn/language-sftp --adaptor @openfn/language-common --state tests/e2e/sftp-check-input.json', { 
  stdio: 'inherit',
  cwd: process.cwd()
}); 