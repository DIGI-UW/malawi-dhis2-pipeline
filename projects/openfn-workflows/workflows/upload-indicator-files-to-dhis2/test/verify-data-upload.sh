#!/bin/bash
# DHIS2 Data Upload Verification Script
# Verifies that the OpenFN workflow correctly uploaded disaggregated data values

set -e

DHIS2_URL="${DHIS2_URL:-http://localhost:8080}"
DHIS2_USER="${DHIS2_USER:-admin}"
DHIS2_PASS="${DHIS2_PASS:-district}"
AUTH="${DHIS2_USER}:${DHIS2_PASS}"

OUTPUT_DIR="./test/dhis2-api-results"
mkdir -p "$OUTPUT_DIR"

# Expected values from workflow
EXPECTED_TOTAL=781
EXPECTED_COMBOS=55
EXPECTED_ORG_UNITS=21
DATA_SET_ID="IvnQNOyL50L"
DATA_ELEMENT_ID="qGKa4asLplN"
PERIOD="2025Q2"

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0
WARNINGS=0

echo "==================================="
echo "DHIS2 Data Verification"
echo "==================================="
echo "DHIS2 URL: $DHIS2_URL"
echo "Period: $PERIOD"
echo "Data Set: $DATA_SET_ID"
echo "Data Element: $DATA_ELEMENT_ID"
echo "Output: $OUTPUT_DIR"
echo ""

