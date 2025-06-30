#!/bin/bash

# Pre-push Check
# Basic validation before pushing changes

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🔍 Running pre-push checks..."
echo "============================="

# Track overall status
status=0

# Check JSON syntax
echo -n "Checking JSON files... "
json_errors=0
for file in $(find . -name "*.json" -not -path "./node_modules/*" -not -path "./.git/*"); do
    if ! python3 -m json.tool "$file" > /dev/null 2>&1; then
        echo -e "${RED}✗${NC} Invalid JSON: $file"
        json_errors=1
        status=1
    fi
done
if [ $json_errors -eq 0 ]; then
    echo -e "${GREEN}✓${NC}"
fi

# Check shell script syntax
echo -n "Checking shell scripts... "
if find . -name "*.sh" -type f -exec bash -n {} \; 2>&1 | grep -q "syntax error"; then
    echo -e "${RED}✗${NC}"
    status=1
else
    echo -e "${GREEN}✓${NC}"
fi

# Check for large files
echo -n "Checking for large files... "
large_files=$(find . -type f -size +5M -not -path "./.git/*" -not -path "./node_modules/*" 2>/dev/null)
if [ -n "$large_files" ]; then
    echo -e "${YELLOW}⚠${NC} Large files detected (>5MB)"
else
    echo -e "${GREEN}✓${NC}"
fi

# Summary
echo "============================="
if [ $status -eq 0 ]; then
    echo -e "${GREEN}✅ Basic checks passed!${NC}"
    echo ""
    echo "For comprehensive testing, run:"
    echo "  ./scripts/run-ci-locally.sh"
else
    echo -e "${RED}❌ Some checks failed${NC}"
    echo ""
    echo "Please fix the issues above before pushing."
    exit 1
fi 