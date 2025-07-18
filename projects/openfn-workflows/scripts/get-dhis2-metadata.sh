#!/bin/bash

# DHIS2 Metadata Extraction Script
# Fetches real DHIS2 IDs from your deployed instance

DHIS2_URL="http://localhost:8080"
DHIS2_USER="admin"
DHIS2_PASSWORD="district"

echo "=== Fetching DHIS2 Metadata ==="
echo "URL: $DHIS2_URL"
echo "User: $DHIS2_USER"
echo ""

# Create output directory
mkdir -p metadata-export

# Function to fetch metadata
fetch_metadata() {
    local endpoint=$1
    local filename=$2
    local fields=$3
    
    echo "Fetching $endpoint..."
    curl -u "$DHIS2_USER:$DHIS2_PASSWORD" \
         -H "Accept: application/json" \
         "$DHIS2_URL/api/$endpoint?fields=$fields&paging=false" \
         -o "metadata-export/$filename.json"
    
    if [ $? -eq 0 ]; then
        echo "✓ Saved to metadata-export/$filename.json"
    else
        echo "✗ Failed to fetch $endpoint"
    fi
}

# Fetch Data Elements
fetch_metadata "dataElements" "data-elements" "id,name,code,displayName,shortName,valueType,domainType"

# Fetch Organization Units
fetch_metadata "organisationUnits" "org-units" "id,name,code,displayName,shortName,level,path,parent"

# Fetch Data Sets
fetch_metadata "dataSets" "data-sets" "id,name,code,displayName,shortName,periodType,dataSetElements"

# Fetch Category Option Combos
fetch_metadata "categoryOptionCombos" "category-combos" "id,name,code,displayName,shortName"

# Fetch Option Sets (for indicators)
fetch_metadata "optionSets" "option-sets" "id,name,code,displayName,options"

# Fetch Indicators (if any exist)
fetch_metadata "indicators" "indicators" "id,name,code,displayName,shortName,indicatorType"

echo ""
echo "=== Metadata Export Complete ==="
echo "Files saved to metadata-export/ directory"
echo "Use these IDs to update your mapping files" 