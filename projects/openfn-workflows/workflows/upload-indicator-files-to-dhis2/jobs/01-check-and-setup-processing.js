/**
 * Job 1 – CheckForTargetFile
 * Role: Re-evaluates configuration, reloads per-file metadata, and confirms the file promoted from Job 0.
 * Workflow position: 2/5 (prepares parsing inputs for Job 2). Uses native state for index/config handoff.
 */
// STATE CONTRACT:
// Input:  { config, lock, filesIndex, fileName?, filePath?, fileType?, fileTypeConfigKey?, ... }
// Output: { targetFileFound, fileName, filePath, fileType, fileTypeConfig, metadataMappings, config, filesIndex }

/*
 * FILE TYPE CONFIGURATION TEMPLATE
 * 
 * To add a new file type, copy this template and fill in the fields:
 * 
 * your_file_type_key: {
 *   fileType: 'csv' or 'xlsx',
 *   displayName: 'Human Readable Name',
 *   description: 'Description of what this file contains',
 *   filePrefix: 'SOURCE_INDICATOR',  // e.g., 'PEPFAR_TxNEW' matches PEPFAR_TxNEW_*.csv
 *   // OR use filePatterns for complex matching:
 *   // filePatterns: ['*pattern*.xlsx'],
 *   
 *   columnMappings: { ... },
 *   headerMap: { ... },
 *   dhis2Config: { ... }
 * }
 */
