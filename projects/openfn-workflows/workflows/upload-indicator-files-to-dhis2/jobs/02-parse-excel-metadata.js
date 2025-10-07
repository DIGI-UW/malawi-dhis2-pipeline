/**
 * Job 2 – ParseMetadata
 * Role: Reads the selected file to derive chunking metadata and build DHIS2 scaffolding.
 * Workflow position: 3/5 (passes structures to DHIS2 setup and chunk processing). Uses native state for resume info.
 */
// STATE CONTRACT:
// Input:  { fileName, filePath, fileType, fileTypeConfig, metadataMappings, config }
// Output: { chunkSize, totalChunks, totalRows, metadataParsed, data: { uniqueValues, orgUnitParentMap, dhis2Structures, headerMap, hash }, filesIndex }

// No external imports; use adaptor operations exposed by runtime

fn(async state => {
  console.log('📊 Job 2: Reading file metadata and generating DHIS2 structures...');
  const { fileName, filePath, fileType, fileTypeConfig, metadataMappings } = state;
  if (!fileTypeConfig) {
    throw new Error('File type configuration missing from previous job');
  }

  const config = state.config;
  const chunkSize = fileTypeConfig.chunkSize || config.chunkSize || 5000;

  console.log(`📄 File: ${fileName}`);
  console.log(`🧩 Type: ${fileType}`);
  console.log(`🔧 Chunk size: ${chunkSize}`);

  let metadata;
  if (fileType === 'xlsx') {
    metadata = await parseXlsxMetadata(state, filePath, chunkSize, fileTypeConfig, metadataMappings);
  } else if (fileType === 'csv') {
    metadata = await parseCsvMetadata(state, filePath, fileTypeConfig, metadataMappings);
  } else {
    throw new Error(`Unsupported fileType '${fileType}'`);
  }

  const dhis2Structures = buildDhis2Structures(fileTypeConfig, metadata.uniqueValues, metadata.orgUnitParentMap || {}, config, metadataMappings);

  await updateIndex(state, fileName, {
    totalChunks: metadata.totalChunks,
    chunkSize: metadata.chunkSize,
    hash: metadata.hash,
    headerMap: metadata.headerMap,
    orgUnitParentMap: metadata.orgUnitParentMap || {},
    dhis2Structures
  });

  state.chunkSize = metadata.chunkSize;
  state.totalChunks = metadata.totalChunks;
  state.totalRows = metadata.totalRows;
  state.metadataParsed = true;

  state.data = {
    uniqueValues: metadata.uniqueValues,
    orgUnitParentMap: metadata.orgUnitParentMap || {},
    dhis2Structures
  };

  return state;
});

async function updateIndex(state, fileName, inflight) {
  const filesIndex = state.filesIndex || {};
  filesIndex[fileName] = {
    ...(filesIndex[fileName] || {}),
    ...inflight,
    status: 'metadata-parsed',
    inflight: {
      ...(filesIndex[fileName]?.inflight || {}),
      ...inflight,
      updatedAt: new Date().toISOString()
    }
  };

  state.filesIndex = filesIndex;
}

async function parseXlsxMetadata(state, filePath, chunkSize, fileTypeConfig, metadataMappings) {
  const columnMapping = buildColumnMapping(fileTypeConfig);
  const resultState = await getExcelMetadata(filePath, chunkSize, { columnMapping })(state);
  const metadata = resultState.data;
  if (!metadata || !metadata.totalRows) {
    throw new Error('Failed to read Excel metadata or no rows found');
  }

  return {
    chunkSize: metadata.chunkSize,
    totalChunks: metadata.totalChunks,
    totalRows: metadata.totalRows,
    uniqueValues: metadata.uniqueValues || {},
    orgUnitParentMap: metadata.orgUnitParentMap || {},
    headerMap: metadata.headerMap || {},
    hash: metadata.hash || null
  };
}

