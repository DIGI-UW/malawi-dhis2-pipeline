# Research & Decisions: DHIS2 Indicator Loading Pipeline

**Date**: 2025-11-24
**Context**: Key technical decisions made during implementation (June-November 2025)

## Key Technical Decisions

### 1. Custom OpenFN Adaptors

**Decision**: Fork and customize @openfn/language-sftp and @openfn/language-dhis2 adaptors

**Rationale**:
- Official SFTP adaptor v2.0.14 had authentication issues in Docker builds (pnpm symlink issues)
- DHIS2 adaptor needed specific metadata operations not available in upstream version
- Faster iteration than waiting for upstream fixes

**Alternatives Considered**:
- Wait for official fixes: Rejected due to timeline constraints
- Write standalone Node.js scripts: Rejected to maintain OpenFN ecosystem compatibility
- Use HTTP adaptor for all operations: Rejected due to complexity of SFTP operations

**Evidence**: See `projects/openfn-custom-adaptors/` submodule and git history showing adaptor fixes

---

### 2. Five-Job Workflow Architecture

**Decision**: Split pipeline into 5 sequential jobs with conditional edges

**Rationale**:
- **Resumability**: Each job saves state; failure in Job 4 doesn't lose metadata work from Job 3
- **Credential separation**: Admin credentials for metadata (Job 3), integration user for data (Job 4)
- **Debugging**: Isolate failures to specific processing stages
- **OpenFN best practices**: Small, focused jobs are recommended

**Alternatives Considered**:
- Single monolithic job: Rejected because failure loses all progress
- Two-job split (setup vs upload): Rejected because credential separation requires three credential types
- Parallel processing: Rejected due to DHIS2 API rate limits and conflict potential

**Evidence**: `project.yaml` workflow definition with conditional edges

---

### 3. Inline FILE_TYPE_CONFIGS

**Decision**: Store file type configurations inline in Job 00 rather than external JSON files

**Rationale**:
- Faster iteration during development - no rebuild needed
- All configuration visible in one place
- Avoids file loading complexity in Docker environment

**Alternatives Considered**:
- External JSON configs: Planned for future refactor (more maintainable)
- Database-stored configs: Rejected as over-engineering for current scale
- Environment variables: Rejected due to complexity of nested config structure

**Known Technical Debt**: Should be externalized to JSON files for easier maintenance by non-developers

**Evidence**: `FILE_TYPE_CONFIGS` object in `jobs/00-scan-sftp-for-changes.js`

---

### 4. Chunked Processing with State Tracking

**Decision**: Process large files in configurable chunks (default 5000 rows) with per-chunk state

**Rationale**:
- Memory efficiency: Streaming prevents loading entire files into memory
- Resumability: `lastSuccessfulChunk` enables restart from failure point
- DHIS2 API limits: Smaller payloads avoid timeout and size limits

**Alternatives Considered**:
- Load entire file: Rejected due to memory limits (100k+ row files)
- Fixed chunk size: Rejected in favor of configurable `maxChunkSize`
- Parallel chunk uploads: Rejected due to DHIS2 conflict potential

**Evidence**: `state.filesIndex[file].lastSuccessfulChunk` tracking in Job 04

---

### 5. CREATE_AND_UPDATE Import Strategy

**Decision**: Use DHIS2 `CREATE_AND_UPDATE` strategy with `skipExistingCheck`

**Rationale**:
- Idempotent: Re-uploading same data is safe
- Newer data wins: Handles corrected data files naturally
- Simple conflict resolution: No complex merge logic needed

**Alternatives Considered**:
- CREATE only: Rejected because data corrections need overwrites
- Manual conflict resolution: Rejected as too complex for batch processing
- Version comparison: Rejected due to lack of versioning in source files

**Evidence**: DHIS2 API calls in Job 04 with `importStrategy: 'CREATE_AND_UPDATE'`

---

### 6. Auto-Create DHIS2 Metadata

**Decision**: Automatically create missing org units, data elements, and categories in DHIS2

**Rationale**:
- Self-healing: New facilities in files automatically added to DHIS2
- Reduced manual setup: Minimizes admin work on target DHIS2 instance
- Fail-fast: Clear errors if auto-creation not possible (e.g., permission denied)

**Alternatives Considered**:
- Require pre-configured metadata: Rejected due to maintenance burden
- Skip unknown entities: Rejected because data would be lost
- Manual mapping file: Rejected as too complex for handover to local team

**Evidence**: `createCategories`, `createDataElements`, upsert logic in Job 03

---

### 7. Docker Swarm Deployment

**Decision**: Use Instant OpenHIE v2 with Docker Swarm for deployment

**Rationale**:
- Pre-built infrastructure: OpenFN, DHIS2, PostgreSQL already integrated
- Production-ready: Secrets management, health checks, restart policies
- Familiar to health IT teams: OpenHIE is common in health informatics

**Alternatives Considered**:
- Kubernetes: Rejected as over-engineering for single-node deployment
- Docker Compose: Rejected because Swarm provides better production features
- Manual installation: Rejected due to complexity and reproducibility concerns

**Evidence**: `packages/` directory structure, `instant` CLI usage throughout

---

## Integration Patterns

### SFTP File Discovery

**Pattern**: Cron-triggered scan with file status tracking

```
Every 5 minutes:
  1. List all files in SFTP directory
  2. Filter by supported patterns
  3. Check filesIndex for already-processed files
  4. Select first unprocessed file
  5. Process or skip based on state
```

### DHIS2 Metadata Resolution

**Pattern**: Get-or-Create with deterministic codes

```
For each entity (org unit, data element, category):
  1. Generate code from name (deterministic)
  2. GET by code from DHIS2
  3. If exists: use returned ID
  4. If not exists: POST to create, use new ID
  5. Handle 409 Conflict by re-fetching
```

### State Persistence

**Pattern**: OpenFN state.filesIndex as persistent tracking

```
filesIndex = {
  "filename.xlsx": {
    status: "completed" | "processing" | "failed",
    lastSuccessfulChunk: 5,
    dhis2Mappings: { ... },
    lastProcessedAt: "2025-11-24T12:00:00Z"
  }
}
```

## Unresolved / Deferred Items

1. **External config files**: FILE_TYPE_CONFIGS should be moved to JSON files
2. **PEPFAR MMD hardcoding**: Special row-splitting logic should be generalized
3. **Utility deduplication**: Some helper functions repeated across jobs
4. **Monitoring dashboard**: Currently relies on OpenFN Activity tab only
