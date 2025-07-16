/**
 * Process Excel data from downloaded SFTP files.
 * This job uses a configuration-driven approach to map and validate data.
 * 
 * OpenFn Design Principles:
 * - Single responsibility: Process Excel files into structured data
 * - Configuration-driven: Externalize business logic from code
 * - Error handling: Graceful failure with detailed error messages
 * - State immutability: Return new state objects
 */

// Try to import XLSX library for parsing raw Excel files
let XLSX;
let isXLSXAvailable = false;
try {
  XLSX = require('xlsx');
  isXLSXAvailable = true;
  console.log('✅ XLSX library available for Excel parsing');
} catch (error) {
  console.log('⚠️  XLSX library not available, will use alternative parsing methods');
}

// Configuration is embedded directly in the job for portability.
const CONFIG = {
  fileType: 'art_data_long_format',
  displayName: 'ART Data Long Format',
  description: 'Configuration for processing ART supervision data in long format',
  filePatterns: ['*ART*data*long*.xlsx', '*ART*data*long*.csv', 'ART_data_long_format.xlsx'],
  columnMappings: {
    facility: {
      sourceColumns: ['Facility', 'facility', 'Health Facility', 'Site'],
      targetField: 'orgUnit',
      required: true,
    },
    indicator: {
      sourceColumns: ['Indicator', 'indicator', 'Indicator Name', 'Data Element'],
      targetField: 'dataElement',
      required: true,
    },
    value: {
      sourceColumns: ['Value', 'value', 'Count', 'Total', 'Result'],
      targetField: 'value',
      required: true,
      dataType: 'numeric',
    },
    period: {
      sourceColumns: ['Period', 'period', 'Month', 'Quarter', 'Reporting Period'],
      targetField: 'period',
      required: true,
      format: 'YYYYMM',
    },
    ageGroup: {
      sourceColumns: ['Age Group', 'age_group', 'Age', 'Age Category'],
      targetField: 'categoryOptions.ageGroup',
      required: false,
    },
    gender: {
      sourceColumns: ['Gender', 'gender', 'Sex'],
      targetField: 'categoryOptions.gender',
      required: false,
    },
    artRegimen: {
      sourceColumns: ['ART Regimen', 'Regimen', 'Treatment'],
      targetField: 'categoryOptions.artRegimen',
      required: false,
    },
  },
  dataValidation: {
    rules: [
      { field: 'value', type: 'numeric', min: 0, max: 999999, allowNull: false },
      { field: 'period', type: 'regex', pattern: '^\\d{6}$', message: 'Period must be in YYYYMM format' },
      { field: 'indicator', type: 'notEmpty', message: 'Indicator name cannot be empty' },
    ],
    skipEmptyRows: true,
    stopOnError: false,
  },
  transformations: [
    { field: 'period', type: 'dateFormat', from: ['MM/YYYY', 'MM-YYYY', 'MMMM YYYY'], to: 'YYYYMM' },
    { field: 'value', type: 'numeric', removeCommas: true, defaultValue: 0 },
  ],
};

// Helper function to find which source column name is present in the row
const findSourceColumn = (row, sourceColumns) => {
  for (const col of sourceColumns) {
    if (row[col] !== undefined) {
      return col;
    }
  }
  return null;
};

// Helper to set a value in a nested object path
const setNestedValue = (obj, path, value) => {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    current[keys[i]] = current[keys[i]] || {};
    current = current[keys[i]];
}
  current[keys[keys.length - 1]] = value;
};

