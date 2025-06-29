#!/bin/bash
# SFTP Syntax Validation Script
# Ensures all workflows use the working simple syntax instead of complex nested functions

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "🔍 OpenFN SFTP Syntax Validation"
echo "================================"
echo ""

WORKFLOWS_DIR="../../../openfn-workflows/workflows"
ISSUES_FOUND=0
FIXED_FILES=0

# Function to check a job file for problematic patterns
check_job_file() {
    local file="$1"
    local issues=0
    
    log_info "Checking: $(basename "$file")"
    
    # Check for complex nested function syntax (BAD)
    if grep -q "list(" "$file" && grep -A5 "list(" "$file" | grep -q "(state) => {"; then
        if grep -A5 "list(" "$file" | grep -B2 -A2 "(state) => {" | grep -q "const directory\|remoteDir\|\.configuration"; then
            log_error "  ❌ Found complex nested function syntax"
            echo "     Pattern: list((state) => { const directory = ... }, callback)"
            ((issues++))
        fi
    fi
    
    # Check for template literals in SFTP calls (BAD)
    if grep -q '\${' "$file" && grep -B2 -A2 '\${' "$file" | grep -q "list\|get\|put"; then
        log_error "  ❌ Found template literals in SFTP calls"
        echo "     Pattern: Uses \${...} expressions"
        ((issues++))
    fi
    
    # Check for old adaptor version (BAD)
    if grep -q "@openfn/language-sftp@1\.0\.0\|@openfn/language-sftp@latest" "$file"; then
        log_error "  ❌ Found old/broken adaptor version"
        echo "     Should use: @openfn/language-sftp@2.0.14-custom"
        ((issues++))
    fi
    
    # Check for good patterns (GOOD)
    if grep -q "list('/[^']*'," "$file"; then
        log_success "  ✅ Found simple direct syntax"
    fi
    
    if grep -q "@openfn/language-sftp@2\.0\.14-custom" "$file"; then
        log_success "  ✅ Using correct custom adaptor version"
    fi
    
    return $issues
}

# Function to auto-fix common issues
fix_job_file() {
    local file="$1"
    local backup="${file}.backup"
    local fixed=0
    
    log_info "Attempting to fix: $(basename "$file")"
    
    # Create backup
    cp "$file" "$backup"
    
    # Fix: Replace complex nested list() calls with simple syntax
    if grep -q "list(" "$file" && grep -A10 "list(" "$file" | grep -q "remoteDir.*uploads/hiv-indicators"; then
        log_info "  🔧 Fixing complex list() call..."
        sed -i 's|list(\s*(state)\s*=>\s*{[^}]*remoteDir.*uploads/hiv-indicators[^}]*},|(state) => {\n  // Fixed: Use simple direct syntax\n  list("/data/excel-files",|g' "$file"
        ((fixed++))
    fi
    
    # Fix: Update directory references
    if grep -q "uploads/hiv-indicators" "$file"; then
        log_info "  🔧 Updating directory path..."
        sed -i 's|/uploads/hiv-indicators/|/data/excel-files/|g' "$file"
        ((fixed++))
    fi
    
    if [[ $fixed -gt 0 ]]; then
        log_success "  ✅ Applied $fixed fixes"
        echo "     Backup saved as: $(basename "$backup")"
        return 0
    else
        # Remove backup if no changes made
        rm "$backup"
        log_info "  ℹ️  No automatic fixes applied"
        return 1
    fi
}

# Main validation loop
echo "Searching for workflow job files..."
while IFS= read -r -d '' job_file; do
    echo ""
    if check_job_file "$job_file"; then
        log_success "✅ $(basename "$job_file") - No issues found"
    else
        ((ISSUES_FOUND++))
        
        # Ask if user wants to attempt auto-fix
        echo ""
        read -p "Attempt to auto-fix this file? [y/N]: " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if fix_job_file "$job_file"; then
                ((FIXED_FILES++))
                log_success "✅ Auto-fix applied"
            else
                log_warning "⚠️  Manual fixes may be required"
            fi
        fi
    fi
done < <(find "$WORKFLOWS_DIR" -name "*.js" -type f -print0 2>/dev/null)

echo ""
echo "================================"
echo "🏁 Validation Complete"
echo ""

if [[ $ISSUES_FOUND -eq 0 ]]; then
    log_success "🎉 All job files comply with coding standards!"
else
    log_warning "⚠️  Found issues in $ISSUES_FOUND file(s)"
    if [[ $FIXED_FILES -gt 0 ]]; then
        log_success "🔧 Auto-fixed $FIXED_FILES file(s)"
    fi
    echo ""
    echo "📋 Coding standards document:"
    echo "   projects/indicator_workflow_testing/docs/OPENFN_CODING_STANDARDS.md"
fi

exit $ISSUES_FOUND 