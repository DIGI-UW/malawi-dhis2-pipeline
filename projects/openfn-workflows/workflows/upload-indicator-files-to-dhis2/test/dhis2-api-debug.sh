#!/bin/bash
# DHIS2 API Debug Test Script
# Tests the exact API calls that Job 3 makes to isolate failures

set -e

DHIS2_URL="${DHIS2_URL:-http://localhost:8080}"
DHIS2_USER="${DHIS2_USER:-admin}"
DHIS2_PASS="${DHIS2_PASS:-district}"
AUTH="${DHIS2_USER}:${DHIS2_PASS}"

OUTPUT_DIR="./test/dhis2-api-results"
mkdir -p "$OUTPUT_DIR"

echo "==================================="
echo "DHIS2 API Workflow Debug Test"
echo "==================================="
echo "DHIS2 URL: $DHIS2_URL"
echo "Output: $OUTPUT_DIR"
echo ""

# Test 0: Basic connectivity
echo "TEST 0: Basic Connectivity"
echo "-----------------------------------"
curl -s -u "$AUTH" "$DHIS2_URL/api/me?fields=id,username" > "$OUTPUT_DIR/00-whoami.json"
if [ $? -eq 0 ]; then
    echo "✓ DHIS2 is accessible"
    cat "$OUTPUT_DIR/00-whoami.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/00-whoami.json"
else
    echo "✗ DHIS2 connection failed"
    exit 1
fi
echo ""

# Test 1: Check if SEX category already exists
echo "TEST 1: Check Existing SEX Category"
echo "-----------------------------------"
curl -s -u "$AUTH" "$DHIS2_URL/api/categories?filter=code:eq:SEX&fields=id,name,code,categoryOptions[id,name,code]&paging=false" > "$OUTPUT_DIR/01-check-sex-category.json"
SEX_CATEGORY_ID=$(cat "$OUTPUT_DIR/01-check-sex-category.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['categories'][0]['id'] if d.get('categories') and len(d['categories'])>0 else '')" 2>/dev/null || echo "")
if [ -n "$SEX_CATEGORY_ID" ]; then
    echo "✓ SEX category exists: $SEX_CATEGORY_ID"
else
    echo "⚠ SEX category does not exist"
fi
cat "$OUTPUT_DIR/01-check-sex-category.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/01-check-sex-category.json"
echo ""

# Test 2: Create category options for SEX
echo "TEST 2: Create Category Options (Male, Female)"
echo "-----------------------------------"
# Create Male option
curl -s -u "$AUTH" -X POST -H "Content-Type: application/json" \
    -d '{"name":"Male","shortName":"Male","code":"MALE"}' \
    "$DHIS2_URL/api/categoryOptions" > "$OUTPUT_DIR/02a-create-male-option.json"
echo "Male option response:"
cat "$OUTPUT_DIR/02a-create-male-option.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/02a-create-male-option.json"

# Get Male option ID
curl -s -u "$AUTH" "$DHIS2_URL/api/categoryOptions?filter=code:eq:MALE&fields=id&paging=false" > "$OUTPUT_DIR/02b-get-male-id.json"
MALE_ID=$(cat "$OUTPUT_DIR/02b-get-male-id.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['categoryOptions'][0]['id'] if d.get('categoryOptions') and len(d['categoryOptions'])>0 else '')" 2>/dev/null || echo "")

# Create Female option
curl -s -u "$AUTH" -X POST -H "Content-Type: application/json" \
    -d '{"name":"Female","shortName":"Female","code":"FEMALE"}' \
    "$DHIS2_URL/api/categoryOptions" > "$OUTPUT_DIR/02c-create-female-option.json"
echo "Female option response:"
cat "$OUTPUT_DIR/02c-create-female-option.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/02c-create-female-option.json"

# Get Female option ID
curl -s -u "$AUTH" "$DHIS2_URL/api/categoryOptions?filter=code:eq:FEMALE&fields=id&paging=false" > "$OUTPUT_DIR/02d-get-female-id.json"
FEMALE_ID=$(cat "$OUTPUT_DIR/02d-get-female-id.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['categoryOptions'][0]['id'] if d.get('categoryOptions') and len(d['categoryOptions'])>0 else '')" 2>/dev/null || echo "")

echo "Male ID: $MALE_ID"
echo "Female ID: $FEMALE_ID"
echo ""

