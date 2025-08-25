/**
 * Process Excel data from downloaded SFTP files
 * This job handles the conversion of Excel data to the format expected by generate-dhis2-payload.js
 * Uses configuration-based file type detection and column mapping
 */

import { 
  fn,
  each,
  dataPath,
  dataValue
} from '@openfn/language-common';

import * as XLSX from 'xlsx';
import fs from 'fs';
import { 
  loadFileTypeConfigs, 
  loadMetadataMappings, 
  matchFileToConfig,
  applyColumnMappings 
} from '../../../shared/config-loader.js';

// Enhanced Excel data parsing with configuration
function parseExcelData(filePath, fileName, config, metadata) {
  console.log(`Parsing Excel file: ${fileName} at ${filePath}`);
  console.log(`Using configuration: ${config.fileType}`);
  
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read the Excel file
    const workbook = XLSX.readFile(filePath);
    console.log(`Workbook sheets: ${workbook.SheetNames.join(', ')}`);

    let processedData = [];
    
    if (config.sheetConfig.multiSheet) {
      // Process multiple sheets
      config.sheetConfig.sheetPatterns.forEach(pattern => {
        const matchingSheets = workbook.SheetNames.filter(name => 
          new RegExp(pattern.replace(/\*/g, '.*'), 'i').test(name)
        );
        
        matchingSheets.forEach(sheetName => {
          const sheetData = processSheet(workbook, sheetName, config, metadata);
          processedData = processedData.concat(sheetData);
        });
      });
    } else {
      // Process single sheet
      const sheetIndex = config.sheetConfig.targetSheet || 0;
      const sheetName = workbook.SheetNames[sheetIndex];
      if (sheetName) {
        processedData = processSheet(workbook, sheetName, config, metadata);
      }
    }

    // Apply validation
    const validation = validateData(processedData, config.dataValidation);
    if (!validation.isValid) {
      console.warn(`Data validation warnings for ${fileName}:`, validation.warnings);
    }

    return {
      type: config.fileType,
      fileName: fileName,
      filePath: filePath,
      config: config,
      data: processedData,
      validation: validation,
      processedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error(`Error parsing Excel file ${fileName}:`, error);
    throw new Error(`Failed to parse Excel file ${fileName}: ${error.message}`);
  }
}

// Process a single sheet with configuration-based mapping
function processSheet(workbook, sheetName, config, metadata) {
  console.log(`Processing sheet: ${sheetName}`);
  
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: config.sheetConfig.headerRow || 1,
    range: (config.sheetConfig.dataStartRow || 2) - 1
  });

  console.log(`Found ${jsonData.length} rows in sheet ${sheetName}`);

  const processedRows = [];
  
  jsonData.forEach((row, index) => {
    try {
      // Apply column mappings
      const mappedRow = applyColumnMappings(row, config.columnMappings, metadata);
      
      // Apply transformations
      const transformedRow = applyTransformations(mappedRow, config.transformations);
      
      // Add metadata
      transformedRow._rowNumber = index + (config.sheetConfig.dataStartRow || 2);
      transformedRow._sheet = sheetName;
      
      processedRows.push(transformedRow);
    } catch (error) {
      console.warn(`Error processing row ${index + 1} in sheet ${sheetName}:`, error.message);
    }
  });

  return processedRows;
}

// Apply transformations based on configuration
function applyTransformations(row, transformations = []) {
  const transformed = { ...row };
  
  transformations.forEach(transform => {
    const field = transform.field;
    if (transformed[field] !== undefined) {
      switch (transform.type) {
        case 'numeric':
          let value = transformed[field];
          if (transform.removeCommas) {
            value = value.toString().replace(/,/g, '');
          }
          transformed[field] = parseFloat(value) || transform.defaultValue || 0;
          break;
          
        case 'dateFormat':
          transformed[field] = transformDate(transformed[field], transform);
          break;
          
        case 'quarterToMonth':
          transformed[field] = transformQuarter(transformed[field], transform);
          break;
          
        case 'percentage':
          transformed[field] = transformPercentage(transformed[field], transform);
          break;
      }
    }
  });
  
  return transformed;
}

