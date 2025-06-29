# OpenFN Workflow Testing Framework

This directory contains a comprehensive automated testing suite for the OpenFN DHIS2 pipeline workflows.

## 🚀 **Working SFTP Syntax**


- **✅ Use**: `@openfn/language-sftp@2.0.14-custom` (fixed version)
- **✅ Use**: Simple direct syntax: `list('/path', callback)`  
- **✅ Use**: `-s` flag for state in CLI 
- **❌ Avoid**: Complex nested functions (causes "TypeError: fn is not a function")

## Structure

```
projects/indicator_workflow_testing/
├── README.md                          # This file
├── run-tests.sh                       # Main test runner
├── config/
│   ├── test-config.json              # Test configuration
│   └── endpoints.json                # API endpoints
├── tests/
│   ├── api-tests.sh                  # OpenFN API connectivity tests
│   ├── excel-parsing-tests.js        # Excel file parsing validation
│   ├── integration-tests.js          # End-to-end integration validation  
│   ├── sftp-integration-tests.sh     # SFTP workflow integration tests
│   ├── deploy-and-test-sftp-integration.sh # Comprehensive deployment testing
│   ├── test-sftp.sh                  # Basic SFTP connectivity tests
│   ├── openfn-cli-workflow-tests.sh  # CLI-based SFTP-to-DHIS2 workflow tests
│   └── cli-sftp-custom-adaptor-test.sh # Custom SFTP adaptor with module fix
├── utils/
│   ├── common.sh                     # Common test utilities and functions
│   ├── analyze-excel-files.js        # Excel file structure analysis
│   └── test-excel-parsing.js         # Basic Excel parsing utilities
└── test-results.log                  # Test execution results (generated)
```

## Quick Start

### Prerequisites

