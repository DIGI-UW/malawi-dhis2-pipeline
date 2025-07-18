import axios from 'axios';
import { Buffer } from 'buffer';

// Job 4: Process all Excel chunks sequentially using real DHIS2 mappings
fn(state => {
  const { fileName, totalChunks, chunkSize, filePath, totalRows } = state;
  const { dhis2Mappings } = state.data;
  
  // Validate required state from previous jobs
  if (!fileName || !totalChunks || !filePath) {
    throw new Error('Missing required state: fileName, totalChunks, and filePath must be provided from previous jobs');
  }
  
  // Validate DHIS2 mappings from metadata setup
  if (!dhis2Mappings) {
    throw new Error('Missing DHIS2 mappings: dhis2Mappings must be provided from metadata setup job');
  }
  
  console.log(`🚀 Job 4: Starting batch processing with real DHIS2 mappings`);
  console.log(`📊 Processing ${totalChunks} chunks of ${chunkSize} rows each`);
  console.log(`📋 Total rows: ${totalRows || 'unknown'}`);
  console.log(`🔗 Available mappings:`);
  console.log(`   • Organization Units: ${Object.keys(dhis2Mappings.orgUnits).length}`);
  console.log(`   • Categories: ${Object.keys(dhis2Mappings.categories).length}`);
  console.log(`   • Data Elements: ${Object.keys(dhis2Mappings.dataElements).length}`);
  
  // Create array of chunk configurations for each() to iterate over
  const chunks = [];
  for (let i = 0; i < totalChunks; i++) {
    chunks.push({
      index: i,
      number: i + 1,
      size: chunkSize,
      filePath: filePath,
      dhis2Mappings: dhis2Mappings // Pass mappings to each chunk
    });
  }
  
  console.log(`📦 Created ${chunks.length} chunk configurations`);
  
  // Initialize processing results array
  return {
    ...state,
    chunks,
    chunkResults: [],
    batchProcessingStartTime: new Date().toISOString()
  };
});

// Process each chunk using the atomic operation with real mappings
each(
  'chunks[*]',
  processExcelChunkToDHIS2(
    state => state.data.filePath,
    state => state.data.index,
    state => state.data.size,
    (chunkData, metadata) => {
      const { dhis2Mappings } = metadata;
      
      // Transform Excel data to DHIS2 dataValueSet format using real mappings
      console.log(`🔄 Transforming ${chunkData.length} rows to DHIS2 format with real UIDs`);
      
      // Extract common fields for the dataValueSet
      const firstRow = chunkData[0];
      const period = firstRow?.Quarter ? transformPeriod(firstRow.Quarter) : '';
      const orgUnit = firstRow?.Site ? dhis2Mappings.orgUnits[firstRow.Site] : null;
      
      const dataValues = chunkData.map((row, rowIndex) => {
        // Map Excel columns to DHIS2 format using real UIDs
        const indicatorName = row.Indicator_name;
        const value = row.IndicatorValue;
        const quarterPeriod = row.Quarter ? transformPeriod(row.Quarter) : period;
        const siteOrgUnit = row.Site ? dhis2Mappings.orgUnits[row.Site] : orgUnit;
        const dataElement = row.Indicator_name ? dhis2Mappings.dataElements[row.Indicator_name] : null;
        const categoryOptionCombo = row.hsector ? dhis2Mappings.categories[row.hsector] : null;
        
        // Log missing mappings for debugging
        if (!dataElement) {
          console.log(`⚠️  Row ${rowIndex + 1}: No data element mapping for '${indicatorName}'`);
        }
        if (!siteOrgUnit) {
          console.log(`⚠️  Row ${rowIndex + 1}: No org unit mapping for '${row.Site}'`);
        }
        if (!categoryOptionCombo) {
          console.log(`⚠️  Row ${rowIndex + 1}: No category mapping for '${row.hsector}'`);
        }
        
        // Skip invalid rows but log them
        if (!dataElement || !siteOrgUnit || !value || value === '') {
          console.log(`⚠️  Row ${rowIndex + 1}: Skipping invalid row - missing required mappings or value`);
          return null;
        }
        
        console.log(`📊 Row ${rowIndex + 1}: ${indicatorName} = ${value} (${row.Site}, ${quarterPeriod})`);
        
        return {
          dataElement: dataElement,
          period: quarterPeriod,
          orgUnit: siteOrgUnit,
          categoryOptionCombo: categoryOptionCombo || 'HllvX50cXC0', // Default if no category mapping
          attributeOptionCombo: 'HllvX50cXC0', // Default attribute option combo
          value: value.toString(),
          comment: `${row.Region}/${row.Zone}/${row.District}/${row.Site} - ${row.hsector} - ${row['Reporting period']}`
        };
      }).filter(dv => dv !== null); // Remove null entries
      
      console.log(`📝 Generated ${dataValues.length} valid data values from ${chunkData.length} rows`);
      
      if (dataValues.length > 0) {
        // Log a sample of the data values for debugging
        console.log(`🔍 Sample data values (first 3):`);
        dataValues.slice(0, 3).forEach((dv, index) => {
          console.log(`   ${index + 1}. ${dv.dataElement} → ${dv.value} (${dv.orgUnit}, ${dv.period})`);
        });
      }
      
      // Return DHIS2 API compatible structure
      return {
        dataValues: dataValues
      };
    }
  )
);

// Collect results and provide summary
fn(state => {
  const results = state.chunkResults || [];
  const successfulChunks = results.filter(r => r.uploadSuccess).length;
  const failedChunks = results.length - successfulChunks;
  const totalRowsProcessed = results.reduce((sum, r) => sum + (r.rowsProcessed || 0), 0);
  const totalDataValuesUploaded = results.reduce((sum, r) => sum + (r.dataValuesUploaded || 0), 0);
  
  console.log(`\n🎉 ===== BATCH PROCESSING COMPLETE =====`);
  console.log(`📊 Total chunks processed: ${results.length}`);
  console.log(`✅ Successful chunks: ${successfulChunks}`);
  console.log(`❌ Failed chunks: ${failedChunks}`);
  console.log(`📈 Total rows processed: ${totalRowsProcessed}`);
  console.log(`📊 Total data values uploaded: ${totalDataValuesUploaded}`);
  
  return {
    ...state,
    batchProcessingComplete: true,
    batchProcessingEndTime: new Date().toISOString(),
    summary: {
      fileName: state.fileName,
      totalChunksProcessed: results.length,
      successfulChunks,
      failedChunks,
      totalRowsProcessed,
      totalDataValuesUploaded,
      processingStartTime: state.batchProcessingStartTime,
      processingEndTime: new Date().toISOString()
    },
    // Keep the last successful result as the main data
    data: results.length > 0 ? results[results.length - 1] : {},
    references: results
  };
});

// Helper function to transform period from Excel format to DHIS2 format
function transformPeriod(quarterString) {
  if (!quarterString) return '2017Q1';
  
  // Handle formats like "2017 Q1" or "2017Q1"
  const cleaned = quarterString.replace(/\s+/g, '');
  
  // Extract year and quarter
  const match = cleaned.match(/(\d{4})\s*Q(\d)/);
  if (match) {
    const year = match[1];
    const quarter = match[2];
    return `${year}Q${quarter}`;
  }
  
  // Fallback
  return cleaned || '2017Q1';
} 