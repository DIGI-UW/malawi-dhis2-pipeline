# Archived Test Files

This directory contains obsolete, experimental, and superseded test files that are no longer actively used but kept for historical reference.

**📖 For current testing documentation, see [`../TESTING-INDEX.md`](../TESTING-INDEX.md) - Complete consolidated guide**

## Archive Structure

### `cli-tests-2024-12-29/`
Latest archived CLI tests that have been superseded by working implementations:
- `test-real-workflows.sh` - ❌ Broken YAML→JSON conversion (replaced by `test-sftp-dhis2-workflow.sh`)
- `test-sftp-check-files.sh` - ❌ Redundant test that failed with state issues
- `openfn-cli-workflow-tests.sh` - ❌ Old wrapper calling obsolete tests
- `validate-sftp-syntax.sh` - ❌ Syntax validation, not actively used

### `custom-adaptor-obsolete/`
Tests from when we were using custom SFTP adaptors (now using official @openfn/language-sftp@2.0.14):
- Custom adaptor build tests
- Excel reading with custom adaptor

### `openfn-workflows-legacy/`
Old workflow tests and configurations from the main openfn-workflows project

### `experimental/`
Development experiments and debugging scripts

### `root-level/`
Test files that were at the project root level

### `duplicates/`
(Cleaned up - files were duplicates of active tests)

## Why These Were Archived

1. **YAML→JSON Conversion Issues**: Many tests tried to convert project.yaml to CLI-compatible JSON using Python, which wasn't available in Docker
2. **Custom Adaptor No Longer Needed**: We fixed the official SFTP adaptor installation issue
3. **State Structure Problems**: Old tests had incorrect state structure (credentials not nested in configuration)
4. **Superseded by Better Tests**: New tests are simpler, more focused, and actually work

## Active Tests Location

Current working tests are in:
- `/tests/cli/` - CLI-based tests (3 working scripts)
- `/tests/api/` - API validation
- `/tests/` - Integration and other tests

See `TESTING-INDEX.md` for the current testing strategy. 