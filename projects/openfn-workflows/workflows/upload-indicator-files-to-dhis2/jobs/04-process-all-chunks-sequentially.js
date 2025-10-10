/**
 * Job 4 – ProcessAndUploadChunks
 * Role: Streams file chunks, builds DHIS2 payloads, and uploads them sequentially.
 * Workflow position: 5/5 (final processing + cleanup). Native state tracks progress/resume info.
 */

executeWithSftp(
  fn(state => {
    const { fileName, totalChunks, chunkSize, filePath, fileType, data: { dhis2Mappings } } = state;
    if (!fileName || !totalChunks || !filePath) {
      throw new Error('Missing required state: fileName, totalChunks, and filePath must be provided.');
    }
    if (!dhis2Mappings) {
      throw new Error('Missing DHIS2 mappings from previous job.');
    }

    console.log(`🚀 Job 4: Starting batch processing (${fileType})`);
    console.log(`📊 Total chunks: ${totalChunks}, chunk size: ${chunkSize}`);

    // Preserve DHIS2 configuration explicitly for later upload calls
    state.__dhis2Config = state.configuration;

    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
      chunks.push({
        index: i,
        number: i + 1,
        size: chunkSize,
        filePath,
        fileName,
        totalChunks,
        fileType,
        dhis2Mappings,
        fileTypeConfig: state.fileTypeConfig,
        metadataMappings: state.metadataMappings,
        config: state.config,
        configuration: state.configuration,
        dhis2Config: state.__dhis2Config
      });
    }

    state.chunks = chunks;
    state.chunkResults = [];
    state.batchProcessingStartTime = new Date().toISOString();
    state.data = {
      ...state.data,
      chunks
    };

    // Return promise from updateIndex, then return state
    return updateIndex(state, fileName, {
      status: 'processing',
      inProgressAt: new Date().toISOString(),
      totalChunks,
      chunkSize
    }).then(() => state);
  }),

  each('chunks[*]', fn(state => {
    const chunk = state.data;
    const { index, filePath, size, totalChunks, fileType, dhis2Mappings, fileTypeConfig, metadataMappings } = chunk;
    
    console.log(`📦 Processing chunk ${index + 1}/${totalChunks}`);
    
    // Prepare config synchronously
    const cfgForDhis = chunk.dhis2Config || state.__dhis2Config || state.configuration;
    const headerMapFromIndex = (state.filesIndex && state.fileName && state.filesIndex[state.fileName] && state.filesIndex[state.fileName].headerMap) || {};
    const headerMap = (chunk.fileTypeConfig && chunk.fileTypeConfig.headerMap) || headerMapFromIndex || {};
    let datasetPeriodType = (fileTypeConfig && fileTypeConfig.dhis2Config && fileTypeConfig.dhis2Config.periodType) || 'Monthly';

    // Determine period derivation strategy (synchronous)
    const periodSource = (fileTypeConfig && fileTypeConfig.dhis2Config && fileTypeConfig.dhis2Config.periodSource) || 'filename';
    const fixedPeriodRaw = (fileTypeConfig && fileTypeConfig.dhis2Config && fileTypeConfig.dhis2Config.fixedPeriod) || null;
    const filename = state.fileName || chunk.fileName || '';
    let derivedPeriod = null;
    if (periodSource === 'fixed' && fixedPeriodRaw) {
      derivedPeriod = String(fixedPeriodRaw);
    } else if (periodSource === 'filename') {
      try {
        const m = filename.match(/_(\d{4})_Q([1-4])_/i);
        if (m) derivedPeriod = `${m[1]}Q${m[2]}`;
      } catch (_) {}
    }
    const overridePeriod = derivedPeriod ? normalizePeriodForPeriodType(derivedPeriod, datasetPeriodType) : null;
    if (overridePeriod) {
      console.log(`   ℹ️ Using override period from ${periodSource}: ${overridePeriod} (dataset periodType=${datasetPeriodType})`);
    }
    
    // Start promise chain with CSV/Excel read
    const readPromise = fileType === 'xlsx'
      ? getExcelChunk(filePath, index, size)(state)
      : getCsvChunk(filePath, index, size)({ ...state, configuration: state.configuration });
    
    return readPromise.then(chunkState => {
      // Process chunk data (synchronous)
      const records = fileType === 'xlsx'
        ? normalizeXlsxChunk(chunkState.chunkData, fileTypeConfig)
        : chunkState.chunkData.map(row => applyHeaderMap(row, headerMap));
      
      if (!records || records.length === 0) {
        console.log('   ⚠️ Chunk empty; skipping upload');
        return {
          ...state,
          references: [
            ...(state.references || []),
            {
              chunkIndex: index,
              uploadSuccess: true,
              rowsProcessed: 0,
              dataValuesUploaded: 0,
              message: 'Empty chunk'
            }
          ]
        };
      }
      
      // Build data values (synchronous)
      const useCodeSchemeForValues = !dhis2Mappings.dataElements || Object.keys(dhis2Mappings.dataElements).length === 0;
      const useNameOrgUnitsForValues = !dhis2Mappings.orgUnits || Object.keys(dhis2Mappings.orgUnits).length === 0;
      const headerGuarded = records.filter(r => !isHeaderLikeRow(r, fileTypeConfig, headerMap));
      const dataValues = buildDataValues(
        headerGuarded,
        fileTypeConfig,
        dhis2Mappings,
        metadataMappings,
        { useCodeScheme: useCodeSchemeForValues, useNameOrgUnits: useNameOrgUnitsForValues, headerMap, periodType: datasetPeriodType, overridePeriod }
      );
      
      try {
        const samplePeriods = Array.from(new Set(dataValues.slice(0, 50).map(v => v.period))).slice(0, 3);
        console.log(`   ℹ️ Sample mapped periods: ${samplePeriods.join(', ')}`);
      } catch (_) {}
      
      if (dataValues.length === 0) {
        try {
          const preview = records.slice(0, 3).map(r => mapColumns(r, fileTypeConfig.columnMappings || {}, metadataMappings, { headerMap }));
          console.log('   🔎 Preview first 3 mapped rows:', JSON.stringify(preview, null, 2));
          console.log('   🔎 dhis2Mappings summary:', {
            de: Object.keys(dhis2Mappings.dataElements || {}).length,
            ou: Object.keys(dhis2Mappings.orgUnits || {}).length,
            coc: Object.keys(dhis2Mappings.categoryOptionCombos || {}).length,
            dataSetId: dhis2Mappings.dataSetId || null
          });
        } catch (e) {}
        console.log('   ⚠️ No valid data values built');
        return {
          ...state,
          references: [
            ...(state.references || []),
            {
              chunkIndex: index,
              uploadSuccess: true,
              rowsProcessed: records.length,
              dataValuesUploaded: 0,
              message: 'No valid data values'
            }
          ]
        };
      }
      
      // Build payload (synchronous)
      const useCodeScheme = !dhis2Mappings.dataElements || Object.keys(dhis2Mappings.dataElements).length === 0;
      const haveOrgUnitUIDs = dhis2Mappings.orgUnits && Object.keys(dhis2Mappings.orgUnits).length > 0;
      const useNameOrgUnits = !haveOrgUnitUIDs;
      const payload = { dataValues, dataSet: dhis2Mappings.dataSetId || undefined };
      const uploadQuery = {
        importStrategy: 'CREATE_AND_UPDATE',
        skipExistingCheck: false,
        ...(useCodeScheme ? { dataElementIdScheme: 'CODE' } : {}),
        ...(useNameOrgUnits ? { orgUnitIdScheme: 'NAME' } : { orgUnitIdScheme: 'UID' })
      };
      
      // Upload to DHIS2 - returns promise
      return create('dataValueSets', payload, { query: uploadQuery })({
        ...state,
        configuration: cfgForDhis,
        data: payload
      }).then(uploadState => {
        // Update index after successful upload
        return updateIndex(state, state.fileName, {
          lastSuccessfulChunk: index,
          lastChunkUploadedAt: new Date().toISOString()
        }).then(() => {
          // Return STATE with result in references
          return {
            ...state,
            references: [
              ...(state.references || []),
              {
                chunkIndex: index,
                uploadSuccess: true,
                rowsProcessed: records.length,
                dataValuesUploaded: dataValues.length,
                dhis2Response: uploadState?.data || uploadState?.response || uploadState,
                message: `Uploaded ${dataValues.length} data values`
              }
            ]
          };
        });
      }).catch(error => {
        // Error handling - return plain result object
        let condensed = {};
        try {
          const body = error?.body || error?.data || {};
          const conflicts = body?.response?.conflicts || [];
          const byCode = conflicts.reduce((acc, c) => {
            const code = c.errorCode || 'UNKNOWN';
            const count = Array.isArray(c.indexes) ? c.indexes.length : 1;
            acc[code] = (acc[code] || 0) + count;
            return acc;
          }, {});
          condensed = { error: error?.message, codes: byCode, sample: conflicts[0] ? { errorCode: conflicts[0].errorCode, object: conflicts[0].object, property: conflicts[0].property, value: conflicts[0].value } : undefined };
        } catch (_) {}
        console.log(`   ⚠️ Upload failed (condensed): ${JSON.stringify(condensed)}`);
        
        return {
          ...state,
          references: [
            ...(state.references || []),
            {
              chunkIndex: index,
              uploadSuccess: false,
              rowsProcessed: records.length,
              dataValuesUploaded: 0,
              dhis2Error: condensed,
              message: 'Upload failed with conflicts'
            }
          ]
        };
      });
    }).catch(readError => {
      console.error(`❌ Chunk ${index + 1} read failed:`, readError.message);
      
      return {
        ...state,
        references: [
          ...(state.references || []),
          {
            chunkIndex: index,
            uploadSuccess: false,
            rowsProcessed: 0,
            dataValuesUploaded: 0,
            error: readError.message,
            message: 'Chunk read failed'
          }
        ]
      };
    });
  })),

  fn(state => {
    // Collect results from each() operation
    const results = state.references || [];
    const successfulChunks = results.filter(r => r && r.uploadSuccess);
    const failedChunks = results.filter(r => r && !r.uploadSuccess);
    
    const totalRowsProcessed = results.reduce((sum, r) => sum + (r.rowsProcessed || 0), 0);
    const totalDataValuesUploaded = results.reduce((sum, r) => sum + (r.dataValuesUploaded || 0), 0);
    
    console.log(`✅ Job 4 Complete: ${successfulChunks.length}/${results.length} chunks succeeded`);
    console.log(`📊 Summary: ${totalRowsProcessed} rows processed, ${totalDataValuesUploaded} data values uploaded`);
    
    if (failedChunks.length > 0) {
      console.log(`⚠️  Failed chunks: ${failedChunks.map(c => c.chunkIndex + 1).join(', ')}`);
    }
    
    // Update state (synchronous)
    state.workflowLock = null;
    state.lock = null;
    
    const hadAnyValues = totalDataValuesUploaded > 0;
    state.batchProcessingComplete = failedChunks.length === 0 && hadAnyValues;
    state.summary = {
      totalChunks: results.length,
      successfulChunks: successfulChunks.length,
      failedChunks: failedChunks.length,
      totalRowsProcessed,
      totalDataValuesUploaded
    };
    state.data = results.length > 0 ? results[results.length - 1] : {};
    delete state.chunks;
    delete state.chunkResults;
    
    if (!hadAnyValues) {
      throw new Error('No data values uploaded');
    }
    
    // Return promise from updateIndex, then return state
    return updateIndex(state, state.fileName, {
      summary: {
        totalChunks: results.length,
        successfulChunks: successfulChunks.length,
        failedChunks: failedChunks.length,
        totalRowsProcessed,
        totalDataValuesUploaded,
        processingStartTime: state.batchProcessingStartTime,
        processingEndTime: new Date().toISOString()
      },
      status: failedChunks.length === 0 ? 'completed' : 'failed'
    }).then(() => state);
  })
);

