#!/bin/bash

# Setup Test Data for OpenFN End-to-End Testing
# Uses real Excel files from the SFTP data directory

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# Configuration
SFTP_HOST="${SFTP_HOST:-localhost}"
SFTP_PORT="${SFTP_PORT:-2225}"
SFTP_USER="${SFTP_USER:-malawi_user}"
SFTP_PASS="${SFTP_PASS:-malawi_password}"
SFTP_DIR="${SFTP_DIR:-/uploads/hiv-indicators}"

# Source directory with real Excel files
SOURCE_DATA_DIR="/home/ubuntu/code/malawi-dhis2-pipeline/projects/sftp/data/excel-files"
TEST_DATA_DIR="tests/test-data"

# Create test data directory
mkdir -p "$TEST_DATA_DIR"

# Function to copy real Excel files
copy_real_excel_files() {
    log_step "Copying real Excel files for testing..."
    
    if [[ ! -d "$SOURCE_DATA_DIR" ]]; then
        log_error "❌ Source data directory not found: $SOURCE_DATA_DIR"
        return 1
    fi
    
    log_info "Available Excel files in source directory:"
    ls -lh "$SOURCE_DATA_DIR"/*.xlsx 2>/dev/null || {
        log_error "❌ No Excel files found in $SOURCE_DATA_DIR"
        return 1
    }
    
    echo ""
    log_info "Copying files to test directory..."
    log_info "Note: Workflows will auto-detect file types using mapping configs"
    
    # Copy all Excel files - the workflows will auto-detect file types using mapping configs
    local files_copied=0
    
    for excel_file in "$SOURCE_DATA_DIR"/*.xlsx; do
        if [[ -f "$excel_file" ]]; then
            local filename=$(basename "$excel_file")
            cp "$excel_file" "$TEST_DATA_DIR/"
            log_success "✅ Copied $filename ($(du -h "$excel_file" | cut -f1))"
            ((files_copied++))
        fi
    done
    
    if [[ $files_copied -eq 0 ]]; then
        log_error "❌ No files were copied"
        return 1
    fi
    
    echo ""
    log_success "✅ Copied $files_copied Excel file(s) to test directory"
    log_info "Test files ready in: $TEST_DATA_DIR"
    ls -lh "$TEST_DATA_DIR"/*.xlsx
    
    return 0
}

# Function to upload files to SFTP
upload_to_sftp() {
    log_step "Uploading real Excel files to SFTP..."
    
    # Check if sshpass is available
    if ! command -v sshpass >/dev/null 2>&1; then
        log_error "❌ sshpass not available. Install with: sudo apt-get install sshpass"
        log_info "Alternative: Upload files manually with:"
        log_info "  sftp -P $SFTP_PORT $SFTP_USER@$SFTP_HOST"
        log_info "  cd $SFTP_DIR"
        log_info "  put $TEST_DATA_DIR/*.xlsx"
        return 1
    fi
    
    # Test SFTP connection
    log_info "Testing SFTP connection to $SFTP_HOST:$SFTP_PORT"
    if ! timeout 10 bash -c "</dev/tcp/$SFTP_HOST/$SFTP_PORT"; then
        log_error "❌ SFTP service not accessible"
        log_error "Make sure SFTP service is running: ./instant package up -n sftp-storage"
        return 1
    fi
    
    # Upload files
    log_info "Uploading files to SFTP directory: $SFTP_DIR"
    
    local files_uploaded=0
    for file in "$TEST_DATA_DIR"/*.xlsx; do
        if [[ -f "$file" ]]; then
            local filename=$(basename "$file")
            local filesize=$(du -h "$file" | cut -f1)
            log_info "Uploading $filename ($filesize)..."
            
            if sshpass -p "$SFTP_PASS" sftp -o StrictHostKeyChecking=no -P $SFTP_PORT $SFTP_USER@$SFTP_HOST << EOF
cd $SFTP_DIR
put $file
EOF
            then
                log_success "  ✅ $filename uploaded successfully"
                ((files_uploaded++))
            else
                log_error "  ❌ Failed to upload $filename"
            fi
        fi
    done
    
    if [[ $files_uploaded -gt 0 ]]; then
        log_success "✅ $files_uploaded file(s) uploaded to SFTP successfully"
        
        # List uploaded files
        log_info "Files now on SFTP server:"
        sshpass -p "$SFTP_PASS" sftp -o StrictHostKeyChecking=no -P $SFTP_PORT $SFTP_USER@$SFTP_HOST << EOF
cd $SFTP_DIR
ls -la *.xlsx
quit
EOF
        
        return 0
    else
        log_error "❌ No files were uploaded"
        return 1
    fi
}

# Function to inspect Excel file structure
inspect_excel_files() {
    log_step "Inspecting Excel file structure..."
    
    if ! command -v python3 >/dev/null 2>&1; then
        log_warning "⚠️  Python3 not available, skipping file inspection"
        return 0
    fi
    
    # Try to inspect the Excel files
    python3 << 'EOF'
import sys
import os

try:
    import openpyxl
    
    test_data_dir = "tests/test-data"
    
    for xlsx_file in os.listdir(test_data_dir):
        if xlsx_file.endswith('.xlsx'):
            xlsx_path = os.path.join(test_data_dir, xlsx_file)
            
            print(f"\n📊 Inspecting: {xlsx_file}")
            print("=" * 50)
            
            try:
                wb = openpyxl.load_workbook(xlsx_path, read_only=True)
                print(f"Worksheets: {wb.sheetnames}")
                
                # Check first worksheet
                ws = wb.active
                print(f"Active sheet: {ws.title}")
                print(f"Dimensions: {ws.max_row} rows x {ws.max_column} columns")
                
                # Show first few rows
                print("\nFirst 5 rows:")
                for row_num in range(1, min(6, ws.max_row + 1)):
                    row_data = []
                    for col_num in range(1, min(6, ws.max_column + 1)):
                        cell_value = ws.cell(row=row_num, column=col_num).value
                        row_data.append(str(cell_value)[:20] if cell_value else "")
                    print(f"  Row {row_num}: {' | '.join(row_data)}")
                
                wb.close()
                
            except Exception as e:
                print(f"❌ Error reading {xlsx_file}: {e}")
    
except ImportError:
    print("📝 openpyxl not available. Install with: pip install openpyxl")
    print("   (File inspection skipped)")
    
except Exception as e:
    print(f"❌ Error inspecting files: {e}")
EOF
}

# Function to clean up test files
cleanup_test_files() {
    log_step "Cleaning up test files..."
    
    if [[ -d "$TEST_DATA_DIR" ]]; then
        log_info "Removing test data files..."
        rm -f "$TEST_DATA_DIR"/*.xlsx "$TEST_DATA_DIR"/*.csv
        log_success "✅ Test files cleaned up"
    fi
}

# Main command handler
main() {
    local command="${1:-setup}"
    
    echo ""
    log_info "🗂️  OpenFN Real Data Testing Setup"
    log_info "Using Excel files from: $SOURCE_DATA_DIR"
    log_info "Workflows will auto-detect file types using mapping configs"
    log_info "=================================="
    echo ""
    
    case "$command" in
        "copy")
            copy_real_excel_files
            ;;
        "inspect")
            copy_real_excel_files && inspect_excel_files
            ;;
        "upload")
            upload_to_sftp
            ;;
        "clean")
            cleanup_test_files
            ;;
        "setup"|"all")
            log_info "Setting up test environment with real Excel files..."
            echo ""
            
            copy_real_excel_files
            echo ""
            
            inspect_excel_files
            echo ""
            
            upload_to_sftp
            echo ""
            
            log_success "🎉 Real data test setup completed!"
            log_info "Files uploaded and ready for workflow processing:"
            log_info "  • ART_data_long_format.xlsx - Will use art_data_long_format.json mapping"
            log_info "  • Q2FY25_DQ_253_sites.xlsx - Will use dq_sites.json mapping"
            log_info "  • Direct Queries - Q1 2025 MoH Reports.xlsx - Will use moh_direct_queries.json mapping"
            echo ""
            log_info "You can now run end-to-end tests with:"
            log_info "  ./scripts/test-end-to-end.sh full"
            ;;
        *)
            echo "OpenFN Real Data Test Setup Script"
            echo ""
            echo "Usage: $0 {command}"
            echo ""
            echo "Commands:"
            echo "  copy      - Copy real Excel files to test directory"
            echo "  inspect   - Copy and inspect Excel file structure"
            echo "  upload    - Upload test files to SFTP"
            echo "  clean     - Remove test files"
            echo "  setup     - Complete setup with real data (default)"
            echo ""
            echo "Real Excel Files Used:"
            echo "  • ART_data_long_format.xlsx (29MB) - ART treatment data"
            echo "  • Q2FY25_DQ_253_sites.xlsx (3.1MB) - Data quality sites"
            echo "  • Direct Queries - Q1 2025 MoH Reports.xlsx (4.0MB) - MoH reports"
            echo ""
            echo "Mapping Configurations:"
            echo "  • configs/file-types/art_data_long_format.json"
            echo "  • configs/file-types/dq_sites.json"
            echo "  • configs/file-types/moh_direct_queries.json"
            echo "  • configs/metadata/data_element_mapping.json"
            echo "  • configs/metadata/org_unit_mapping.json"
            echo ""
            echo "Environment Variables:"
            echo "  SFTP_HOST=$SFTP_HOST"
            echo "  SFTP_PORT=$SFTP_PORT"
            echo "  SFTP_USER=$SFTP_USER"
            echo "  SFTP_DIR=$SFTP_DIR"
            echo ""
            echo "Examples:"
            echo "  $0 setup                    # Complete setup with real data"
            echo "  $0 inspect                  # Examine Excel file structure"
            echo "  $0 upload                   # Upload existing test files"
            echo ""
            echo "Prerequisites:"
            echo "  1. SFTP service running: ./instant package up -n sftp-storage"
            echo "  2. sshpass installed: sudo apt-get install sshpass"
            echo "  3. Python3 with openpyxl: pip install openpyxl (for inspection)"
            exit 1
            ;;
    esac
}

# Run main function
main "$@" 