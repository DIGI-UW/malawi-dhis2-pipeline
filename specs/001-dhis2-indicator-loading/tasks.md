# Tasks: DHIS2 Indicator Loading Pipeline

**Input**: Design documents from `/specs/001-dhis2-indicator-loading/`
**Prerequisites**: plan.md (complete), spec.md (complete), research.md (complete), data-model.md (complete), quickstart.md (complete)

**Status**: Implementation complete. Polish tasks in progress.

**Organization**: Tasks are grouped by user story to enable independent validation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Workflows**: `projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2/`
- **Custom Adaptors**: `projects/openfn-custom-adaptors/packages/`
- **Testing**: `projects/indicator_workflow_testing/`
- **Documentation**: `docs/`
- **Sample Data**: `projects/sftp/data/`

---

## Phase 1: Setup (Shared Infrastructure) ✅ COMPLETE

**Purpose**: Project initialization and Docker Swarm deployment framework

- [x] T001 Create repository structure with Instant OpenHIE v2 framework
- [x] T002 Initialize git submodules for openfn-custom-adaptors in projects/openfn-custom-adaptors/
- [x] T003 [P] Configure Docker Swarm deployment scripts in packages/
- [x] T004 [P] Setup SFTP server configuration in packages/sftp-storage/
- [x] T005 [P] Configure PostgreSQL for DHIS2 in packages/database-postgres/
- [x] T006 [P] Setup Nginx reverse proxy in packages/reverse-proxy-nginx/
- [x] T007 Create environment template with .env.example

---

## Phase 2: Foundational (Custom Adaptors) ✅ COMPLETE

**Purpose**: Core adaptor customizations required for workflow operation

**⚠️ CRITICAL**: Workflow cannot function without custom adaptors

- [x] T008 Fork @openfn/language-sftp and apply authentication fixes in projects/openfn-custom-adaptors/packages/sftp/
- [x] T009 [P] Fork @openfn/language-dhis2 and add metadata operations in projects/openfn-custom-adaptors/packages/dhis2/
- [x] T010 Build and publish custom adaptors as @openfn/language-sftp@2.1.0-custom
- [x] T011 [P] Build and publish custom adaptors as @openfn/language-dhis2@7.1.3-custom
- [x] T012 Configure workflow to use custom adaptor versions in project.yaml

**Checkpoint**: Custom adaptors ready - workflow jobs can now be implemented

---

## Phase 3: User Story 1 - Data Partner Uploads Indicator File (Priority: P1) ✅ COMPLETE

**Goal**: Enable data partners to upload indicator files that automatically import to DHIS2

**Independent Test**: Upload ART_data_long_format.xlsx to SFTP, verify data appears in DHIS2

### Implementation for User Story 1 ✅ COMPLETE

- [x] T013 [US1] Create Job 00 SFTP scanner in jobs/00-scan-sftp-for-changes.js
- [x] T014 [US1] Define FILE_TYPE_CONFIGS inline in jobs/00-scan-sftp-for-changes.js
- [x] T015 [P] [US1] Create Job 01 processing setup in jobs/01-check-and-setup-processing.js
- [x] T016 [US1] Create Job 02 Excel/CSV parser in jobs/02-parse-excel-metadata.js
- [x] T017 [US1] Implement period normalization logic (YYYYMM, YYYY-Qx) in jobs/02-parse-excel-metadata.js
- [x] T018 [US1] Create Job 03 DHIS2 metadata handler in jobs/03-check-and-setup-metadata.js
- [x] T019 [US1] Implement org unit upsert logic in jobs/03-check-and-setup-metadata.js
- [x] T020 [US1] Implement data element auto-creation in jobs/03-check-and-setup-metadata.js
- [x] T021 [US1] Implement category/category combo creation in jobs/03-check-and-setup-metadata.js
- [x] T022 [US1] Create Job 04 chunked uploader in jobs/04-process-all-chunks-sequentially.js
- [x] T023 [US1] Implement filesIndex state tracking across all jobs
- [x] T024 [US1] Implement resume capability with lastSuccessfulChunk in jobs/04-process-all-chunks-sequentially.js
- [x] T025 [US1] Configure workflow edges and conditions in project.yaml

