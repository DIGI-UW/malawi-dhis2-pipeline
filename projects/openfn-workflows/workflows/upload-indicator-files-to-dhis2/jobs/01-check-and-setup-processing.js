/**
 * Job 1 – ValidateFileConfig
 * Role: Validates the file configuration received from Job 0
 * Workflow position: 2/5 (validates config from Job 0, passes to Job 2)
 * 
 * NOTE: This job no longer contains file type configurations.
 * All configs are defined in Job 0 (single source of truth) and passed via state.
 */
// STATE CONTRACT:
// Input:  { fileName, filePath, fileType, fileTypeConfigKey, fileTypeConfig, ... }
// Output: { fileName, filePath, fileType, fileTypeConfigKey, fileTypeConfig, metadataMappings, ... }

function loadMetadataMappings() { return {}; }

fn(async state => {
  console.log('📁 Job 1: Validating file configuration...');

  // Receive the full config from Job 0 - no lookup needed!
  const { fileTypeConfig, fileTypeConfigKey, fileName, filePath, fileType } = state;
  
  if (!fileTypeConfig) {
    throw new Error('Missing fileTypeConfig from Job 0. Ensure Job 0 matched a file and passed the complete config object.');
  }
  
  if (!fileTypeConfigKey) {
    throw new Error('Missing fileTypeConfigKey from Job 0.');
  }
  
  // Validate critical sections exist
  if (!fileTypeConfig.columnMappings) {
    console.warn('⚠️  No columnMappings in config - Job 2 may have issues parsing data');
  }
  
  if (!fileTypeConfig.uniqueValueCollectors) {
    console.warn('⚠️  No uniqueValueCollectors in config - Job 2 may not collect metadata properly');
  }
  
  if (!fileTypeConfig.builders) {
    console.warn('⚠️  No builders in config - Job 2 may not create DHIS2 structures');
  }
  
  console.log(`✅ Using configuration: ${fileTypeConfig.displayName} (${fileTypeConfigKey})`);
  console.log(`   • File: ${fileName}`);
  console.log(`   • Type: ${fileType}`);
  console.log(`   • Has columnMappings: ${!!fileTypeConfig.columnMappings}`);
  console.log(`   • Has uniqueValueCollectors: ${!!fileTypeConfig.uniqueValueCollectors}`);
  console.log(`   • Has builders: ${!!fileTypeConfig.builders}`);
  
  const metadataMappings = loadMetadataMappings();
  
  return { 
    ...state,
    fileTypeConfig,
    fileTypeConfigKey,
    metadataMappings,
  };
}); 

function inferFileType(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.csv') || lower.endsWith('.csv.csv')) return 'csv';
  return 'unknown';
}