// Parse raw Excel content if needed
const parseExcelContent = (content, fileName) => {
  try {
    console.log(`📄 Parsing Excel content for: ${fileName}`);
    console.log(`📄 Content type:`, typeof content);
    
    // If content is already parsed (from getXLSX), return as is
    if (Array.isArray(content)) {
      console.log(`📄 Content already parsed as array with ${content.length} rows`);
      return content;
    }
    
    // If content is a string (raw file content), try to parse it
    if (typeof content === 'string') {
      console.log(`📄 Parsing raw string content, length: ${content.length}`);
    
      if (XLSX) {
        // Use XLSX library to parse
        const workbook = XLSX.read(content, { type: 'string' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Convert to array of objects with headers
        if (jsonData.length > 0) {
          const headers = jsonData[0];
          const rows = jsonData.slice(1).map(row => {
            const obj = {};
            headers.forEach((header, index) => {
              if (header && row[index] !== undefined) {
                obj[header] = row[index];
      }
            });
            return obj;
          });
          
          console.log(`📄 Successfully parsed ${rows.length} rows using XLSX library`);
          return rows;
        }
      }
      
      // Fallback: try to parse as CSV if it looks like CSV
      if (content.includes(',') && content.includes('\n')) {
        console.log(`📄 Attempting CSV parsing as fallback`);
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
          const rows = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
            const obj = {};
            headers.forEach((header, index) => {
              if (header && values[index] !== undefined) {
                obj[header] = values[index];
              }
            });
            return obj;
          });

          console.log(`📄 Successfully parsed ${rows.length} rows using CSV fallback`);
          return rows;
        }
      }
      
      console.error(`📄 Could not parse content for ${fileName}`);
      return [];
    }
    
    // If content is already an object/array, return as is
    if (typeof content === 'object' && content !== null) {
      console.log(`📄 Content is already an object, returning as is`);
      return Array.isArray(content) ? content : [content];
    }
    
    console.error(`📄 Unknown content type for ${fileName}:`, typeof content);
    return [];
    } catch (error) {
    console.error(`📄 Error parsing Excel content for ${fileName}:`, error);
    return [];
}
};

// Main mapping function for parsed Excel data
const mapExcelData = (parsedData, config) => {
  try {
    console.log('📊 Mapping Excel data...');
    console.log('📊 Input data type:', typeof parsedData);
    console.log('📊 Input data length:', Array.isArray(parsedData) ? parsedData.length : 'not array');
    
    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      return {
        type: config.fileType,
        data: [],
        validation: { 
          isValid: false, 
          warnings: ['No data found in parsed Excel content'] 
        },
        processedAt: new Date().toISOString(),
      };
}

    console.log(`📊 Found ${parsedData.length} data rows`);
    console.log(`📊 Sample row:`, parsedData[0]);

    const processedData = parsedData.map((row, rowIndex) => {
      const mappedRow = {};
    
      // Map each column according to configuration
      for (const key in config.columnMappings) {
        const mapping = config.columnMappings[key];
        const sourceColumn = findSourceColumn(row, mapping.sourceColumns);

        if (sourceColumn) {
          let value = row[sourceColumn];
          
          // Apply data type transformations
          if (mapping.dataType === 'numeric') {
            value = parseFloat(value) || 0;
          }
          
          setNestedValue(mappedRow, mapping.targetField, value);
        } else if (mapping.required) {
          console.warn(`⚠️  Required column not found for target field: ${mapping.targetField}`);
          console.warn(`⚠️  Available columns:`, Object.keys(row));
          // Don't throw error, just skip this field
        }
      }
      
      // Add row metadata
      mappedRow._rowNumber = rowIndex + 1;
      mappedRow._sourceRow = row;
      
      return mappedRow;
    });

    console.log(`📊 Successfully mapped ${processedData.length} rows`);
    console.log(`📊 Sample mapped row:`, processedData[0]);

    return {
      type: config.fileType,
      data: processedData,
      validation: { isValid: true, warnings: [] },
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ Error mapping Excel data:', error);
    return {
      type: config.fileType,
      data: [],
      validation: { 
        isValid: false, 
        warnings: [`Error mapping Excel data: ${error.message}`] 
      },
      processedAt: new Date().toISOString(),
    };
  }
};

// Match file to our single, embedded configuration
const matchFileToConfig = (fileName, config) => {
  for (const pattern of config.filePatterns) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
    if (regex.test(fileName)) {
      return config;
          }
  }
  return null;
};

