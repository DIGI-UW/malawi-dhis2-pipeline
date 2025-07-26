// Job 4: ProcessAllChunksSequentially  
// STATE CONTRACT:
// Input:  { fileName, filePath, chunkSize, totalChunks, totalRows, 
//          metadataSetupComplete, config, data: { dhis2Mappings } }
// Output: { fileName, batchProcessingComplete, summary, config, data: {...} }

executeWithSftp(
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
    
    console.log(`🚀 Job 4: Starting batch processing`);
    console.log(`📊 Processing ${totalChunks} chunks of ${chunkSize} rows each`);
    console.log(`🔗 Available mappings:`);
    console.log(`   • Organization Units: ${Object.keys(dhis2Mappings.orgUnits).length}`);
    console.log(`   • Category Option Combos: ${Object.keys(dhis2Mappings.categoryOptionCombos).length}`);
    console.log(`   • Data Elements: ${Object.keys(dhis2Mappings.dataElements).length}`);
    
    // Create array of chunk configurations for each() to iterate over
    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
      chunks.push({
        index: i,
        number: i + 1,
        size: chunkSize,
        filePath: filePath,
        totalChunks: totalChunks, // Pass total chunks for logging
        dhis2Mappings: dhis2Mappings, // Pass mappings to each chunk
        config: state.config, // Pass config to each chunk
        configuration: state.configuration // Pass DHIS2 configuration to each chunk
      });
    }
    
    console.log(`📦 Created ${chunks.length} chunk configurations`);
    
    return {
      fileName,
      filePath,
      chunkSize,
      totalChunks,
      totalRows,
      chunks,
      chunkResults: [],
      batchProcessingStartTime: new Date().toISOString(),
      data: {
        chunks
      }
    };
  }),

  each(
    'chunks[*]',
    fn(state => {
      const chunk = state.data;
      const { index, filePath, size, totalChunks, dhis2Mappings, config, configuration } = chunk;
      
      console.log(`📦 Processing chunk ${index + 1}/${totalChunks}`);
    
      // Use DHIS2 adaptor's getExcelChunk function (handles SFTP internally)
      // Note: getExcelChunk may return data as arrays or objects depending on the Excel structure
      return getExcelChunk(filePath, index, size)(state).then(chunkState => {
        const chunkData = chunkState.chunkData;
        
        // Concise chunk data structure logging
        if (chunkData && chunkData.length > 0) {
          console.log(`   📊 Chunk ${index} analysis: ${chunkData.length} rows`);
          
          // Quick structure check
          if (chunkData[0]) {
            const keys = Object.keys(chunkData[0]);
            console.log(`      • Structure: ${keys.includes('obj') ? 'Wrapped (obj/arr)' : 'Direct columns'}`);
            console.log(`      • Keys: ${keys.join(', ')}`);
          }
          
          // Log expected columns from config
          console.log(`   Expected columns from config:`, Object.keys(config.columnMapping));
          console.log(`   === END CHUNK ANALYSIS ===\n`);
        }
       
        if (!chunkData || chunkData.length === 0) {
          return {
            chunkIndex: index,
            uploadSuccess: true,
            rowsProcessed: 0,
            dataValuesUploaded: 0,
            message: 'Empty chunk skipped'
          };
        }
        
        // Handle case where Excel data comes back in different formats
        let processedChunkData = chunkData;
        
        // Check if data needs transformation
        if (chunkData.length > 0) {
          // Case 1: Data is wrapped in an object structure
          if (chunkData[0].obj !== undefined) {
            console.log(`   🔄 Unwrapping data from 'obj' property`);
            processedChunkData = chunkData.map(row => row.obj);
          } 
          // Case 2: Data is an array of arrays
          else if (Array.isArray(chunkData[0])) {
            console.log(`   🔄 Converting array format to objects`);
            // Skip the header row if this is the first chunk
            const startIndex = (index === 0) ? 1 : 0;
            
            // Hardcode the column order based on the Excel file structure
            // This should match the order in the Excel file
            const columnOrder = ['Site', 'District', 'Zone', 'Region', 'Quarter', 
                                'hsector', 'Reporting period', 'Indicator_name', 'IndicatorValue'];
            
            console.log(`   Using column order:`, columnOrder);
            processedChunkData = chunkData.slice(startIndex).map((row, rowIdx) => {
              const obj = {};
              columnOrder.forEach((colName, idx) => {
                obj[colName] = row[idx];
              });
              if (rowIdx === 0) {
                console.log(`   Sample converted row:`, JSON.stringify(obj, null, 2));
              }
              return obj;
            });
          } 
          // Case 3: Data is already in the expected format
          else {
            console.log(`   ✓ Data appears to be in expected object format`);
          }
        }
        
        // Final validation of processed data
        if (processedChunkData.length > 0) {
          console.log(`\n   === PROCESSED DATA VALIDATION ===`);
          console.log(`   Processed rows count: ${processedChunkData.length}`);
          console.log(`   First processed row keys:`, Object.keys(processedChunkData[0]));
          console.log(`   First processed row values:`, processedChunkData[0]);
          
          // Check if we have the expected columns
          const expectedCols = Object.keys(config.columnMapping);
          const actualCols = Object.keys(processedChunkData[0]);
          const missingCols = expectedCols.filter(col => !actualCols.includes(col));
          const extraCols = actualCols.filter(col => !expectedCols.includes(col));
          
          if (missingCols.length > 0) {
            console.log(`   ⚠️ Missing expected columns:`, missingCols);
          }
          if (extraCols.length > 0) {
            console.log(`   ⚠️ Extra unexpected columns:`, extraCols);
          }
          console.log(`   === END VALIDATION ===\n`);
        }
        
        // Get dynamic column names from config
        console.log(`\n   === COLUMN MAPPING FROM CONFIG ===`);
        console.log(`   Config column mapping:`, JSON.stringify(config.columnMapping, null, 2));
        
        const indicatorColumn = Object.keys(config.columnMapping).find(col => 
          config.columnMapping[col].dataProcessingRole === 'indicator'
        );
        const valueColumn = Object.keys(config.columnMapping).find(col => 
          config.columnMapping[col].dataProcessingRole === 'value'
        );
        const quarterColumn = Object.keys(config.columnMapping).find(col => 
          config.columnMapping[col].dataProcessingRole === 'period'
        );
        const siteColumn = Object.keys(config.columnMapping).find(col => 
          config.columnMapping[col].dataProcessingRole === 'orgUnit'
        );
        const hsectorColumn = Object.keys(config.columnMapping).find(col => 
          config.columnMapping[col].dataProcessingRole === 'category'
        );
        const reportingPeriodColumn = Object.keys(config.columnMapping).find(col => 
          config.columnMapping[col].uniqueValueKey === 'reportingPeriods'
        );
        
        console.log(`   Mapped columns:`);
        console.log(`     - indicatorColumn: "${indicatorColumn}"`);
        console.log(`     - valueColumn: "${valueColumn}"`);
        console.log(`     - quarterColumn: "${quarterColumn}"`);
        console.log(`     - siteColumn: "${siteColumn}"`);
        console.log(`     - hsectorColumn: "${hsectorColumn}"`);
        console.log(`     - reportingPeriodColumn: "${reportingPeriodColumn}"`);
        console.log(`   === END COLUMN MAPPING ===\n`);
        
        const dataValues = processedChunkData.map((row, rowIndex) => {
          const quarterPeriod = row[quarterColumn] ? transformPeriod(row[quarterColumn]) : '';
          
          // Org units are mapped by name (from upsertOrganisationUnitHierarchy)
          const siteName = row[siteColumn];
          const siteOrgUnit = siteName ? dhis2Mappings.orgUnits[siteName] : null;
          
          // Convert indicator name to code before lookup
          const indicatorName = row[indicatorColumn];
          const indicatorCode = indicatorName ? generateCodeFromName(indicatorName) : '';
          const dataElement = indicatorCode ? dhis2Mappings.dataElements[indicatorCode] : null;
          
          // Create category option combo key from both hsector and reporting period
          // Category option combos are mapped by name (e.g., "Public+Cumulative")
          const hsectorValue = row[hsectorColumn];
          const reportingPeriodValue = row[reportingPeriodColumn];
          const categoryComboKey = (hsectorValue && reportingPeriodValue) ? 
            `${hsectorValue}+${reportingPeriodValue}` : '';
          const categoryOptionCombo = categoryComboKey ? 
            dhis2Mappings.categoryOptionCombos[categoryComboKey] : null;
          
          // Debug first few rows with complete details
          // Log only the first row mapping for debugging
          if (rowIndex === 0) {
            console.log(`   📍 Sample mapping (row 0):`);
            console.log(`      • ${indicatorColumn}: "${row[indicatorColumn]}" → ${dataElement ? `✓ ${dataElement}` : '✗ Not found'}`);
            console.log(`      • ${siteColumn}: "${row[siteColumn]}" → ${siteOrgUnit ? `✓ ${siteOrgUnit}` : '✗ Not found'}`);
            console.log(`      • Category: "${categoryComboKey}" → ${categoryOptionCombo ? `✓ ${categoryOptionCombo}` : '✗ Not found'}`);
            console.log(`      • Period: "${row[quarterColumn]}" → "${quarterPeriod}"`);
          }
        
          // Get the value, handling undefined/null cases
          const value = row[valueColumn];
          
          return {
            dataElement: dataElement || 'UNKNOWN_DATA_ELEMENT',
            period: quarterPeriod,
            orgUnit: siteOrgUnit || 'UNKNOWN_ORG_UNIT',
                          categoryOptionCombo: categoryOptionCombo || 'HllvX50cXC0',  // Use DHIS2's default category option combo UID
            value: value !== undefined && value !== null && value !== '' ? String(value) : '0',
            hasValue: value !== undefined && value !== null && value !== ''
          };
        });
        
        // Filter out invalid mappings and rows without values
        const validDataValues = dataValues
          .filter(dv => dv.dataElement !== 'UNKNOWN_DATA_ELEMENT' && dv.orgUnit !== 'UNKNOWN_ORG_UNIT')
          .filter(dv => dv.hasValue)  // Only include rows that have actual values
          .map(dv => {
            // Remove the hasValue flag before sending to DHIS2
            const { hasValue, ...dataValue } = dv;
            return dataValue;
          });
        
        // Log mapping statistics for debugging
        const unknownDataElements = dataValues.filter(dv => dv.dataElement === 'UNKNOWN_DATA_ELEMENT').length;
        const unknownOrgUnits = dataValues.filter(dv => dv.orgUnit === 'UNKNOWN_ORG_UNIT').length;
        const missingValues = dataValues.filter(dv => !dv.hasValue).length;
        
        if (unknownDataElements > 0 || unknownOrgUnits > 0 || missingValues > 0) {
          console.log(`   ⚠️ Data issues in chunk ${index}:`);
          if (unknownDataElements > 0) console.log(`      • ${unknownDataElements} unknown data elements`);
          if (unknownOrgUnits > 0) console.log(`      • ${unknownOrgUnits} unknown org units`);
          if (missingValues > 0) console.log(`      • ${missingValues} rows without values (skipped)`);
        }
        
        console.log(`   📊 Chunk ${index}: ${dataValues.length} total rows → ${validDataValues.length} valid data values`);
      
        if (validDataValues.length === 0) {
          return {
            chunkIndex: index,
            uploadSuccess: true,
            rowsProcessed: processedChunkData.length,
            dataValuesUploaded: 0,
            message: 'No valid data values created'
          };
        }
        
        // Create DHIS2 DataValueSet
        // For bulk imports, don't include period/orgUnit at root level when data values have mixed periods/orgs
        const dataValueSet = {
          dataValues: validDataValues
        };
        
        // Include dataSet ID if available
        if (dhis2Mappings.dataSetId) {
          dataValueSet.dataSet = dhis2Mappings.dataSetId;
        }
        
        // Log the data value set structure for debugging
        console.log(`   📝 Data value set structure:`);
        console.log(`      • Data set ID: ${dataValueSet.dataSet || 'Not specified'}`);
        console.log(`      • Data values count: ${dataValueSet.dataValues.length}`);
        if (dataValueSet.dataValues.length > 0) {
          console.log(`      • Sample data value:`, JSON.stringify(dataValueSet.dataValues[0], null, 2));
          
          // Check for common issues
          const sampleValue = dataValueSet.dataValues[0];
          if (!sampleValue.dataElement || sampleValue.dataElement === 'UNKNOWN_DATA_ELEMENT') {
            console.warn(`      ⚠️  Warning: Invalid data element ID`);
          }
          if (!sampleValue.orgUnit || sampleValue.orgUnit === 'UNKNOWN_ORG_UNIT') {
            console.warn(`      ⚠️  Warning: Invalid org unit ID`);
          }
          if (!sampleValue.categoryOptionCombo || sampleValue.categoryOptionCombo === 'UNKNOWN_CATEGORY_COMBO') {
            console.warn(`      ⚠️  Warning: Invalid category option combo ID`);
          }
        }
        
        // Pass the complete state with DHIS2 configuration to the create function
        const stateForUpload = {
          configuration: configuration,  // Use the DHIS2 configuration from the chunk
          data: dataValueSet
        };
        
        // Use query parameters instead of params wrapper
        return create('dataValueSets?importStrategy=CREATE_AND_UPDATE&skipExistingCheck=true', dataValueSet)(stateForUpload).then(uploadState => {
          console.log(`✅ Chunk ${index + 1}: ${dataValueSet.dataValues.length} values uploaded`);
          
          // Handle different possible response structures safely
          const responseData = uploadState?.data || uploadState?.response || uploadState || {};
          
          // Log import summary if available
          if (responseData.importCount) {
            const summary = responseData.importCount;
            console.log(`   📊 Import summary:`);
            console.log(`      • Imported: ${summary.imported || 0}`);
            console.log(`      • Updated: ${summary.updated || 0}`);
            console.log(`      • Ignored: ${summary.ignored || 0}`);
            console.log(`      • Deleted: ${summary.deleted || 0}`);
          }
          
          return {
            chunkIndex: index,
            uploadSuccess: true,
            rowsProcessed: processedChunkData.length,
            dataValuesUploaded: dataValueSet.dataValues.length,
            dhis2Response: responseData,
            message: `Successfully uploaded ${dataValueSet.dataValues.length} data values`
          };
        }).catch(uploadError => {
          console.error(`❌ Chunk ${index + 1} failed:`, uploadError.message);
          
          // Log more details about the error if available
          if (uploadError.body) {
            // Process conflicts to show summary instead of full indexes
            if (uploadError.body.response && uploadError.body.response.conflicts) {
              const conflicts = uploadError.body.response.conflicts;
              console.error(`   ❌ DHIS2 Import Conflicts: ${conflicts.length} types`);
              
              conflicts.forEach((conflict, idx) => {
                const indexCount = conflict.indexes ? conflict.indexes.length : 0;
                console.error(`   ${idx + 1}. ${conflict.value}`);
                console.error(`      • Error code: ${conflict.errorCode}`);
                console.error(`      • Object: ${conflict.object}`);
                console.error(`      • Affected rows: ${indexCount}`);
                if (indexCount > 0 && conflict.indexes) {
                  const preview = conflict.indexes.slice(0, 5).join(', ');
                  const suffix = indexCount > 5 ? `, ... (${indexCount - 5} more)` : '';
                  console.error(`      • Row indexes: ${preview}${suffix}`);
                }
              });
              
              // Show import summary if available
              if (uploadError.body.response.importCount) {
                const summary = uploadError.body.response.importCount;
                console.error(`   📊 Import summary: imported=${summary.imported || 0}, updated=${summary.updated || 0}, ignored=${summary.ignored || 0}`);
              }
            } else {
              // For non-conflict errors, show the full response but without huge arrays
              const cleanedBody = JSON.parse(JSON.stringify(uploadError.body));
              console.error(`   DHIS2 Error Response:`, JSON.stringify(cleanedBody, null, 2));
            }
          }
          if (uploadError.response && uploadError.response.headers) {
            console.error(`   HTTP Response: ${uploadError.response.status} ${uploadError.response.statusText}`);
          }
          
          return {
            chunkIndex: index,
            uploadSuccess: false,
            rowsProcessed: processedChunkData.length,
            dataValuesUploaded: 0,
            error: uploadError.message,
            errorDetails: uploadError.body || (uploadError.response ? uploadError.response.body : null),
            message: `Upload failed: ${uploadError.message}`
          };
        });
      }).catch(chunkError => {
        console.error(`❌ Chunk ${index + 1}:`, chunkError.message);
        
        return {
          chunkIndex: index,
          uploadSuccess: false,
          rowsProcessed: 0,
          dataValuesUploaded: 0,
          error: chunkError.message,
          message: `Chunk processing failed: ${chunkError.message}`
        };
      });
    })
  ),

  fn(state => {
    // Collect all results from the each() operation
    const results = state.references || [];
    const successfulChunks = results.filter(r => r.uploadSuccess === true);
    const failedChunks = results.filter(r => r.uploadSuccess === false);
    
    const totalRowsProcessed = results.reduce((sum, r) => sum + (r.rowsProcessed || 0), 0);
    const totalDataValuesUploaded = results.reduce((sum, r) => sum + (r.dataValuesUploaded || 0), 0);
    
    console.log(`✅ Job 4 Complete: ${successfulChunks.length}/${results.length} chunks, ${totalDataValuesUploaded} values uploaded`);
    
    if (failedChunks.length > 0) {
      console.log(`⚠️  Failed chunks: ${failedChunks.map(c => c.chunkIndex + 1).join(', ')}`);
    }
    
    return {
      fileName: state.fileName,
      batchProcessingComplete: true,
      summary: {
        totalChunks: results.length,
        successfulChunks: successfulChunks.length,
        failedChunks: failedChunks.length,
        totalRowsProcessed,
        totalDataValuesUploaded,
        processingStartTime: state.batchProcessingStartTime,
        processingEndTime: new Date().toISOString()
      },
      data: results.length > 0 ? results[results.length - 1] : {}
    };
  })
); // Close executeWithSftp

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

// Helper function to generate codes from names (same as in metadata generation)
function generateCodeFromName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
} 