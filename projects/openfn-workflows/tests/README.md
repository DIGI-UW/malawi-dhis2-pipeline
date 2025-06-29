# OpenFN Workflows Testing Guide

This project supports parallel Docker-based testing environments with **custom SFTP adaptor** that fixes the "Invalid username" error.

## 🚀 **Quick Start (New Integration)**

```bash
# 1. Build the CLI testing image (integrated with main build system)
./build-custom-images.sh openfn-cli-test

# 2. Run tests with custom adaptor
npm run test:cli            # Run CLI tests (now passes!)
npm run test:openfn         # Trigger via OpenFN API

# 3. Interactive development
npm run dev:shell          # Enter CLI container
npm run dev                # Run workflow once
```

## 🎯 **What's Fixed**

### ✅ **Before (Native Adaptor - BROKEN)**
```bash
# This FAILED with "Invalid username" error
docker run --rm openfn/cli:latest openfn run sftp-test.json
# [R/T] ✘ connect: Invalid username
```

### ✅ **After (Custom Adaptor - WORKING)**
```bash
# This WORKS with enhanced debugging
docker run --rm openfn-cli-test:latest test-sftp tests/e2e/sftp-check-input.json
# [R/T] ✔ Connected to SFTP server
# [R/T] ✔ Listed files: [...]
```

## 🐳 **Docker-Based Testing (No Local Dependencies!)**

All testing is containerized with **custom SFTP adaptor** - no need to install Node.js, npm, or broken adaptors locally.

### 🔧 **Integrated Build System**

The CLI test container is now part of the main build system:

```bash
# Build specific container
./build-custom-images.sh openfn-cli-test

# Build all custom images (including CLI test)
./build-custom-images.sh

# Configuration in: packages/openfn/package-metadata.json
{
  "LOCAL_OPENFN_CLI_TEST_IMAGE": "openfn-cli-test:latest",
  "OPENFN_CLI_TEST_IMAGE": "node:18-alpine"
}
```

## 🧪 **Testing Approaches**

### 1. **CLI Testing (Custom Container with Fixed SFTP)**
Fast testing with OpenFN CLI and **custom SFTP adaptor** that actually works.

```bash
# Build the test environment (integrated)
./build-custom-images.sh openfn-cli-test

# Run CLI tests with custom adaptor
npm run test:cli

# Interactive shell for debugging
npm run dev:shell

# Inside the container (enhanced commands):
test-sftp tests/e2e/sftp-check-input.json      # SFTP with debugging
run-workflow workflows/sftp-dhis2/sftp-to-dhis2.json  # Full workflow
```

### 2. **OpenFN Lightning Testing (Production with Custom SFTP)**
Test workflows in the actual OpenFN Lightning environment with **custom SFTP adaptor**.

```bash
# Ensure OpenFN is running with custom image
docker service ls | grep openfn

# Trigger workflow via API
npm run test:openfn

# Monitor logs with enhanced debugging  
npm run dev:logs
```

## 📁 **Test Structure**

```
projects/openfn-workflows/
├── Dockerfile.cli        # CLI testing environment (custom SFTP)
├── docker-compose.test.yml # Test orchestration
├── tests/
│   ├── unit/            # Unit tests for adaptors
│   ├── e2e/             # End-to-end tests
│   │   ├── sftp-check-input.json  # SFTP connection test
│   │   └── outputs/     # Test results
│   └── README.md        # This file
└── workflows/           # Your OpenFN workflows
```

## 🔧 **Key Commands**

| Command | Description | Status |
|---------|-------------|--------|
| `./build-custom-images.sh openfn-cli-test` | Build CLI test container | ✅ **NEW** |
| `npm run test:cli` | Run CLI tests | ✅ **WORKS** |
| `npm run dev:shell` | Enter test container | ✅ **WORKS** |
| `npm run dev:up` | Start test container in background | ✅ **WORKS** |
| `npm run dev:down` | Stop test containers | ✅ **WORKS** |
| `npm run test:data` | Create test data in SFTP | ✅ **WORKS** |
| `npm run test:openfn` | Trigger via API | ✅ **WORKS** |
| `npm run dev:logs` | Monitor OpenFN logs | ✅ **WORKS** |

## 🐛 **Debugging Tips**

### CLI Container (Custom SFTP Adaptor)
```bash
# Enter the container
npm run dev:shell

# Test SFTP connectivity
nc -v sftp-storage_sftp-server 22

# Run with custom adaptor and enhanced debugging
test-sftp tests/e2e/sftp-check-input.json
run-workflow workflows/sftp-dhis2/sftp-to-dhis2.json

# Check custom adaptor is loaded
ls -la /adaptors/node_modules/@openfn/language-sftp
# Should show: custom-sftp -> symlink to enhanced adaptor
```

### OpenFN Lightning Container (Custom SFTP Adaptor)
```bash
# Access the running container
docker exec -it $(docker ps -q -f ancestor=openfn-custom:latest) /bin/bash

# Test custom adaptor with enhanced debugging
cd /app/priv/openfn/@openfn/language-sftp
node
> const {execute, list} = require('./dist/index.cjs');
```

## 📝 **SFTP Issue Resolution - FIXED! 🎉**

### **Problem**: "Invalid username" Error
```
[R/T] ✘ connect: Invalid username
[R/T] ✘ Check state.errors.job-1 for details
```

### **Root Cause**: 
- Broken **pnpm symlinks** in Docker builds prevented `ssh2-sftp-client` from loading
- Native OpenFN adaptors had broken dependency installation
- Same issue affected both CLI and Lightning environments

### **Solution**:
1. **Custom Dockerfile**: Modified to use `npm install` instead of copying broken pnpm symlinks
2. **Enhanced Debugging**: Added detailed connection logging to SFTP adaptor
3. **Integrated Build**: Part of main `build-custom-images.sh` system
4. **Both Environments**: Fixed in both CLI test container and Lightning container

### **Result**:
- ✅ **CLI Container**: `openfn-cli-test:latest` with working SFTP
- ✅ **Lightning Container**: `openfn-custom:latest` with working SFTP  
- ✅ **Enhanced Debugging**: Detailed connection info and error reporting
- ✅ **Proven Working**: Manual testing confirms SFTP operations succeed

## 🔄 **Architecture Overview**

### **Two Working Environments**:

1. **OpenFN Lightning** (Production):
   - Image: `openfn-custom:latest`
   - Custom SFTP adaptor in `/app/priv/openfn/@openfn/language-sftp/`
   - Enhanced debugging enabled
   - **Status**: ✅ **WORKING**

2. **OpenFN CLI** (Testing):
   - Image: `openfn-cli-test:latest` 
   - Custom SFTP adaptor in `/adaptors/node_modules/@openfn/language-sftp/`
   - Enhanced debugging enabled
   - **Status**: ✅ **WORKING**

### **Native Adaptors Status**:
- **OpenFN CLI Native**: ❌ **BROKEN** - "Invalid username" error
- **OpenFN Lightning Native**: ❌ **BROKEN** - Same dependency issue
- **Recommendation**: **Keep custom adaptors** - they work reliably

## 🚀 **Testing Workflow**

```bash
# 1. Build custom images (includes CLI test)
./build-custom-images.sh

# 2. Test CLI environment
npm run test:cli
# Expected: ✅ SFTP connection succeeds

# 3. Test Lightning environment  
npm run test:openfn
# Expected: ✅ Workflow execution succeeds

# 4. Compare with native (broken) adaptor
docker run --rm openfn/cli:latest openfn --version
# This would fail with SFTP operations
``` 