# Test 3: Create SEX category
echo "TEST 3: Create SEX Category"
echo "-----------------------------------"
if [ -z "$SEX_CATEGORY_ID" ]; then
    CATEGORY_PAYLOAD="{\"name\":\"Sex\",\"shortName\":\"Sex\",\"code\":\"SEX\",\"dataDimensionType\":\"DISAGGREGATION\",\"categoryOptions\":[{\"id\":\"$MALE_ID\"},{\"id\":\"$FEMALE_ID\"}]}"
    echo "Payload: $CATEGORY_PAYLOAD"
    curl -s -u "$AUTH" -X POST -H "Content-Type: application/json" \
        -d "$CATEGORY_PAYLOAD" \
        "$DHIS2_URL/api/categories" > "$OUTPUT_DIR/03a-create-sex-category.json"
    cat "$OUTPUT_DIR/03a-create-sex-category.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/03a-create-sex-category.json"
    
    # Retrieve the created category
    sleep 2
    curl -s -u "$AUTH" "$DHIS2_URL/api/categories?filter=code:eq:SEX&fields=id,name,code,categoryOptions[id,name,code]&paging=false" > "$OUTPUT_DIR/03b-get-sex-category.json"
    SEX_CATEGORY_ID=$(cat "$OUTPUT_DIR/03b-get-sex-category.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['categories'][0]['id'] if d.get('categories') and len(d['categories'])>0 else '')" 2>/dev/null || echo "")
    echo "Created SEX category: $SEX_CATEGORY_ID"
else
    echo "Using existing SEX category: $SEX_CATEGORY_ID"
fi
echo ""

# Test 4: Create category combination
echo "TEST 4: Create Category Combination"
echo "-----------------------------------"
curl -s -u "$AUTH" "$DHIS2_URL/api/categoryCombos?filter=code:eq:HEALTH_REPORTING_COMBO&fields=id,name,code,categories[id,name],categoryOptionCombos[id,name,categoryOptions[id,name,code]]&paging=false" > "$OUTPUT_DIR/04a-check-combo.json"
COMBO_ID=$(cat "$OUTPUT_DIR/04a-check-combo.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['categoryCombos'][0]['id'] if d.get('categoryCombos') and len(d['categoryCombos'])>0 else '')" 2>/dev/null || echo "")

if [ -z "$COMBO_ID" ]; then
    COMBO_PAYLOAD="{\"name\":\"Health Reporting Combo\",\"code\":\"HEALTH_REPORTING_COMBO\",\"dataDimensionType\":\"DISAGGREGATION\",\"categories\":[{\"id\":\"$SEX_CATEGORY_ID\"}]}"
    echo "Payload: $COMBO_PAYLOAD"
    curl -s -u "$AUTH" -X POST -H "Content-Type: application/json" \
        -d "$COMBO_PAYLOAD" \
        "$DHIS2_URL/api/categoryCombos" > "$OUTPUT_DIR/04b-create-combo.json"
    cat "$OUTPUT_DIR/04b-create-combo.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/04b-create-combo.json"
    
    # Retrieve the created combo with option combos
    sleep 2
    curl -s -u "$AUTH" "$DHIS2_URL/api/categoryCombos?filter=code:eq:HEALTH_REPORTING_COMBO&fields=id,name,code,categories[id,name],categoryOptionCombos[id,name,categoryOptions[id,name,code]]&paging=false" > "$OUTPUT_DIR/04c-get-combo.json"
    COMBO_ID=$(cat "$OUTPUT_DIR/04c-get-combo.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['categoryCombos'][0]['id'] if d.get('categoryCombos') and len(d['categoryCombos'])>0 else '')" 2>/dev/null || echo "")
    echo "Created combo: $COMBO_ID"
    cat "$OUTPUT_DIR/04c-get-combo.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/04c-get-combo.json"
else
    echo "Using existing combo: $COMBO_ID"
    cat "$OUTPUT_DIR/04a-check-combo.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/04a-check-combo.json"
fi
echo ""

# Test 5: Create data element WITH category combo (critical test)
echo "TEST 5: Create Data Element WITH Category Combo"
echo "-----------------------------------"
curl -s -u "$AUTH" "$DHIS2_URL/api/dataElements?filter=code:eq:TX_CURR_TEST&fields=id,name,code,categoryCombo[id,name]&paging=false" > "$OUTPUT_DIR/05a-check-data-element.json"
DE_ID=$(cat "$OUTPUT_DIR/05a-check-data-element.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['dataElements'][0]['id'] if d.get('dataElements') and len(d['dataElements'])>0 else '')" 2>/dev/null || echo "")

