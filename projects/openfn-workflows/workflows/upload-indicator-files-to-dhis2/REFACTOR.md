# DHIS2 Pipeline Refactoring Plan

## Current State Analysis

### Job Files Issues:
1. **Massive configuration duplication** - `FILE_SELECTION_RULES` and `FILE_TYPE_CONFIGS` are duplicated across jobs
2. **DHIS2 API logic scattered** - Complex metadata creation functions are embedded in job files
3. **Utility function duplication** - `generateCodeFromName`, `normalizePeriod`, `mapColumns` repeated across jobs
4. **Mixed responsibilities** - Jobs handle both business logic and DHIS2 API details
5. **Large, complex functions** - Some functions are 100+ lines with multiple responsibilities

### Adaptor Gaps:
1. **Missing high-level metadata operations** - No `createMetadataSet`, `createUserWithPermissions`, etc.
2. **Limited data transformation utilities** - Missing CSV/Excel processing helpers
3. **No configuration management** - File type configs not centralized

## Refactoring Targets & Priorities

### 🎯 **Priority 1: Move DHIS2 Metadata Operations to Adaptor**

**Target Functions to Move:**
- `createCategories()` → `@openfn/language-dhis2`
- `createCategoryCombination()` → `@openfn/language-dhis2` 
- `createDataElements()` → `@openfn/language-dhis2`
- `createDataSet()` → `@openfn/language-dhis2`
- `checkAndCreateIntegrationUser()` → `@openfn/language-dhis2`
- `createOrganizationUnitGroups()` → `@openfn/language-dhis2`

**New Adaptor Functions:**
```javascript
// High-level metadata operations
export function createMetadataSet(metadataConfig, options = {})
export function createUserWithPermissions(userConfig, orgUnitIds, options = {})
export function createCategoryStructure(categories, options = {})
export function createDataElementStructure(dataElements, options = {})
export function createOrgUnitHierarchy(orgUnits, options = {})
```

### 🎯 **Priority 2: Centralize Configuration Management**

**Create:** `@openfn/language-dhis2/src/config.js`
```javascript
export const FILE_TYPE_CONFIGS = { /* centralized configs */ }
export function loadFileTypeConfig(fileTypeKey)
export function matchFileToConfig(fileName, configs)
export function validateFileTypeConfig(config)
```

**Remove from jobs:** All `FILE_TYPE_CONFIGS` and `FILE_SELECTION_RULES` duplication

### 🎯 **Priority 3: Move Data Processing Utilities**

**Target Functions to Move:**
- `mapColumns()` → `@openfn/language-sftp` (CSV processing)
- `normalizeHeader()` → `@openfn/language-sftp`
- `buildDataValues()` → `@openfn/language-dhis2` (DHIS2-specific)
- `isHeaderLikeRow()` → `@openfn/language-sftp`
- `normalizePeriod()` → `@openfn/language-dhis2` (already exists, consolidate)

**New Adaptor Functions:**
```javascript
// In @openfn/language-sftp
export function processCsvData(filePath, config, options = {})
export function validateCsvHeaders(headers, config)
export function cleanCsvData(records, config)

// In @openfn/language-dhis2  
export function buildDataValueSet(records, mappings, options = {})
export function validateDataValues(dataValues, schema)
```

### 🎯 **Priority 4: Simplify Job Files**

**Job 1 (Scan SFTP):** 
- Remove `FILE_SELECTION_RULES` → use adaptor config
- Remove file type inference → use adaptor function
- Focus on: file discovery, locking, state management

**Job 2 (Check Target File):**
- Remove `FILE_TYPE_CONFIGS` → use adaptor config
- Focus on: file validation, config loading

**Job 3 (Parse Metadata):**
- Remove `buildDhis2Structures()` → use adaptor function
- Remove parsing logic → use adaptor functions
- Focus on: orchestration, state management

**Job 4 (Setup Metadata):**
- Remove all DHIS2 API functions → use adaptor functions
- Focus on: orchestration, error handling

**Job 5 (Process Chunks):**
- Remove `buildDataValues()` → use adaptor function
- Remove data transformation → use adaptor functions
- Focus on: chunk processing, upload orchestration

## Detailed Refactoring Plan

### Phase 1: DHIS2 Metadata Operations (Week 1)

1. **Create new DHIS2 adaptor functions:**
   ```javascript
   // @openfn/language-dhis2/src/metadata.js
   export function createMetadataSet(metadataConfig, options = {}) {
     // Orchestrates: categories, data elements, data sets, org units
   }
   
   export function createUserWithPermissions(userConfig, orgUnitIds, options = {}) {
     // Handles: user creation, role assignment, org unit assignment
   }
   ```

2. **Update Job 4 to use new functions:**
   ```javascript
   // Before: 200+ lines of DHIS2 API logic
   // After: 
   const metadataMappings = await createMetadataSet(dhis2Structures, {
     countryConfig: { name: 'Malawi', code: 'MW' },
     integrationUser: { username: 'openfn_integration', password: 'OpenFn@2024!' }
   })(state);
   ```

### Phase 2: Configuration Centralization (Week 1)

1. **Create centralized config:**
   ```javascript
   // @openfn/language-dhis2/src/config.js
   export const FILE_TYPE_CONFIGS = { /* single source of truth */ }
   ```

2. **Update all jobs to import config:**
   ```javascript
   import { loadFileTypeConfig } from '@openfn/language-dhis2';
   const fileTypeConfig = loadFileTypeConfig(selectedKey);
   ```

### Phase 3: Data Processing Utilities (Week 2)

1. **Move CSV processing to SFTP adaptor:**
   ```javascript
   // @openfn/language-sftp/src/csv.js
   export function processCsvData(filePath, config, options = {}) {
     // Handles: parsing, header mapping, validation, chunking
   }
   ```

2. **Move DHIS2 data building to DHIS2 adaptor:**
   ```javascript
   // @openfn/language-dhis2/src/data.js
   export function buildDataValueSet(records, mappings, options = {}) {
     // Handles: data value creation, validation, formatting
   }
   ```

### Phase 4: Job Simplification (Week 2)

1. **Refactor each job to focus on single responsibility:**
   - **Job 1:** File discovery + locking
   - **Job 2:** File validation + config loading  
   - **Job 3:** Metadata parsing orchestration
   - **Job 4:** DHIS2 setup orchestration
   - **Job 5:** Data upload orchestration

2. **Remove all utility functions from jobs**

3. **Add comprehensive error handling and logging**

## Expected Benefits

### Code Quality:
- **Reduce job file size by 60-70%**
- **Eliminate code duplication**
- **Improve testability** (adaptor functions can be unit tested)
- **Better separation of concerns**

### Maintainability:
- **Single source of truth for configurations**
- **Centralized DHIS2 API logic**
- **Easier to add new file types**
- **Simpler job debugging**

### Reusability:
- **Adaptor functions can be used in other workflows**
- **Configuration can be shared across projects**
- **Utilities can be used independently**

## Implementation Strategy

1. **Start with Job 4** (most complex, biggest impact)
2. **Move functions incrementally** (one at a time, test each)
3. **Keep old functions temporarily** (for rollback)
4. **Update jobs one by one** (maintain working state)
5. **Remove old functions** (after all jobs updated)

## Current Status

- [ ] Phase 1: DHIS2 Metadata Operations
- [ ] Phase 2: Configuration Centralization  
- [ ] Phase 3: Data Processing Utilities
- [ ] Phase 4: Job Simplification

**Note:** This refactoring plan is deferred until the workflow is fully functional and tested.