// Transform date formats
function transformDate(value, config) {
  if (!value) return value;
  
  // Simple implementation - would need more robust date parsing
  const date = new Date(value);
  if (!isNaN(date) && config.to === 'YYYYMM') {
    return date.getFullYear().toString() + 
           (date.getMonth() + 1).toString().padStart(2, '0');
  }
  
  return value;
}

// Transform quarter to month
function transformQuarter(value, config) {
  if (!value) return value;
  
  // Match patterns like Q1 FY25, Q2FY25, etc.
  const match = value.match(/Q(\d)\s*FY(\d{2})/i);
  if (match) {
    const quarter = parseInt(match[1]);
    const year = 2000 + parseInt(match[2]);
    const fiscalYearStart = config.fiscalYearStart || 1;
    
    // Calculate the month based on quarter and fiscal year start
    let month = fiscalYearStart + (quarter - 1) * 3;
    let actualYear = year;
    
    if (month > 12) {
      month = month - 12;
      actualYear = year + 1;
    }
    
    return actualYear.toString() + month.toString().padStart(2, '0');
  }
  
  return value;
}

// Transform percentage values
function transformPercentage(value, config) {
  if (!value) return value;
  
  const numValue = parseFloat(value);
  if (!isNaN(numValue)) {
    if (config.from === 'decimal' && config.to === 'whole') {
      return numValue * 100;
    } else if (config.from === 'whole' && config.to === 'decimal') {
      return numValue / 100;
    }
  }
  
  return value;
}

// Validate data based on configuration rules
function validateData(data, validationConfig = {}) {
  const warnings = [];
  let isValid = true;
  
  if (data.length === 0) {
    warnings.push('No data found in the processed file');
    isValid = false;
  }
  
  const rules = validationConfig.rules || [];
  
  data.forEach((row, index) => {
    rules.forEach(rule => {
      const value = row[rule.field];
      
      switch (rule.type) {
        case 'numeric':
          if (typeof value !== 'number' || isNaN(value)) {
            warnings.push(`Row ${row._rowNumber || index}: ${rule.field} must be numeric`);
          } else if (rule.min !== undefined && value < rule.min) {
            warnings.push(`Row ${row._rowNumber || index}: ${rule.field} must be >= ${rule.min}`);
          } else if (rule.max !== undefined && value > rule.max) {
            warnings.push(`Row ${row._rowNumber || index}: ${rule.field} must be <= ${rule.max}`);
          }
          break;
          
        case 'notEmpty':
          if (!value || value.toString().trim() === '') {
            warnings.push(`Row ${row._rowNumber || index}: ${rule.message || `${rule.field} cannot be empty`}`);
          }
          break;
          
        case 'regex':
          if (value && !new RegExp(rule.pattern).test(value.toString())) {
            warnings.push(`Row ${row._rowNumber || index}: ${rule.message || `${rule.field} format is invalid`}`);
          }
          break;
      }
    });
  });
  
  return { isValid: isValid && warnings.length === 0, warnings };
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

  // Load configurations
  const fileTypeConfigs = loadFileTypeConfigs();
  const metadata = loadMetadataMappings();
  
  const processedFiles = [];
  const processingErrors = [];

  state.downloadedFiles.forEach(file => {
    try {
      console.log(`Processing file: ${file.name}`);
      
      // Match file to configuration
      const config = matchFileToConfig(file.name, fileTypeConfigs);
      
      if (!config) {
        // Fall back to generic processing if no config found
        console.warn(`No configuration found for ${file.name}, using generic processing`);
        // You could implement a generic fallback here
        processingErrors.push({
          fileName: file.name,
          error: 'No matching configuration found'
        });
        return;
      }
      
      const excelData = parseExcelData(file.localPath, file.name, config, metadata);
      processedFiles.push({
        ...file,
        excelData,
        processedAt: new Date().toISOString(),
        status: 'processed'
      });
      
      console.log(`Successfully processed: ${file.name} with ${excelData.data.length} rows`);
      
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
    metadata, // Pass metadata to next job
    data: processedFiles.length > 0 ? processedFiles[0].excelData : null // Primary data for next step
  };
});
