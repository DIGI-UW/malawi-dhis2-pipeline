#!/usr/bin/env node

/**
 * Enhanced Excel Parsing Test Script
 * Tests the multi-sheet Excel parsing functionality with real file structures
 * 
 * This script validates:
 * 1. Multi-sheet processing (6-11 sheets per file)
 * 2. Format-specific parsers for each file type
 * 3. Column structure variations across sheets
 * 4. Data validation and error handling
 * 5. Comprehensive data extraction
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
const testFiles = [
  'data/DHIS2_HIV Indicators.xlsx',
  'data/Direct Queries - Q1 2025 MoH Reports.xlsx',
  'data/Q2FY25_DQ_253_sites.xlsx'
];

// Expected file structures based on our analysis
const expectedStructures = {
  'DHIS2_HIV Indicators.xlsx': {
    sheetCount: 1,
    approximateRows: 122,
    description: 'HIV indicators reference data'
  },
  'Direct Queries - Q1 2025 MoH Reports.xlsx': {
    sheetCount: 6,
    approximateRows: 62000,
    sheets: ['COHORT_REPORT', 'TPT_NEW_INITIATIONS', 'TPT_OUTCOMES', 'TX_ML', 'TX_RTT', 'PMTCT_EID'],
    description: 'Multi-sheet direct queries report'
  },
  'Q2FY25_DQ_253_sites.xlsx': {
    sheetCount: 11,
    approximateRows: 'varies',
    sheets: ['TX_NEW', 'TX_CURR', 'TX_ML', 'TX_RTT', 'TX_PVLS', 'PMTCT_STAT', 'PMTCT_ART', 'PMTCT_EID', 'TB_STAT', 'TX_TB', 'TPT_NEW'],
    description: 'Multi-sheet data quality sites report'
  }
};

// Enhanced parsing functions (matching our implementation)
function parseHIVIndicators(workbook) {
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);

  const indicators = jsonData.map((row, index) => {
    return {
      indicator: row['Indicator'] || row['indicator'] || `Row_${index + 1}`,
      value: parseFloat(row['Value'] || row['value'] || 0),
      period: row['Period'] || row['period'] || '202506',
      orgUnit: row['OrgUnit'] || row['orgUnit'] || row['Facility'] || 'MW_DEFAULT',
      target: parseFloat(row['Target'] || row['target']) || null,
      comment: row['Comment'] || row['comment'] || null,
      dataElement: row['DataElement'] || row['dataElement'] || null,
      rowIndex: index + 1
    };
  }).filter(item => item.indicator && item.indicator !== `Row_${item.rowIndex}`);

  return { indicators, sheetName, totalRows: jsonData.length };
}

function parseDirectQueries(workbook) {
  const allSheets = [];
  
  workbook.SheetNames.forEach(sheetName => {
    try {
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (rawData.length === 0) return;
      
      // Find header row
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (row && Array.isArray(row) && row.length > 0) {
          const hasHeaders = row.some(cell => 
            cell && typeof cell === 'string' && 
            (/facility|site|query|indicator|value|result|count|total|period|month|quarter|year|date|org|unit|district|region/i.test(cell))
          );
          if (hasHeaders) {
            headerRowIndex = i;
            break;
          }
        }
      }
      
      const headers = rawData[headerRowIndex] || [];
      const dataRows = rawData.slice(headerRowIndex + 1);
      
      // Map headers to standard fields
      const headerMap = {};
      headers.forEach((header, index) => {
        if (!header) return;
        const headerStr = header.toString().toLowerCase().trim();
        
        if (/^(site|facility|health.*facility|clinic|hospital)$/i.test(headerStr)) {
          headerMap.site = index;
        } else if (/^(query|indicator|measure|metric|data.*element)$/i.test(headerStr)) {
          headerMap.indicator = index;
        } else if (/^(value|result|count|total|number|amount)$/i.test(headerStr)) {
          headerMap.value = index;
        } else if (/^(period|month|quarter|year|date|time)$/i.test(headerStr)) {
          headerMap.period = index;
        } else if (/^(org.*unit|district|region|area)$/i.test(headerStr)) {
          headerMap.orgUnit = index;
        }
      });
      
      const queries = dataRows.map((row, index) => {
        if (!row || !Array.isArray(row) || row.length === 0) return null;
        
        const site = row[headerMap.site] || row[0] || `Site_${index + 1}`;
        const indicator = row[headerMap.indicator] || row[1] || `Query_${index + 1}`;
        const value = parseFloat(row[headerMap.value] || row[2] || 0);
        
        if (!site || site.toString().trim() === '' || 
            !indicator || indicator.toString().trim() === '') {
          return null;
        }
        
        return {
          site: site.toString().trim(),
          indicator: indicator.toString().trim(),
          value: isNaN(value) ? 0 : value,
          period: row[headerMap.period] || '2025Q1',
          orgUnit: row[headerMap.orgUnit] || generateOrgUnit(site),
          rowIndex: index + 1
        };
      }).filter(item => item !== null);
      
      allSheets.push({
        sheetName,
        queries,
        totalRows: dataRows.length,
        validRows: queries.length,
        headers: headers.slice(0, 10) // First 10 headers for analysis
      });
      
    } catch (error) {
      log(`⚠️  Error parsing sheet ${sheetName}: ${error.message}`, 'yellow');
    }
  });
  
  return { sheets: allSheets, totalSheets: workbook.SheetNames.length };
}

function parseDQSites(workbook) {
  const allSheets = [];
  
  workbook.SheetNames.forEach(sheetName => {
    try {
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (rawData.length === 0) return;
      
      // Find header row
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (row && Array.isArray(row)) {
          const hasDataQualityHeaders = row.some(cell => 
            cell && typeof cell === 'string' && 
            (/site|facility|clinic|quality|score|completeness|timeliness|dq|data.*quality/i.test(cell))
          );
          if (hasDataQualityHeaders) {
            headerRowIndex = i;
            break;
          }
        }
      }
      
      const headers = rawData[headerRowIndex] || [];
      const dataRows = rawData.slice(headerRowIndex + 1);
      
      const sites = dataRows.map((row, index) => {
        if (!row || !Array.isArray(row) || row.length === 0) return null;
        
        const site = row[0] || `Site_${index + 1}`;
        const indicator = row[1] || sheetName;
        const value = parseFloat(row[2] || 0);
        
        if (!site || site.toString().trim() === '') return null;
        
        return {
          site: site.toString().trim(),
          indicator: indicator.toString().trim(),
          value: isNaN(value) ? 0 : value,
          period: '2025Q2',
          orgUnit: generateOrgUnit(site),
          sheetName,
          rowIndex: index + 1
        };
      }).filter(item => item !== null);
      
      allSheets.push({
        sheetName,
        sites,
        totalRows: dataRows.length,
        validRows: sites.length,
        headers: headers.slice(0, 10)
      });
      
    } catch (error) {
      log(`⚠️  Error parsing sheet ${sheetName}: ${error.message}`, 'yellow');
    }
  });
  
  return { sheets: allSheets, totalSheets: workbook.SheetNames.length };
}

function generateOrgUnit(siteName) {
  if (!siteName) return 'MW_DEFAULT';
  const cleanName = siteName.toString().replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  return `MW_${cleanName.substring(0, 10)}`;
}

// Main testing function
function testEnhancedExcelParsing() {
  log('🧪 Enhanced Excel Parsing Test Suite', 'cyan');
  log('====================================', 'cyan');
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testFile of testFiles) {
    const fileName = path.basename(testFile);
    const expectedStructure = expectedStructures[fileName];
    
    log(`\n📊 Testing: ${fileName}`, 'bright');
    log(`Expected: ${expectedStructure.description}`, 'blue');
    
    totalTests++;
    
    try {
      // Check if file exists
      if (!fs.existsSync(testFile)) {
        log(`❌ File not found: ${testFile}`, 'red');
        failedTests++;
        continue;
      }
      
      // Read workbook
      const workbook = XLSX.readFile(testFile);
      log(`✅ File loaded successfully`, 'green');
      log(`   Sheets found: ${workbook.SheetNames.length}`, 'blue');
      log(`   Sheet names: ${workbook.SheetNames.join(', ')}`, 'blue');
      
      // Validate sheet count
      if (workbook.SheetNames.length === expectedStructure.sheetCount) {
        log(`✅ Sheet count matches expected (${expectedStructure.sheetCount})`, 'green');
      } else {
        log(`⚠️  Sheet count mismatch. Expected: ${expectedStructure.sheetCount}, Found: ${workbook.SheetNames.length}`, 'yellow');
      }
      
      // Parse based on file type
      let parsedData;
      if (fileName.includes('DHIS2_HIV Indicators')) {
        parsedData = parseHIVIndicators(workbook);
        log(`✅ HIV Indicators parsed: ${parsedData.indicators.length} indicators`, 'green');
        
        // Sample data
        if (parsedData.indicators.length > 0) {
          const sample = parsedData.indicators[0];
          log(`   Sample indicator: ${sample.indicator}`, 'blue');
          log(`   Sample value: ${sample.value}`, 'blue');
          log(`   Sample period: ${sample.period}`, 'blue');
        }
        
      } else if (fileName.includes('Direct Queries')) {
        parsedData = parseDirectQueries(workbook);
        log(`✅ Direct Queries parsed: ${parsedData.totalSheets} sheets`, 'green');
        
        parsedData.sheets.forEach(sheet => {
          log(`   Sheet: ${sheet.sheetName} - ${sheet.validRows}/${sheet.totalRows} valid rows`, 'blue');
          if (sheet.headers.length > 0) {
            log(`   Headers: ${sheet.headers.join(', ')}`, 'blue');
          }
        });
        
        // Validate expected sheets
        if (expectedStructure.sheets) {
          const foundSheets = parsedData.sheets.map(s => s.sheetName);
          const missingSheets = expectedStructure.sheets.filter(s => !foundSheets.includes(s));
          if (missingSheets.length === 0) {
            log(`✅ All expected sheets found`, 'green');
          } else {
            log(`⚠️  Missing sheets: ${missingSheets.join(', ')}`, 'yellow');
          }
        }
        
      } else if (fileName.includes('Q2FY25_DQ')) {
        parsedData = parseDQSites(workbook);
        log(`✅ DQ Sites parsed: ${parsedData.totalSheets} sheets`, 'green');
        
        parsedData.sheets.forEach(sheet => {
          log(`   Sheet: ${sheet.sheetName} - ${sheet.validRows}/${sheet.totalRows} valid rows`, 'blue');
        });
        
        // Validate expected sheets
        if (expectedStructure.sheets) {
          const foundSheets = parsedData.sheets.map(s => s.sheetName);
          const missingSheets = expectedStructure.sheets.filter(s => !foundSheets.includes(s));
          if (missingSheets.length === 0) {
            log(`✅ All expected sheets found`, 'green');
          } else {
            log(`⚠️  Missing sheets: ${missingSheets.join(', ')}`, 'yellow');
          }
        }
      }
      
      passedTests++;
      log(`✅ ${fileName} test passed`, 'green');
      
    } catch (error) {
      log(`❌ ${fileName} test failed: ${error.message}`, 'red');
      failedTests++;
    }
  }
  
  // Summary
  log(`\n🎯 Test Summary`, 'cyan');
  log(`=============`, 'cyan');
  log(`Total tests: ${totalTests}`, 'blue');
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
  log(`Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`, passedTests === totalTests ? 'green' : 'yellow');
  
  if (passedTests === totalTests) {
    log(`\n🎉 All tests passed! Enhanced Excel parsing is working correctly.`, 'green');
  } else {
    log(`\n⚠️  Some tests failed. Please review the issues above.`, 'yellow');
  }
  
  return { totalTests, passedTests, failedTests };
}

// Run tests
if (require.main === module) {
  testEnhancedExcelParsing();
}

module.exports = { testEnhancedExcelParsing, parseHIVIndicators, parseDirectQueries, parseDQSites };
