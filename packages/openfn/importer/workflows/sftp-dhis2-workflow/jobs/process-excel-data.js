/**
 * Process Excel data from downloaded SFTP files
 * This job handles the conversion of Excel data to the format expected by generate-dhis2-payload.js
 */

import { 
  fn,
  each,
  dataPath,
  dataValue
} from '@openfn/language-common';

import * as XLSX from 'xlsx';
import fs from 'fs';

// Data validation schemas
const validationSchemas = {
  hiv_indicators: {
    requiredColumns: ['indicator', 'value', 'period', 'orgUnit'],
    optionalColumns: ['target', 'comment', 'dataElement']
  },
  direct_queries: {
    requiredColumns: ['site', 'indicator', 'value', 'period'],
    optionalColumns: ['orgUnit', 'target', 'comment']
  }
};

// Enhanced Excel data parsing
function parseExcelData(filePath, fileName) {
  console.log(`Parsing Excel file: ${fileName} at ${filePath}`);
  
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read the Excel file
    const workbook = XLSX.readFile(filePath);
    console.log(`Workbook sheets: ${workbook.SheetNames.join(', ')}`);

    let dataType = 'unknown';
    let parsedData = {};

    // Determine data type based on filename
    if (fileName.includes('DHIS2_HIV Indicators') || fileName.includes('HIV') || fileName.includes('hiv')) {
      dataType = 'hiv_indicators';
      parsedData = parseHIVIndicators(workbook);
    } else if (fileName.includes('Direct Queries') || fileName.includes('DQ') || fileName.includes('queries')) {
      dataType = 'direct_queries';
      parsedData = parseDirectQueries(workbook);
    } else {
      // Generic parsing for unknown files
      parsedData = parseGenericExcel(workbook);
    }

    // Validate the parsed data
    const validation = validateExcelData(parsedData, dataType);
    if (!validation.isValid) {
      console.warn(`Data validation warnings for ${fileName}:`, validation.warnings);
    }

    return {
      type: dataType,
      fileName: fileName,
      filePath: filePath,
      sheetNames: workbook.SheetNames,
      ...parsedData,
      validation: validation,
      processedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error(`Error parsing Excel file ${fileName}:`, error);
    throw new Error(`Failed to parse Excel file ${fileName}: ${error.message}`);
  }
}

// Parse HIV Indicators Excel file
function parseHIVIndicators(workbook) {
  const sheetName = workbook.SheetNames[0]; // Use first sheet
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);

  console.log(`Processing ${jsonData.length} rows from HIV Indicators sheet`);

  const indicators = jsonData.map((row, index) => {
    try {
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
    } catch (error) {
      console.warn(`Error processing row ${index + 1}:`, error);
      return null;
    }
  }).filter(item => item !== null);

  return { indicators };
}

// Parse Direct Queries Excel file
function parseDirectQueries(workbook) {
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);

  console.log(`Processing ${jsonData.length} rows from Direct Queries sheet`);

  const queries = jsonData.map((row, index) => {
    try {
      return {
        site: row['Site'] || row['site'] || row['Facility'] || `Site_${index + 1}`,
        indicator: row['Indicator'] || row['indicator'] || row['Query'] || `Indicator_${index + 1}`,
        value: parseFloat(row['Value'] || row['value'] || row['Count'] || row['Total'] || 0),
        period: row['Period'] || row['period'] || '202506',
        orgUnit: row['OrgUnit'] || row['orgUnit'] || row['Site'] || 'MW_DEFAULT',
        target: parseFloat(row['Target'] || row['target']) || null,
        comment: row['Comment'] || row['comment'] || null,
        rowIndex: index + 1
      };
    } catch (error) {
      console.warn(`Error processing row ${index + 1}:`, error);
      return null;
    }
  }).filter(item => item !== null);

  return { queries };
}

// Generic Excel parsing for unknown file types
function parseGenericExcel(workbook) {
  console.log('Using generic Excel parsing...');
  
  const sheets = {};
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    sheets[sheetName] = jsonData;
  });

  return { sheets, type: 'generic' };
}

// Validate parsed Excel data
function validateExcelData(data, dataType) {
  const schema = validationSchemas[dataType];
  if (!schema) {
    return { isValid: true, warnings: [`No validation schema for data type: ${dataType}`] };
  }

  const warnings = [];
  let isValid = true;

  // Get the actual data array based on type
  let dataArray = [];
  if (dataType === 'hiv_indicators' && data.indicators) {
    dataArray = data.indicators;
  } else if (dataType === 'direct_queries' && data.queries) {
    dataArray = data.queries;
  }

  if (dataArray.length === 0) {
    warnings.push('No data found in the parsed Excel file');
    isValid = false;
  }

  // Check required columns in first few rows
  const sampleRows = dataArray.slice(0, 5);
  schema.requiredColumns.forEach(column => {
    const hasColumn = sampleRows.some(row => row[column] !== undefined && row[column] !== null);
    if (!hasColumn) {
      warnings.push(`Required column '${column}' appears to be missing or empty`);
    }
  });

  return { isValid, warnings };
}

// Main processing function
fn((state) => {
  console.log('Starting Excel processing for downloaded files...');
  
  if (!state.downloadedFiles || state.downloadedFiles.length === 0) {
    console.log('No downloaded files to process');
    return {
      ...state,
      processedFiles: [],
      error: 'No downloaded files to process'
    };
  }

  const processedFiles = [];
  const processingErrors = [];

  state.downloadedFiles.forEach(file => {
    try {
      console.log(`Processing file: ${file.name}`);
      
      const excelData = parseExcelData(file.localPath, file.name);
      processedFiles.push({
        ...file,
        excelData,
        processedAt: new Date().toISOString(),
        status: 'processed'
      });
      
      console.log(`Successfully processed: ${file.name}`);
      
    } catch (error) {
      console.error(`Failed to process ${file.name}:`, error);
      processingErrors.push({
        fileName: file.name,
        error: error.message
      });
    }
  });

  console.log(`Processing complete: ${processedFiles.length} files processed, ${processingErrors.length} errors`);

  return {
    ...state,
    processedFiles,
    processingErrors,
    processingCompleted: true,
    data: processedFiles.length > 0 ? processedFiles[0].excelData : null // Primary data for next step
  };
});
