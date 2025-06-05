// Process Excel data from SFTP and prepare for DHIS2 payload generation
// This job handles the conversion of Excel data to the format expected by generate-dhis2-payload.js

import { 
  fn,
  each,
  dataPath,
  dataValue,
  field
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
  },
  dq_sites: {
    requiredColumns: ['site', 'indicator', 'value', 'period'],
    optionalColumns: ['orgUnit', 'score', 'completeness']
  }
};

// Enhanced Excel data parsing with real XLSX library
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
    if (fileName.includes('DHIS2_HIV Indicators')) {
      dataType = 'hiv_indicators';
      parsedData = parseHIVIndicators(workbook);
    } else if (fileName.includes('Direct Queries')) {
      dataType = 'direct_queries';
      parsedData = parseDirectQueries(workbook);
    } else if (fileName.includes('Q2FY25_DQ')) {
      dataType = 'dq_sites';
      parsedData = parseDQSites(workbook);
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
      sheetNames: workbook.SheetNames,
      ...parsedData,
      validation: validation
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

// Parse Direct Queries Excel file with robust column detection
function parseDirectQueries(workbook) {
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Get raw data with headers
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  console.log(`Processing ${rawData.length} rows from Direct Queries sheet`);
  
  if (rawData.length === 0) {
    return { queries: [] };
  }
  
  // Find header row (look for common patterns)
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    if (row && Array.isArray(row)) {
      const hasCommonHeaders = row.some(cell => 
        cell && typeof cell === 'string' && 
        (/facility|site|query|indicator|value|result|count|total/i.test(cell) ||
         /period|month|quarter|year|date/i.test(cell) ||
         /org|unit|district|region/i.test(cell))
      );
      if (hasCommonHeaders) {
        headerRowIndex = i;
        break;
      }
    }
  }
  
  const headers = rawData[headerRowIndex] || [];
  const dataRows = rawData.slice(headerRowIndex + 1);
  
  console.log(`Found headers at row ${headerRowIndex}:`, headers.slice(0, 10));
  
  // Map headers to standard fields
  const headerMap = {};
  headers.forEach((header, index) => {
    if (!header) return;
    
    const headerStr = header.toString().toLowerCase().trim();
    
    // Site/Facility mapping
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
    } else if (/^(target|goal|expected)$/i.test(headerStr)) {
      headerMap.target = index;
    } else if (/^(comment|note|remark|description)$/i.test(headerStr)) {
      headerMap.comment = index;
    }
    
    // Additional flexible mappings for common variations
    if (!headerMap.site && /facility|site|clinic/i.test(headerStr)) {
      headerMap.site = index;
    }
    if (!headerMap.indicator && /indicator|query|measure/i.test(headerStr)) {
      headerMap.indicator = index;
    }
    if (!headerMap.value && /value|count|total|result/i.test(headerStr)) {
      headerMap.value = index;
    }
  });
  
  console.log('Header mapping:', headerMap);
  
  const queries = dataRows.map((row, index) => {
    if (!row || !Array.isArray(row) || row.length === 0) return null;
    
    try {
      const site = row[headerMap.site] || row[0] || `Site_${index + 1}`;
      const indicator = row[headerMap.indicator] || row[1] || `Query_${index + 1}`;
      const value = parseFloat(row[headerMap.value] || row[2] || 0);
      
      // Skip empty rows
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
        target: parseFloat(row[headerMap.target]) || null,
        comment: row[headerMap.comment] || null,
        rowIndex: index + 1
      };
    } catch (error) {
      console.warn(`Error processing Direct Queries row ${index + 1}:`, error);
      return null;
    }
  }).filter(item => item !== null);

  return { queries };
}

