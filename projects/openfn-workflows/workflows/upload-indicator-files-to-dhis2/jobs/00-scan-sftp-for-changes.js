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

/*
 * Configuration is now loaded dynamically from the dhis2 adaptor.
 * See projects/openfn-custom-adaptors/packages/dhis2/src/fileTypeConfig.js
 */

function matchFileTypeKey(fileName, configs) {
  const basename = String(fileName || '').split('/').pop();
  const baseNameWithoutExt = basename.replace(/\.(csv|xlsx|xls)(\.(csv|xlsx|xls))?$/i, '');
  
  for (const key of Object.keys(configs)) {
    const cfg = configs[key];
    
    // Try prefix matching first (simple and preferred)
    if (cfg.filePrefix && basename.startsWith(cfg.filePrefix)) {
      return key;
    }
    
    // Fall back to pattern matching for complex cases
    if (cfg.filePatterns) {
      const patterns = cfg.filePatterns.map(p => new RegExp(
        '^' + p.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*') + '$', 
        'i'
      ));
      if (patterns.some(rx => rx.test(basename))) {
        return key;
      }
    }
  }
  return null;
}

function matchFileToConfig(fileName, configs) {
  const key = matchFileTypeKey(fileName, configs);
  return key ? configs[key] : null;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

execute(fn(async state => {
  console.log('🔎 Job 0: Scanning SFTP directory for new/updated indicator files...');

  const params = state.params || {};
  const baseConfig = state.config || {};
  const config = {
    directory: '/data',
    targetFilePatterns: [
      '^PEPFAR_TxCURR_.*\\.(csv)(\\.csv)?$'
    ],
    fileTypesEnabled: ['csv'],
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

  const fileTypeConfigs = loadFileTypeConfigs(); // Loaded from adaptor
  console.log(`   • Loaded ${Object.keys(fileTypeConfigs).length} file type configurations`);

  // Normalize directory to avoid trailing slash
  const directory = String(config.directory || '/data').replace(/\/+$/, '');
  const patternStrings = Array.isArray(config.targetFilePatterns) && config.targetFilePatterns.length > 0
    ? config.targetFilePatterns
    : ['^PEPFAR_TxCURR_.*\\.(csv)(\\.csv)?$'];
  const patterns = patternStrings.map(p => new RegExp(p, 'i'));

  console.log(`   • Directory: ${directory}`);
  console.log(`   • Patterns: ${patternStrings.join(' | ')}`);
  console.log(`   • Enabled types: ${config.fileTypesEnabled.join(', ')}`);

  return list(directory, null, async listingState => {
    const entries = Array.isArray(listingState.data) ? listingState.data : [];
    const nowIso = new Date().toISOString();

    const normalize = f => {
      if (typeof f === 'string') {
        return { name: f, size: null, mtime: null, type: null };
      }
      const mtime = f.mtime || f.modifyTime || f.modTime || f.date || null;
      const size = f.size || f.length || null;
      const name = f.name || String(f.filename || '');
      const type = f.type || null; // 'd' denotes directory in ssh2-sftp-client
      return { name, size, mtime, type };
    };

    const joinPath = (dir, name) => `${String(dir).replace(/\/+$/, '')}/${String(name).replace(/^\/+/, '')}`;

    // Build list including multiple levels of subdirectories under /data (bounded depth=3)
    async function listRecursive(basePath, depth, acc, parentNamePrefix = '') {
      if (depth < 0) return acc;
      const lsState = await list(basePath, null)(listingState);
      const items = (Array.isArray(lsState.data) ? lsState.data : []).map(normalize);
      for (const it of items) {
        const name = parentNamePrefix ? `${parentNamePrefix}/${it.name}` : it.name;
        acc.push({ ...it, name });
        if (it.type === 'd') {
          const nextPath = joinPath(basePath, it.name);
          await listRecursive(nextPath, depth - 1, acc, name);
        }
      }
      return acc;
    }

    let allEntries = await listRecursive(directory, 3, []);

    const files = allEntries
      .filter(f => f.name && patterns.some(rx => rx.test(String(f.name).split('/').pop())))
      .map(file => {
        const basename = String(file.name).split('/').pop();
        const configKey = matchFileTypeKey(basename, fileTypeConfigs);
        return {
          ...file,
          fileType: inferFileType(basename),
          fileTypeConfigKey: configKey,
          fileTypeConfig: configKey ? fileTypeConfigs[configKey] : null
        };
      })
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

      // Use the computed selection rule key (if any)
      let resolvedFileTypeConfigKey = file.fileTypeConfigKey || existing.fileTypeConfigKey || null;

      nextFilesIndex[key] = {
        path: `${directory}/${file.name}`,
        lastSeenAt: nowIso,
        size: file.size || existing.size || null,
        mtime: file.mtime || existing.mtime || null,
        processed: existing.processed === true && !fileChanged ? true : false,
        status: notProcessed || fileChanged ? 'pending' : existing.status || 'completed',
        lastProcessedAt: existing.lastProcessedAt || null,
        fileType: file.fileType,
        fileTypeConfigKey: resolvedFileTypeConfigKey
      };

      if (!resolvedFileTypeConfigKey) {
        console.warn(`   ⚠️ No file-type config matched for ${file.name} and no CSV fallback available`);
        continue;
      }

      const isCandidate = !seenBefore || notProcessed || fileChanged;
      if (isCandidate) {
        candidates.push({
          name: file.name,
          path: joinPath(directory, file.name),
          size: file.size,
          mtime: file.mtime,
          fileType: file.fileType,
          fileTypeConfigKey: nextFilesIndex[key].fileTypeConfigKey,
          fileTypeConfig: file.fileTypeConfig
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
      fileTypeConfig: nextFile.fileTypeConfig,
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







