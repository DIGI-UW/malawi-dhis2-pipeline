/**
 * Generate DHIS2 payload from processed Excel data
 * This job transforms Excel indicator data into DHIS2 dataValueSets format
 */

import { fn } from '@openfn/language-common';

// Default report configuration for Malawi HIV indicators
const defaultReportConfig = {
  catAttrCombo: 'HllvX50cXC0', // Default category option combo
  dataSet: 'BfMAe6Itzgt', // HIV indicators dataset
  period: '202506', // Current period (June 2025)
  orgUnit: 'rXoaHGAXWy9', // Malawi country level
  hivStagesReportMapping: {
    // Core HIV Testing indicators
    'HTS_TST': 'FTRrcoaog83', // HIV tests performed
    'HTS_TST_POS': 'ybzlGLjWwnK', // HIV positive tests
    'HTS_INDEX': 'CklPZdOd6H1', // Index testing contacts
    
    // Treatment indicators
    'TX_NEW': 'dwEq7wi6nXV', // Newly enrolled on ART
    'TX_CURR': 'ZiOVcrSjSYe', // Currently on ART
    'TX_PVLS': 'RE0iJ0hANDC', // Viral load suppression
    
    // Prevention indicators
    'PrEP_NEW': 'G7vUx908SwP', // New on PrEP
    'PrEP_CT': 'mFkjPTqYNlX', // PrEP continuation
    
    // PMTCT indicators
    'PMTCT_STAT': 'Tt5TAvdfdz7', // PMTCT status known
    'PMTCT_ART': 'jjZWrxtK9z2', // PMTCT on ART
    
    // TB/HIV indicators
    'TB_ART': 'FjjP1Gs6kHf', // TB patients on ART
    'TB_STAT': 'V37YqbqpEhV' // TB status among HIV+
  }
};

function generatePayload(processedFiles, reportConfig) {
  const { catAttrCombo, dataSet, period, orgUnit, hivStagesReportMapping } = reportConfig;
  
  console.log('Generating DHIS2 payload from processed Excel files...');
  console.log('Report config:', JSON.stringify(reportConfig, null, 2));
  
  // Extract indicator values from all processed files
  const indicatorValues = {};
  let totalRecords = 0;
  
  processedFiles.forEach(file => {
    console.log(`Processing file: ${file.fileName} (${file.excelData.type})`);
    
    // Process HIV indicators
    if (file.excelData.indicators) {
      file.excelData.indicators.forEach(indicator => {
        const key = indicator.indicator.trim();
        const value = parseFloat(indicator.value) || 0;
        
        // Use the most recent value if duplicate indicators exist
        if (!indicatorValues[key] || indicatorValues[key] < value) {
          indicatorValues[key] = value;
        }
        
        totalRecords++;
        console.log(`Mapped indicator: ${key} = ${value}`);
      });
    }
    
    // Process direct queries
    if (file.excelData.queries) {
      file.excelData.queries.forEach(query => {
        const key = `${query.site}_${query.indicator}`.trim();
        const value = parseFloat(query.value) || 0;
        
        indicatorValues[key] = value;
        totalRecords++;
        console.log(`Mapped query: ${key} = ${value}`);
      });
    }
  });
  
  console.log(`Extracted ${Object.keys(indicatorValues).length} unique indicators from ${totalRecords} total records`);
  
  // Generate DHIS2 dataValues array with matching
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
    dataSource: 'SFTP Excel',
    generatedAt: new Date().toISOString(),
    matchingStats: matchingStats,
    totalRecords: totalRecords,
    uniqueIndicators: Object.keys(indicatorValues).length
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

// Main processing function
fn(state => {
  console.log('Starting DHIS2 payload generation...');
  
  // Check for processed Excel data
  if (!state.processedFiles || state.processedFiles.length === 0) {
    throw new Error('No processed Excel files found in state. Make sure process-excel-data job executed successfully.');
  }
  
  // Use default report config or from state
  const reportConfig = state.reportConfig || defaultReportConfig;
  
  console.log(`Processing ${state.processedFiles.length} Excel files for DHIS2 payload generation`);
  
  // Generate the DHIS2 payload
  const payload = generatePayload(state.processedFiles, reportConfig);
  
  // Add metadata about the processing
  const enhancedPayload = {
    ...payload,
    metadata: {
      originalDataSource: 'SFTP Excel',
      processedAt: new Date().toISOString(),
      totalDataValues: payload.dataValues?.length || 0,
      hasValidationWarnings: state.processingErrors?.length > 0,
      processedFiles: state.processedFiles.map(f => ({
        fileName: f.fileName,
        type: f.excelData.type,
        recordCount: (f.excelData.indicators?.length || 0) + (f.excelData.queries?.length || 0)
      }))
    }
  };
  
  console.log(`Payload generation completed. Generated ${enhancedPayload.totalDataValues} data values.`);
  console.log('Ready for DHIS2 upload.');
  
  return {
    ...state,
    payload: enhancedPayload,
    dhis2Payload: enhancedPayload, // For compatibility
    payloadGeneratedAt: new Date().toISOString()
  };
});