function normalizeXlsxChunk(chunkData, fileTypeConfig) {
  if (!chunkData || chunkData.length === 0) return [];
  let rows = chunkData;
  if (chunkData[0]?.obj) {
    rows = chunkData.map(row => row.obj);
  }
  if (Array.isArray(chunkData[0])) {
    const columnOrder = fileTypeConfig.columnOrder || [];
    rows = chunkData.map(row => {
      const obj = {};
      columnOrder.forEach((colName, idx) => {
        obj[colName] = row[idx];
      });
      return obj;
    });
  }
  return rows;
}

// removed readCsvChunk; CSV handled via adaptor getCsvChunk()

function buildDataValues(records, fileTypeConfig, dhis2Mappings, metadataMappings, options = {}) {
  const values = [];
  const mappings = fileTypeConfig.columnMappings || {};
  const useCodeScheme = Boolean(options.useCodeScheme);
  const useNameOrgUnits = Boolean(options.useNameOrgUnits);
  const headerMap = options.headerMap || {};
  const periodType = (fileTypeConfig && fileTypeConfig.dhis2Config && fileTypeConfig.dhis2Config.periodType) || 'Monthly';
  const overridePeriod = options.overridePeriod || null;
  
  // Track category option combo usage for debugging
  const cocUsage = {};
  let rowsProcessed = 0;

  for (const record of records) {
    rowsProcessed++;
    const mappedRow = mapColumns(record, mappings, metadataMappings, { headerMap });

    // Skip rows that look like headers or lack required fields
    if (isHeaderMappedRow(mappedRow)) continue;
    const orgUnitName = mappedRow.orgUnit;
    // Prefer explicit code mapping if present; fallback to generated code from name
    const dataElementCode = mappedRow.dataElementCode || getCodeFromName(mappedRow.dataElement);
    
    // Build category option combo key based on available category options
    // For PEPFAR files: use sex and age group
    // For other files: use hsector and reportingPeriodType
    const categoryParts = [];
    if (mappedRow.categoryOptions?.sex) {
      categoryParts.push(mappedRow.categoryOptions.sex);
    }
    if (mappedRow.categoryOptions?.ageGroup) {
      categoryParts.push(mappedRow.categoryOptions.ageGroup);
    }
    if (mappedRow.categoryOptions?.hsector) {
      categoryParts.push(mappedRow.categoryOptions.hsector);
    }
    if (mappedRow.categoryOptions?.reportingPeriodType) {
      categoryParts.push(mappedRow.categoryOptions.reportingPeriodType);
    }
    // Sort category parts alphabetically to match Job 3's key format
    const categoryKey = categoryParts.length > 0 ? categoryParts.sort().join('+') : '';

    const mappedDataElement = dhis2Mappings.dataElements?.[dataElementCode] || dhis2Mappings.dataElements?.[getCodeFromName(mappedRow.dataElement)];
    const mappedOrgUnit = dhis2Mappings.orgUnits?.[orgUnitName] || dhis2Mappings.orgUnits?.[getCodeFromName(orgUnitName)];
    const dataElement = mappedDataElement || (useCodeScheme ? dataElementCode : undefined);
    const orgUnit = mappedOrgUnit || (useNameOrgUnits ? orgUnitName : undefined);
    
    // Look up category option combo using sorted key
    let categoryOptionCombo = dhis2Mappings.categoryOptionCombos?.[categoryKey];
    
    // Fallback for hsector-based lookups
    if (!categoryOptionCombo && mappedRow.categoryOptions?.hsector) {
      categoryOptionCombo = dhis2Mappings.categoryOptionCombos?.[`hsector:${mappedRow.categoryOptions.hsector}`];
    }
    
    // Final fallback to default combo
    if (!categoryOptionCombo) {
      categoryOptionCombo = 'HllvX50cXC0';
    }
    
    // Track category option combo usage
    if (!cocUsage[categoryOptionCombo]) {
      cocUsage[categoryOptionCombo] = { count: 0, key: categoryKey || '(no key)', isDefault: categoryOptionCombo === 'HllvX50cXC0' };
    }
    cocUsage[categoryOptionCombo].count++;

    if (!dataElement || !orgUnit) {
      continue;
    }

    // Period handling: prioritize overridePeriod from filename, fall back to data period
    // This ensures period consistency based on file metadata rather than submission timestamps
    const finalPeriod = overridePeriod 
      ? normalizePeriodForPeriodType(overridePeriod, periodType)
      : normalizePeriodForPeriodType(normalizePeriod(mappedRow.period), periodType);
    
    // If this is a PEPFAR MMD file-type, emit up to three rows for durations
    if (String(fileTypeConfig?.fileType || '').startsWith('pepfar_tx_mmd_csv')) {
      const durations = [
        { key: 'mmd_lt3', label: '<3 months' },
        { key: 'mmd_3to5', label: '3-5 months' },
        { key: 'mmd_ge6', label: '>=6 months' }
      ];
      for (const d of durations) {
        const val = mappedRow[d.key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const cocKey = `mmdDuration:${d.label}`;
          const coc = dhis2Mappings.categoryOptionCombos?.[cocKey]
            || dhis2Mappings.categoryOptionCombos?.[`mmd:${d.label}`]
            || categoryOptionCombo;
          values.push({
            dataElement,
            period: finalPeriod,
            orgUnit,
            categoryOptionCombo: coc,
            value: String(val)
          });
        }
      }
      continue;
    }

    values.push({
      dataElement,
      period: finalPeriod,
      orgUnit,
      categoryOptionCombo,
      value: mappedRow.value !== undefined && mappedRow.value !== null ? String(mappedRow.value) : '0'
    });
  }
  
  // Log category option combo usage summary
  const uniqueCombos = Object.keys(cocUsage).length;
  const defaultUsage = cocUsage['HllvX50cXC0']?.count || 0;
  const disaggregatedUsage = Object.values(cocUsage)
    .filter(u => !u.isDefault)
    .reduce((sum, u) => sum + u.count, 0);
  
  console.log(`   📊 Category option combo usage: ${uniqueCombos} unique combos used`);
  console.log(`   ✓ Disaggregated: ${disaggregatedUsage} rows across ${uniqueCombos - (defaultUsage > 0 ? 1 : 0)} combos`);
  if (defaultUsage > 0) {
    console.log(`   ⚠️ Default combo used: ${defaultUsage} rows (may indicate missing category mappings)`);
  }
  
  // Show sample of category option combos being used
  const sampleCombos = Object.entries(cocUsage)
    .filter(([id]) => id !== 'HllvX50cXC0')
    .slice(0, 5)
    .map(([id, data]) => `${data.key} → ${id}`);
  if (sampleCombos.length > 0) {
    console.log(`   📋 Sample combos: ${sampleCombos.join(', ')}`);
  }

  return values;
}

