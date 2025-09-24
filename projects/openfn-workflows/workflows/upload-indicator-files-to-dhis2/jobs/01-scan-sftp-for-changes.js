/**
 * Job 0 – ScanSftpForChanges
 * Role: Entry point that secures a workflow lock, scans SFTP for candidate indicator files,
 *       and seeds state for downstream processing.
 * Workflow position: 1/5 (feeds Job 1 with the selected file and refreshed index metadata).
 * Notes: Uses native OpenFn state to carry `filesIndex` and lock info between cron runs. Tracks a simple owner token
 *        (`workflow-owner`) so subsequent jobs can validate control of the lock.
 */
// STATE CONTRACT:
// Input:  {}
// Output: { hasFileToProcess, config, lock, filesIndex, fileName?, filePath?, fileType?, fileTypeConfigKey?, metadataMappingsKey? }

// adaptor operations are available globally in Lightning; no imports

const LOCK_KEY = 'workflow-lock';
const WORKFLOW_OWNER_KEY = 'workflow-owner';

const FILE_TYPE_CONFIGS = {
  art_data_long_format: {
    fileType: 'art_data_long_format',
    displayName: 'ART Data Long Format',
    description: 'Configuration for processing ART supervision data in long format',
    filePatterns: ['*ART*data*long*.xlsx', '*ART*data*long*.csv', 'ART_data_long_format.xlsx'],
    sheetConfig: {
      targetSheet: 0,
      headerRow: 1,
      dataStartRow: 2
    },
    columnMappings: {
      facility: {
        sourceColumns: ['Facility', 'facility', 'Health Facility', 'Site'],
        targetField: 'orgUnit',
        required: true
      },
      indicator: {
        sourceColumns: ['Indicator', 'indicator', 'Indicator Name', 'Data Element'],
        targetField: 'dataElement',
        required: true
      },
      value: {
        sourceColumns: ['Value', 'value', 'Count', 'Total', 'Result'],
        targetField: 'value',
        required: true,
        dataType: 'numeric'
      },
      period: {
        sourceColumns: ['Period', 'period', 'Month', 'Quarter', 'Reporting Period'],
        targetField: 'period',
        required: true,
        format: 'YYYYMM'
      },
      ageGroup: {
        sourceColumns: ['Age Group', 'age_group', 'Age', 'Age Category'],
        targetField: 'categoryOptions.ageGroup',
        required: false
      },
      gender: {
        sourceColumns: ['Gender', 'gender', 'Sex'],
        targetField: 'categoryOptions.gender',
        required: false
      },
      artRegimen: {
        sourceColumns: ['ART Regimen', 'Regimen', 'Treatment'],
        targetField: 'categoryOptions.artRegimen',
        required: false
      }
    },
    dataValidation: {
      rules: [
        {
          field: 'value',
          type: 'numeric',
          min: 0,
          max: 999999,
          allowNull: false
        },
        {
          field: 'period',
          type: 'regex',
          pattern: '^\\d{6}$',
          message: 'Period must be in YYYYMM format'
        },
        {
          field: 'indicator',
          type: 'notEmpty',
          message: 'Indicator name cannot be empty'
        }
      ],
      skipEmptyRows: true,
      stopOnError: false
    },
    transformations: [
      {
        field: 'period',
        type: 'dateFormat',
        from: ['MM/YYYY', 'MM-YYYY', 'MMMM YYYY'],
        to: 'YYYYMM'
      },
      {
        field: 'value',
        type: 'numeric',
        removeCommas: true,
        defaultValue: 0
      }
    ],
    uniqueValueCollectors: {
      sites: { targetField: 'orgUnit' },
      indicators: { targetField: 'dataElement' },
      quarters: { targetField: 'period' },
      hsectors: { targetField: 'categoryOptions.hsector' },
      reportingPeriods: { targetField: 'categoryOptions.reportingPeriodType' },
      regions: { targetField: 'Region' },
      zones: { targetField: 'Zone' },
      districts: { targetField: 'District' }
    },
    orgUnitHierarchy: [
      { childField: 'orgUnit', parentField: 'District' },
      { childField: 'District', parentField: 'Zone' },
      { childField: 'Zone', parentField: 'Region' }
    ],
    builders: {
      orgUnits: {
        levels: [
          { level: 2, uniqueValueKey: 'regions', parentKey: 'root' },
          { level: 3, uniqueValueKey: 'zones', parentKey: 'Region' },
          { level: 4, uniqueValueKey: 'districts', parentKey: 'Zone' },
          { level: 5, uniqueValueKey: 'sites', parentKey: 'District' }
        ]
      },
      categories: [
        { name: 'Health Sector', shortName: 'Health Sector', code: 'HEALTH_SECTOR', uniqueValueKey: 'hsectors' },
        { name: 'Reporting Period Type', shortName: 'Report Period Type', code: 'REPORTING_PERIOD_TYPE', uniqueValueKey: 'reportingPeriods' }
      ],
      dataElements: { uniqueValueKey: 'indicators' }
    },
    aggregation: {
      enabled: false,
      groupBy: ['orgUnit', 'dataElement', 'period', 'categoryOptions'],
      method: 'sum'
    },
    dhis2Config: {
      dataSetId: 'ARTSupervisionDataSet',
      importStrategy: 'CREATE_AND_UPDATE',
      skipAudit: false,
      dryRun: false,
      idScheme: 'UID',
      orgUnitIdScheme: 'CODE'
    }
  },
  dq_sites: {
    fileType: 'dq_sites',
    displayName: 'Data Quality Sites Report',
    description: 'Configuration for processing quarterly DQ site reports',
    filePatterns: ['*Q*FY*DQ*sites*.xlsx', '*DQ*253*sites*.xlsx', 'Q2FY25_DQ_253_sites.xlsx'],
    sheetConfig: {
      targetSheet: 0,
      headerRow: 1,
      dataStartRow: 2
    },
    columnMappings: {
      site: {
        sourceColumns: ['Site', 'site', 'Facility', 'Health Facility', 'Site Name'],
        targetField: 'orgUnit',
        required: true
      },
      indicator: {
        sourceColumns: ['Indicator', 'indicator', 'Data Element', 'Measure'],
        targetField: 'dataElement',
        required: true
      },
      value: {
        sourceColumns: ['Value', 'value', 'Score', 'Result', 'Count'],
        targetField: 'value',
        required: true,
        dataType: 'numeric'
      },
      period: {
        sourceColumns: ['Period', 'period', 'Quarter', 'Reporting Period'],
        targetField: 'period',
        required: true,
        format: 'YYYYQQ'
      },
      dataQualityScore: {
        sourceColumns: ['DQ Score', 'Quality Score', 'Score', 'Completeness'],
        targetField: 'attributeOptions.dqScore',
        required: false,
        dataType: 'numeric'
      },
      completeness: {
        sourceColumns: ['Completeness', 'completeness', 'Complete %', 'Reporting Rate'],
        targetField: 'attributeOptions.completeness',
        required: false,
        dataType: 'percentage'
      },
      timeliness: {
        sourceColumns: ['Timeliness', 'timeliness', 'On Time', 'Timely Submission'],
        targetField: 'attributeOptions.timeliness',
        required: false,
        dataType: 'percentage'
      }
    },
    dataValidation: {
      rules: [
        {
          field: 'value',
          type: 'numeric',
          min: 0,
          max: 999999,
          allowNull: false
        },
        {
          field: 'period',
          type: 'regex',
          pattern: '^\\d{4}Q[1-4]$',
          message: 'Period must be in YYYYQQ format (e.g., 2025Q2)'
        },
        {
          field: 'dataQualityScore',
          type: 'numeric',
          min: 0,
          max: 100,
          allowNull: true
        }
      ],
      skipEmptyRows: true,
      stopOnError: false
    },
    transformations: [
      {
        field: 'period',
        type: 'quarterToMonth',
        from: ['Q1 FY25', 'Q2 FY25', 'Q3 FY25', 'Q4 FY25', 'Q1FY25', 'Q2FY25'],
        fiscalYearStart: 7,
        to: 'YYYYMM'
      },
      {
        field: 'value',
        type: 'numeric',
        removeCommas: true,
        defaultValue: 0
      },
      {
        field: 'completeness',
        type: 'percentage',
        from: 'decimal',
        to: 'whole'
      }
    ],
    aggregation: {
      enabled: false,
      groupBy: ['orgUnit', 'dataElement', 'period'],
      method: 'average'
    },
    dhis2Config: {
      dataSetId: 'DataQualityMonitoring',
      importStrategy: 'CREATE_AND_UPDATE',
      skipAudit: false,
      dryRun: false,
      idScheme: 'UID',
      orgUnitIdScheme: 'CODE'
    }
  },
  moh_direct_queries: {
    fileType: 'moh_direct_queries',
    displayName: 'MoH Direct Queries Reports',
    description: 'Configuration for processing quarterly MoH direct query reports',
    filePatterns: ['*Direct*Queries*.xlsx', '*MoH*Reports*.xlsx', 'Direct Queries - Q1 2025 MoH Reports.xlsx'],
    sheetConfig: {
      multiSheet: true,
      sheetPatterns: ['HIV*', 'TB*', 'Malaria*', 'Summary'],
      headerRow: 1,
      dataStartRow: 2
    },
    columnMappings: {
      facility: {
        sourceColumns: ['Facility', 'facility', 'Health Facility', 'Site', 'Facility Name'],
        targetField: 'orgUnit',
        required: true
      },
      district: {
        sourceColumns: ['District', 'district', 'District Name'],
        targetField: 'orgUnitParent',
        required: false
      },
      indicator: {
        sourceColumns: ['Indicator', 'indicator', 'Query', 'Data Element', 'Measure'],
        targetField: 'dataElement',
        required: true
      },
      value: {
        sourceColumns: ['Value', 'value', 'Result', 'Count', 'Total'],
        targetField: 'value',
        required: true,
        dataType: 'numeric'
      },
      numerator: {
        sourceColumns: ['Numerator', 'numerator', 'Num'],
        targetField: 'numerator',
        required: false,
        dataType: 'numeric'
      },
      denominator: {
        sourceColumns: ['Denominator', 'denominator', 'Denom', 'Den'],
        targetField: 'denominator',
        required: false,
        dataType: 'numeric'
      },
      period: {
        sourceColumns: ['Period', 'period', 'Quarter', 'Month', 'Reporting Period'],
        targetField: 'period',
        required: true,
        format: 'flexible'
      },
      target: {
        sourceColumns: ['Target', 'target', 'Expected', 'Goal'],
        targetField: 'attributeOptions.target',
        required: false,
        dataType: 'numeric'
      },
      comment: {
        sourceColumns: ['Comment', 'comment', 'Note', 'Remark'],
        targetField: 'comment',
        required: false
      }
    },
    dataValidation: {
      rules: [
        {
          field: 'value',
          type: 'numeric',
          min: 0,
          max: 9999999,
          allowNull: false
        },
        {
          field: 'period',
          type: 'flexible',
          formats: ['YYYYMM', 'YYYY-MM', 'MMM YYYY', 'Q[1-4] YYYY', 'YYYY Q[1-4]'],
          message: 'Period must be a valid date format'
        },
        {
          field: 'numerator',
          type: 'conditionalRequired',
          condition: 'denominator',
          message: 'Numerator required when denominator is present'
        }
      ],
      skipEmptyRows: true,
      stopOnError: false,
      customValidation: {
        checkPercentages: true,
        checkOutliers: true,
        outlierThreshold: 3.5
      }
    },
    transformations: [
      {
        field: 'period',
        type: 'flexibleDateParse',
        formats: [
          { from: 'Q1 2025', to: '202501' },
          { from: 'Q2 2025', to: '202504' },
          { from: 'Q3 2025', to: '202507' },
          { from: 'Q4 2025', to: '202510' },
          { from: 'January 2025', to: '202501' },
          { from: 'Jan 2025', to: '202501' }
        ],
        defaultQuarterStart: true
      },
      {
        field: 'value',
        type: 'calculateIfMissing',
        formula: 'numerator / denominator * 100',
        condition: 'numerator && denominator && !value',
        precision: 2
      },
      {
        field: 'orgUnit',
        type: 'lookup',
        lookupFile: '../metadata/org_unit_mapping.json',
        keyField: 'name',
        valueField: 'id'
      }
    ],
    aggregation: {
      enabled: true,
      groupBy: ['orgUnit', 'dataElement', 'period'],
      method: 'sum',
      handleDuplicates: 'warn'
    },
    dhis2Config: {
      dataSetId: 'MoHQuarterlyReports',
      importStrategy: 'CREATE_AND_UPDATE',
      skipAudit: false,
      dryRun: false,
      idScheme: 'UID',
      orgUnitIdScheme: 'CODE',
      dataElementIdScheme: 'CODE',
      preheatCache: true
    },
    postProcessing: {
      generateSummaryReport: true,
      validateAgainstTargets: true,
      calculateIndicators: [
        {
          name: 'ART Coverage',
          formula: 'CurrentOnART / EstimatedPLHIV * 100',
          dataElements: ['CurrentOnART', 'EstimatedPLHIV']
        }
      ]
    }
  }
};

