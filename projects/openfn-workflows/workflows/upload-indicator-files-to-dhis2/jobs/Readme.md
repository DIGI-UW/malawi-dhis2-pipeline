# DHIS2 Indicator Uploader

## Workflow Overview

### Parameters
- Target Network Directory (SFTP)
- File Name Pattern (With current default)
- Check Frequency


1. Cron Job that Scans a Directory for File Changes and maintains the file metadata in the state (hash, last updated, etc., upload date)

2. When a target file is found for upload, we run the chunked file upload. We've done it for xlsx, now we need to make sure it works for csv. 

3. We run the chunked upload for each file that's identified for upload. If upload succeeds, we mark file as uploaded, save hash/file info, and move onto the next file. 

4. Each file upload should follow the current xlsx dhis2 load path of creating metadata in dhis2 and then loading the data. 

Data Structure for target files:

In addition to the current implementation for the xlsx file, we need there to be support for the following csv files:


### Files and column names
```1:1:projects/sftp/data/samples/pepfar/PEPFAR_TxRTT_2025_Q2_Cleaned_v3_20250805160300.csv
site_id,facility,indicator,sex,age_group,Date_Submitted,Returned <3 mo,Returned 3-5 mo,Returned 6+ mo
```

```1:1:projects/sftp/data/samples/pepfar/PEPFAR_TxNEW_2025_Q2_Cleaned_v3_20250805160300.csv
site_id,facility,indicator,sex,age_group,Date_Submitted,cd4_less_than_200,cd4_greater_than_equal_to_200,cd4_unknown_or_not_done
```

```1:1:projects/sftp/data/samples/pepfar/PEPFAR_TxML_2025_Q2_Cleaned_v3_20250805160300.csv
site_id,facility,indicator,sex,age_group,Date_Submitted,IIT <3 mo,IIT 3-5 mo,IIT 6+ mo,Patient died,Patient transferred out,Treatment stopped
```

```1:1:projects/sftp/data/samples/pepfar/PEPFAR_TxCURR_2025_Q2_Cleaned_v3_20250805160300.csv
site_id,facility,indicator,sex,age_group,Date_Submitted,tx_curr
```

```1:1:projects/sftp/data/samples/pepfar/PEPFAR_TxCURRMMD_2025_Q2_Cleaned_v3_20250805160300.csv
site_id,facility,indicator,sex,age_group,Date_Submitted,# of clients on <3 months of ARVs,# of clients on 3 - 5 months of ARVs,# of clients on >= 6 months of ARVs
```

```1:1:projects/sftp/data/samples/moh/MoH_CohortReport_2025_Q1_Initial_v1_20250805160300.csv
Facility Name,indicator_number,site_id,Indicator Name,newly_reg_in_quarter,cumulative_ever_reg,reporting_period
```

```1:1:projects/sftp/data/samples/moh/MoH_RegimenDistributionByWeight_2025_Q1_Initial_v1_20250805160300.csv
site_id,gender,age_group,weight_band,regimen_category,total_clients
```

```1:1:projects/sftp/data/samples/moh/MoH_SurvivalAnalysisGeneral_2025_Q1_Initial_v1_20250805160300.csv
site_id,Year,Quarter,Interval,Total Registered,Total Alive,Patient Died,Total Defaulted,Treatment Stopped,Patient transferred out,Unknown
```

```1:1:projects/sftp/data/samples/moh/MoH_SurvivalAnalysisWomen_2025_Q1_Initial_v1_20250805160300.csv.csv
site_id,Year,Quarter,Interval,Total Registered,Total Alive,Patient Died,Total Defaulted,Treatment Stopped,Patient transferred out,Unknown
```

```1:1:projects/sftp/data/samples/moh/MoH_TPTNewInitiations_2025_Q1_Initial_v1_20250805160300.csv.csv
site_id,gender,age_group,3HP (Started New on ART),6H (Started New on ART),3HP (Started Previously on ART),6H (Started Previously on ART)
```

```1:1:projects/sftp/data/samples/moh/MoH_SurvivalAnalysisChildren_2025_Q1_Initial_v1_20250805160300.csv
site_id,Year,Quarter,Interval,Total Registered,Total Alive,Patient Died,Total Defaulted,Treatment Stopped,Patient transferred out,Unknown
```