function normalizeHeader(header, headerMap = {}) {
  return headerMap[header] || headerMap[header?.toLowerCase?.()] || header;
}
function applyHeaderMap(row, headerMap = {}) {
  const normalized = {};
  Object.keys(row || {}).forEach(header => {
    const normalizedHeader = normalizeHeader(header, headerMap);
    normalized[normalizedHeader] = row[header];
  });
  return normalized;
}

function mapColumns(record, mappings, metadataMappings, options = {}) {
  const out = { categoryOptions: {} };
  const headerMap = options.headerMap || {};
  // basic mapping using sourceColumns -> targetField
  Object.entries(mappings || {}).forEach(([key, spec]) => {
    const target = spec.targetField || key;
    const sources = spec.sourceColumns || spec.sourceColumn || [key];
    let value = undefined;
    for (const s of sources) {
      const header = headerMap[s] || headerMap[s?.toLowerCase?.()] || s;
      if (record[header] !== undefined && record[header] !== null && record[header] !== '') {
        value = record[header];
        break;
      }
    }
    if (target.startsWith('categoryOptions.')) {
      const k = target.split('.')[1];
      out.categoryOptions[k] = value;
    } else {
      out[target] = value;
    }
  });
  // allow metadata-driven enrichments if needed
  return out;
}

