// Job 1: CheckForTargetFile
// STATE CONTRACT:
// Input:  Initial state with optional config: { config?: {...overrides} }
// Output: { fileName, filePath, targetFileFound, noFilesToProcess, config }

// Master configuration - single source of truth for entire workflow
const MASTER_CONFIG = {
  // === JOB 1: FILE DISCOVERY ===
  targetFile: 'ART_data_long_format.xlsx',
  targetFilePattern: null,
  directory: '/data/excel-files',
  
  // === JOB 2: EXCEL PROCESSING ===
  chunkSize: 5000,
  maxLevels: 5, // Organization unit hierarchy depth
  
  // Clear column mapping: Excel column name → what it's used for
  columnMapping: {
    'Indicator_name': {
      uniqueValueKey: 'indicators',    // Collect unique values for metadata generation
      dataProcessingRole: 'indicator'  // Use as indicator in data processing
    },
    'IndicatorValue': {
      dataProcessingRole: 'value'      // Use as value in data processing
    },
    'Quarter': {
      uniqueValueKey: 'quarters',
      dataProcessingRole: 'period'
    },
    'Site': {
      uniqueValueKey: 'sites',
      dataProcessingRole: 'orgUnit'
    },
    'Region': {
      uniqueValueKey: 'regions'        // Only for metadata generation
    },
    'Zone': {
      uniqueValueKey: 'zones'
    },
    'District': {
      uniqueValueKey: 'districts'
    },
    'hsector': {
      uniqueValueKey: 'hsectors',
      dataProcessingRole: 'category'
    },
    'Reporting period': {
      uniqueValueKey: 'reportingPeriods'
    }
  },
  
  // === DHIS2 METADATA GENERATION ===
  countryConfig: {
    name: 'Malawi',
    shortName: 'Malawi',
    code: 'MW'
  },
  
  categoryConfig: {
    healthSector: {
      name: 'Health Sector',
      shortName: 'Health Sector',
      code: 'HEALTH_SECTOR'
    },
    reportingPeriodType: {
      name: 'Reporting Period Type',
      shortName: 'Report Period Type',
      code: 'REPORTING_PERIOD_TYPE'
    }
  }
};

// List files and check for target file
list('/data/excel-files', null, state => {
  console.log('📁 Job 1: Checking for Excel files...');
  
  const config = { ...MASTER_CONFIG, ...(state.config || {}) };
  const searchDirectory = config.directory;
  
  console.log(`🔧 Configuration:`);
  console.log(`   • Target file: ${config.targetFile}`);
  console.log(`   • Target pattern: ${config.targetFilePattern || 'none'}`);
  console.log(`   • Search directory: ${searchDirectory}`);
  console.log(`   • Chunk size: ${config.chunkSize}`);
  console.log(`   • Max levels: ${config.maxLevels}`);
  
  const allFiles = Array.isArray(state.data) ? state.data : [];
  const excelFiles = allFiles.filter(file => {
    const filename = typeof file === 'string' ? file : file.name;
    return filename && filename.endsWith('.xlsx');
  });
  
  console.log(`📄 Found ${excelFiles.length} Excel files`);
  
  if (excelFiles.length === 0) {
    console.log('📭 No Excel files found to process');
    return { 
      noFilesToProcess: true,
      targetFileFound: false,
      fileName: null,
      filePath: null,
      config,
      filesIndex: state.filesIndex || {}
    };
  }
  
  // Find target file using either exact match or pattern
  let targetFile = null;
  let matchedFileName = null;
  
  if (config.targetFilePattern) {
    // Use regex pattern matching
    const pattern = new RegExp(config.targetFilePattern, 'i');
    targetFile = excelFiles.find(file => {
      const filename = typeof file === 'string' ? file : file.name;
      return pattern.test(filename);
    });
    matchedFileName = targetFile ? (typeof targetFile === 'string' ? targetFile : targetFile.name) : null;
  } else {
    // Use exact file name matching
    targetFile = excelFiles.find(file => {
      const filename = typeof file === 'string' ? file : file.name;
      return filename === config.targetFile;
    });
    matchedFileName = config.targetFile;
  }
  
  if (!targetFile) {
    const searchCriteria = config.targetFilePattern ? `pattern '${config.targetFilePattern}'` : `file '${config.targetFile}'`;
    console.log(`❌ Target ${searchCriteria} not found`);
    return { 
      noFilesToProcess: true,
      targetFileFound: false,
      fileName: null,
      filePath: null,
      config,
      filesIndex: state.filesIndex || {}
    };
  }
  
  console.log(`✅ Found target file: ${matchedFileName}`);
  
  return { 
    targetFileFound: true,
    noFilesToProcess: false,
    fileName: matchedFileName,
    filePath: `${searchDirectory}/${matchedFileName}`,
    config,
    // Preserve filesIndex passed from Scan job
    filesIndex: state.filesIndex || {}
  };
}); 