// Parse DQ Sites Excel file with flexible column detection
function parseDQSites(workbook) {
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Get raw data with headers
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  console.log(`Processing ${rawData.length} rows from DQ Sites sheet`);
  
  if (rawData.length === 0) {
    return { sites: [] };
  }
  
  // Find header row
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    if (row && Array.isArray(row)) {
      const hasDataQualityHeaders = row.some(cell => 
        cell && typeof cell === 'string' && 
        (/site|facility|clinic/i.test(cell) ||
         /quality|score|completeness|timeliness/i.test(cell) ||
         /dq|data.*quality/i.test(cell))
      );
      if (hasDataQualityHeaders) {
        headerRowIndex = i;
        break;
      }
    }
  }
  
  const headers = rawData[headerRowIndex] || [];
  const dataRows = rawData.slice(headerRowIndex + 1);
  
  console.log(`Found DQ headers at row ${headerRowIndex}:`, headers.slice(0, 10));
  
  // Map headers to standard fields
  const headerMap = {};
  headers.forEach((header, index) => {
    if (!header) return;
    
    const headerStr = header.toString().toLowerCase().trim();
    
    // Site/Facility mapping
    if (/^(site|facility|health.*facility|clinic|hospital|hf)$/i.test(headerStr)) {
      headerMap.site = index;
    } else if (/^(score|quality.*score|dq.*score|overall.*score)$/i.test(headerStr)) {
      headerMap.score = index;
    } else if (/^(completeness|complete|data.*complete)$/i.test(headerStr)) {
      headerMap.completeness = index;
    } else if (/^(timeliness|timely|on.*time)$/i.test(headerStr)) {
      headerMap.timeliness = index;
    } else if (/^(period|month|quarter|year|date)$/i.test(headerStr)) {
      headerMap.period = index;
    } else if (/^(org.*unit|district|region|area)$/i.test(headerStr)) {
      headerMap.orgUnit = index;
    } else if (/^(indicator|measure|metric)$/i.test(headerStr)) {
      headerMap.indicator = index;
    }
    
    // Additional flexible mappings
    if (!headerMap.site && /facility|site|clinic|hf/i.test(headerStr)) {
      headerMap.site = index;
    }
    if (!headerMap.score && /score|quality|dq/i.test(headerStr)) {
      headerMap.score = index;
    }
  });
  
  console.log('DQ Sites header mapping:', headerMap);
  
  const sites = dataRows.map((row, index) => {
    if (!row || !Array.isArray(row) || row.length === 0) return null;
    
    try {
      const site = row[headerMap.site] || row[0] || `Site_${index + 1}`;
      
      // Skip empty rows
      if (!site || site.toString().trim() === '') {
        return null;
      }
      
      // Try to find a numeric value (score, completeness, etc.)
      let value = 0;
      let indicator = 'Data Quality Score';
      
      if (headerMap.score !== undefined && row[headerMap.score] !== undefined) {
        value = parseFloat(row[headerMap.score]) || 0;
        indicator = 'Data Quality Score';
      } else if (headerMap.completeness !== undefined && row[headerMap.completeness] !== undefined) {
        value = parseFloat(row[headerMap.completeness]) || 0;
        indicator = 'Completeness Rate';
      } else if (headerMap.timeliness !== undefined && row[headerMap.timeliness] !== undefined) {
        value = parseFloat(row[headerMap.timeliness]) || 0;
        indicator = 'Timeliness Score';
      } else {
        // Try to find any numeric column
        for (let i = 1; i < row.length; i++) {
          const cellValue = parseFloat(row[i]);
          if (!isNaN(cellValue)) {
            value = cellValue;
            indicator = headers[i] || `Metric_${i}`;
            break;
          }
        }
      }
      
      return {
        site: site.toString().trim(),
        indicator: indicator,
        value: value,
        period: row[headerMap.period] || '2025Q2',
        orgUnit: row[headerMap.orgUnit] || generateOrgUnit(site),
        score: parseFloat(row[headerMap.score]) || null,
        completeness: parseFloat(row[headerMap.completeness]) || null,
        timeliness: parseFloat(row[headerMap.timeliness]) || null,
        rowIndex: index + 1
      };
    } catch (error) {
      console.warn(`Error processing DQ Sites row ${index + 1}:`, error);
      return null;
    }
  }).filter(item => item !== null);

  return { sites };
}

// Generic Excel parser for unknown file types
function parseGenericExcel(workbook) {
  const allData = [];
  
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    allData.push({
      sheetName,
      data: jsonData,
      rowCount: jsonData.length
    });
  });

  return { 
    type: 'generic',
    sheets: allData,
    totalRows: allData.reduce((sum, sheet) => sum + sheet.rowCount, 0)
  };
}

