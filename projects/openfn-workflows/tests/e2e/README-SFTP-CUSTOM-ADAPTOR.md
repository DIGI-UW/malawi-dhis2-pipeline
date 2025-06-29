# OpenFN SFTP Custom Adaptor Testing

## Overview

This documents the process of creating and testing a custom OpenFN SFTP adaptor to fix the "Invalid username" error that occurs with the npm version (2.0.14).

## Problem

The official SFTP adaptor from npm (@openfn/language-sftp@2.0.14) has broken pnpm symlinks when used in Docker builds, causing module loading failures that manifest as "Invalid username" errors.

## Solution

We created a custom Docker image (`openfn-cli-test:latest`) that:
1. Builds the SFTP adaptor from source
2. Installs it with proper dependencies (no broken symlinks)
3. Pre-installs it in the CLI's expected location
4. Uses version "2.0.14-custom" to differentiate from npm version

## Key Files

### Dockerfile.cli
Located at: `projects/openfn-workflows/Dockerfile.cli`

This Dockerfile:
- Clones the OpenFN adaptors monorepo
- Builds the SFTP adaptor from source
- Installs it in `/tmp/openfn/repo/node_modules/@openfn/language-sftp_2.0.14-custom`
- Creates proper package.json structure

### Test Script
Located at: `tests/e2e/test-sftp-with-custom-adaptor.sh`

This script demonstrates the working approach for running workflows with the custom adaptor.

## Important Discoveries

### 1. CLI Project Structure Requirements

The OpenFN CLI v1.13.0 requires a specific project structure:
```
myproject/
├── openfn.json          # Project configuration
└── workflows/
    └── workflow-name/
        └── workflow-name.json
```

### 2. openfn.json Configuration
```json
{
  "workflowRoot": "workflows",
  "formats": {
    "workflow": "json"
  }
}
```

### 3. Workflow File Structure
```json
{
  "id": "workflow-name",
  "steps": [
    {
      "adaptor": "@openfn/language-sftp@2.0.14-custom",
      "expression": "// Your code here"
    }
  ]
}
```

### 4. Running Workflows

The correct command format is:
```bash
openfn <project-dir> <workflow-name> [options]
```

Example:
```bash
openfn myproject test-workflow -i input.json -o output.json
```

## Building the Custom Image

```bash
docker build -f Dockerfile.cli -t openfn-cli-test:latest .
```

## Testing

1. Make the test script executable:
```bash
chmod +x tests/e2e/test-sftp-with-custom-adaptor.sh
```

2. Run the test:
```bash
./tests/e2e/test-sftp-with-custom-adaptor.sh
```

## Known Issues

1. The CLI tries to parse paths as project directories, causing "ENOTDIR" errors when passing JSON files directly
2. The CLI's module resolution is complex and involves multiple layers
3. Environment variables like OPENFN_REPO_DIR don't always override module resolution

## Next Steps

1. Complete the SFTP connection test with proper credentials
2. Test file operations (list, get, put)
3. Integrate with the full workflow pipeline
4. Consider submitting a fix to the upstream SFTP adaptor

## Debug Output

When the custom adaptor loads successfully, you'll see:
```
[CLI] ♦ Versions:
         ▸ node.js                  18.20.8
         ▸ cli                      1.13.0
         ▸ @openfn/language-sftp    2.0.14-custom
```

The debug logs will show the enhanced connection debugging we added to the SFTP adaptor. 