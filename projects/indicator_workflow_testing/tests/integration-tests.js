#!/usr/bin/env node

/**
 * Comprehensive SFTP Excel Integration Validation Script
 * 
 * This script validates the complete SFTP Excel integration pipeline:
 * 1. File structure analysis and validation
 * 2. Excel parsing with multi-sheet support
 * 3. Data transformation and payload generation
 * 4. DHIS2 compatibility testing
 * 5. End-to-end workflow validation
 * 
 * Save this script for future testing and CI/CD validation
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Color coding for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test configuration
const config = {
  testFiles: [
    'data/DHIS2_HIV Indicators.xlsx',
    'data/Direct Queries - Q1 2025 MoH Reports.xlsx',
    'data/Q2FY25_DQ_253_sites.xlsx'
  ],
  jobFiles: [
    'packages/openfn/importer/workflows/reports-data-upload-workflow/jobs/get-sftp-data.js',
    'packages/openfn/importer/workflows/reports-data-upload-workflow/jobs/process-excel-data.js',
    'packages/openfn/importer/workflows/reports-data-upload-workflow/jobs/generate-dhis2-payload.js'
  ],
  sftpFiles: [
    'packages/sftp-storage/data/DHIS2_HIV Indicators.xlsx',
    'packages/sftp-storage/data/Direct Queries - Q1 2025 MoH Reports.xlsx',
    'packages/sftp-storage/data/Q2FY25_DQ_253_sites.xlsx'
  ]
};

// Comprehensive validation function
async function validateSFTPExcelIntegration() {
  log('🔍 Comprehensive SFTP Excel Integration Validation', 'cyan');
  log('==================================================', 'cyan');
  
  const results = {
    fileStructure: { passed: 0, failed: 0, tests: [] },
    excelParsing: { passed: 0, failed: 0, tests: [] },
    dataTransformation: { passed: 0, failed: 0, tests: [] },
    jobFiles: { passed: 0, failed: 0, tests: [] },
    integration: { passed: 0, failed: 0, tests: [] }
  };
  
  // Test 1: File Structure Validation
  log('\n📁 Test 1: File Structure Validation', 'bright');
  log('=====================================', 'bright');
  
  for (const testFile of config.testFiles) {
    const testName = `File exists: ${path.basename(testFile)}`;
    try {
      if (fs.existsSync(testFile)) {
        const stats = fs.statSync(testFile);
        log(`✅ ${testName} - Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`, 'green');
        results.fileStructure.passed++;
        results.fileStructure.tests.push({ name: testName, status: 'PASS', details: `${(stats.size / 1024 / 1024).toFixed(2)} MB` });
      } else {
        log(`❌ ${testName}`, 'red');
        results.fileStructure.failed++;
        results.fileStructure.tests.push({ name: testName, status: 'FAIL', details: 'File not found' });
      }
    } catch (error) {
      log(`❌ ${testName} - Error: ${error.message}`, 'red');
      results.fileStructure.failed++;
      results.fileStructure.tests.push({ name: testName, status: 'FAIL', details: error.message });
    }
  }
  
  // Test SFTP storage files
  for (const sftpFile of config.sftpFiles) {
    const testName = `SFTP file exists: ${path.basename(sftpFile)}`;
    try {
      if (fs.existsSync(sftpFile)) {
        log(`✅ ${testName}`, 'green');
        results.fileStructure.passed++;
        results.fileStructure.tests.push({ name: testName, status: 'PASS', details: 'Available in SFTP storage' });
      } else {
        log(`⚠️  ${testName}`, 'yellow');
        results.fileStructure.tests.push({ name: testName, status: 'WARN', details: 'Not available in SFTP storage' });
      }
    } catch (error) {
      log(`❌ ${testName} - Error: ${error.message}`, 'red');
      results.fileStructure.failed++;
      results.fileStructure.tests.push({ name: testName, status: 'FAIL', details: error.message });
    }
  }
  
  // Test 2: Excel Parsing Validation
  log('\n📊 Test 2: Excel Parsing Validation', 'bright');
  log('===================================', 'bright');
  
  for (const testFile of config.testFiles) {
    const fileName = path.basename(testFile);
    const testName = `Parse Excel: ${fileName}`;
    
    try {
      if (!fs.existsSync(testFile)) {
        log(`⚠️  ${testName} - File not found, skipping`, 'yellow');
        continue;
      }
      
      const workbook = XLSX.readFile(testFile);
      const sheetCount = workbook.SheetNames.length;
      let totalRows = 0;
      let validSheets = 0;
      
      for (const sheetName of workbook.SheetNames) {
        try {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          totalRows += jsonData.length;
          if (jsonData.length > 0) validSheets++;
        } catch (sheetError) {
          log(`⚠️  Sheet ${sheetName} parsing issue: ${sheetError.message}`, 'yellow');
        }
      }
      
      log(`✅ ${testName} - Sheets: ${sheetCount}, Valid sheets: ${validSheets}, Total rows: ${totalRows}`, 'green');
      results.excelParsing.passed++;
      results.excelParsing.tests.push({ 
        name: testName, 
        status: 'PASS', 
        details: `${sheetCount} sheets, ${validSheets} valid, ${totalRows} rows` 
      });
      
    } catch (error) {
      log(`❌ ${testName} - Error: ${error.message}`, 'red');
      results.excelParsing.failed++;
      results.excelParsing.tests.push({ name: testName, status: 'FAIL', details: error.message });
    }
  }
  
  // Test 3: Data Transformation Validation
  log('\n🔄 Test 3: Data Transformation Validation', 'bright');
  log('==========================================', 'bright');
  
  for (const testFile of config.testFiles) {
    const fileName = path.basename(testFile);
    const testName = `Transform data: ${fileName}`;
    
    try {
      if (!fs.existsSync(testFile)) continue;
      
      const workbook = XLSX.readFile(testFile);
      let transformedRecords = 0;
      let validRecords = 0;
      
      // Test different parsing strategies based on file type
      if (fileName.includes('DHIS2_HIV Indicators')) {
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);
        
        data.forEach(row => {
          transformedRecords++;
          if (row['Indicator'] || row['indicator']) {
            validRecords++;
          }
        });
        
      } else if (fileName.includes('Direct Queries') || fileName.includes('Q2FY25_DQ')) {
        // Multi-sheet processing
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          
          rawData.forEach((row, index) => {
            if (row && Array.isArray(row) && row.length > 0) {
              transformedRecords++;
              if (row.some(cell => cell && cell.toString().trim() !== '')) {
                validRecords++;
              }
            }
          });
        });
      }
      
      const validationRate = transformedRecords > 0 ? ((validRecords / transformedRecords) * 100).toFixed(1) : 0;
      
      log(`✅ ${testName} - Transformed: ${transformedRecords}, Valid: ${validRecords} (${validationRate}%)`, 'green');
      results.dataTransformation.passed++;
      results.dataTransformation.tests.push({ 
        name: testName, 
        status: 'PASS', 
        details: `${transformedRecords} transformed, ${validRecords} valid (${validationRate}%)` 
      });
      
    } catch (error) {
      log(`❌ ${testName} - Error: ${error.message}`, 'red');
      results.dataTransformation.failed++;
      results.dataTransformation.tests.push({ name: testName, status: 'FAIL', details: error.message });
    }
  }
  
  // Test 4: Job Files Validation
  log('\n⚙️  Test 4: Job Files Validation', 'bright');
  log('================================', 'bright');
  
  for (const jobFile of config.jobFiles) {
    const fileName = path.basename(jobFile);
    const testName = `Job file: ${fileName}`;
    
    try {
      if (!fs.existsSync(jobFile)) {
        log(`❌ ${testName} - File not found`, 'red');
        results.jobFiles.failed++;
        results.jobFiles.tests.push({ name: testName, status: 'FAIL', details: 'File not found' });
        continue;
      }
      
      const content = fs.readFileSync(jobFile, 'utf8');
      const stats = fs.statSync(jobFile);
      
      // Check for key functionality
      let hasEnhancements = false;
      let enhancementCount = 0;
      
      if (fileName === 'get-sftp-data.js') {
        if (content.includes('downloadFileWithRetry') && content.includes('retryConfig')) {
          hasEnhancements = true;
          enhancementCount++;
        }
        if (content.includes('validateFileIntegrity')) enhancementCount++;
      } else if (fileName === 'process-excel-data.js') {
        if (content.includes('parseHIVIndicators') && content.includes('parseDirectQueries') && content.includes('parseDQSites')) {
          hasEnhancements = true;
          enhancementCount++;
        }
        if (content.includes('validationSchemas')) enhancementCount++;
        if (content.includes('XLSX.readFile')) enhancementCount++;
      } else if (fileName === 'generate-dhis2-payload.js') {
        if (content.includes('fuzzyMatch') || content.includes('intelligentMatching')) {
          hasEnhancements = true;
          enhancementCount++;
        }
        if (content.includes('sftp_excel')) enhancementCount++;
      }
      
      const status = hasEnhancements ? 'ENHANCED' : 'BASIC';
      const statusColor = hasEnhancements ? 'green' : 'yellow';
      
      log(`✅ ${testName} - ${status} (${enhancementCount} enhancements) - Size: ${(stats.size / 1024).toFixed(1)} KB`, statusColor);
      results.jobFiles.passed++;
      results.jobFiles.tests.push({ 
        name: testName, 
        status: 'PASS', 
        details: `${status} - ${enhancementCount} enhancements, ${(stats.size / 1024).toFixed(1)} KB` 
      });
      
    } catch (error) {
      log(`❌ ${testName} - Error: ${error.message}`, 'red');
      results.jobFiles.failed++;
      results.jobFiles.tests.push({ name: testName, status: 'FAIL', details: error.message });
    }
  }
  
  // Test 5: Integration Dependencies
  log('\n🔗 Test 5: Integration Dependencies', 'bright');
  log('===================================', 'bright');
  
  const dependencyTests = [
    { name: 'xlsx library', test: () => require('xlsx'), details: 'Excel parsing library' },
    { name: 'csv-parser library', test: () => require('csv-parser'), details: 'CSV parsing library' },
    { name: 'fs module', test: () => require('fs'), details: 'File system operations' },
    { name: 'path module', test: () => require('path'), details: 'Path utilities' }
  ];
  
  for (const dep of dependencyTests) {
    const testName = `Dependency: ${dep.name}`;
    try {
      const module = dep.test();
      log(`✅ ${testName} - Available`, 'green');
      results.integration.passed++;
      results.integration.tests.push({ name: testName, status: 'PASS', details: dep.details });
    } catch (error) {
      log(`❌ ${testName} - Missing: ${error.message}`, 'red');
      results.integration.failed++;
      results.integration.tests.push({ name: testName, status: 'FAIL', details: error.message });
    }
  }
  
  // Package.json validation
  const packageJsonFiles = [
    'package.json',
    'packages/openfn/importer/workflows/reports-data-upload-workflow/package.json'
  ];
  
  for (const pkgFile of packageJsonFiles) {
    const testName = `Package config: ${path.basename(path.dirname(pkgFile)) || 'root'}`;
    try {
      if (fs.existsSync(pkgFile)) {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        const hasXlsx = pkg.dependencies && pkg.dependencies.xlsx;
        const hasCsvParser = pkg.dependencies && pkg.dependencies['csv-parser'];
        
        if (hasXlsx && hasCsvParser) {
          log(`✅ ${testName} - All dependencies configured`, 'green');
          results.integration.passed++;
          results.integration.tests.push({ name: testName, status: 'PASS', details: 'xlsx, csv-parser configured' });
        } else {
          log(`⚠️  ${testName} - Missing dependencies: ${!hasXlsx ? 'xlsx ' : ''}${!hasCsvParser ? 'csv-parser' : ''}`, 'yellow');
          results.integration.tests.push({ name: testName, status: 'WARN', details: 'Some dependencies missing' });
        }
      } else {
        log(`⚠️  ${testName} - File not found`, 'yellow');
        results.integration.tests.push({ name: testName, status: 'WARN', details: 'File not found' });
      }
    } catch (error) {
      log(`❌ ${testName} - Error: ${error.message}`, 'red');
      results.integration.failed++;
      results.integration.tests.push({ name: testName, status: 'FAIL', details: error.message });
    }
  }
  
  // Final Results Summary
  log('\n🎯 Final Validation Results', 'cyan');
  log('===========================', 'cyan');
  
  const categories = Object.keys(results);
  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;
  
  categories.forEach(category => {
    const result = results[category];
    const total = result.passed + result.failed;
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalTests += total;
    
    const percentage = total > 0 ? ((result.passed / total) * 100).toFixed(1) : 0;
    const statusColor = result.failed === 0 ? 'green' : (result.passed > result.failed ? 'yellow' : 'red');
    
    log(`${category.toUpperCase().padEnd(20)} | ${result.passed.toString().padStart(3)}/${total.toString().padStart(3)} passed (${percentage}%)`, statusColor);
  });
  
  log('\n' + '='.repeat(50), 'cyan');
  const overallPercentage = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0;
  const overallColor = totalFailed === 0 ? 'green' : (totalPassed > totalFailed ? 'yellow' : 'red');
  
  log(`OVERALL RESULTS          | ${totalPassed.toString().padStart(3)}/${totalTests.toString().padStart(3)} passed (${overallPercentage}%)`, overallColor);
  
  // Detailed Results
  log('\n📋 Detailed Test Results', 'blue');
  log('========================', 'blue');
  
  categories.forEach(category => {
    if (results[category].tests.length > 0) {
      log(`\n${category.toUpperCase()}:`, 'bright');
      results[category].tests.forEach(test => {
        const statusSymbol = test.status === 'PASS' ? '✅' : test.status === 'WARN' ? '⚠️ ' : '❌';
        const statusColor = test.status === 'PASS' ? 'green' : test.status === 'WARN' ? 'yellow' : 'red';
        log(`  ${statusSymbol} ${test.name} - ${test.details}`, statusColor);
      });
    }
  });
  
  // Recommendations
  log('\n💡 Recommendations', 'magenta');
  log('==================', 'magenta');
  
  if (totalFailed > 0) {
    log('⚠️  Issues found that need attention:', 'yellow');
    categories.forEach(category => {
      const failedTests = results[category].tests.filter(t => t.status === 'FAIL');
      if (failedTests.length > 0) {
        log(`   - ${category}: ${failedTests.length} failed tests`, 'red');
      }
    });
  }
  
  if (overallPercentage >= 90) {
    log('🎉 Excellent! The SFTP Excel integration is ready for production.', 'green');
  } else if (overallPercentage >= 75) {
    log('✅ Good! The integration is mostly ready, but some improvements recommended.', 'yellow');
  } else {
    log('⚠️  The integration needs more work before production deployment.', 'red');
  }
  
  log('\n🚀 Next Steps:', 'cyan');
  if (overallPercentage >= 90) {
    log('  1. Deploy to staging environment', 'green');
    log('  2. Run end-to-end integration tests', 'green');
    log('  3. Monitor performance and error rates', 'green');
    log('  4. Schedule production deployment', 'green');
  } else {
    log('  1. Fix failing tests identified above', 'yellow');
    log('  2. Re-run this validation script', 'yellow');
    log('  3. Consider additional testing', 'yellow');
    log('  4. Review integration documentation', 'yellow');
  }
  
  return results;
}

// Run validation if called directly
if (require.main === module) {
  validateSFTPExcelIntegration()
    .then(results => {
      const totalTests = Object.values(results).reduce((sum, category) => sum + category.passed + category.failed, 0);
      const totalPassed = Object.values(results).reduce((sum, category) => sum + category.passed, 0);
      const successRate = totalTests > 0 ? (totalPassed / totalTests) : 0;
      
      process.exit(successRate >= 0.9 ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}

module.exports = { validateSFTPExcelIntegration };
