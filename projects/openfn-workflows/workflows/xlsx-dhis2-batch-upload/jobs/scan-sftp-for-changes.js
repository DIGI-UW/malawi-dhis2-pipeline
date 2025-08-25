// Job 0: ScanSftpForChanges
// STATE CONTRACT:
// Input:  { filesIndex?, config? }
// Output: { hasFileToProcess, filesIndex, config }

fn(state => {
  console.log('🔎 Job 0: Scanning SFTP directory for new/updated ART Excel files...');

  const previousFilesIndex = state.filesIndex || {};
  const config = state.config || {};

  // Pattern for ART data files (case-insensitive)
  const filenamePattern = /^ART_data.*\.xlsx$/i;
  const directory = config.directory || '/data/excel-files';

  console.log(`   • Directory: ${directory}`);
  console.log(`   • Pattern: ${filenamePattern}`);

  return list(directory, null, s => {
    const entries = Array.isArray(s.data) ? s.data : [];
    const nowIso = new Date().toISOString();

    // Normalize listing to { name, size, mtime } shape
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
      .filter(f => f.name && filenamePattern.test(f.name));

    console.log(`   • Matched files: ${files.length}`);

    // Build next filesIndex and detect candidates
    const nextFilesIndex = { ...previousFilesIndex };
    const candidates = [];

    for (const file of files) {
      const key = file.name;
      const existing = previousFilesIndex[key] || {};
      const seenBefore = Boolean(previousFilesIndex[key]);

      // Detect change by size/mtime, or not processed yet
      const changedSize = existing.size !== undefined && file.size !== null && existing.size !== file.size;
      const changedMtime = existing.mtime && file.mtime && existing.mtime !== file.mtime;
      const notProcessed = existing.processed !== true;

      const isCandidate = !seenBefore || notProcessed || changedSize || changedMtime;

      // Update index bookkeeping
      nextFilesIndex[key] = {
        path: `${directory}/${file.name}`,
        lastSeenAt: nowIso,
        size: file.size || existing.size || null,
        mtime: file.mtime || existing.mtime || null,
        processed: existing.processed === true && !(changedSize || changedMtime)
          ? true
          : false,
        lastProcessedAt: existing.lastProcessedAt || null
      };

      if (isCandidate) {
        candidates.push({
          name: file.name,
          path: `${directory}/${file.name}`,
          size: file.size,
          mtime: file.mtime
        });
      }
    }

    // Pick the next file deterministically (by newest mtime then name)
    candidates.sort((a, b) => {
      const am = a.mtime ? new Date(a.mtime).getTime() : 0;
      const bm = b.mtime ? new Date(b.mtime).getTime() : 0;
      if (bm !== am) return bm - am;
      return a.name.localeCompare(b.name);
    });

    const nextFile = candidates[0];

    if (!nextFile) {
      console.log('✅ No new or updated ART_data*.xlsx files to process.');
      return {
        hasFileToProcess: false,
        filesIndex: nextFilesIndex,
        config
      };
    }

    console.log(`📄 Next file selected: ${nextFile.name}`);

    // Set downstream override for exact filename; ensure pattern is not used
    const nextConfig = {
      ...config,
      targetFile: nextFile.name,
      targetFilePattern: null
    };

    return {
      hasFileToProcess: true,
      // Hint fields (downstream Job 1 will still resolve and set fileName/filePath)
      fileName: nextFile.name,
      filePath: nextFile.path,
      filesIndex: nextFilesIndex,
      config: nextConfig
    };
  })(state);
});


