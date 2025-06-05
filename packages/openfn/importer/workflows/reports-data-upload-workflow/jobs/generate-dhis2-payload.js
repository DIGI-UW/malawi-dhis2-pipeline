// Generate DHIS2 payload from Google Sheets data
// This job transforms Google Sheets indicator data into DHIS2 dataValueSets format

// Generate DHIS2 payload from Google Sheets or Excel data
// Enhanced to handle both Google Sheets and SFTP Excel data sources

function generatePayload(inputData, reportConfig) {
  const { catAttrCombo, dataSet, period, orgUnit, hivStagesReportMapping } = reportConfig;
  
  console.log('Generating DHIS2 payload from data...');
  console.log('Report config:', JSON.stringify(reportConfig, null, 2));
  
  // Process input data to extract indicator values
  const indicatorValues = {};
  let dataSource = 'unknown';
  
  // Handle SFTP Excel data format
  if (inputData && inputData.source === 'sftp_excel') {
    dataSource = 'SFTP Excel';
    console.log('Processing SFTP Excel data format');
    
    // Process combined sheets data
    if (inputData.sheets) {
      Object.entries(inputData.sheets).forEach(([sheetType, sheetData]) => {
        console.log(`Processing ${sheetType} with ${sheetData.recordCount} records`);
        
        sheetData.data.forEach(row => {
          const indicatorName = row['Indicator'] || row['indicator'];
          const value = row['Value'] || row['value'];
          const site = row['Site'] || row['site'];
          
          if (indicatorName && value !== undefined && value !== '') {
            // Create unique key for site-specific indicators
            const indicatorKey = site ? `${site}_${indicatorName}` : indicatorName;
            const numericValue = parseFloat(value) || 0;
            
            indicatorValues[indicatorKey.trim()] = numericValue;
            console.log(`Mapped ${sheetType} indicator: ${indicatorKey} = ${numericValue}`);
          }
        });
      });
    }
    
  } 
  // Handle traditional Google Sheets data format
  else if (inputData && inputData.processedData) {
    dataSource = 'Google Sheets';
    console.log('Processing Google Sheets data format');
    
    inputData.processedData.forEach(row => {
      const indicatorName = row['Indicator'] || row['Indicator Name'] || row['indicator'];
      const value = row['Value'] || row['Count'] || row['Total'] || row['value'];
      
      if (indicatorName && value !== undefined && value !== '') {
        const cleanIndicatorName = indicatorName.trim();
        const numericValue = parseFloat(value) || 0;
        indicatorValues[cleanIndicatorName] = numericValue;
        console.log(`Mapped Google Sheets indicator: ${cleanIndicatorName} = ${numericValue}`);
      }
    });
  }
  
  // Handle raw Excel data format (fallback)
  else if (inputData && inputData.processedFiles) {
    dataSource = 'Raw Excel';
    console.log('Processing raw Excel data format');
    
    inputData.processedFiles.forEach(file => {
      console.log(`Processing file: ${file.fileName} (${file.type})`);
      
      // Process indicators
      if (file.indicators) {
        file.indicators.forEach(indicator => {
          const key = indicator.indicator || `${file.fileName}_${indicator.rowIndex}`;
          indicatorValues[key.trim()] = parseFloat(indicator.value) || 0;
          console.log(`Mapped file indicator: ${key} = ${indicator.value}`);
        });
      }
      
      // Process queries
      if (file.queries) {
        file.queries.forEach(query => {
          const key = `${query.site}_${query.indicator}`;
          indicatorValues[key.trim()] = parseFloat(query.value) || 0;
          console.log(`Mapped query: ${key} = ${query.value}`);
        });
      }
      
      // Process sites
      if (file.sites) {
        file.sites.forEach(site => {
          const key = `${site.site}_${site.indicator}`;
          indicatorValues[key.trim()] = parseFloat(site.value) || 0;
          console.log(`Mapped site: ${key} = ${site.value}`);
        });
      }
    });
  }
  
  console.log(`Extracted ${Object.keys(indicatorValues).length} indicator values from ${dataSource}`);
  console.log('Sample indicators:', Object.keys(indicatorValues).slice(0, 5));
  
  // Generate DHIS2 dataValues array with enhanced matching
  const dataValues = [];
  const matchingStats = {
    exactMatches: 0,
    partialMatches: 0,
    noMatches: 0,
    defaultValues: 0
  };
  
  Object.entries(hivStagesReportMapping).forEach(([indicatorKey, dhis2DataElement]) => {
    let value = undefined;
    let matchType = 'none';
    
    // Strategy 1: Exact match
    if (indicatorValues.hasOwnProperty(indicatorKey)) {
      value = indicatorValues[indicatorKey];
      matchType = 'exact';
      matchingStats.exactMatches++;
    }
    
    // Strategy 2: Case-insensitive exact match
    if (value === undefined) {
      const exactMatch = Object.keys(indicatorValues).find(key => 
        key.toLowerCase() === indicatorKey.toLowerCase()
      );
      if (exactMatch) {
        value = indicatorValues[exactMatch];
        matchType = 'exact_case_insensitive';
        matchingStats.exactMatches++;
      }
    }
    
    // Strategy 3: Partial matching (contains)
    if (value === undefined) {
      const partialMatch = Object.keys(indicatorValues).find(key => 
        key.toLowerCase().includes(indicatorKey.toLowerCase()) ||
        indicatorKey.toLowerCase().includes(key.toLowerCase())
      );
      if (partialMatch) {
        value = indicatorValues[partialMatch];
        matchType = 'partial';
        matchingStats.partialMatches++;
        console.log(`Partial match found: "${indicatorKey}" -> "${partialMatch}" = ${value}`);
      }
    }
    
    // Strategy 4: Fuzzy matching for common indicator patterns
    if (value === undefined) {
      const fuzzyMatch = findFuzzyMatch(indicatorKey, Object.keys(indicatorValues));
      if (fuzzyMatch) {
        value = indicatorValues[fuzzyMatch];
        matchType = 'fuzzy';
        matchingStats.partialMatches++;
        console.log(`Fuzzy match found: "${indicatorKey}" -> "${fuzzyMatch}" = ${value}`);
      }
    }
    
    // Default to 0 if no value found
    if (value === undefined) {
      value = 0;
      matchType = 'default';
      matchingStats.noMatches++;
      console.warn(`No data found for indicator: ${indicatorKey}, defaulting to 0`);
    }
    
    dataValues.push({
      dataElement: dhis2DataElement,
      period: period,
      orgUnit: orgUnit,
      categoryOptionCombo: catAttrCombo,
      attributeOptionCombo: catAttrCombo,
      value: value,
      matchType: matchType,
      originalIndicator: indicatorKey
    });
  });
  
  console.log('Data matching statistics:', matchingStats);
  
  const payload = {
    dataSet: dataSet,
    period: period,
    orgUnit: orgUnit,
    dataValues: dataValues,
    dataSource: dataSource,
    generatedAt: new Date().toISOString(),
    matchingStats: matchingStats
  };
  
  console.log(`Generated DHIS2 payload with ${dataValues.length} data values`);
  return payload;
}

