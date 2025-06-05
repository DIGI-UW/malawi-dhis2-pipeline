// Google Sheets to DHIS2 Data Extraction Job
// This job reads HIV indicator data from Google Sheets and prepares it for DHIS2

fn(state => {
  console.log('Starting Google Sheets data extraction...');
  
  // Use configuration from state, with fallbacks
  const config = state.googleSheetsConfig || {
    spreadsheetId: 'YOUR_GOOGLE_SHEET_ID',
    range: 'Sheet1!A:Z'
  };
  
  console.log('Using Google Sheets config:', JSON.stringify(config, null, 2));
  return state;
});

getValues({
  spreadsheetId: (state) => state.googleSheetsConfig?.spreadsheetId || 'YOUR_GOOGLE_SHEET_ID',
  range: (state) => state.googleSheetsConfig?.range || 'Sheet1!A:Z'
}, (state) => {
  console.log('Google Sheets data retrieved:', state.data.values?.length || 0, 'rows');
  
  // Store the raw Google Sheets data
  const sheetData = state.data.values;
  
  // Check if we have data
  if (!sheetData || sheetData.length < 2) {
    throw new Error('No data found in Google Sheets or insufficient rows (need at least headers + 1 data row)');
  }
  
  // Extract headers from first row
  const headers = sheetData[0];
  console.log('Headers found:', headers);
  
  // Get configuration for data processing
  const config = state.googleSheetsConfig || {};
  const skipRows = config.skipHeaderRows || 1;
  
  // Convert rows to objects for easier processing
  const dataRows = sheetData.slice(skipRows).map((row, index) => {
    const rowObj = {
      _rowNumber: index + skipRows + 1, // For debugging
      _originalRow: row
    };
    
    headers.forEach((header, colIndex) => {
      // Clean header names and create object properties
      const cleanHeader = header ? header.toString().trim() : `Column_${colIndex}`;
      const cellValue = row[colIndex] || '';
      rowObj[cleanHeader] = cellValue.toString().trim();
    });
    
    return rowObj;
  });
  
  console.log('Processed', dataRows.length, 'data rows');
  if (dataRows.length > 0) {
    console.log('Sample row:', JSON.stringify(dataRows[0], null, 2));
  }
  
  // Filter out empty rows (rows where all values are empty)
  const validRows = dataRows.filter(row => {
    const nonMetaValues = Object.keys(row)
      .filter(key => !key.startsWith('_'))
      .map(key => row[key]);
    
    return nonMetaValues.some(value => value && value.toString().trim() !== '');
  });
  
  console.log('Valid rows after filtering empty rows:', validRows.length);
  
  // Apply additional filtering based on configuration
  const processingConfig = state.processingConfig || {};
  let finalRows = validRows;
  
  if (processingConfig.dataValidation?.requireIndicatorName) {
    const indicatorCol = config.dataStructure?.indicatorColumn || 'Indicator';
    finalRows = finalRows.filter(row => {
      const hasIndicator = row[indicatorCol] && row[indicatorCol].trim() !== '';
      if (!hasIndicator) {
        console.warn(`Row ${row._rowNumber}: Missing indicator name in column '${indicatorCol}'`);
      }
      return hasIndicator;
    });
    console.log('Rows with valid indicator names:', finalRows.length);
  }
  
  if (processingConfig.dataValidation?.requireNumericValue) {
    const valueCol = config.dataStructure?.valueColumn || 'Value';
    finalRows = finalRows.filter(row => {
      const value = row[valueCol];
      const isNumeric = !isNaN(parseFloat(value)) && isFinite(value);
      if (!isNumeric && value && value.trim() !== '') {
        console.warn(`Row ${row._rowNumber}: Invalid numeric value '${value}' in column '${valueCol}'`);
      }
      return isNumeric || !value || value.trim() === '';
    });
    console.log('Rows with valid numeric values:', finalRows.length);
  }
  
  // Store processed data in state for next job
  const result = {
    ...state,
    googleSheetsData: {
      config: config,
      headers: headers,
      rawData: sheetData,
      processedData: finalRows,
      validRowCount: finalRows.length,
      totalRowCount: sheetData.length - skipRows,
      extractedAt: new Date().toISOString(),
      metadata: {
        spreadsheetId: config.spreadsheetId,
        range: config.range,
        skipRows: skipRows
      }
    }
  };
  
  console.log('Google Sheets extraction completed successfully');
  return result;
});
