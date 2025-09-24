/**
 * Job 1 – CheckForTargetFile
 * Role: Re-evaluates configuration, reloads per-file metadata, and confirms the file promoted from Job 0.
 * Workflow position: 2/5 (prepares parsing inputs for Job 2). Uses native state for index/config handoff.
 */
// STATE CONTRACT:
// Input:  { config, lock, filesIndex, fileName?, filePath?, fileType?, fileTypeConfigKey?, ... }
// Output: { targetFileFound, fileName, filePath, fileType, fileTypeConfig, metadataMappings, config, filesIndex }

// No external imports; inline minimal file-type configs and helpers
const FILE_TYPE_CONFIGS = {
  art_data_long_format: {
    fileType: 'art_data_long_format',
    displayName: 'ART Data Long Format',
    description: 'Configuration for processing ART supervision data in long format',
    filePatterns: ['*ART*data*long*.xlsx', '*ART*data*long*.csv', 'ART_data_long_format.xlsx'],
    sheetConfig: { targetSheet: 0, headerRow: 1, dataStartRow: 2 },
    columnMappings: {
      facility: { sourceColumns: ['Facility','facility','Health Facility','Site'], targetField: 'orgUnit', required: true },
      indicator: { sourceColumns: ['Indicator','indicator','Indicator Name','Data Element'], targetField: 'dataElement', required: true },
      value: { sourceColumns: ['Value','value','Count','Total','Result'], targetField: 'value', required: true, dataType: 'numeric' },
      period: { sourceColumns: ['Period','period','Month','Quarter','Reporting Period'], targetField: 'period', required: true, format: 'YYYYMM' },
    },
    headerMap: {},
    builders: { dataElements: { uniqueValueKey: 'indicators', valueType: 'INTEGER', aggregationType: 'SUM', domainType: 'AGGREGATE' } },
    dhis2Builder: 'default'
  }
};

function loadFileTypeConfigs() { return FILE_TYPE_CONFIGS; }
function loadMetadataMappings() { return {}; }
function matchFileToConfig(fileName, configs) {
  const name = String(fileName || '');
  for (const key of Object.keys(configs)) {
    const cfg = configs[key];
    const patterns = (cfg.filePatterns || []).map(p => new RegExp('^' + p
      .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
      .replace(/\*/g, '.*') + '$', 'i'));
    if (patterns.some(rx => rx.test(name))) return cfg;
  }
  return null;
}

const MASTER_CONFIG = {
  directory: '/data/excel-files',
  chunkSize: 5000,
  maxLevels: 5,
  fileTypeConfigKey: null,
  columnMapping: {}
};

list('/data/excel-files', null, async state => {
  console.log('📁 Job 1: Selecting target indicator file...');

  const params = state.params || {};
  const previousConfig = state.config || {};
  const config = {
    ...MASTER_CONFIG,
    ...previousConfig,
    ...params,
    directory: params.directory || previousConfig.directory || MASTER_CONFIG.directory
  };

  const fileTypeConfigs = loadFileTypeConfigs({ params, config });
  const metadataMappings = loadMetadataMappings({ params, config });

  const filesIndex = { ...(state.filesIndex || {}) };

  const searchDirectory = config.directory;
  console.log(`🔧 Configuration:`);
  console.log(`   • Search directory: ${searchDirectory}`);
  console.log(`   • Chunk size: ${config.chunkSize}`);
  console.log(`   • Max levels: ${config.maxLevels}`);

  const allFiles = Array.isArray(state.data) ? state.data : [];
  const candidateFiles = allFiles
    .map(file => (typeof file === 'string' ? { name: file } : file))
    .filter(file => {
      const filename = file?.name;
      if (!filename) return false;
      const lower = filename.toLowerCase();
      return lower.endsWith('.xlsx') || lower.endsWith('.csv') || lower.endsWith('.csv.csv');
    })
    .map(file => {
      const name = file.name;
      const match = fileTypeConfigs ? matchFileToConfig(name, fileTypeConfigs) : null;
      return {
        name,
        path: `${searchDirectory}/${name}`,
        fileType: inferFileType(name),
        fileTypeConfigKey: match ? (match.fileType || match.fileTypeId) : null,
        fileTypeConfig: match
      };
    })
    .filter(file => file.fileTypeConfigKey);

  console.log(`📄 Found ${candidateFiles.length} candidate files (.xlsx/.csv)`);

  if (candidateFiles.length === 0) {
    console.log('📭 No indicator files matched configured patterns');
    return {
      noFilesToProcess: true,
      targetFileFound: false,
      fileName: null,
      filePath: null,
      config,
      filesIndex,
      metadataMappings
    };
  }

  let targetFile = null;
  if (config.targetFile) {
    targetFile = candidateFiles.find(file => file.name === config.targetFile);
  } else if (config.targetFilePattern) {
    const pattern = new RegExp(config.targetFilePattern, 'i');
    targetFile = candidateFiles.find(file => pattern.test(file.name));
  }

  if (!targetFile) {
    targetFile = candidateFiles[0];
  }

  if (!targetFile) {
    console.log('❌ No candidate file selected after filtering');
    return {
      noFilesToProcess: true,
      targetFileFound: false,
      fileName: null,
      filePath: null,
      config,
      filesIndex,
      metadataMappings
    };
  }

  console.log(`✅ Selected file: ${targetFile.name} (type=${targetFile.fileType})`);

  const mergedConfig = {
    ...config,
    fileTypeConfigKey: targetFile.fileTypeConfigKey,
    chunkSize: targetFile.fileTypeConfig?.chunkSize || config.chunkSize,
    columnMapping: targetFile.fileTypeConfig?.columnMappings || config.columnMapping
  };

  state.targetFileFound = true;
  state.noFilesToProcess = false;
  state.fileName = targetFile.name;
  state.filePath = targetFile.path;
  state.fileType = targetFile.fileType;
  state.fileTypeConfig = targetFile.fileTypeConfig;
  state.metadataMappings = metadataMappings;
  state.config = mergedConfig;
  state.filesIndex = filesIndex;

  // Trim transient listing data to keep inherited state lean
  delete state.data;
  delete state.references;

  return state;
});

function inferFileType(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.csv') || lower.endsWith('.csv.csv')) return 'csv';
  return 'unknown';
}