// Enhanced fuzzy matching for indicator names
function findFuzzyMatch(target, candidates) {
  const targetWords = target.toLowerCase().split(/[\s\-_]+/);
  
  let bestMatch = null;
  let bestScore = 0;
  
  candidates.forEach(candidate => {
    const candidateWords = candidate.toLowerCase().split(/[\s\-_]+/);
    let score = 0;
    
    // Calculate word overlap score
    targetWords.forEach(targetWord => {
      candidateWords.forEach(candidateWord => {
        if (targetWord === candidateWord) {
          score += 2; // Exact word match
        } else if (targetWord.includes(candidateWord) || candidateWord.includes(targetWord)) {
          score += 1; // Partial word match
        }
      });
    });
    
    // Normalize score by length
    const normalizedScore = score / Math.max(targetWords.length, candidateWords.length);
    
    if (normalizedScore > bestScore && normalizedScore > 0.5) { // Threshold for fuzzy matching
      bestScore = normalizedScore;
      bestMatch = candidate;
    }
  });
  
  return bestMatch;
}

fn(state => {
  // Check for data from either Google Sheets or SFTP Excel sources
  const hasGoogleSheetsData = state.googleSheetsData?.processedData;
  const hasSftpData = state.excelData?.processedFiles;
  const hasCombinedSftpData = state.googleSheetsData?.source === 'sftp_excel';
  
  if (!hasGoogleSheetsData && !hasSftpData && !hasCombinedSftpData) {
    throw new Error('No data found in state. Make sure either Google Sheets or SFTP data job executed successfully.');
  }
  
  if (!state.reportConfig) {
    throw new Error('No report configuration found in state. Please ensure reportConfig is properly set.');
  }
  
  // Determine data source and use appropriate data
  let dataToProcess;
  let dataSource;
  
  if (hasCombinedSftpData || hasSftpData) {
    // If we have SFTP data, use it (it should already be transformed to Google Sheets format)
    dataToProcess = state.googleSheetsData || state.excelData;
    dataSource = 'SFTP Excel';
    console.log('Using SFTP Excel data source');
    console.log(`SFTP data summary: ${state.excelData?.summary?.totalRecords || 0} total records`);
  } else {
    dataToProcess = state.googleSheetsData;
    dataSource = 'Google Sheets';
    console.log('Using Google Sheets data source');
  }
  
  // Generate the DHIS2 payload
  const payload = generatePayload(dataToProcess, state.reportConfig);
  
  // Add metadata about the processing
  state.payload = {
    ...payload,
    metadata: {
      originalDataSource: dataSource,
      processedAt: new Date().toISOString(),
      totalDataValues: payload.dataValues?.length || 0,
      hasValidationWarnings: state.excelData?.errors?.length > 0,
      sftpSummary: state.excelData?.summary || null
    }
  };
  
  console.log(`Payload generation completed using ${dataSource}. Generated ${state.payload.totalDataValues || 0} data values.`);
  console.log('Ready for DHIS2 upload.');
  
  return state;
});
