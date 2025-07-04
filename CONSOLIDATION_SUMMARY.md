# Test Consolidation Summary

## Overview
This PR consolidates all testing functionality from `openfn-workflows/scripts` into `indicator_workflow_testing` to eliminate redundancy and create a single source of truth for OpenFN workflow testing.

## Changes Made

### 1. **Removed Redundant Test Scripts**
Deleted the following test scripts from `openfn-workflows/scripts/`:
- `test-end-to-end.sh` (384 lines) - Redundant with CLI workflow tests
- `test-jobs.sh` (270 lines) - Redundant with simple job tests
- `test-workflows.sh` (365 lines) - Redundant with workflow validation
- `setup-test-data.sh` (303 lines) - Redundant with fixtures

These scripts have been archived in `openfn-workflows/scripts/.archive/` for reference.

### 2. **Enhanced Testing Framework**
Added key features from the removed scripts to `indicator_workflow_testing`:

#### **Environment File Support**
- Added `--env-file` option to `run-tests.sh`
- Allows custom environment configurations for different deployment scenarios

#### **Package Metadata Integration**
- Added `get_env_value()` function to `utils/common.sh`
- Automatically reads environment variables from `package-metadata.json` files
- Provides intelligent fallback: env var → package metadata → default value

#### **New Comprehensive Test**
- Created `tests/cli/test-end-to-end-comprehensive.sh`
- Combines service checks, SFTP verification, and workflow testing
- Provides thorough end-to-end validation in one script

### 3. **Preserved Deployment Scripts**
Kept operational scripts in `openfn-workflows/scripts/`:
- `deploy-workflow.sh` - Deploys workflows to OpenFN
- `validate-workflow.sh` - Pre-deployment validation
- `list-workflows.sh` - Lists available workflows

### 4. **Updated Documentation**
- Updated `openfn-workflows/README.md` to point to consolidated testing
- Enhanced `indicator_workflow_testing/TESTING-INDEX.md` with new features
- Added clear migration notes and examples

## Benefits

1. **Single Source of Truth**: All tests in one location
2. **No Duplication**: Eliminated ~1,300 lines of redundant test code
3. **Better Organization**: Clear separation between testing and deployment
4. **Enhanced Features**: Environment files and package metadata support
5. **Easier Maintenance**: One testing framework to update

## Migration Guide

For users of the old test scripts:

```bash
# Old way (in openfn-workflows/scripts/)
./test-end-to-end.sh --env-file .env full

# New way (in indicator_workflow_testing/)
./run-tests.sh --env-file .env --integration
```

## Testing the Changes

```bash
# Verify tests still work
cd projects/indicator_workflow_testing
./run-tests.sh --cli-workflow

# Test new comprehensive script
./tests/cli/test-end-to-end-comprehensive.sh

# Test with custom environment
./run-tests.sh --env-file custom.env --integration
```