# Helper functions
pass_test() {
    echo "✓ PASS: $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail_test() {
    echo "✗ FAIL: $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

warn_test() {
    echo "⚠ WARN: $1"
    WARNINGS=$((WARNINGS + 1))
}

info() {
    echo "ℹ INFO: $1"
}

# Test 0: Basic connectivity
echo "TEST 0: Basic Connectivity"
echo "-----------------------------------"
curl -s -u "$AUTH" "$DHIS2_URL/api/me?fields=id,username" > "$OUTPUT_DIR/00-whoami.json"
if [ $? -eq 0 ]; then
    USERNAME=$(cat "$OUTPUT_DIR/00-whoami.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('username', 'unknown'))" 2>/dev/null || echo "unknown")
    pass_test "DHIS2 is accessible (user: $USERNAME)"
else
    fail_test "DHIS2 connection failed"
    exit 1
fi
echo ""

# Test 1: Query all uploaded data values
echo "TEST 1: Query All Uploaded Data Values"
echo "-----------------------------------"
curl -s -u "$AUTH" "$DHIS2_URL/api/dataValueSets?dataSet=$DATA_SET_ID&period=$PERIOD" \
  > "$OUTPUT_DIR/01-datavalues-full.json"

# Also get via dataValues endpoint for detailed analysis
curl -s -u "$AUTH" "$DHIS2_URL/api/dataValues?dataElement=$DATA_ELEMENT_ID&period=$PERIOD&paging=false" \
  > "$OUTPUT_DIR/01-datavalues-detailed.json"

ACTUAL_COUNT=$(cat "$OUTPUT_DIR/01-datavalues-detailed.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('dataValues', [])))" 2>/dev/null || echo "0")

if [ "$ACTUAL_COUNT" -eq "$EXPECTED_TOTAL" ]; then
    pass_test "Total data values: $ACTUAL_COUNT (expected: $EXPECTED_TOTAL)"
else
    fail_test "Total data values: $ACTUAL_COUNT (expected: $EXPECTED_TOTAL)"
fi
echo ""

# Test 2a: Count by Organization Unit
echo "TEST 2a: Count by Organization Unit"
echo "-----------------------------------"
UNIQUE_ORG_UNITS=$(cat "$OUTPUT_DIR/01-datavalues-detailed.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(set([v['orgUnit'] for v in d.get('dataValues', [])])))" 2>/dev/null || echo "0")

if [ "$UNIQUE_ORG_UNITS" -ge 1 ]; then
    if [ "$UNIQUE_ORG_UNITS" -ge "$EXPECTED_ORG_UNITS" ]; then
        pass_test "Unique org units: $UNIQUE_ORG_UNITS (expected: ~$EXPECTED_ORG_UNITS)"
    else
        warn_test "Unique org units: $UNIQUE_ORG_UNITS (expected: ~$EXPECTED_ORG_UNITS)"
    fi
else
    fail_test "No org units found"
fi
echo ""

# Test 2b: Count by Category Option Combo
echo "TEST 2b: Count by Category Option Combo"
echo "-----------------------------------"
cat "$OUTPUT_DIR/01-datavalues-detailed.json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
combos = [v['categoryOptionCombo'] for v in d.get('dataValues', [])]
unique_combos = set(combos)
print(f'Unique combos: {len(unique_combos)}')
# Get top 5 most used combos
from collections import Counter
top_combos = Counter(combos).most_common(5)
for combo, count in top_combos:
    print(f'  {combo}: {count} values')
" > "$OUTPUT_DIR/02b-combo-distribution.txt" 2>/dev/null || echo "Error analyzing combos"

UNIQUE_COMBOS=$(cat "$OUTPUT_DIR/01-datavalues-detailed.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(set([v['categoryOptionCombo'] for v in d.get('dataValues', [])])))" 2>/dev/null || echo "0")

if [ "$UNIQUE_COMBOS" -eq "$EXPECTED_COMBOS" ]; then
    pass_test "Unique category combos: $UNIQUE_COMBOS (expected: $EXPECTED_COMBOS)"
elif [ "$UNIQUE_COMBOS" -gt 0 ]; then
    warn_test "Unique category combos: $UNIQUE_COMBOS (expected: $EXPECTED_COMBOS)"
else
    fail_test "No category combos found"
fi

cat "$OUTPUT_DIR/02b-combo-distribution.txt"
echo ""

# Test 2c: Sample Specific Disaggregations
echo "TEST 2c: Sample Specific Disaggregations"
echo "-----------------------------------"
# Test known combos from logs
SAMPLE_COMBOS=("Hq8CoK8l5ix:50-54 years+Male" "AXlDofv9isa:40-44 years+Male" "ZU4Sw0h7n3y:All+FNP")

for combo_info in "${SAMPLE_COMBOS[@]}"; do
    IFS=':' read -r combo_id combo_name <<< "$combo_info"
    
    curl -s -u "$AUTH" "$DHIS2_URL/api/dataValues?dataElement=$DATA_ELEMENT_ID&period=$PERIOD&categoryOptionCombo=$combo_id&paging=false" \
      > "$OUTPUT_DIR/02c-combo-$combo_id.json"
    
    COUNT=$(cat "$OUTPUT_DIR/02c-combo-$combo_id.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('dataValues', [])))" 2>/dev/null || echo "0")
    
    if [ "$COUNT" -gt 0 ]; then
        pass_test "$combo_name ($combo_id): $COUNT values"
    else
        warn_test "$combo_name ($combo_id): no values found"
    fi
done
echo ""

# Test 3: Validate Category Option Combos
echo "TEST 3: Validate Category Option Combos"
echo "-----------------------------------"
# Verify first sample combo structure
curl -s -u "$AUTH" "$DHIS2_URL/api/categoryOptionCombos/Hq8CoK8l5ix?fields=id,name,categoryOptions[id,name,code]" \
  > "$OUTPUT_DIR/03-combo-structure.json"

COMBO_OPTIONS=$(cat "$OUTPUT_DIR/03-combo-structure.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('categoryOptions', [])))" 2>/dev/null || echo "0")

if [ "$COMBO_OPTIONS" -eq 2 ]; then
    pass_test "Category combo structure: 2 options (sex + age)"
    # Check if names contain expected values
    HAS_AGE=$(cat "$OUTPUT_DIR/03-combo-structure.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any('50-54' in opt.get('name', '') for opt in d.get('categoryOptions', [])))" 2>/dev/null || echo "False")
    HAS_SEX=$(cat "$OUTPUT_DIR/03-combo-structure.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any('Male' in opt.get('name', '') for opt in d.get('categoryOptions', [])))" 2>/dev/null || echo "False")
    
    if [ "$HAS_AGE" = "True" ] && [ "$HAS_SEX" = "True" ]; then
        pass_test "Category options contain expected age and sex values"
    else
        warn_test "Category options may not contain expected values"
    fi
else
    fail_test "Category combo structure: $COMBO_OPTIONS options (expected: 2)"
fi
echo ""

# Test 4a: Duplicate Detection
echo "TEST 4a: Duplicate Detection"
echo "-----------------------------------"
cat "$OUTPUT_DIR/01-datavalues-detailed.json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
values = d.get('dataValues', [])
keys = [(v['orgUnit'], v['categoryOptionCombo']) for v in values]
from collections import Counter
duplicates = {k: count for k, count in Counter(keys).items() if count > 1}
print(f'Duplicate combinations: {len(duplicates)}')
if duplicates:
    print('Sample duplicates:')
    for (org, combo), count in list(duplicates.items())[:3]:
        print(f'  orgUnit={org}, combo={combo}: {count} times')
" > "$OUTPUT_DIR/04a-duplicates.txt" 2>/dev/null || echo "Error checking duplicates"

DUPLICATE_COUNT=$(cat "$OUTPUT_DIR/04a-duplicates.txt" | head -1 | grep -oP '\d+' || echo "0")

if [ "$DUPLICATE_COUNT" -eq 0 ]; then
    pass_test "No duplicate data values found"
else
    fail_test "Found $DUPLICATE_COUNT duplicate combinations"
    cat "$OUTPUT_DIR/04a-duplicates.txt"
fi
echo ""

# Test 4b: Default Combo Usage
echo "TEST 4b: Default Combo Usage"
echo "-----------------------------------"
curl -s -u "$AUTH" "$DHIS2_URL/api/dataValues?dataElement=$DATA_ELEMENT_ID&period=$PERIOD&categoryOptionCombo=HllvX50cXC0&paging=false" \
  > "$OUTPUT_DIR/04b-default-combo.json"

DEFAULT_COUNT=$(cat "$OUTPUT_DIR/04b-default-combo.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('dataValues', [])))" 2>/dev/null || echo "0")

if [ "$DEFAULT_COUNT" -eq 0 ]; then
    pass_test "No default combo usage (proper disaggregation)"
else
    warn_test "Found $DEFAULT_COUNT values using default combo (missing disaggregation)"
fi
echo ""

# Test 4c: Value Distribution
echo "TEST 4c: Value Distribution Statistics"
echo "-----------------------------------"
cat "$OUTPUT_DIR/01-datavalues-detailed.json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
values = [float(v['value']) for v in d.get('dataValues', []) if v.get('value')]
if values:
    print(f'Count: {len(values)}')
    print(f'Min: {min(values)}')
    print(f'Max: {max(values)}')
    print(f'Avg: {sum(values)/len(values):.2f}')
    print(f'Sum: {sum(values):.0f}')
else:
    print('No values found')
" > "$OUTPUT_DIR/04c-value-stats.txt" 2>/dev/null || echo "Error calculating stats"

cat "$OUTPUT_DIR/04c-value-stats.txt"

VALUE_COUNT=$(cat "$OUTPUT_DIR/04c-value-stats.txt" | grep "Count:" | grep -oP '\d+' || echo "0")
if [ "$VALUE_COUNT" -gt 0 ]; then
    pass_test "Value statistics calculated successfully"
else
    fail_test "No numeric values found"
fi
echo ""

# Test 5: Cross-Reference with Workflow Logs
echo "TEST 5: Cross-Reference with Logs"
echo "-----------------------------------"
# Check specific facility from logs (Kamuzu Academy Clinic)
SAMPLE_ORG="AzkP0nqoJxd"
curl -s -u "$AUTH" "$DHIS2_URL/api/dataValues?dataElement=$DATA_ELEMENT_ID&period=$PERIOD&orgUnit=$SAMPLE_ORG&paging=false" \
  > "$OUTPUT_DIR/05-sample-facility.json"

FACILITY_COUNT=$(cat "$OUTPUT_DIR/05-sample-facility.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('dataValues', [])))" 2>/dev/null || echo "0")

if [ "$FACILITY_COUNT" -gt 0 ]; then
    pass_test "Kamuzu Academy Clinic ($SAMPLE_ORG): $FACILITY_COUNT values"
else
    warn_test "Kamuzu Academy Clinic ($SAMPLE_ORG): no values found"
fi
echo ""

# Generate Summary Report
echo "==================================="
echo "Generating Summary Report"
echo "==================================="

cat > "$OUTPUT_DIR/verification-summary.txt" <<EOF
DHIS2 Data Verification Summary
================================
Test Date: $(date)
DHIS2 URL: $DHIS2_URL
Period: $PERIOD
Data Set: $DATA_SET_ID
Data Element: $DATA_ELEMENT_ID

Results:
--------
Total Data Values: $ACTUAL_COUNT (expected: $EXPECTED_TOTAL) $([ "$ACTUAL_COUNT" -eq "$EXPECTED_TOTAL" ] && echo "✓" || echo "✗")
Unique Org Units: $UNIQUE_ORG_UNITS (expected: ~$EXPECTED_ORG_UNITS) $([ "$UNIQUE_ORG_UNITS" -ge 1 ] && echo "✓" || echo "✗")
Unique Category Combos: $UNIQUE_COMBOS (expected: $EXPECTED_COMBOS) $([ "$UNIQUE_COMBOS" -eq "$EXPECTED_COMBOS" ] && echo "✓" || echo "✗")
Default Combo Usage: $DEFAULT_COUNT $([ "$DEFAULT_COUNT" -eq 0 ] && echo "✓" || echo "⚠")
Duplicate Values: $DUPLICATE_COUNT $([ "$DUPLICATE_COUNT" -eq 0 ] && echo "✓" || echo "✗")

Sample Verifications:
--------------------
EOF

# Add sample combo details to summary
for combo_info in "${SAMPLE_COMBOS[@]}"; do
    IFS=':' read -r combo_id combo_name <<< "$combo_info"
    COUNT=$(cat "$OUTPUT_DIR/02c-combo-$combo_id.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('dataValues', [])))" 2>/dev/null || echo "0")
    echo "- $combo_name ($combo_id): $COUNT values $([ "$COUNT" -gt 0 ] && echo "✓" || echo "⚠")" >> "$OUTPUT_DIR/verification-summary.txt"
done

cat >> "$OUTPUT_DIR/verification-summary.txt" <<EOF

Value Statistics:
-----------------
$(cat "$OUTPUT_DIR/04c-value-stats.txt")

Test Results:
-------------
Tests Passed: $TESTS_PASSED
Tests Failed: $TESTS_FAILED
Warnings: $WARNINGS

Overall Status: $([ "$TESTS_FAILED" -eq 0 ] && echo "PASS ✓" || echo "FAIL ✗")
EOF

cat "$OUTPUT_DIR/verification-summary.txt"

echo ""
echo "==================================="
echo "Verification Complete"
echo "==================================="
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo "Warnings: $WARNINGS"
echo ""
echo "Full results saved to: $OUTPUT_DIR/"

if [ "$TESTS_FAILED" -gt 0 ]; then
    echo "Status: FAIL ✗"
    exit 1
else
    echo "Status: PASS ✓"
    exit 0
fi