const FILE_TYPE_CONFIGS = {
  art_data_long_format: {
    fileType: 'art_data_long_format',
    displayName: 'ART Data Long Format',
    description: 'Configuration for processing ART supervision data in long format',
    filePatterns: ['*ART*data*long*.xlsx', '*ART*data*long*.csv', 'ART_data_long_format.xlsx'],
    sheetConfig: { targetSheet: 0, headerRow: 1, dataStartRow: 2 },
    columnMappings: {
      facility: { sourceColumns: ['Facility','facility','Health Facility','Site','site','Site Name'], targetField: 'orgUnit', required: true },
      indicator: { sourceColumns: ['Indicator','indicator','Indicator Name','Data Element','TX_CURR','TX_CURR_MMD'], targetField: 'dataElement', required: true },
      value: { sourceColumns: ['Value','value','Count','Total','Result','tx_curr'], targetField: 'value', required: true, dataType: 'numeric' },
      period: { sourceColumns: ['Period','period','Month','Quarter','Reporting Period','Date_Submitted'], targetField: 'period', required: true, format: 'YYYYMM' },
      hsector: { sourceColumns: ['hsector','Health Sector'], targetField: 'categoryOptions.hsector', required: false },
      reportingPeriodType: { sourceColumns: ['reportingPeriodType','Reporting Period Type'], targetField: 'categoryOptions.reportingPeriodType', required: false }
    },
    headerMap: {
      site_id: 'site_id',
      facility: 'facility',
      indicator: 'indicator',
      sex: 'sex',
      age_group: 'age_group',
      Date_Submitted: 'Date_Submitted',
      tx_curr: 'tx_curr'
    },
    uniqueValueCollectors: {
      sites: { targetField: 'orgUnit' },
      indicators: { targetField: 'dataElement' },
      reportingPeriods: { targetField: 'categoryOptions.reportingPeriodType' },
      hsectors: { targetField: 'categoryOptions.hsector' }
    },
    builders: { dataElements: { uniqueValueKey: 'indicators', valueType: 'INTEGER', aggregationType: 'SUM', domainType: 'AGGREGATE' } },
    dhis2Builder: 'default',
    dhis2Config: {
      periodType: 'Quarterly',
      periodSource: 'filename',
      openFuturePeriods: 4
    }
  },
  pepfar_tx_curr_csv: {
    fileType: 'pepfar_tx_curr_csv',
    displayName: 'PEPFAR TxCURR CSV',
    description: 'PEPFAR CSV for TX_CURR indicator',
    filePrefix: 'PEPFAR_TxCURR',
    columnMappings: {
      facility: { sourceColumns: ['facility','Facility','Health Facility','Site','site','Site Name'], targetField: 'orgUnit', required: true },
      indicator: { sourceColumns: ['indicator','Indicator','TX_CURR'], targetField: 'dataElement', required: true },
      sex: { sourceColumns: ['sex','Sex'], targetField: 'categoryOptions.sex', required: false },
      age_group: { sourceColumns: ['age_group','Age Group','Age'], targetField: 'categoryOptions.ageGroup', required: false },
      Date_Submitted: { sourceColumns: ['Date_Submitted'], targetField: 'period', required: true },
      value: { sourceColumns: ['tx_curr','Value','value'], targetField: 'value', required: true, dataType: 'numeric' }
    },
    headerMap: {
      site_id: 'site_id',
      facility: 'facility',
      indicator: 'indicator',
      sex: 'sex',
      age_group: 'age_group',
      Date_Submitted: 'Date_Submitted',
      tx_curr: 'tx_curr'
    },
    dhis2Config: {
      periodType: 'Quarterly',
      periodSource: 'filename',
      openFuturePeriods: 4
    }
  },
  pepfar_tx_mmd_csv: {
    fileType: 'pepfar_tx_mmd_csv',
    displayName: 'PEPFAR TxCURR MMD CSV',
    description: 'PEPFAR CSV for TX_CURR_MMD indicator (MMD durations)',
    filePrefix: 'PEPFAR_TxCURRMMD',
    columnMappings: {
      facility: { sourceColumns: ['facility','Facility','Health Facility','Site','site','Site Name'], targetField: 'orgUnit', required: true },
      indicator: { sourceColumns: ['indicator','Indicator','TX_CURR_MMD'], targetField: 'dataElement', required: true },
      sex: { sourceColumns: ['sex','Sex'], targetField: 'categoryOptions.sex', required: false },
      age_group: { sourceColumns: ['age_group','Age Group','Age'], targetField: 'categoryOptions.ageGroup', required: false },
      Date_Submitted: { sourceColumns: ['Date_Submitted'], targetField: 'period', required: true },
      mmd_lt3: { sourceColumns: ['# of clients on <3 months of ARVs'], targetField: 'mmd_lt3', required: false, dataType: 'numeric' },
      mmd_3to5: { sourceColumns: ['# of clients on 3 - 5 months of ARVs'], targetField: 'mmd_3to5', required: false, dataType: 'numeric' },
      mmd_ge6: { sourceColumns: ['# of clients on >= 6 months of ARVs'], targetField: 'mmd_ge6', required: false, dataType: 'numeric' }
    },
    headerMap: {
      site_id: 'site_id',
      facility: 'facility',
      indicator: 'indicator',
      sex: 'sex',
      age_group: 'age_group',
      Date_Submitted: 'Date_Submitted',
      '# of clients on <3 months of ARVs': '# of clients on <3 months of ARVs',
      '# of clients on 3 - 5 months of ARVs': '# of clients on 3 - 5 months of ARVs',
      '# of clients on >= 6 months of ARVs': '# of clients on >= 6 months of ARVs'
    },
    dhis2Config: {
      periodType: 'Quarterly',
      periodSource: 'filename',
      openFuturePeriods: 4
    }
  },
  pepfar_tx_ml_csv: {
    fileType: 'pepfar_tx_ml_csv',
    displayName: 'PEPFAR TxML CSV',
    description: 'PEPFAR CSV for TX_ML indicator',
    filePrefix: 'PEPFAR_TxML',
    columnMappings: {
      facility: { sourceColumns: ['facility','Facility','Health Facility','Site','site','Site Name'], targetField: 'orgUnit', required: true },
      indicator: { sourceColumns: ['indicator','Indicator','TX_ML'], targetField: 'dataElement', required: true },
      sex: { sourceColumns: ['sex','Sex'], targetField: 'categoryOptions.sex', required: false },
      age_group: { sourceColumns: ['age_group','Age Group','Age'], targetField: 'categoryOptions.ageGroup', required: false },
      Date_Submitted: { sourceColumns: ['Date_Submitted'], targetField: 'period', required: true },
      value: { sourceColumns: ['value','Value'], targetField: 'value', required: true, dataType: 'numeric' }
    },
    headerMap: {
      site_id: 'site_id',
      facility: 'facility',
      indicator: 'indicator',
      sex: 'sex',
      age_group: 'age_group',
      Date_Submitted: 'Date_Submitted'
    },
    dhis2Config: {
      periodType: 'Quarterly',
      periodSource: 'filename',
      openFuturePeriods: 4
    }
  },
  pepfar_tx_new_csv: {
    fileType: 'pepfar_tx_new_csv',
    displayName: 'PEPFAR TxNEW CSV',
    description: 'PEPFAR CSV for TX_NEW indicator',
    filePrefix: 'PEPFAR_TxNEW',
    columnMappings: {
      facility: { sourceColumns: ['facility','Facility','Health Facility','Site','site','Site Name'], targetField: 'orgUnit', required: true },
      indicator: { sourceColumns: ['indicator','Indicator','TX_NEW'], targetField: 'dataElement', required: true },
      sex: { sourceColumns: ['sex','Sex'], targetField: 'categoryOptions.sex', required: false },
      age_group: { sourceColumns: ['age_group','Age Group','Age'], targetField: 'categoryOptions.ageGroup', required: false },
      Date_Submitted: { sourceColumns: ['Date_Submitted'], targetField: 'period', required: true },
      value: { sourceColumns: ['value','Value'], targetField: 'value', required: true, dataType: 'numeric' }
    },
    headerMap: {
      site_id: 'site_id',
      facility: 'facility',
      indicator: 'indicator',
      sex: 'sex',
      age_group: 'age_group',
      Date_Submitted: 'Date_Submitted'
    },
    dhis2Config: {
      periodType: 'Quarterly',
      periodSource: 'filename',
      openFuturePeriods: 4
    }
  },
  pepfar_tx_rtt_csv: {
    fileType: 'pepfar_tx_rtt_csv',
    displayName: 'PEPFAR TxRTT CSV',
    description: 'PEPFAR CSV for TX_RTT indicator',
    filePrefix: 'PEPFAR_TxRTT',
    columnMappings: {
      facility: { sourceColumns: ['facility','Facility','Health Facility','Site','site','Site Name'], targetField: 'orgUnit', required: true },
      indicator: { sourceColumns: ['indicator','Indicator','TX_RTT'], targetField: 'dataElement', required: true },
      sex: { sourceColumns: ['sex','Sex'], targetField: 'categoryOptions.sex', required: false },
      age_group: { sourceColumns: ['age_group','Age Group','Age'], targetField: 'categoryOptions.ageGroup', required: false },
      Date_Submitted: { sourceColumns: ['Date_Submitted'], targetField: 'period', required: true },
      value: { sourceColumns: ['value','Value'], targetField: 'value', required: true, dataType: 'numeric' }
    },
    headerMap: {
      site_id: 'site_id',
      facility: 'facility',
      indicator: 'indicator',
      sex: 'sex',
      age_group: 'age_group',
      Date_Submitted: 'Date_Submitted'
    },
    dhis2Config: {
      periodType: 'Quarterly',
      periodSource: 'filename',
      openFuturePeriods: 4
    }
  },
  moh_direct_queries: {
    fileType: 'moh_direct_queries',
    displayName: 'MoH Direct Queries Reports',
    description: 'Mapping for MoH direct query reports (quarterly)',
    filePatterns: ['*Direct*Queries*.xlsx', '*MoH*Reports*.xlsx', 'Direct Queries - Q1 2025 MoH Reports.xlsx'],
    sheetConfig: { targetSheet: 0, headerRow: 1, dataStartRow: 2 },
    columnMappings: {
      orgUnit: { sourceColumns: ['Facility','facility','Health Facility','Site','Facility Name'], targetField: 'orgUnit', required: true },
      dataElement: { sourceColumns: ['Indicator','indicator','Query','Data Element','Measure'], targetField: 'dataElement', required: true },
      value: { sourceColumns: ['Value','value','Result','Count','Total'], targetField: 'value', required: true, dataType: 'numeric' },
      period: { sourceColumns: ['Period','period','Quarter','Month','Reporting Period'], targetField: 'period', required: true, format: 'flexible' }
    },
    headerMap: {},
    uniqueValueCollectors: {
      sites: { targetField: 'orgUnit' },
      indicators: { targetField: 'dataElement' }
    },
    builders: { dataElements: { uniqueValueKey: 'indicators', valueType: 'INTEGER', aggregationType: 'SUM', domainType: 'AGGREGATE' } },
    dhis2Builder: 'default',
    dhis2Config: {
      periodType: 'Quarterly',
      periodSource: 'filename',
      openFuturePeriods: 4
    }
  }
};