async function parseCsvMetadata(state, filePath, fileTypeConfig, metadataMappings) {
  const headerRowIndex = (fileTypeConfig.sheetConfig?.headerRow || 1) - 1;
  const dataStartRow = (fileTypeConfig.sheetConfig?.dataStartRow || 2) - 1;
  const columnHeaders = new Set();
  const uniqueValueSets = {};
  const orgUnitParentMap = {};
  let dataRowCount = 0;
  const hash = createFnv1a();
  const parserOptions = {
    relax_column_count: true,
    relax_column_count_more: true,
    relax_column_count_less: true,
    skip_empty_lines: true,
    bom: true
  };

  const metaState = await getCsvMetadata(filePath, fileTypeConfig.chunkSize || 5000, parserOptions)({ ...state });
  // We need headers and unique values; read the whole file once via CSV chunk index 0..n
  const totalRows = metaState.data.totalRows || 0;
  const chunkSize = fileTypeConfig.chunkSize || 5000;
  const totalChunks = Math.ceil(totalRows / chunkSize);

  for (let i = 0; i < totalChunks; i++) {
    const chunkState = await getCsvChunk(filePath, i, chunkSize, parserOptions)({ ...state });
    const rows = chunkState.chunkData || [];
    rows.forEach((row, index) => {
      const normalizedRow = {};
      Object.keys(row).forEach(header => {
        const normalizedHeader = normalizeHeader(header, fileTypeConfig.headerMap || {});
        normalizedRow[normalizedHeader] = row[header];
      });

      // Capture headers once from the first parsed data row
      if (columnHeaders.size === 0) {
        Object.keys(normalizedRow).forEach(header => columnHeaders.add(header));
      }

      if ((i * chunkSize + index) < dataStartRow) return;

      try {
        const rowValues = mapColumns(normalizedRow, fileTypeConfig.columnMappings || {}, metadataMappings, {
          headerMap: fileTypeConfig.headerMap || {}
        });
        hash.update(JSON.stringify(rowValues));
        dataRowCount += 1;
        collectUniqueValues(uniqueValueSets, fileTypeConfig, rowValues);
        collectOrgUnitParents(orgUnitParentMap, fileTypeConfig, rowValues);
      } catch (error) {
        console.warn(`   ⚠️ Skipping row due to mapping error: ${error.message}`);
      }
    });
  }

  const uniqueValues = finalizeUniqueValues(uniqueValueSets);

  return {
    chunkSize,
    totalChunks,
    totalRows: dataRowCount,
    uniqueValues,
    orgUnitParentMap,
    headerMap: Array.from(columnHeaders).reduce((map, header) => {
      map[header] = header;
      return map;
    }, {}),
    hash: hash.digest()
  };
}

function buildColumnMapping(fileTypeConfig) {
  const columnMapping = {};
  const mappings = fileTypeConfig.columnMappings || {};
  Object.entries(mappings).forEach(([key, mapping]) => {
    if (mapping.uniqueValueKey) {
      columnMapping[mapping.uniqueValueKey] = mapping.sourceColumns || mapping.sourceColumn || [key];
    }
  });
  return columnMapping;
}

function collectUniqueValues(uniqueValueSets, fileTypeConfig, rowValues) {
  Object.entries(fileTypeConfig.uniqueValueCollectors || {}).forEach(([key, collector]) => {
    // Handle nested properties like 'categoryOptions.sex'
    let value;
    const targetField = collector.targetField;
    if (targetField.includes('.')) {
      const parts = targetField.split('.');
      value = rowValues[parts[0]]?.[parts[1]];
    } else {
      value = rowValues[targetField];
    }
    
    if (!value && value !== 0) return;
    if (!uniqueValueSets[key]) uniqueValueSets[key] = new Set();
    uniqueValueSets[key].add(String(value).trim());
  });
}

function finalizeUniqueValues(uniqueValueSets) {
  const uniqueValues = {};
  Object.entries(uniqueValueSets).forEach(([key, set]) => {
    uniqueValues[key] = Array.from(set || []);
  });
  return uniqueValues;
}