function loadFileTypeConfigs() {
  return deepClone(FILE_TYPE_CONFIGS);
}

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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

execute(fn(async state => {
  console.log('🔎 Job 0: Scanning SFTP directory for new/updated indicator files...');

  const params = state.params || {};
  const baseConfig = state.config || {};
  const config = {
    directory: '/data/excel-files',
    targetFilePatterns: ['^ART_data.*\\.(xlsx|csv)(\\.csv)?$'],
    fileTypesEnabled: ['xlsx', 'csv'],
    lockTtlSeconds: 600,
    pruneProcessedAfterDays: 30,
    ...baseConfig,
    ...params
  };

  const now = Date.now();
  const lockTtlMillis = (config.lockTtlSeconds || 600) * 1000;
  const existingLock = state.workflowLock;
  const existingExpires = existingLock?.expiresAt ? new Date(existingLock.expiresAt).getTime() : 0;

  if (existingLock && existingLock.key === LOCK_KEY && existingExpires > now) {
    console.log('🔒 Another run currently holds the workflow lock.');
    return {
      ...state,
      hasFileToProcess: false,
      config,
      lock: existingLock
    };
  }

  const owner = state[WORKFLOW_OWNER_KEY] || state.configuration?.runId || state.runId || `openfn-${Math.random().toString(16).slice(2)}`;

  const lock = {
    key: LOCK_KEY,
    owner,
    acquiredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + lockTtlMillis).toISOString()
  };

  state.workflowLock = lock;
  state.lock = lock;
  state[WORKFLOW_OWNER_KEY] = owner;

  if (!state.filesIndex) state.filesIndex = {};
  const filesIndex = { ...state.filesIndex };

  if (pruneOldEntries(filesIndex, config.pruneProcessedAfterDays || 30)) {
    state.filesIndex = filesIndex;
  }

  const fileTypeConfigs = FILE_TYPE_CONFIGS; // already inlined
  console.log(`   • Loaded ${Object.keys(fileTypeConfigs).length} file-type configs`);

  const directory = config.directory;
  const patternStrings = Array.isArray(config.targetFilePatterns) && config.targetFilePatterns.length > 0
    ? config.targetFilePatterns
    : ['^ART_data.*\\.(xlsx|csv)(\\.csv)?$'];
  const patterns = patternStrings.map(p => new RegExp(p, 'i'));

  console.log(`   • Directory: ${directory}`);
  console.log(`   • Patterns: ${patternStrings.join(' | ')}`);
  console.log(`   • Enabled types: ${config.fileTypesEnabled.join(', ')}`);

  return list(directory, null, async listingState => {
    const entries = Array.isArray(listingState.data) ? listingState.data : [];
    const nowIso = new Date().toISOString();

    const normalize = f => {
      if (typeof f === 'string') {
        return { name: f, size: null, mtime: null };
      }
      const mtime = f.mtime || f.modifyTime || f.modTime || f.date || null;
      const size = f.size || f.length || null;
      const name = f.name || String(f.filename || '');
      return { name, size, mtime };
    };

    const files = entries
      .map(normalize)
      .filter(f => f.name && patterns.some(rx => rx.test(f.name)))
      .map(file => ({
        ...file,
        fileType: inferFileType(file.name),
        fileTypeConfig: matchFileToConfig(file.name, fileTypeConfigs)
      }))
      .filter(f => config.fileTypesEnabled.includes(f.fileType));

    console.log(`   • Matched files: ${files.length}`);

    const nextFilesIndex = { ...filesIndex };
    const candidates = [];

    for (const file of files) {
      const key = file.name;
      const existing = filesIndex[key] || {};
      const seenBefore = Boolean(existing.path);
      const changedSize = existing.size !== undefined && file.size !== null && existing.size !== file.size;
      const changedMtime = existing.mtime && file.mtime && existing.mtime !== file.mtime;
      const notProcessed = existing.processed !== true;
      const fileChanged = changedSize || changedMtime;

      nextFilesIndex[key] = {
        path: `${directory}/${file.name}`,
        lastSeenAt: nowIso,
        size: file.size || existing.size || null,
        mtime: file.mtime || existing.mtime || null,
        processed: existing.processed === true && !fileChanged ? true : false,
        status: notProcessed || fileChanged ? 'pending' : existing.status || 'completed',
        lastProcessedAt: existing.lastProcessedAt || null,
        fileType: file.fileType,
        fileTypeConfigKey: file.fileTypeConfig ? (file.fileTypeConfig.fileType || file.fileTypeConfig.fileTypeId) : existing.fileTypeConfigKey || null
      };

      if (!file.fileTypeConfig) {
        console.warn(`   ⚠️ No file-type config matched for ${file.name}`);
        continue;
      }

      const isCandidate = !seenBefore || notProcessed || fileChanged;
      if (isCandidate) {
        candidates.push({
          name: file.name,
          path: `${directory}/${file.name}`,
          size: file.size,
          mtime: file.mtime,
          fileType: file.fileType,
          fileTypeConfigKey: nextFilesIndex[key].fileTypeConfigKey
        });
      }
    }

    candidates.sort((a, b) => {
      const am = a.mtime ? new Date(a.mtime).getTime() : 0;
      const bm = b.mtime ? new Date(b.mtime).getTime() : 0;
      if (bm !== am) return bm - am;
      return a.name.localeCompare(b.name);
    });

    const nextFile = candidates[0];

    if (!nextFile) {
      state.filesIndex = nextFilesIndex;
      state.workflowLock = null;
      state.lock = null;

      delete state.data;
      delete state.references;

      return {
        ...state,
        hasFileToProcess: false,
        config
      };
    }

    console.log(`📄 Next file selected: ${nextFile.name}`);

    const nextConfig = {
      ...config,
      targetFile: nextFile.name,
      targetFilePattern: null
    };

    const marked = {
      ...nextFilesIndex[nextFile.name],
      status: 'inflight',
      inflight: {
        ...(nextFilesIndex[nextFile.name]?.inflight || {}),
        startedAt: new Date().toISOString()
      }
    };
    nextFilesIndex[nextFile.name] = marked;

    state.filesIndex = nextFilesIndex;
    state.workflowLock = lock;
    state.lock = lock;

    delete state.data;
    delete state.references;

    return {
      ...state,
      hasFileToProcess: true,
      fileName: nextFile.name,
      filePath: nextFile.path,
      fileType: nextFile.fileType,
      fileTypeConfigKey: nextFile.fileTypeConfigKey,
      config: nextConfig
    };
  })(state);
}));

// Local helper to infer file type from filename
function inferFileType(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.csv') || lower.endsWith('.csv.csv')) return 'csv';
  return 'unknown';
}

function pruneOldEntries(filesIndex, days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let changed = false;

  Object.entries(filesIndex).forEach(([fileName, entry]) => {
    if (entry.processed && entry.lastProcessedAt) {
      const processedAt = new Date(entry.lastProcessedAt).getTime();
      if (!Number.isNaN(processedAt) && processedAt < cutoff) {
        delete filesIndex[fileName];
        changed = true;
      }
    }
  });

  return changed;
}