function loadFileTypeConfigs() { return FILE_TYPE_CONFIGS; }
function loadMetadataMappings() { return {}; }

fn(async state => {
  console.log('📁 Job 1: Selecting target indicator file...');

  const params = state.params || {};
  const previousConfig = state.config || {};
  const config = { ...previousConfig, ...params };

  // Trust Job 0 selection
  const selectedName = state.fileName || config.targetFile || null;
  const selectedPath = state.filePath || null;
  const selectedType = state.fileType || (selectedName ? inferFileType(selectedName) : null);
  const selectedKey = state.fileTypeConfigKey || null;

  if (!selectedName || !selectedPath || !selectedType || !selectedKey) {
    throw new Error('Missing file selection from Job 0. Ensure Job 0 ran and set fileName, filePath, fileType, and fileTypeConfigKey.');
  }

  // Load canonical FILE_TYPE_CONFIGS defined in this job only (mapping/schema)
  const fileTypeConfigs = loadFileTypeConfigs();
  const fileTypeConfig = fileTypeConfigs[selectedKey];
  if (!fileTypeConfig) {
    throw new Error(`Unknown fileTypeConfigKey '${selectedKey}' from Job 0.`);
  }

  const metadataMappings = loadMetadataMappings();
  
  return { 
    ...state,
    fileName: selectedName,
    filePath: selectedPath,
    fileType: selectedType,
    fileTypeConfigKey: selectedKey,
    fileTypeConfig,
    metadataMappings,
  };
}); 

function inferFileType(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.csv') || lower.endsWith('.csv.csv')) return 'csv';
  return 'unknown';
}