Ensure the following services are running:
- OpenFN Lightning (http://localhost:4000)
- PostgreSQL database
- SFTP server with test data
- Node.js (for JavaScript tests)

### Running Tests

1. **Run all tests:**
   ```bash
   ./projects/indicator_workflow_testing/run-tests.sh
   ```

2. **Run specific test suites:**
   ```bash
   ./projects/indicator_workflow_testing/run-tests.sh --api          # API tests only
   ./projects/indicator_workflow_testing/run-tests.sh --excel        # Excel parsing tests only
   ./projects/indicator_workflow_testing/run-tests.sh --sftp         # SFTP tests only
   ./projects/indicator_workflow_testing/run-tests.sh --cli-workflow # CLI workflow tests only
   ./projects/indicator_workflow_testing/run-tests.sh --custom-sftp  # Custom SFTP adaptor test
   ./projects/indicator_workflow_testing/run-tests.sh --integration  # Integration tests only
   ```

3. **Run with verbose output:**
   ```bash
   ./projects/indicator_workflow_testing/run-tests.sh --verbose
   ```

4. **Get help:**
   ```bash
   ./projects/indicator_workflow_testing/run-tests.sh --help
   ```

## Test Categories

### 1. API Tests (`tests/api-tests.sh`)
- Health checks for OpenFN Lightning
- Authentication validation (API key and user/password)
- CRUD operations testing
- Workflow, job, and trigger validation
- JSON response validation

### 2. Excel Parsing Tests (`tests/excel-parsing-tests.js`)
- Multi-sheet Excel file processing
- Format-specific parsers (HIV indicators, Direct Queries, DQ Sites)
- Column structure validation
- Data transformation testing
- Enhanced parsing functionality validation

### 3. SFTP Tests
- **Basic SFTP (`tests/test-sftp.sh`)**: Connection and file operations
- **Integration (`tests/sftp-integration-tests.sh`)**: Workflow integration
- **Deployment (`tests/deploy-and-test-sftp-integration.sh`)**: Full deployment testing
- **Custom Adaptor (`tests/cli-sftp-custom-adaptor-test.sh`)**: Tests fixed SFTP adaptor v2.0.14-custom

### 4. CLI Workflow Tests (`tests/openfn-cli-workflow-tests.sh`)
- **Custom CLI Container**: Uses enhanced SFTP adaptor with debugging
- **Step-by-Step Execution**: Tests each workflow step with caching
- **Full Pipeline**: SFTP → Excel Processing → DHIS2 Payload Generation
- **Debug Outputs**: Saves all intermediate states for troubleshooting

### 5. Custom SFTP Adaptor Test (`tests/cli-sftp-custom-adaptor-test.sh`)
- **Fixed Module Loading**: Tests the custom-built SFTP adaptor v2.0.14-custom
- **Project Structure**: Uses proper OpenFN CLI project structure
- **Module Resolution**: Verifies the fix for broken pnpm symlinks
- **Connection Testing**: Validates SFTP connection with enhanced debugging

### 6. Integration Tests (`tests/integration-tests.js`)
- End-to-end workflow validation
- File structure analysis
- Data transformation validation
- DHIS2 compatibility testing
- Dependency verification

## Configuration

### Test Configuration (`config/test-config.json`)
Customize settings for:
- OpenFN endpoint URLs and credentials
- SFTP connection details
- DHIS2 connection parameters
- Test data file paths
- Expected workflow configurations

### API Endpoints (`config/endpoints.json`)
Defines API endpoints for:
- OpenFN Lightning API routes
- DHIS2 API endpoints
- Webhook URLs

## Test Results

Test results are:
- **Console output**: Colored, real-time feedback
- **Log file**: Detailed results in `test-results.log`
- **Exit codes**: 0 for success, 1 for failures

## Utilities

### Common Functions (`utils/common.sh`)
- Logging functions with colors
- API request utilities
- Service availability checks
- JSON validation
- Docker service management
- Test result summarization

### Excel Analysis (`utils/analyze-excel-files.js`)
- Excel file structure analysis
- Sheet and column inspection
- Data sampling and validation

### Excel Parsing (`utils/test-excel-parsing.js`)
- Basic Excel parsing utilities
- Data extraction functions

## Test Data

The framework tests with:
- **HIV Indicators**: `DHIS2_HIV Indicators.xlsx`
- **Direct Queries**: `Direct Queries - Q1 2025 MoH Reports.xlsx` (6 sheets)
- **DQ Sites**: `Q2FY25_DQ_253_sites.xlsx` (11 sheets)

## Development

### Adding New Tests

1. Create test files in the appropriate `tests/` subdirectory
2. Follow naming convention: `test-<functionality>.sh` or `test-<functionality>.js`
3. Use common utilities from `utils/common.sh`
4. Update the main test runner if needed
5. Update this README with new test descriptions

### Test Function Guidelines

**Shell Scripts:**
- Source `../utils/common.sh` for common functions
- Use `log_info`, `log_success`, `log_warning`, `log_error` for output
- Return appropriate exit codes (0 = success, 1 = failure)

**JavaScript Tests:**
- Include comprehensive error handling
- Use colored console output for consistency
- Export test functions for modularity

### Integration with CI/CD

The testing framework is designed for:
- Local development testing
- CI/CD pipeline integration
- Docker-based deployment validation
- Automated regression testing

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Node.js not found" | Install Node.js or use `--api --sftp` flags to skip JS tests |
| "curl is required" | Install curl package |
| "Service not available" | Ensure Docker services are running (`docker service ls`) |
| Permission denied | Make scripts executable (`chmod +x run-tests.sh`) |

### Debug Mode

Enable verbose output for detailed debugging:
```bash
./run-tests.sh --verbose
```

### Service Logs

Check service logs if tests fail:
```bash
docker service logs openfn_openfn
docker service logs sftp-storage_sftp-server
```

## Integration with Main Project

This testing framework is integrated with the main project documentation:
- Referenced in main [README.md](../../README.md)
- Part of [Deliverables](../../docs/Deliverables.md) section 7
- Complements [Testing Guide](../../docs/Testing-Guide-CSV-XLSX.md)

## License

Part of the Malawi DHIS2 HIV/TB Indicators Pipeline project. 

## Recent Fixes

### SFTP Adaptor Module Loading Issue
The npm version of `@openfn/language-sftp@2.0.14` has broken pnpm symlinks causing "Invalid username" errors. We've created a custom Docker image (`openfn-cli-test:latest`) that builds the adaptor from source. See [SFTP Custom Adaptor Integration Guide](../SFTP-CUSTOM-ADAPTOR-INTEGRATION.md) for details. 