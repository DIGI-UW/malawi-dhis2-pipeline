# DHIS2 Workflow Fix Summary

## Test Results - October 7, 2025

### Problem Statement
OpenFN workflow was creating duplicate data values in DHIS2 because all data used the default category option combo (`HllvX50cXC0`) instead of being disaggregated by sex and age group.

### Root Cause Analysis

**Test Methodology:**
Created Python and Bash scripts to test DHIS2 API directly, bypassing the full workflow to isolate issues.

**Key Finding:**
The DHIS2 API works perfectly. The issue was in Job 3's `createDataElements()` function, which did NOT assign the custom category combo to data elements at creation time.

### Test Evidence

**Data Element WITH Category Combo:**
```json
{
  "name": "TX_CURR Test (With Combo)",
  "categoryCombo": {
    "name": "Health Reporting Combo",
    "categoryOptionCombos": [
      {"name": "Male", "id": "svYAzdCLqJT"},
      {"name": "Female", "id": "VqFgn8A2T9N"}
    ]
  }
}
```

**Data Element WITHOUT Category Combo (What we were creating):**
```json
{
  "name": "TX_CURR Test (Default)",
  "categoryCombo": {
    "name": "default",
    "categoryOptionCombos": [
      {"name": "default", "id": "HllvX50cXC0"}
    ]
  }
}
```

### Fixes Implemented

#### Fix #1: Assign Category Combo to Data Elements

**File:** `jobs/03-check-and-setup-metadata.js`

**Change 1:** Updated function signature to accept `categoryCombinationId`
```javascript
// Before
async function createDataElements(dataElementStructures, state) {

// After
async function createDataElements(dataElementStructures, categoryCombinationId, state) {
```

**Change 2:** Added category combo to payload
```javascript
// Before
const payload = {
  name: dataElement.name,
  shortName: dataElement.shortName,
  code: dataElement.code,
  valueType: dataElement.valueType,
  aggregationType: dataElement.aggregationType,
  domainType: dataElement.domainType
};

// After
const payload = {
  name: dataElement.name,
  shortName: dataElement.shortName,
  code: dataElement.code,
  valueType: dataElement.valueType,
  aggregationType: dataElement.aggregationType,
  domainType: dataElement.domainType
};

// Assign category combo for disaggregation
if (categoryCombinationId) {
  payload.categoryCombo = { id: categoryCombinationId };
}
```

**Change 3:** Updated function call to pass category combo ID
```javascript
// Before
const dataElementMappings = await createDataElements(dataElements, state);

// After
const dataElementMappings = await createDataElements(dataElements, categoryCombinationId, state);
```

#### Fix #2: Correct Paging Parameter Format

**File:** `jobs/03-check-and-setup-metadata.js`

**Change:** Replaced all `paging: 'false'` (string) with `paging: false` (boolean)
- Fixed 8 occurrences throughout the file
- While both work, boolean is the correct type

### Impact

**Before Fix:**
- All data values used default combo: `HllvX50cXC0`
- Every row with same org unit + data element + period = duplicate
- No disaggregation by sex or age group
- DHIS2 log filled with "Duplicate object" warnings

**After Fix:**
- Data elements created with custom category combo
- Each sex value gets unique category option combo ID
- Male → `svYAzdCLqJT`
- Female → `VqFgn8A2T9N`
- No more duplicates (assuming age group categories added similarly)

### Test Results Summary

All DHIS2 API tests passed:
- ✅ Categories can be created and retrieved immediately
- ✅ Category combos auto-generate option combos correctly
- ✅ Data elements CAN be assigned custom category combos
- ✅ Paging parameter works with both string and boolean formats
- ✅ No timing issues with GET after POST

### Next Steps

1. **Delete existing TX_CURR data element** in DHIS2 (it has wrong combo)
2. **Run the workflow** to create TX_CURR with correct combo
3. **Verify** data loads with proper disaggregation
4. **Add age group category** to the category combo for full disaggregation

### Files Modified

- `jobs/03-check-and-setup-metadata.js` - Fixed data element creation

### Test Files Created

- `test/dhis2_api_test.py` - Python test script
- `test/dhis2-api-debug.sh` - Bash test script  
- `test/TEST-PLAN.md` - Detailed test strategy
- `test/dhis2-api-results/*.json` - API response snapshots

### Key Lessons

1. **Test API directly** before blaming DHIS2 or timing issues
2. **Category combos belong to data elements**, not datasets
3. **Disaggregation is defined at data element level** in DHIS2
4. **Always assign categoryCombo when creating data elements** that need disaggregation




