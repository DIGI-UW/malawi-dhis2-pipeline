<!--
Sync Impact Report
==================
Version change: 0.0.0 → 1.0.0 (initial creation)
Added sections:
  - Principle I: Configuration-Driven Design
  - Principle II: State-Driven Workflows
  - Principle III: Single Responsibility Jobs
  - Principle IV: DHIS2 API Compliance
  - Principle V: Resumable Processing
  - Principle VI: Graceful Error Handling
  - Technology Standards section
  - Quality Gates section
  - Governance section
Templates requiring updates:
  - .specify/templates/plan-template.md ✅ (Constitution Check section already present)
  - .specify/templates/spec-template.md ✅ (no changes needed)
  - .specify/templates/tasks-template.md ✅ (no changes needed)
Follow-up TODOs: None
-->

# Malawi DHIS2 Pipeline Constitution

## Core Principles

### I. Configuration-Driven Design

All file format processing MUST be driven by configuration rather than hardcoded logic.

- File type configurations (FILE_TYPE_CONFIGS) MUST define: file patterns, column mappings, period formats, and category configurations
- Adding support for new file formats MUST NOT require modifying workflow job code
- Configuration MUST be the single source of truth for data transformation rules
- Column mappings MUST support multiple aliases for flexibility with varying source formats

**Rationale**: Health data comes from diverse partners (PEPFAR, MOH) with evolving formats. Configuration-driven design enables local teams to extend the system without developer assistance.

### II. State-Driven Workflows

All OpenFN workflow jobs MUST follow state-driven design patterns per [OpenFN documentation](https://docs.openfn.org/documentation/design/design-overview).

- Each job MUST receive state as input and return a new state object
- State MUST be treated as immutable; jobs return `{ ...state, newProperties }` rather than mutating
- File processing status MUST be tracked in `state.filesIndex` with status, lastSuccessfulChunk, and metadata
- Workflow progress MUST be recoverable from state alone

**Rationale**: State-driven design enables workflow resumption after failures and provides complete audit trail of processing.

### III. Single Responsibility Jobs

Each workflow job MUST have a single, well-defined responsibility.

- Job 0: SFTP scanning and file selection
- Job 1: Configuration validation and setup
- Job 2: File parsing and metadata extraction
- Job 3: DHIS2 metadata resolution/creation
- Job 4: Data value upload

Jobs MUST NOT combine concerns (e.g., parsing and uploading in one job). Inter-job communication MUST occur exclusively through state.

**Rationale**: Single responsibility enables independent testing, easier debugging, and targeted retry when failures occur.

### IV. DHIS2 API Compliance

All DHIS2 interactions MUST follow official API patterns from [DHIS2 documentation](https://docs.dhis2.org/) and [OpenFN DHIS2 adaptor](https://github.com/OpenFn/language-dhis2).

- Data value uploads MUST use `create("dataValueSets", ...)` pattern
- Payload structure MUST include: dataSet, period, orgUnit, completeDate, dataValues
- Each dataValue MUST include: dataElement, period, orgUnit, value, categoryOptionCombo
- Import strategy MUST use CREATE_AND_UPDATE to handle re-uploads gracefully
- Metadata operations MUST validate existence before creation

**Rationale**: DHIS2 API compliance ensures data integrity and compatibility with government health information systems.

### V. Resumable Processing

Large file processing MUST support interruption and resumption.

- Files MUST be processed in configurable chunks (default: 5000 rows)
- `state.filesIndex[filename].lastSuccessfulChunk` MUST track progress
- On workflow restart, processing MUST resume from lastSuccessfulChunk + 1
- Chunk boundaries MUST NOT split logical data units (e.g., all values for one facility/period)

**Rationale**: Health data files can contain tens of thousands of rows. Resumable processing prevents data loss and reduces reprocessing time after failures.

### VI. Graceful Error Handling

All jobs MUST implement graceful failure patterns.

- Validation failures MUST return `{ ...state, workflowComplete: true, error: "message" }`
- Partial failures MUST log details but continue processing valid rows
- DHIS2 API errors MUST be captured with response details for troubleshooting
- Error messages MUST be actionable (specify which field/row failed and why)

**Rationale**: Production health systems require clear error messages for operators who may not have developer skills.

## Technology Standards

### Platform Stack

- **Workflow Engine**: OpenFN Lightning v2.8+
- **Adaptors**: Custom @openfn/language-sftp@2.1.0-custom, @openfn/language-dhis2@7.1.3-custom
- **Deployment**: Docker Swarm via Instant OpenHIE v2
- **Target**: DHIS2 v2.39+ (Malawi government instance)

### Custom Adaptors

The pipeline uses forked OpenFN adaptors in `projects/openfn-custom-adaptors/` to address:
- SFTP authentication handling fixes
- Enhanced DHIS2 metadata operations

Changes to custom adaptors MUST be documented with rationale and upstream PR status if applicable.

### Credential Management

- Production credentials MUST be configured via OpenFN web UI, never in code
- Two credential types required:
  - `dhis2-credential`: Admin access for metadata operations
  - `combined-sftp-dhis2-credential`: Integration user for data uploads
- Integration user (`openfn_integration`) MUST have explicit org unit assignments in DHIS2

## Quality Gates

### Before Merging Features

1. **Configuration Validation**: New FILE_TYPE_CONFIGS MUST include sample file in `projects/sftp/data/samples/`
2. **End-to-End Test**: Feature MUST be verified with test file upload through complete workflow
3. **Error Scenario Coverage**: Common failure modes (invalid data, missing metadata) MUST produce actionable errors
4. **Documentation**: New file types MUST be documented in spec.md and data-model.md

### Before Production Deployment

1. **Credential Verification**: Confirm correct DHIS2 URL and service account permissions
2. **Metadata Alignment**: Verify DHIS2 metadata UIDs match or auto-creation is enabled
3. **Sample File Test**: Process at least one file of each type successfully
4. **Monitoring Setup**: Confirm OpenFN Activity tab shows workflow runs

## Governance

This constitution establishes non-negotiable principles for the Malawi DHIS2 Pipeline project.

### Amendment Process

1. Proposed changes MUST be documented with rationale
2. Changes affecting core principles require review of downstream impact
3. Version increments follow semantic versioning:
   - MAJOR: Principle removal or redefinition
   - MINOR: New principle or significant expansion
   - PATCH: Clarifications or typo fixes

### Compliance

- All PRs MUST verify alignment with constitution principles
- Complexity beyond these principles MUST be justified in plan.md Complexity Tracking section
- Runtime development guidance: See `CLAUDE.md` and `AGENTS.md`

### References

- [OpenFN Design Documentation](https://docs.openfn.org/documentation/design/design-overview)
- [DHIS2 Developer Documentation](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/data.html)
- [Instant OpenHIE v2](https://github.com/openhie/instant-v2)
- Project specs: `specs/001-dhis2-indicator-loading/`

**Version**: 1.0.0 | **Ratified**: 2025-11-25 | **Last Amended**: 2025-11-25
