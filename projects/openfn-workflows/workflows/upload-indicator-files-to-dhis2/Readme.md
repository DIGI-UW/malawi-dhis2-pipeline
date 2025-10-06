# DHIS2 Indicator Uploader – Workflow Overview

## High-level flow
- Job 1 ScanSftpForChanges (SFTP): discover candidate files recursively, pick next file to process.
- Job 2 ParseExcelMetadata (SFTP): stream/parse metadata, build dhis2Structures, define chunking.
- Job 3 CheckAndSetupMetadata (DHIS2, admin): create/resolve DHIS2 metadata and return dhis2Mappings. Fail fast if any prerequisite is missing.
- Job 4 ProcessAllChunksSequentially (DHIS2+SFTP, integration): stream chunks, build dataValueSets, upload sequentially, update per-file index.

## State contracts
- After Job 1:
```
{
  fileName, filePath, fileType, chunkSize,
  filesIndex, // persisted per file
  config, fileTypeConfig
}
```
- After Job 2:
```
{
  ...,
  totalRows, totalChunks,
  data: {
    uniqueValues,
    orgUnitParentMap,
    dhis2Structures: { orgUnits, categories, dataElements }
  }
}
```
- After Job 3:
```
{
  ...,
  metadataSetupComplete: true,
  data: {
    ...,
    dhis2Mappings: {
      orgUnits: { name → id },
      categories: { categoryName/optionName → id },
      categoryOptionCombos: { "OptionA+OptionB" → id, "hsector:Public" → id },
      dataElements: { CODE → id },
      dataSetId: 'xxxxxxxxxxx'
    }
  },
  filesIndex: { [fileName]: { status: 'metadata-ready', dhis2Mappings, lastProcessedAt } }
}
```
- After Job 4:
```
{
  ...,
  summary: { totalChunks, successfulChunks, failedChunks, totalRowsProcessed, totalDataValuesUploaded },
  filesIndex: { [fileName]: { status: 'completed'|'failed', lastSuccessfulChunk, lastChunkUploadedAt, summary } }
}
```

## Job responsibilities and wiring
- Job 1 (scan)
  - Recursively list under configured directory; maintain filesIndex; select next file not completed.
- Job 2 (parse)
  - For CSV/XLSX: compute chunking; collect uniqueValues; build dhis2Structures; normalize headers; drop duplicate headers.
- Job 3 (metadata)
  - Admin credential. Steps (fail fast after each):
    - Root OU Malawi (code MW) → id.
    - Integration user openfn_integration → create/resolve; assign Malawi to OU arrays.
    - Facilities → upsert as children of “Malawi” by name.
    - Categories + categoryCombo → map COCs including combined keys.
    - Data elements → create/resolve from dhis2Structures.dataElements (built from uniqueValues.indicators).
    - Dataset → create/resolve; assign DEs and OUs at creation.
  - Compose data.dhis2Mappings only in orchestrator.
- Job 4 (chunks)
  - Integration credential. For each chunk: read via SFTP; map DE/OU/COC; transform period; upload dataValueSets with CREATE_AND_UPDATE & skipExistingCheck.

## Credentials
- Job 3 → dhis2-credential (admin). Contains integrationUsername/password only for provisioning.
- Job 4 → combined-sftp-dhis2-credential (integration user + SFTP).

## Error handling (fail-fast)
- Job 3 throws if: missing root OU, unresolved/unauthorized integration user, facilities unmapped, DEs unmapped, or dataset missing.
- Job 4 throws if mappings missing or no values built.

## Resume & idempotency
- filesIndex[file].lastSuccessfulChunk enables resume of Job 4.
- Metadata upserts are idempotent via GET-by-unique + POST; on 409, follow-up GET resolves ID.

## Implementation notes
- Always capture returned state from adaptor operations: `state = await get/create(...)(state)` then read `state.data`.
- Keep helpers pure: return only what they create/resolve (mappings/ids). Orchestrator composes mappings.
- Add `paging=false` for list GETs.
- Period normalization supports timestamps (YYYYMM), ISO dates, and quarters (YYYYQx).

## Configuration
- File-type configs are defined inline in Job 2 (`02-check-and-setup-processing.js`) under `FILE_TYPE_CONFIGS`. This is the single source of truth for file processing, period sourcing, header mapping, and column mappings.
- The previous external config directory (`projects/openfn-workflows/configs/`) has been removed. If needed later, we can add a loader to merge external JSON configs with schema validation and tests.

## File discovery parameters
- Target directory (SFTP), file patterns, file types, chunk size, and cron cadence are configurable in the workflow config.

## CSV/XLSX samples and columns (reference)
- See `projects/sftp/data/samples/*` for file patterns and headers used during parsing and mapping.