function collectOrgUnitParents(target, fileTypeConfig, rowValues) {
  const mappings = fileTypeConfig.orgUnitHierarchy || [];
  mappings.forEach(mapping => {
    const child = rowValues[mapping.childField];
    const parent = rowValues[mapping.parentField];
    if (child && parent) {
      target[child] = parent;
    }
  });
}

function buildDhis2Structures(fileTypeConfig, uniqueValues, orgUnitParentMap, config, metadataMappings) {
  if (fileTypeConfig.dhis2Builder === 'none') {
    return { orgUnits: [], categories: [], dataElements: [] };
  }

  const builder = fileTypeConfig.builders || {};
  return {
    orgUnits: buildOrgUnits(builder.orgUnits, uniqueValues, orgUnitParentMap, config, metadataMappings),
    categories: buildCategories(builder.categories, uniqueValues, metadataMappings),
    dataElements: buildDataElements(builder.dataElements, uniqueValues, metadataMappings)
  };
}

function buildOrgUnits(config, uniqueValues, orgUnitParentMap, stateConfig, metadataMappings) {
  if (!config) return [];
  const result = [];
  const levels = config.levels || [];

  levels.forEach(level => {
    const values = uniqueValues[level.uniqueValueKey] || [];
    values.forEach(name => {
      result.push({
        name,
        shortName: name.substring(0, 50),
        code: generateCodeFromName(name),
        level: level.level,
        parent: level.parentKey === 'root' ? stateConfig.countryConfig?.name : (orgUnitParentMap[name] || level.defaultParent || null)
      });
    });
  });

  if (stateConfig.countryConfig) {
    result.unshift({
      name: stateConfig.countryConfig.name,
      shortName: stateConfig.countryConfig.shortName,
      code: stateConfig.countryConfig.code,
      level: 1,
      parent: null
    });
  }

  return result;
}

function buildCategories(config, uniqueValues, metadataMappings) {
  if (!config) return [];
  return (config || []).map(category => ({
    name: category.name,
    shortName: category.shortName,
    code: category.code,
    categoryOptions: (uniqueValues[category.uniqueValueKey] || []).map(option => ({
      name: option,
      shortName: option.substring(0, 50),
      code: generateCodeFromName(option)
    }))
  }));
}

function buildDataElements(config, uniqueValues, metadataMappings) {
  if (!config) return [];
  const indicators = uniqueValues[config.uniqueValueKey] || [];
  return indicators.map(name => ({
    name,
    shortName: name.substring(0, 50),
    code: generateCodeFromName(name),
    valueType: config.valueType || 'INTEGER',
    aggregationType: config.aggregationType || 'SUM',
    domainType: config.domainType || 'AGGREGATE'
  }));
}

// Lightweight FNV-1a hasher (32-bit) suitable for sandboxed runtime
function createFnv1a() {
  let hash = 0x811c9dc5; // FNV offset basis
  return {
    update(str) {
      const s = String(str);
      for (let i = 0; i < s.length; i++) {
        hash ^= s.charCodeAt(i);
        // multiply by FNV prime (0x01000193) with overflow in 32-bit
        hash = (hash >>> 0) * 0x01000193 >>> 0;
      }
    },
    digest() {
      // Return 8-char zero-padded hex
      return (hash >>> 0).toString(16).padStart(8, '0');
    }
  };
}

function generateCodeFromName(name) {
  // Prefer adaptor util if present; fallback to local
  const util = (globalThis && globalThis.util) || {};
  const fn = util.generateCodeFromName;
  if (typeof fn === 'function') return fn(name);
  return String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

function normalizeHeader(header, headerMap = {}) {
  return headerMap[header] || headerMap[header?.toLowerCase?.()] || header;
}

function mapColumns(record, mappings, metadataMappings, options = {}) {
  const out = { categoryOptions: {} };
  const headerMap = options.headerMap || {};
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
  return out;
} 