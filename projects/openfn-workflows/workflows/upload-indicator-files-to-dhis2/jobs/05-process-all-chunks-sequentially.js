/**
 * Job 4 – ProcessAndUploadChunks
 * Role: Streams file chunks, builds DHIS2 payloads, and uploads them sequentially.
 * Workflow position: 5/5 (final processing + cleanup). Native state tracks progress/resume info.
 */

// No external imports; rely on adaptor operations provided by the runtime
import { getExcelChunk, execute as executeWithSftp } from '@openfn/language-sftp';
import { create as dhis2Create } from '@openfn/language-dhis2';

executeWithSftp(
  fn(async state => {
    const { fileName, totalChunks, chunkSize, filePath, fileType, data: { dhis2Mappings } } = state;
    if (!fileName || !totalChunks || !filePath) {
      throw new Error('Missing required state: fileName, totalChunks, and filePath must be provided.');
    }
    if (!dhis2Mappings) {
      throw new Error('Missing DHIS2 mappings from previous job.');
    }

    console.log(`🚀 Job 4: Starting batch processing (${fileType})`);
    console.log(`📊 Total chunks: ${totalChunks}, chunk size: ${chunkSize}`);

    await updateIndex(state, fileName, {
      status: 'processing',
      inProgressAt: new Date().toISOString(),
      totalChunks,
      chunkSize
    });

    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
      chunks.push({
        index: i,
        number: i + 1,
        size: chunkSize,
        filePath,
        totalChunks,
        fileType,
        dhis2Mappings,
        fileTypeConfig: state.fileTypeConfig,
        metadataMappings: state.metadataMappings,
        config: state.config,
        configuration: state.configuration
      });
    }

    state.chunks = chunks;
    state.chunkResults = [];
    state.batchProcessingStartTime = new Date().toISOString();
    state.data = {
      ...state.data,
      chunks
    };

    return state;
  }),

  each('chunks[*]', fn(async state => {
    const chunk = state.data;
    const { index, filePath, size, totalChunks, fileType, dhis2Mappings, fileTypeConfig, metadataMappings } = chunk;

    console.log(`📦 Processing chunk ${index + 1}/${totalChunks}`);

    let records;
    if (fileType === 'xlsx') {
      const chunkState = await getExcelChunk(filePath, index, size)(state);
      records = normalizeXlsxChunk(chunkState.chunkData, fileTypeConfig);
    } else if (fileType === 'csv') {
      const csvState = await getCsvChunk(filePath, index, size)({ ...state, configuration: state.configuration });
      records = csvState.chunkData.map(row => {
        const normalized = {};
        Object.keys(row).forEach(header => {
          const normalizedHeader = normalizeHeader(header, chunk.fileTypeConfig?.headerMap || {});
          normalized[normalizedHeader] = row[header];
        });
        return normalized;
      });
    } else {
      throw new Error(`Unsupported fileType '${fileType}' in chunk processing`);
    }

    if (!records || records.length === 0) {
      console.log('   ⚠️ Chunk empty; skipping upload');
      return {
        chunkIndex: index,
        uploadSuccess: true,
        rowsProcessed: 0,
        dataValuesUploaded: 0,
        message: 'Empty chunk'
      };
    }

    const dataValues = buildDataValues(records, fileTypeConfig, dhis2Mappings, metadataMappings);
    if (dataValues.length === 0) {
      console.log('   ⚠️ No valid data values built');
      return {
        chunkIndex: index,
        uploadSuccess: true,
        rowsProcessed: records.length,
        dataValuesUploaded: 0,
        message: 'No valid data values'
      };
    }

    const payload = {
      dataValues,
      dataSet: dhis2Mappings.dataSetId || undefined
    };

    const uploadState = await dhis2Create('dataValueSets?importStrategy=CREATE_AND_UPDATE&skipExistingCheck=true', payload)({
      configuration: chunk.configuration || state.configuration,
      data: payload
    });

    await updateIndex(state, state.fileName, {
      lastSuccessfulChunk: index,
      lastChunkUploadedAt: new Date().toISOString()
    });

    return {
      chunkIndex: index,
      uploadSuccess: true,
      rowsProcessed: records.length,
      dataValuesUploaded: dataValues.length,
      dhis2Response: uploadState?.data || uploadState?.response || uploadState,
      message: `Uploaded ${dataValues.length} data values`
    };
  })),

  fn(async state => {
    const results = state.references || [];
    const successfulChunks = results.filter(r => r.uploadSuccess);
    const failedChunks = results.filter(r => !r.uploadSuccess);

    const totalRowsProcessed = results.reduce((sum, r) => sum + (r.rowsProcessed || 0), 0);
    const totalDataValuesUploaded = results.reduce((sum, r) => sum + (r.dataValuesUploaded || 0), 0);

    console.log(`✅ Job 4 Complete: ${successfulChunks.length}/${results.length} chunks succeeded`);
    if (failedChunks.length > 0) {
      console.log(`⚠️  Failed chunks: ${failedChunks.map(c => c.chunkIndex + 1).join(', ')}`);
    }

    await updateIndex(state, state.fileName, {
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
    });

    state.workflowLock = null;
    state.lock = null;

    state.batchProcessingComplete = failedChunks.length === 0;
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

    return state;
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

function buildDataValues(records, fileTypeConfig, dhis2Mappings, metadataMappings) {
  const values = [];
  const mappings = fileTypeConfig.columnMappings || {};

  for (const record of records) {
    const mappedRow = mapColumns(record, mappings, metadataMappings, {
      headerMap: fileTypeConfig.headerMap || {}
    });

    const orgUnitName = mappedRow.orgUnit;
    const dataElementCode = generateCodeFromName(mappedRow.dataElement);
    const categoryKey = [mappedRow.categoryOptions?.hsector, mappedRow.categoryOptions?.reportingPeriodType]
      .filter(Boolean)
      .join('+');

    const dataElement = dhis2Mappings.dataElements[dataElementCode];
    const orgUnit = dhis2Mappings.orgUnits[orgUnitName];
    const categoryOptionCombo = dhis2Mappings.categoryOptionCombos[categoryKey] || dhis2Mappings.categoryOptionCombos[`hsector:${mappedRow.categoryOptions?.hsector}`] || dhis2Mappings.categoryOptionCombos[categoryKey];

    if (!dataElement || !orgUnit) {
      continue;
    }

    values.push({
      dataElement,
      period: mappedRow.period,
      orgUnit,
      categoryOptionCombo: categoryOptionCombo || 'HllvX50cXC0',
      value: mappedRow.value !== undefined && mappedRow.value !== null ? String(mappedRow.value) : '0'
    });
  }

  return values;
}

function normalizeHeader(header, headerMap = {}) {
  return headerMap[header] || headerMap[header?.toLowerCase?.()] || header;
}

function generateCodeFromName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
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

async function updateIndex(state, fileName, patch) {
  const filesIndex = state.filesIndex || {};
  filesIndex[fileName] = {
    ...(filesIndex[fileName] || {}),
    ...patch
  };
  state.filesIndex = filesIndex;
} 