function normalizePeriod(p) {
  // Delegated to adaptor util; fallback kept in case state.environment lacks util
  const util = (globalThis && globalThis.util) || {};
  const fn = util.normalizePeriod;
  if (typeof fn === 'function') return fn(p);
  if (!p) return p;
  const s = String(p);
  const yyyymm = s.match(/^(\d{6})$/);
  if (yyyymm) return yyyymm[1];
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) {
    const d = new Date(iso);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}${m}`;
  }
  const q = s.match(/^(\d{4})Q([1-4])$/i);
  if (q) {
    const year = q[1];
    const quarter = Number(q[2]);
    const month = (quarter - 1) * 3 + 1;
    return `${year}${String(month).padStart(2, '0')}`;
  }
  return s;
}

// Ensure period string matches dataset periodType (e.g., Quarterly expects YYYYQn)
function normalizePeriodForPeriodType(period, periodType) {
  const s = String(period || '').trim();
  if (!s) return s;
  const pt = String(periodType || 'Monthly').toLowerCase();

  if (pt === 'quarterly') {
    // If already in YYYYQn format, return as is
    const q = s.match(/^(\d{4})Q([1-4])$/i);
    if (q) return `${q[1]}Q${q[2]}`.toUpperCase();
    // If monthly YYYYMM, convert to quarter code
    const m = s.match(/^(\d{4})(\d{2})$/);
    if (m) {
      const year = m[1];
      const month = Number(m[2]);
      const quarter = Math.floor((month - 1) / 3) + 1;
      return `${year}Q${quarter}`;
    }
    // If ISO date, convert to quarter
    const t = Date.parse(s);
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      const year = d.getUTCFullYear();
      const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
      return `${year}Q${quarter}`;
    }
  }
  // Default: return as-is (Monthly, etc.)
  return s;
}

function getCodeFromName(name) {
  const util = (globalThis && globalThis.util) || {};
  const fn = util.generateCodeFromName;
  if (typeof fn === 'function') return fn(name);
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

async function updateIndex(state, fileName, patch) {
  const filesIndex = state.filesIndex || {};
  filesIndex[fileName] = {
    ...(filesIndex[fileName] || {}),
    ...patch
  };
  state.filesIndex = filesIndex;
} 

// Guard: detect header-like rows from raw records
function isHeaderLikeRow(record, fileTypeConfig, headerMap = {}) {
  const headers = Object.keys(headerMap || {});
  if (headers.length === 0) return false;
  const normalized = {};
  Object.keys(record || {}).forEach(k => {
    const mapped = normalizeHeader(k, headerMap || {});
    normalized[mapped] = record[k];
  });
  const sample = {
    facility: 'facility',
    dataElement: 'indicator',
    period: 'Date_Submitted',
  };
  const looksLikeHeader =
    (String(normalized.facility || '').trim().toLowerCase() === sample.facility) ||
    (String(normalized.dataElement || '').trim().toLowerCase() === sample.dataElement) ||
    (String(normalized.period || '').trim() === sample.period);
  return looksLikeHeader;
}

// Guard: detect header-like rows after mapping
function isHeaderMappedRow(mappedRow) {
  const facilityIsHeader = String(mappedRow.orgUnit || '').trim().toLowerCase() === 'facility';
  const indicatorIsHeader = String(mappedRow.dataElement || '').trim().toLowerCase() === 'indicator';
  const periodIsHeader = String(mappedRow.period || '').trim() === 'Date_Submitted';
  return facilityIsHeader || indicatorIsHeader || periodIsHeader;
} 