if [ -z "$DE_ID" ]; then
    DE_PAYLOAD="{\"name\":\"TX_CURR Test\",\"shortName\":\"TX_CURR Test\",\"code\":\"TX_CURR_TEST\",\"valueType\":\"INTEGER\",\"aggregationType\":\"SUM\",\"domainType\":\"AGGREGATE\",\"categoryCombo\":{\"id\":\"$COMBO_ID\"}}"
    echo "Payload: $DE_PAYLOAD"
    curl -s -u "$AUTH" -X POST -H "Content-Type: application/json" \
        -d "$DE_PAYLOAD" \
        "$DHIS2_URL/api/dataElements" > "$OUTPUT_DIR/05b-create-data-element.json"
    cat "$OUTPUT_DIR/05b-create-data-element.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/05b-create-data-element.json"
    
    sleep 2
    curl -s -u "$AUTH" "$DHIS2_URL/api/dataElements?filter=code:eq:TX_CURR_TEST&fields=id,name,code,categoryCombo[id,name,categories[id,name],categoryOptionCombos[id,name,categoryOptions[id,name,code]]]&paging=false" > "$OUTPUT_DIR/05c-get-data-element.json"
    echo "Data element with category combo:"
    cat "$OUTPUT_DIR/05c-get-data-element.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/05c-get-data-element.json"
else
    echo "Data element already exists: $DE_ID"
    cat "$OUTPUT_DIR/05a-check-data-element.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/05a-check-data-element.json"
fi
echo ""

# Test 6: Compare with default combo data element
echo "TEST 6: Create Data Element WITHOUT Category Combo (for comparison)"
echo "-----------------------------------"
curl -s -u "$AUTH" "$DHIS2_URL/api/dataElements?filter=code:eq:TX_CURR_DEFAULT&fields=id,name,code,categoryCombo[id,name]&paging=false" > "$OUTPUT_DIR/06a-check-default-de.json"
DEFAULT_DE_ID=$(cat "$OUTPUT_DIR/06a-check-default-de.json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['dataElements'][0]['id'] if d.get('dataElements') and len(d['dataElements'])>0 else '')" 2>/dev/null || echo "")

if [ -z "$DEFAULT_DE_ID" ]; then
    DEFAULT_DE_PAYLOAD='{"name":"TX_CURR Default","shortName":"TX_CURR Default","code":"TX_CURR_DEFAULT","valueType":"INTEGER","aggregationType":"SUM","domainType":"AGGREGATE"}'
    curl -s -u "$AUTH" -X POST -H "Content-Type: application/json" \
        -d "$DEFAULT_DE_PAYLOAD" \
        "$DHIS2_URL/api/dataElements" > "$OUTPUT_DIR/06b-create-default-de.json"
    cat "$OUTPUT_DIR/06b-create-default-de.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/06b-create-default-de.json"
    
    sleep 2
    curl -s -u "$AUTH" "$DHIS2_URL/api/dataElements?filter=code:eq:TX_CURR_DEFAULT&fields=id,name,code,categoryCombo[id,name,categoryOptionCombos[id,name]]&paging=false" > "$OUTPUT_DIR/06c-get-default-de.json"
    echo "Data element with default combo:"
    cat "$OUTPUT_DIR/06c-get-default-de.json" | python3 -m json.tool 2>/dev/null || cat "$OUTPUT_DIR/06c-get-default-de.json"
fi
echo ""

echo "==================================="
echo "Test Summary"
echo "==================================="
echo "SEX Category ID: ${SEX_CATEGORY_ID:-NOT FOUND}"
echo "Category Combo ID: ${COMBO_ID:-NOT FOUND}"
echo "Test Data Element ID: ${DE_ID:-NOT FOUND}"
echo ""
echo "Results saved to: $OUTPUT_DIR"
echo ""
echo "CRITICAL TEST RESULTS:"
echo "1. Can categories be created? Check 03a-create-sex-category.json"
echo "2. Can category combos be created? Check 04b-create-combo.json"
echo "3. Does combo have option combos? Check 04c-get-combo.json"
echo "4. Can data elements be assigned a category combo? Check 05c-get-data-element.json"
echo "5. How does this differ from default? Compare 05c vs 06c"