**Checkpoint**: Core file upload functionality complete - files can be processed end-to-end

---

## Phase 4: User Story 2 - System Administrator Adds New File Format (Priority: P2) ✅ COMPLETE

**Goal**: Enable administrators to add support for new file types via configuration

**Independent Test**: Add new entry to FILE_TYPE_CONFIGS, upload matching file, verify processing

### Implementation for User Story 2 ✅ COMPLETE

- [x] T026 [US2] Add ART Data Long format configuration to FILE_TYPE_CONFIGS
- [x] T027 [P] [US2] Add DQ Sites format configuration to FILE_TYPE_CONFIGS
- [x] T028 [P] [US2] Add MoH Direct Queries format configuration to FILE_TYPE_CONFIGS
- [x] T029 [P] [US2] Add PEPFAR TX_CURR CSV format configuration to FILE_TYPE_CONFIGS
- [x] T030 [P] [US2] Add PEPFAR TX_MMD CSV format configuration to FILE_TYPE_CONFIGS
- [x] T031 [US2] Implement column mapping flexibility (multiple column name aliases)
- [x] T032 [US2] Implement category configuration parsing for disaggregations

### File Config Completeness Validation

- [ ] T066 [US2] Create FILE_TYPE_CONFIGS for 6 MOH CSV file types (moh_cohort_report, moh_regimen_distribution, moh_survival_general, moh_survival_women, moh_survival_children, moh_tpt_initiations) in jobs/00-scan-sftp-for-changes.js based on sample files in projects/sftp/data/samples/moh/

**Checkpoint**: Multiple file formats supported - system is extensible

---

## Phase 5: User Story 3 - System Administrator Deploys Pipeline to Production (Priority: P1) 🎯 IN PROGRESS

**Goal**: Enable local team to deploy and configure pipeline on government DHIS2 instance

**Independent Test**: Follow deployment guide to set up new instance, process test file successfully

### Implementation for User Story 3 (Partial) ✅ INFRASTRUCTURE COMPLETE

- [x] T033 [US3] Create Docker Swarm deployment configuration
- [x] T034 [P] [US3] Setup OpenFN Lightning deployment in packages/openfn/
- [x] T035 [P] [US3] Setup DHIS2 instance configuration in packages/dhis2-instance/
- [x] T036 [US3] Create initial environment-setup.md in docs/environment-setup.md
- [x] T037 [US3] Create initial production-deployment.md in docs/production-deployment.md
- [x] T038 [US3] Create handover-notes.md in docs/handover-notes.md

### Documentation for User Story 3 ⚠️ PENDING

- [ ] T039 [US3] Update docs/production-deployment.md with government DHIS2 instance deployment steps
- [ ] T040 [P] [US3] Add credential configuration walkthrough with screenshots to docs/
- [ ] T041 [P] [US3] Document DHIS2 permission requirements (openfn_integration user setup) in docs/
- [ ] T042 [US3] Document credential types and their purposes (dhis2-credential, combined-sftp-dhis2-credential)
- [ ] T043 [US3] Add troubleshooting section for common deployment failures in docs/production-deployment.md

**Checkpoint**: Deployment documentation enables local team to configure independently

---

## Phase 6: User Story 4 - Data Consumer Views Imported Indicators (Priority: P3) ✅ COMPLETE

**Goal**: Ensure imported data appears correctly in DHIS2 with proper disaggregation

**Independent Test**: Query DHIS2 after import, verify disaggregation matches source file

### Implementation for User Story 4 ✅ COMPLETE

- [x] T044 [US4] Implement category option combo resolution in jobs/03-check-and-setup-metadata.js
- [x] T045 [US4] Map disaggregation columns to DHIS2 category options
- [x] T046 [US4] Ensure period format consistency for trend reporting

**Checkpoint**: Data consumers can view correctly disaggregated data in DHIS2

---

## Phase 7: User Story 5 - System Administrator Monitors Pipeline Health (Priority: P3) ✅ COMPLETE

**Goal**: Enable administrators to monitor pipeline status and troubleshoot failures

