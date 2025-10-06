#!/usr/bin/env node

/**
 * Test script for Excel parsing functionality
 * Tests the XLSX parsing logic independently of the OpenFN workflow
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Test configuration
const testConfig = {
  dataDir: './data',
  testFiles: [
    'DHIS2_HIV Indicators.xlsx',
    'Direct Queries - Q1 2025 MoH Reports.xlsx',
    'Q2FY25_DQ_253_sites.xlsx'
  ]
};

console.log('🚀 Starting Excel Parsing Tests\n');

// Check if required dependencies are installed
try {
  require('xlsx');
  console.log('✅ XLSX library is available\n');
} catch (error) {
  console.error('❌ XLSX library not found. Please install it:');
  console.error('   npm install xlsx\n');
  process.exit(1);
}

// Test if files exist
console.log('📁 Checking test files...');
testConfig.testFiles.forEach(fileName => {
  const filePath = path.join(testConfig.dataDir, fileName);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`✅ ${fileName} (${stats.size} bytes)`);
  } else {
    console.log(`❌ ${fileName} - NOT FOUND`);
  }
});

// Simple parsing test
console.log('\n🧪 Testing basic Excel parsing...');
const testFile = path.join(testConfig.dataDir, testConfig.testFiles[0]);

if (fs.existsSync(testFile)) {
  try {
    const workbook = XLSX.readFile(testFile);
    console.log(`✅ Successfully loaded workbook`);
    console.log(`   Sheets: ${workbook.SheetNames.join(', ')}`);
    
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
    console.log(`   Rows in first sheet: ${jsonData.length}`);
    
    if (jsonData.length > 0) {
      console.log(`   Sample columns: ${Object.keys(jsonData[0]).join(', ')}`);
    }
    
    console.log('\n🎯 Excel parsing test completed successfully!');
    
  } catch (error) {
    console.error('❌ Excel parsing failed:', error.message);
    process.exit(1);
  }
} else {
  console.error(`❌ Test file not found: ${testFile}`);
  console.log('\n💡 To run a complete test:');
  console.log('1. Ensure Excel files are in the ./data directory');
  console.log('2. Make sure xlsx library is installed: npm install xlsx');
  process.exit(1);
}