### Compare / contrast
- **Shared keys (PEPFAR)**: `site_id`, `facility`, `indicator`, `sex`, `age_group`, `Date_Submitted`.
  - **Measures differ per indicator**:
    - TxRTT: “Returned <3 mo”, “Returned 3–5 mo”, “Returned 6+ mo”.
    - TxNEW: CD4 bins.
    - TxML: IIT duration bins + outcomes (died, transferred, stopped).
    - TxCURR: `tx_curr`.
    - TxCURR_MMD: MMD duration bins.
- **Shared keys (MoH)**: `site_id` is consistent; time is by `Year`/`Quarter`/`Interval` or a `reporting_period` string; facility appears as `Facility Name` only in CohortReport.
  - **Measures**:
    - CohortReport: registration metrics.
    - RegimenDistribution: `gender`, `age_group`, `weight_band`, `regimen_category`, `total_clients`.
    - Survival* (General/Women/Children): survival/retention outcomes by time interval.
    - TPTNewInitiations: TPT regimen starts split by “New on ART” vs “Previously on ART”.
- **Cross-dataset alignment**:
  - `facility` (PEPFAR) ≈ `Facility Name` (MoH CohortReport).
  - `sex` (PEPFAR) ≈ `gender` (MoH); note PEPFAR includes `FNP` which may need mapping.
  - Time: `Date_Submitted` (PEPFAR) vs `Year`/`Quarter`/`Interval` or `reporting_period` (MoH).