**Independent Test**: Trigger successful and failed imports, verify logging in OpenFN Activity tab

### Implementation for User Story 5 ✅ COMPLETE

- [x] T047 [US5] Implement verbose logging throughout all jobs
- [x] T048 [P] [US5] Add error detail logging with row-level context
- [x] T049 [US5] Implement fail-fast credential validation in jobs/03-check-and-setup-metadata.js

**Checkpoint**: Administrators can monitor and troubleshoot pipeline operations

---

## Phase 8: Testing & Validation ✅ COMPLETE

**Purpose**: Test framework and sample data

- [x] T050 [P] Create test runner framework in projects/indicator_workflow_testing/run-tests.sh
- [x] T051 [P] Add API connectivity tests in projects/indicator_workflow_testing/tests/
- [x] T052 [P] Add SFTP integration tests in projects/indicator_workflow_testing/tests/
- [x] T053 [P] Provide sample ART Data file in projects/sftp/data/excel-files/ART_data_long_format.xlsx
- [x] T054 [P] Provide sample DQ Sites file in projects/sftp/data/excel-files/Q2FY25_DQ_253_sites.xlsx
- [x] T055 [P] Provide sample Direct Queries file in projects/sftp/data/excel-files/Direct Queries - Q1 2025 MoH Reports.xlsx
- [x] T056 [P] Provide sample PEPFAR CSV files in projects/sftp/data/samples/pepfar/

**Checkpoint**: Testing framework and sample data available for validation

---

## Phase 9: Polish & Handover Documentation ⚠️ IN PROGRESS

**Purpose**: Final documentation packaging for project handover

- [x] T057 [P] Create specification in specs/001-dhis2-indicator-loading/spec.md
- [x] T058 [P] Create implementation plan in specs/001-dhis2-indicator-loading/plan.md
- [x] T059 [P] Create research decisions document in specs/001-dhis2-indicator-loading/research.md
- [x] T060 [P] Create data model documentation in specs/001-dhis2-indicator-loading/data-model.md
- [x] T061 [P] Create quickstart guide in specs/001-dhis2-indicator-loading/quickstart.md
- [ ] T062 [P] Create FILE_TYPE_CONFIGS customization guide in docs/ or specs/
- [ ] T063 Package final handover report consolidating all documentation
- [ ] T064 Validate quickstart.md by following steps on clean environment
- [ ] T065 Review and update docs/summary.md with final project status

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: ✅ No dependencies - COMPLETE
- **Foundational (Phase 2)**: ✅ COMPLETE - custom adaptors ready
- **User Stories (Phases 3-7)**: ✅ Implementation COMPLETE
- **Testing (Phase 8)**: ✅ Test framework COMPLETE
- **Polish (Phase 9)**: 🔄 IN PROGRESS - documentation remaining

### Remaining Task Dependencies

- **T039-T043** (US3 Documentation): Can run in parallel, no dependencies
- **T062** (Config Guide): No dependencies
- **T063** (Handover Report): Depends on T039-T043, T062 completion
- **T064** (Quickstart Validation): No dependencies
- **T065** (Summary Update): Depends on T063

### Parallel Opportunities

```bash
# Run these documentation tasks in parallel:
Task T039: "Update production-deployment.md with government instance steps"
Task T040: "Add credential configuration screenshots"
Task T041: "Document DHIS2 permission requirements"
Task T062: "Create FILE_TYPE_CONFIGS customization guide"
Task T064: "Validate quickstart.md on clean environment"
```

---

## Summary

| Phase | Total | Done |
|-------|-------|------|
| Phase 1: Setup | 7 | 7 |
| Phase 2: Foundational | 5 | 5 |
| Phase 3: US1 File Upload | 13 | 13 |
| Phase 4: US2 File Formats | 8 | 7 |
| Phase 5: US3 Deployment | 11 | 6 |
| Phase 6: US4 Data Display | 3 | 3 |
| Phase 7: US5 Monitoring | 3 | 3 |
| Phase 8: Testing | 7 | 7 |
| Phase 9: Polish | 9 | 5 |
| **TOTAL** | **66** | **56** |