// Generate org unit ID from site name
function generateOrgUnit(siteName) {
  if (!siteName) return 'MW_DEFAULT';
  
  // Create a simple org unit ID from site name
  const cleanName = siteName.toString().replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  return `MW_${cleanName.substring(0, 10)}`;
}

// Validate parsed Excel data
function validateExcelData(data, dataType) {
  const validation = {
    isValid: true,
    warnings: [],
    errors: []
  };

  if (!validationSchemas[dataType]) {
    validation.warnings.push(`No validation schema for data type: ${dataType}`);
    return validation;
  }

  const schema = validationSchemas[dataType];
  const dataArray = data.indicators || data.queries || data.sites || [];

  if (dataArray.length === 0) {
    validation.errors.push('No data found in Excel file');
    validation.isValid = false;
  }

  // Check required columns
  dataArray.forEach((item, index) => {
    schema.requiredColumns.forEach(column => {
      if (!item[column] && item[column] !== 0) {
        validation.warnings.push(`Missing required field '${column}' in row ${index + 1}`);
      }
    });

    // Check data types
    if (item.value && isNaN(parseFloat(item.value))) {
      validation.warnings.push(`Invalid numeric value '${item.value}' in row ${index + 1}`);
    }
  });

  return validation;
}

// Process the SFTP downloaded files with enhanced error handling
fn((state) => {
  console.log('Processing Excel data from SFTP...');
  
  if (!state.sftpData?.downloadedFiles) {
    throw new Error('No SFTP data found in state. Make sure get-sftp-data job ran successfully.');
  }
  
  const processedData = [];
  const errors = [];
  
  // Process each downloaded Excel file with retry logic
  state.sftpData.downloadedFiles.forEach(file => {
    console.log(`Processing file: ${file.name}`);
    
    let retryCount = 0;
    const maxRetries = 3;
    let processed = false;
    
    while (!processed && retryCount < maxRetries) {
      try {
        const parsedData = parseExcelData(file.localPath, file.name);
        
        // Additional data transformation for Google Sheets compatibility
        const transformedData = transformToGoogleSheetsFormat(parsedData);
        
        processedData.push({
          source: 'sftp',
          fileName: file.name,
          filePath: file.localPath,
          ...parsedData,
          googleSheetsFormat: transformedData,
          processedAt: new Date().toISOString()
        });
        
        console.log(`Successfully processed ${file.name} with ${parsedData.indicators?.length || parsedData.queries?.length || parsedData.sites?.length || 0} records`);
        processed = true;
        
      } catch (error) {
        retryCount++;
        console.error(`Error processing ${file.name} (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount >= maxRetries) {
          errors.push({
            fileName: file.name,
            error: error.message,
            attempts: retryCount
          });
        } else {
          // Wait before retry
          console.log(`Retrying ${file.name} in 2 seconds...`);
          // Note: In a real scenario, you'd use setTimeout or similar
        }
      }
    }
  });
  
  // Store processed data in state for the DHIS2 payload generator
  state.excelData = {
    processedFiles: processedData,
    errors: errors,
    processedAt: new Date().toISOString(),
    totalFiles: processedData.length,
    errorCount: errors.length,
    source: 'sftp',
    summary: {
      hivIndicators: processedData.filter(f => f.type === 'hiv_indicators').length,
      directQueries: processedData.filter(f => f.type === 'direct_queries').length,
      dqSites: processedData.filter(f => f.type === 'dq_sites').length,
      totalRecords: processedData.reduce((sum, file) => {
        return sum + (file.indicators?.length || file.queries?.length || file.sites?.length || 0);
      }, 0)
    }
  };

  // Transform data to Google Sheets compatible format for downstream processing
  if (processedData.length > 0) {
    state.googleSheetsData = combineDataForGoogleSheets(processedData);
    console.log(`Combined ${processedData.length} files into Google Sheets format`);
  }

  console.log(`Excel data processing complete. Processed: ${processedData.length}, Errors: ${errors.length}`);
  return state;
});

// Transform Excel data to Google Sheets compatible format
function transformToGoogleSheetsFormat(parsedData) {
  const transformed = {
    type: parsedData.type,
    fileName: parsedData.fileName,
    data: []
  };

  if (parsedData.indicators) {
    transformed.data = parsedData.indicators.map(indicator => ({
      'Indicator': indicator.indicator,
      'Value': indicator.value,
      'Period': indicator.period,
      'OrgUnit': indicator.orgUnit,
      'Target': indicator.target || '',
      'Comment': indicator.comment || '',
      'DataElement': indicator.dataElement || ''
    }));
  } else if (parsedData.queries) {
    transformed.data = parsedData.queries.map(query => ({
      'Site': query.site,
      'Indicator': query.indicator,
      'Value': query.value,
      'Period': query.period,
      'OrgUnit': query.orgUnit,
      'Target': query.target || '',
      'Comment': query.comment || ''
    }));
  } else if (parsedData.sites) {
    transformed.data = parsedData.sites.map(site => ({
      'Site': site.site,
      'Indicator': site.indicator,
      'Value': site.value,
      'Period': site.period,
      'OrgUnit': site.orgUnit,
      'Score': site.score || '',
      'Completeness': site.completeness || ''
    }));
  }

  return transformed;
}

// Combine multiple Excel files into a single Google Sheets compatible structure
function combineDataForGoogleSheets(processedFiles) {
  const combined = {
    source: 'sftp_excel',
    processedAt: new Date().toISOString(),
    files: processedFiles.map(f => f.fileName),
    sheets: {}
  };

  processedFiles.forEach(file => {
    const sheetName = file.type.replace('_', ' ').toUpperCase();
    
    if (!combined.sheets[sheetName]) {
      combined.sheets[sheetName] = {
        data: [],
        fileCount: 0,
        recordCount: 0
      };
    }

    if (file.googleSheetsFormat?.data) {
      combined.sheets[sheetName].data.push(...file.googleSheetsFormat.data);
      combined.sheets[sheetName].fileCount++;
      combined.sheets[sheetName].recordCount += file.googleSheetsFormat.data.length;
    }
  });

  return combined;
}
  
  console.log('Excel data processing completed:', state.excelData);
  
  return state;
});

// Transform Excel data to match Google Sheets data structure
fn((state) => {
  console.log('Transforming Excel data to Google Sheets format...');
  
  if (!state.excelData) {
    return state;
  }
  
  // Convert Excel data to the format expected by generate-dhis2-payload.js
  const transformedData = [];
  
  state.excelData.processedFiles.forEach(file => {
    if (file.type === 'hiv_indicators' && file.indicators) {
      file.indicators.forEach(indicator => {
        transformedData.push({
          'Indicator': indicator.indicator,
          'Value': indicator.value,
          'Period': indicator.period,
          'Organisation Unit': indicator.orgUnit,
          'Source': 'SFTP Excel',
          'File': file.fileName
        });
      });
    } else if (file.type === 'direct_queries' && file.queries) {
      file.queries.forEach(query => {
        transformedData.push({
          'Indicator': query.indicator,
          'Value': query.value,
          'Period': query.period,
          'Organisation Unit': query.orgUnit,
          'Site': query.site,
          'Source': 'SFTP Excel',
          'File': file.fileName
        });
      });
    } else if (file.type === 'dq_sites' && file.sites) {
      file.sites.forEach(site => {
        transformedData.push({
          'Indicator': site.indicator,
          'Value': site.value,
          'Period': site.period,
          'Organisation Unit': site.orgUnit,
          'Site': site.site,
          'Source': 'SFTP Excel',
          'File': file.fileName
        });
      });
    }
  });
  
  // Store in the same format as Google Sheets data
  state.googleSheetsData = {
    source: 'sftp_excel',
    processedData: transformedData,
    processedAt: new Date().toISOString(),
    totalRecords: transformedData.length
  };
  
  console.log(`Transformed ${transformedData.length} records from Excel to Google Sheets format`);
  console.log('Sample transformed records:', JSON.stringify(transformedData.slice(0, 3), null, 2));
  
  return state;
});