- **Column naming quirks to consider**:
  - Special characters and spaces in column names (e.g., “IIT <3 mo”, “# of clients on …”, “3HP (Started New on ART)”) may require quoting/renaming in downstream code.
  - Repeated header rows appear in some files (e.g., `PEPFAR_TxML`, `MoH_TPTNewInitiations` show header lines again later), so readers should handle or drop duplicate headers.
  - Two files have a double `.csv.csv` extension (`MoH_SurvivalAnalysisWomen`, `MoH_TPTNewInitiations`).




### Implementation Plan: CSV/XLSX Support and State Management *(status: delivered September 2025)*

- **Objectives**
  - Support both `.xlsx` and `.csv` inputs end-to-end.
  - Keep per-file metadata loading now; architect for file-type–based DHIS2 initialization later.
  - Add per-file-type configs derived from current `@samples/`.
  - Ensure robust, synchronized state management across cron and webhook runs.

- **File discovery and selection** *(completed)*
- Locks and file index are handled via native OpenFn state persistence in this iteration (DHIS2 dataStore hooks are stubbed for later use).
  - Candidate selection continues to use shared config loader logic.

- **Input state contract (caller parameters)**
  - `configuration`: SFTP/DHIS2 credentials.
  - `params` defaulted for directory, file patterns, file types, state backend, chunk size, dry run, etc.
  - Support overrides: `targetFile`, `targetFilePattern`, `fileTypeConfigKey`, `configPath`.

- **Persistent state schema (shared across cron/webhooks)** *(completed for `filesIndex` + locking; resume markers captured per file)*
  - Remaining enhancements (e.g. detailed `lastRunSummary`) tracked separately.
- `filesIndex`: `{ [fileName]: { path, size, mtime, hash?, processed, lastProcessedAt, status, fileType, fileTypeConfigKey, inflight? } }`.
- `lock`: `{ owner, acquiredAt, expiresAt }` with TTL and safe release.
- Persisted directly in OpenFn cron state for this iteration.
  - Track `inflight` progress (chunk pointer, hash, header map, dhis2 mappings) for resume.

- **Persistence backend**
- Primary: OpenFn state (state returned by last successful cron run).
- DHIS2 dataStore endpoints retained for future scaling work.

- **Locking and concurrency**
  - Set workflow `concurrency: 1` (in `project.yaml`).
  - Logical lock lifecycle:
    - At Scan start: read `lock`; if `expiresAt > now`, exit; else acquire `{ owner: runId, acquiredAt, expiresAt }`.
    - Release at end; TTL protects against crashes.

- **Change detection and idempotency**
  - Prefer `hash` when available, else `(size, mtime)`, else first-seen.
  - CSV: compute streaming SHA-256 during parse; XLSX: compute on downloaded buffer during metadata.
  - Update `filesIndex[file]` each scan; keep `processed=true` unless file changed.

- **Metadata (per file; unified output)** *(implemented)*
  - Job 02 streams CSV/XLSX via adaptor operations and records hash/header map in the shared index.
  - XLSX: continue `getExcelMetadata(filePath, chunkSize, { columnMapping })`.
  - CSV: add lightweight pass: stream header (BOM-safe), sample rows for type inference, count rows, collect unique keys needed by DHIS2 init.
  - Normalize headers (trim/case/special-chars) and record a header map; detect repeated headers for later skipping.
  - Both paths yield: `{ uniqueValues, orgUnitParentMap?, dhis2Structures }` for Job 04.

- **Per-file-type configuration**
  - Registry: `projects/openfn-workflows/configs/file-types/*.json` with fields:
    - `fileTypeId`, `patterns` (filename regex), `format` (`xlsx|csv`).
    - `columns` (canonical keys), `headerMap`, `valueCoercions`.
    - `disaggregations`, `periodResolver`, `orgResolver`.
    - `dhis2Mappings` (strategy or explicit UIDs if pre-provisioned).
  - Seed for: PEPFAR (TxRTT, TxNEW, TxML, TxCURR, TxCURR_MMD) and MoH (CohortReport, RegimenDistributionByWeight, SurvivalAnalysis*, TPTNewInitiations).

- **DHIS2 initialization (forward-compatible)**
  - Keep current upsert flow, but route through a builder:
    - `buildDhis2Structures(fileTypeConfig, uniqueValues)` → orgUnits, categories, dataElements.
    - Future: swap builder per `fileTypeId` or bypass when pre-provisioned.
  - Idempotent by `code` lookups; guard dataset/category-combo creation.

- **Chunked processing & upload** *(implemented)*
  - XLSX: keep `getExcelChunk(...)` and existing upload path.
  - CSV: stream via `getCSV` + `parseCsv` with `{ bom:true, trim:true, skip_empty_lines:true }`:
    - Apply header map; drop repeated header rows.
    - Map orgUnit/dataElement/categoryOptionCombo via file-type config.
    - Coerce numeric/date fields; resolve period (`Date_Submitted` or `Year+Quarter(+Interval)`).
    - Build `dataValues`; include `dataSet` when configured; upload with `importStrategy=CREATE_AND_UPDATE&skipExistingCheck=true`.
  - Mixed periods/orgs: omit root-level `period`/`orgUnit` in payload.

- **Resume and retries**
  - Track `inflight.lastSuccessfulChunk`; resume from next chunk on retry.
  - On success: mark file `processed=true`, clear `inflight`.

- **State hygiene and limits**
  - After each job: `state.data = {}` and `state.references = []`.
  - Prune `filesIndex` entries older than N days (default 30) when `processed=true`.

- **Cron/webhook synchronization**
  - Both read same persistent state, acquire same lock, and write back at phase boundaries.
  - If `inflight` exists, resume that before scanning new files.
  - Record `lastRunSummary` (files, chunks, imported/updated/ignored, conflicts, errors).

- **Quality controls**
  - Per-file-type schema checks; value coercion; unknown entity counters.
  - Optional time-window filter before upload.
  - Structured logging: start/end, counts, first-2 mapping samples.

- **Milestones**
  1) Discovery + registry loader + lock/persist helpers — ✅
  2) CSV metadata pass + metadata builder orchestration — ✅
  3) CSV streaming chunk processing/upload — ✅
  4) Per-file-type configs for additional sample sets — *pending follow-up*
  5) Protections (schema/time window/unknown counters) — *pending*
  6) Docs and integration tests — ✅ updated README, end-to-end via adaptor helpers.

- **Acceptance criteria**
  - Mixed `.xlsx/.csv` detection; double `.csv.csv` handled; deterministic selection.
  - Metadata outputs unify shape and drive DHIS2 initialization.
  - Each sample file type uploads valid `dataValues` with correct `dataElement`, `orgUnit`, `period`, and `categoryOptionCombo`.
  - Resume works per chunk; state is small and pruned; cron/webhook do not race.

References:
- State best practices: `https://docs.openfn.org/documentation/jobs/state`
- SFTP CSV helpers (getCSV/parseCsv), streaming XLSX chunk/metadata are supported by the updated adaptors.
