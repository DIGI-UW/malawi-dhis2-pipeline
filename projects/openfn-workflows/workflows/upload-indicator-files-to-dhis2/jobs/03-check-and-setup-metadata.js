/**
 * Job 3 – SetupDHIS2Metadata
 * Role: Creates or loads DHIS2 structures based on metadata from Job 2, persisting mappings for chunk uploads.
 * Workflow position: 4/5 (bridges metadata parsing and chunk upload). Uses native state for index/mapping handoff.
 */
// STATE CONTRACT:
// Input: { data: { dhis2Structures, orgUnitParentMap }, fileTypeConfig, config, filesIndex }
// Output: { metadataSetupComplete, data.dhis2Mappings, filesIndex }

// adaptor operations are available globally in Lightning; no imports
// We use createMetadataSet from the adaptor

fn(async state => {
  console.log('🏗️ Job 3: Setting up DHIS2 metadata...');

  const { dhis2Structures } = state.data || {};
  const fileTypeConfig = state.fileTypeConfig || state.config?.fileTypeConfig;

  if (!dhis2Structures) {
    throw new Error('No DHIS2 structures found from previous job');
  }

  const filesIndex = state.filesIndex || {};

  // TEMP DEBUG: log admin and integration credentials in use for this job
  const cfgDebug = state.configuration || {};
  try {
    const p = String(cfgDebug.password || '');
    console.log('🔐 DHIS2 ADMIN DEBUG:', {
      hostUrl: cfgDebug.hostUrl,
      username: cfgDebug.username,
      pw_raw: p
    });
  } catch (_) {}

  let mappings = {};

  if (fileTypeConfig?.dhis2Config?.preProvisioned) {
    console.log('ℹ️ DHIS2 metadata pre-provisioned; skipping creation');
    mappings = fileTypeConfig.dhis2Config.preProvisionedMappings || {};
  } else {
    const options = {
      maxLevels: state.config.maxLevels || 5,
      orgUnitParentMap: state.data.orgUnitParentMap || {},
      dhis2Config: fileTypeConfig?.dhis2Config || {},
      fileTypeConfig: fileTypeConfig // Pass config for data set logic
    };

    // Call the adaptor operation
    // Note: createMetadataSet is now a standard adaptor operation
    // If it's not available in global scope, ensure adaptor build includes it
    if (typeof createMetadataSet !== 'function') {
       // Fallback or error if adaptor not updated
       throw new Error('createMetadataSet adaptor operation not found. Ensure @openfn/language-dhis2 is updated.');
    }

    state = await createMetadataSet(dhis2Structures, options)(state);
    mappings = state.data.dhis2Mappings;
  }

  filesIndex[state.fileName] = {
    ...(filesIndex[state.fileName] || {}),
    dhis2Mappings: mappings,
    status: 'metadata-ready',
    lastProcessedAt: new Date().toISOString()
  };

  state.filesIndex = filesIndex;
  state.metadataSetupComplete = true;
  // Mappings are already in state.data if createMetadataSet succeeded, but ensure consistency
  state.data = {
    ...state.data,
    dhis2Mappings: mappings
  };
  delete state.references;

  return state;
});