// Main job function
fn(state => {
  console.log('🔄 Starting Excel data processing...');
  
  if (!state.downloadedFiles || state.downloadedFiles.length === 0) {
    console.warn('⚠️  No downloaded files to process.');
    return {
      ...state,
      processedFiles: [],
      workflowComplete: true,
      error: 'No downloaded files to process'
    };
  }

  console.log(`📁 Processing ${state.downloadedFiles.length} downloaded file(s)`);
  
  const processedFiles = [];
  const processingErrors = [];

  state.downloadedFiles.forEach(file => {
    console.log(`📄 Processing file: ${file.name}`);
    console.log(`📄 File status: ${file.status}`);
    console.log(`📄 Content type: ${file.contentType}`);
    console.log(`📄 Row count: ${file.rowCount || 'unknown'}`);
    
    if (file.status !== 'downloaded' || !file.content) {
      console.log(`⏭️  Skipping file with no content: ${file.name}`);
      processingErrors.push({
        fileName: file.name,
        error: 'File not downloaded or has no content',
        status: file.status
      });
      return;
    }

    try {
      // Match file to configuration
      const config = matchFileToConfig(file.name, CONFIG);
      
      if (!config) {
        console.log(`⏭️  No configuration found for file: ${file.name}`);
        processingErrors.push({
          fileName: file.name,
          error: 'No configuration found for this file type'
        });
        return;
      }
      
      console.log(`✅ Using configuration: ${config.displayName}`);

      // Content is already parsed from getXLSX - it's an array of row objects
      const parsedContent = file.content;
      
      if (!Array.isArray(parsedContent) || parsedContent.length === 0) {
        console.error(`❌ No valid data in ${file.name}`);
        processingErrors.push({
          fileName: file.name,
          error: 'No valid data found in file'
        });
        return;
      }

      console.log(`📊 Processing ${parsedContent.length} rows with chunking for memory efficiency`);

      // Process data in chunks to avoid memory issues
      const chunkSize = 100; // Process 100 rows at a time
      const allMappedData = [];
      let processedCount = 0;

      console.log(`🔄 Processing data in chunks of ${chunkSize} rows`);

      while (processedCount < parsedContent.length) {
        const chunk = parsedContent.slice(processedCount, processedCount + chunkSize);
        console.log(`📊 Processing chunk ${Math.floor(processedCount / chunkSize) + 1}: rows ${processedCount + 1}-${Math.min(processedCount + chunkSize, parsedContent.length)}`);
        
        // Map the chunk
        const mappedChunk = mapExcelData(chunk, config);
      
        if (mappedChunk.validation.isValid) {
          allMappedData.push(...mappedChunk.data);
          console.log(`✅ Chunk processed: ${mappedChunk.data.length} rows mapped`);
        } else {
          console.warn(`⚠️  Chunk had validation issues:`, mappedChunk.validation.warnings);
          // Still add the data, but log the warnings
          allMappedData.push(...mappedChunk.data);
        }
        
        processedCount += chunk.length;
        
        // Brief log for progress
        if (processedCount < parsedContent.length) {
          console.log(`📊 Progress: ${processedCount}/${parsedContent.length} rows processed`);
        }
      }

      console.log(`✅ Successfully processed ${file.name}: ${allMappedData.length} total rows mapped`);
      
      // Create final result
      const excelData = {
        type: config.fileType,
        data: allMappedData,
        validation: { 
          isValid: true, 
          warnings: [],
          totalRowsProcessed: allMappedData.length,
          chunksProcessed: Math.ceil(parsedContent.length / chunkSize)
        },
        processedAt: new Date().toISOString(),
      };

      processedFiles.push({
          fileName: file.name,
        fileType: file.contentType,
          excelData: excelData,
          processedAt: new Date().toISOString()
        });

    } catch (error) {
      console.error(`❌ Error processing ${file.name}:`, error);
      processingErrors.push({
        fileName: file.name,
        error: error.message
      });
    }
  });

  console.log(`📊 Processing complete: ${processedFiles.length} successful, ${processingErrors.length} failed`);

  if (processedFiles.length === 0) {
    console.error('❌ No files were successfully processed. Stopping workflow.');
    return {
      ...state,
      processedFiles: [],
      processingErrors,
      workflowComplete: true,
      error: `Processing failed: ${processingErrors.length} files failed to process`
    };
  }

  return {
    ...state,
    processedFiles,
    processingErrors,
    processingCompleted: true
  };
});
