# OpenFN Testing Framework - Complete Index & Strategy

**Last Updated**: 2024-12-29  
**Status**: ✅ **Production Ready** - Docker-based testing framework with working SFTP integration

## 🚀 **Quick Start Guide**

### **30-Second Test**
```bash
cd projects/indicator_workflow_testing
./run-tests.sh --cli-workflow
```
**Expected Output:**
```
✅ CLI SFTP Basic tests passed
✅ CLI Simple Job tests passed  
✅ CLI SFTP Workflow tests passed
```

### **Complete Test Suite**
```bash
./run-tests.sh                    # All tests (~5min)
./run-tests.sh --cli-workflow     # CLI tests only (~2min)
./run-tests.sh --api             # API only (~30s)
./run-tests.sh --excel           # Excel only (~1min)
./run-tests.sh --integration     # Integration only (~2min)
```

### **Quick Debugging**
If tests fail:
1. **Check Docker images:** `docker images | grep openfn-cli-test`
2. **Rebuild if needed:** `./build-custom-images.sh openfn-cli-test`
3. **Check SFTP service:** `docker service ls | grep sftp`
4. **Manual test:** `cd tests/cli && ./test-sftp-working-command.sh`

### **Success Indicators**
- ✅ **CLI Tests**: All 3 tests pass (basic, simple, workflow)
- ✅ **SFTP Connection**: Lists 3 Excel files including ART data
- ✅ **No "Invalid username" errors**
- ✅ **Docker images**: `openfn-cli-test:latest` exists

---

## 🎯 **What We're Testing: OpenFN Workflows**

### **Purpose**
This testing framework is designed to test the OpenFN workflows located in:
```
projects/openfn-workflows/workflows/
├── sftp-dhis2/          # SFTP to DHIS2 workflow (currently active)
│   ├── project.yaml     # Workflow configuration
│   ├── jobs/*.js        # Individual job scripts
│   └── README.md        # Workflow documentation
└── [new-workflow]/      # Your new workflow here
```

### **Workflow Development Lifecycle**

```mermaid
graph LR
    A[1. Create Workflow] --> B[2. Test with CLI]
    B --> C[3. Validate Logic]
    C --> D[4. Deploy to OpenFN]
    D --> E[5. Monitor in Production]
    C --> B
```

1. **Create/Modify Workflow** → Edit files in `workflows/[workflow-name]/`
2. **Test Locally with CLI** → Use our testing framework
3. **Validate Business Logic** → Ensure data transformations work
4. **Deploy to OpenFN** → Push to Lightning instance
5. **Monitor Production** → Check logs and results

### **Testing Workflow Changes**

When you modify a workflow in `/workflows`:

```bash
# 1. Test the complete workflow
cd projects/indicator_workflow_testing
./run-tests.sh --cli-workflow

# 2. Test individual SFTP operations
./tests/cli/test-sftp-working-command.sh   # Basic connectivity (30s)
./tests/cli/test-simple-sftp-job.sh        # Simple inline job
./tests/cli/test-sftp-dhis2-workflow.sh    # Complete workflow test

# 3. Test with custom state file
# Edit fixtures/sftp-test-input.json with your test data
# Then run any of the above tests
```

---

## 🏗️ **Build Process**

### **Building Custom Images**

Before deploying with instant CLI, you need to build the custom images:

```bash
# 1. Build custom OpenFN images with working SFTP adaptor
./build-custom-images.sh
# This builds:
#   - openfn-custom:latest (Lightning with SFTP fix)
#   - openfn-cli-test:latest (CLI testing environment)

# 2. Build the main platform image
./build-image.sh
# This builds:
#   - malawi-dhis2-indicators:latest (Main platform image)

# 3. Verify images were built
docker images | grep -E "(openfn-custom|openfn-cli-test|malawi-dhis2)"
```

**Build outputs:**
- **`openfn-custom:latest`** - OpenFN Lightning with working SFTP adaptor for production
- **`openfn-cli-test:latest`** - CLI testing environment with pre-installed adaptors
- **`malawi-dhis2-indicators:latest`** - Main platform image used by instant CLI

---

## 📝 **Complete Workflow Development Guide**

### **1. Creating a New Workflow**

#### **Step 1: Create Workflow Structure**
```bash
cd projects/openfn-workflows/workflows
mkdir my-new-workflow
cd my-new-workflow

# Create project configuration
cat > project.yaml << 'EOF'
name: my-new-workflow
description: My new workflow description
workflows:
  MyWorkflow:
    name: My Workflow
    jobs:
      FirstJob:
        name: First Job
        adaptor: '@openfn/language-common@latest'
        body:
          path: ./jobs/first-job.js
    triggers:
      manual:
        type: webhook
    edges:
      trigger-to-job:
        source_trigger: manual
        target_job: FirstJob
EOF

# Create jobs directory
mkdir jobs
```

#### **Step 2: Write Job Scripts**
```bash
cat > jobs/first-job.js << 'EOF'
// Simple job that logs state
fn(state => {
  console.log('Processing data:', state.data);
  return { ...state, processed: true };
});
EOF
```

#### **Step 3: Test with CLI**
```bash
cd ~/code/malawi-dhis2-pipeline/projects/indicator_workflow_testing

# Test individual job
./tests/cli/test-job.sh ../openfn-workflows/workflows/my-new-workflow/jobs/first-job.js

# Test as workflow (create test fixture first)
cat > tests/fixtures/my-workflow-input.json << 'EOF'
{
  "data": { "test": "hello" },
  "configuration": {}
}
EOF

# Run workflow test
./tests/cli/test-workflow.sh my-new-workflow
```

### **2. Testing Existing Workflows**

#### **Testing sftp-dhis2 Workflow**
```bash
# 1. Test the complete workflow with all 3 CLI tests
./run-tests.sh --cli-workflow

# 2. Run individual test scripts
cd tests/cli
./test-sftp-working-command.sh    # ⭐ Proven working SFTP test (30s)
./test-simple-sftp-job.sh         # Simple inline job test
./test-sftp-dhis2-workflow.sh     # Complete workflow integration

# 3. Test with custom data
# Create custom state file
cat > fixtures/custom-sftp-test.json << 'EOF'
{
  "data": [],
  "configuration": {
    "host": "172.17.0.1",
    "port": 2225,
    "username": "test",
    "password": "test123"
  }
}
EOF

# Use custom state with existing tests
# The tests will use this fixture if you copy it to sftp-test-input.json
cp fixtures/custom-sftp-test.json fixtures/sftp-test-input.json
./test-sftp-working-command.sh
```

### **3. Deploying to OpenFN**

#### **Option 1: Using Instant OpenHIE v2 CLI (Production Deployment)**
```bash
# Build custom images first
./build-custom-images.sh
./build-image.sh

# Deploy using instant CLI v2
# Initialize packages
./instant package init -n database-postgres -d
./instant package init -n openfn -d
./instant package init -n sftp-storage -d     # If using SFTP
./instant package init -n dhis2-instance -d   # If using local DHIS2

# To update/redeploy
./instant package destroy -n openfn
./instant package init -n openfn -d

# Check deployment
docker service ls
```

#### **Option 2: Manual Deployment via UI**
1. Log into OpenFN Lightning at http://localhost:4000
2. Navigate to Projects → Your Project
3. Create/Update workflow with contents from `project.yaml`
4. Upload job scripts from `jobs/` directory
5. Configure credentials and test

#### **Option 3: OpenFN CLI Deploy (Development)**
```bash
cd projects/openfn-workflows/workflows/sftp-dhis2

# Deploy using OpenFN CLI
openfn deploy \
  --endpoint http://localhost:4000 \
  --apiKey your-api-key \
  --project-path .
```

### **4. Workflow Testing Patterns**

#### **Pattern 1: Quick Connectivity Test (30s)**
```bash
# Use the proven working test
./tests/cli/test-sftp-working-command.sh

# Tests basic SFTP connectivity
# Good for: Quick validation, debugging connectivity issues
```

#### **Pattern 2: Integration Testing (Complete Workflow)**
```bash
# Test all 3 CLI tests together
./run-tests.sh --cli-workflow

# Or run the comprehensive workflow test directly
./tests/cli/test-sftp-dhis2-workflow.sh

# Tests complete SFTP → Excel → DHIS2 flow
# Good for: End-to-end validation
```

#### **Pattern 3: Simple Job Testing**
```bash
# Test simple inline SFTP operations
./tests/cli/test-simple-sftp-job.sh

# Tests basic SFTP job execution
# Good for: Testing simple transformations
```

### **5. Debugging Workflows**

#### **Common Debugging Steps**
```bash
# 1. Enable verbose logging
./run-tests.sh --cli-workflow --verbose

# 2. Check intermediate states (if using the workflow tests)
# Output files are saved in tests/cli/outputs/
ls tests/cli/outputs/

# 3. Test with known working state
./tests/cli/test-sftp-working-command.sh
# This uses fixtures/sftp-test-input.json which is proven to work

# 4. Interactive debugging
docker run --rm -it openfn-cli-test:latest /bin/bash
# Then manually run commands inside container
```

#### **Debugging Checklist**
- [ ] State structure correct? (credentials in `configuration`)
- [ ] Adaptor version specified correctly?
- [ ] File paths relative to workflow root?
- [ ] All required npm packages installed?
- [ ] Docker network connectivity working?

---

## 🎯 **Testing Strategy Overview**

### **Core Principle: Docker-First Testing**
- **No local dependencies required** (Node.js, npm, etc.)
- **Consistent environments** across development/CI/production
- **Working SFTP integration** with official `@openfn/language-sftp@2.0.14` 
- **Fixed Docker builds** that properly install packages (no broken symlinks)

### **Architecture**
```
Docker Images:
├── openfn-cli-test:latest     # CLI testing with official SFTP
├── openfn-custom:latest       # Lightning with official SFTP  
└── node:18-alpine            # For Node.js tests

Test Categories:
├── CLI Tests        # OpenFN CLI workflows
├── API Tests        # Lightning API endpoints
├── Integration      # End-to-end workflows
├── Excel Parsing    # Data processing
├── SFTP Operations  # File transfers
└── Deployment       # Service orchestration
```

## 📝 **OpenFN Coding Standards**

### **✅ ALWAYS USE: Simple Direct Syntax**

```javascript
// ✅ CORRECT - Works with official adaptor @openfn/language-sftp@2.0.14
list('/data/excel-files', (state) => {
  console.log('Files found:', state.data.length);
  return state;
});

// ✅ CORRECT - Direct file operations
get('/data/excel-files/report.xlsx', '/tmp/local-file.xlsx', (state) => {
  console.log('File downloaded');
  return state;
});
```

### **❌ Don't Use: Complex Nested Functions**

```javascript
// ❌ WRONG - Causes "TypeError: fn is not a function"
list(
  (state) => {
    const directory = state.configuration?.remoteDir || '/default/';
    return directory;
  },
  (state) => { /* callback */ }
);

// ❌ WRONG - Template literals in shell-generated workflows
list(`${state.config.dir}`, (state) => { ... });
```

### **Why This Matters**
1. **Shell Script Compatibility**: Complex nested functions get mangled during string escaping
2. **Runtime Stability**: Simple syntax avoids function resolution errors  
3. **Debugging**: Easier to read and troubleshoot
4. **Consistency**: All workflows use the same reliable pattern

### **Required State Structure**
```json
{
  "data": [],
  "configuration": {
    "host": "172.17.0.1",
    "port": 2225,
    "username": "openfn", 
    "password": "instant101"
  }
}
```

---

## 📚 **OpenFN Testing Best Practices** (Based on Official Documentation Review)

### **Based on Official Documentation Review**

After thorough review of OpenFN's [Job Writing Guide](https://docs.openfn.org/documentation/jobs/job-writing-guide), [CLI Usage](https://docs.openfn.org/documentation/cli-usage), and workflow specifications, here's the correct testing approach:

#### **1. Job Structure Requirements**
- **Operations at top level only** - Never nest operations in callbacks
- **Always return state** from callbacks
- **Use arrow functions** for lazy state resolution: `state => state.data`
- **Clean final state** - Remove sensitive data before job completion

#### **2. CLI Workflow Format** ⚠️ **Critical**
The CLI uses **JSON format**, not YAML (YAML is for Lightning deployment):

```json
{
  "workflows": {
    "steps": [
      {
        "id": "step-name",
        "expression": "path/to/job.js",  // or inline code
        "adaptor": "@openfn/language-sftp@latest",
        "state": {
          "configuration": {
            // Credentials MUST be nested in configuration
            "host": "sftp.example.com",
            "username": "user",
            "password": "pass"
          }
        },
        "next": {
          "next-step": true  // or conditional expression
        }
      }
    ]
  },
  "options": {
    "start": "step-name"  // optional start node
  }
}
```

#### **3. State Structure Requirements**
```json
{
  "configuration": {
    // Credentials/auth info MUST be here
    "host": "sftp.example.com",
    "username": "user",
    "password": "pass"
  },
  "data": {
    // Job-specific data goes here
  }
}
```

#### **4. Testing Progression** ⭐ **Recommended Approach**

1. **Test Individual Jobs First**
   ```bash
   # Single job with explicit adaptor
   openfn job.js -a sftp@latest -s state.json -o output.json
   ```

2. **Then Test Full Workflows**
   ```bash
   # Workflow with multiple steps
   openfn workflow.json -o output.json
   ```

3. **Use Step Caching for Debugging**
   ```bash
   # Cache intermediate results
   openfn workflow.json --cache-steps
   # Results in .cli-cache/<workflow>/<step>.json
   ```

4. **Start from Specific Steps**
   ```bash
   # Resume from a step (auto-loads cached state)
   openfn workflow.json --start upload-to-dhis2
   ```

#### **5. Common Pitfalls to Avoid**

| Issue | Wrong | Correct |
|-------|-------|---------|
| **Nested operations** | `get().then(() => each())` | Separate top-level operations |
| **State mutations** | `state.data = filtered` | `fn(state => ({...state, data: filtered}))` |
| **Wrong format** | YAML for CLI | JSON for CLI, YAML for deploy |
| **Credentials location** | Top-level state | Nested in `configuration` |
| **Complex syntax** | Multi-function chains | Simple callback patterns |

#### **6. SFTP-Specific Testing Strategy**

Based on our discoveries, the working approach is:

1. **Use official adaptor**: `@openfn/language-sftp@2.0.14`
2. **Simple syntax works best**:
   ```javascript
   list('/data/excel-files', state => {
     console.log('Files:', state.data);
     return state;
   });
   ```
3. **Avoid complex function chains** that cause "fn is not a function" errors
4. **Use our Docker images** with proper npm installs (no pnpm symlinks)

### **✅ Key Takeaways**

1. **JSON for CLI, YAML for deployment** - Don't mix formats
2. **Test incrementally** - Jobs → Steps → Workflows → Integration
3. **Use official adaptors** - They work when installed correctly
4. **Keep it simple** - Complex syntax often breaks
5. **Docker is your friend** - Consistent, working environment

---

## 📋 **Complete Test Index**

### **🚀 Quick Start Commands**

| Purpose | Command | Time | Notes |
|---------|---------|------|-------|
| **Run everything** | `./run-tests.sh` | ~5min | All test suites |
| **CLI workflows** | `./run-tests.sh --cli-workflow` | ~2min | 3 working CLI tests |
| **Quick SFTP test** | `./run-tests.sh --cli-workflow` | ~30s | Includes **PROVEN WORKING** test |
| **API connectivity** | `./run-tests.sh --api` | ~30s | OpenFN status |
| **Excel parsing** | `./run-tests.sh --excel` | ~1min | Data validation |
| **Integration** | `./run-tests.sh --integration` | ~2min | End-to-end workflow |

### **📁 Test Categories & Files**

#### **1. CLI Tests** (`tests/cli/`)
**We have 3 working test scripts - no additional test files needed:**

| File | Purpose | Status | Access Via |
|------|---------|--------|------------|
| `test-sftp-working-command.sh` | ✅ **PROVEN WORKING SFTP TEST** - Basic connectivity (30s) | 🟢 Active | `./run-tests.sh --cli-workflow` |
| `test-sftp-dhis2-workflow.sh` | ⭐ **COMPREHENSIVE WORKFLOW** - Tests complete SFTP→Excel→DHIS2 flow | 🟢 Active | `./run-tests.sh --cli-workflow` |
| `test-simple-sftp-job.sh` | Simple inline SFTP job test using proven syntax | 🟢 Active | `./run-tests.sh --cli-workflow` |

**What each test does:**
- **`test-sftp-working-command.sh`**: Creates a minimal OpenFN project structure, runs a simple SFTP list command, validates connection
- **`test-simple-sftp-job.sh`**: Tests inline SFTP expressions without full workflow structure
- **`test-sftp-dhis2-workflow.sh`**: Simulates the complete sftp-dhis2 workflow with multiple steps

**Usage:** All 3 CLI tests run together with: `./run-tests.sh --cli-workflow`

#### **2. API Tests** (`tests/api/`)
| File | Purpose | Status | Docker-Based |
|------|---------|--------|--------------|
| `api-tests.sh` | OpenFN Lightning API validation | 🟢 Active | ❌ |

#### **3. Integration Tests** (`tests/`)
| File | Purpose | Status | Docker-Based |
|------|---------|--------|--------------|
| `integration-tests.js` | End-to-end workflow validation | 🟢 Active | ✅ |
| `excel-parsing-tests.js` | Multi-sheet Excel processing | 🟢 Active | ✅ |
| `workflow-validation-tests.sh` | Workflow configuration checks | 🟢 Active | ❌ |

#### **4. SFTP Tests** (`tests/`)
| File | Purpose | Status | Docker-Based |
|------|---------|--------|--------------|
| `test-sftp.sh` | Basic SFTP connectivity | 🟢 Active | ❌ |
| `sftp-integration-tests.sh` | SFTP workflow integration | 🟢 Active | ✅ |
| `deploy-and-test-sftp-integration.sh` | Full deployment testing | 🟢 Active | ✅ |

#### **5. Archived Tests** (`tests/.archive/`)
| Category | Count | Status | Notes |
|----------|--------|--------|-------|
| `cli-tests-2024-12-29/` | 4 files | 🔴 Archived | Latest obsolete CLI tests (YAML conversion issues) |
| `custom-adaptor-obsolete/` | 3 files | 🔴 Obsolete | Used custom adaptor (now official works) |
| `openfn-workflows-legacy/` | 15+ files | 🔴 Archived | Old structure, consolidated |
| `experimental/` | 10+ files | 🔴 Archived | Development artifacts |
| `root-level/` | 3 files | 🔴 Archived | Moved from project root |

### **🧪 Test Data & Fixtures** (`tests/fixtures/`)

| File | Purpose | Used By |
|------|---------|---------|
| `sftp-test-input.json` | ✅ **WORKING SFTP config** | CLI tests |
| `default-input.json` | Generic OpenFN state | Multiple tests |
| `processed-excel-input.json` | Excel processing pipeline | Integration tests |
| `downloaded-files-input.json` | File download simulation | Integration tests |

### **📤 Test Outputs** (`tests/outputs/`)
| File | Generated By | Contains |
|------|--------------|----------|
| `excel-test-result.json` | SFTP tests | ✅ **Actual file listings** |
| Test logs | All tests | Execution details |

## 🐳 **Docker-Based Testing Guide**

### **Prerequisites**
```bash
# Build the working Docker images
./build-custom-images.sh
./build-image.sh

# Verify images exist
docker images | grep -E "(openfn-cli-test|openfn-custom|malawi-dhis2)"
```

### **Core Testing Patterns**

#### **Pattern 1: CLI Workflow Testing** ⭐ **RECOMMENDED**
```bash
# The PROVEN working approach
cd projects/indicator_workflow_testing
./run-tests.sh --cli-workflow

# Expected output:
# ✅ CLI SFTP Basic tests passed
# ✅ CLI Simple Job tests passed
# ✅ CLI SFTP Workflow tests passed
```

#### **Pattern 2: Full Integration Testing**
```bash
cd projects/indicator_workflow_testing
./run-tests.sh --integration

# Tests: File parsing, data transformation, DHIS2 compatibility
```

#### **Pattern 3: Interactive Debugging**
```bash
# Enter the CLI test container
docker run --rm -it \
  -v "$(pwd)/projects/indicator_workflow_testing/tests:/workspace" \
  openfn-cli-test:latest /bin/bash

# Inside container:
# - openfn CLI available with working SFTP
# - Pre-installed adaptors in /adaptors/node_modules
# - Proper npm install (no broken symlinks)
```

## 🎯 **Testing Use Cases**

### **Use Case 1: Validate SFTP Connection** ⭐
```bash
# Quick 30-second validation
cd projects/indicator_workflow_testing
./run-tests.sh --cli-workflow

# Validates:
# ✅ SFTP connectivity (172.17.0.1:2225)
# ✅ File listing (/data/excel-files)
# ✅ Official adaptor (@openfn/language-sftp@2.0.14)
```

### **Use Case 2: Test Excel Processing**
```bash
# Comprehensive Excel validation
./run-tests.sh --excel

# Tests:
# ✅ Multi-sheet processing (6-11 sheets)
# ✅ File type detection
# ✅ Data extraction and validation
```

### **Use Case 3: End-to-End Workflow**
```bash
# Full SFTP → Excel → DHIS2 pipeline
./run-tests.sh --integration

# Validates:
# ✅ File structure analysis
# ✅ Data transformation
# ✅ DHIS2 payload generation
```

### **Use Case 4: API Health Check**
```bash
# OpenFN Lightning validation
./run-tests.sh --api

# Checks:
# ✅ API connectivity
# ✅ Workflow loading
# ✅ Authentication
```

## 📊 **Test Results & Interpretation**

### **Success Indicators**
- **✅ SFTP Connection**: `Connected` + file listings
- **✅ CLI Success**: `[R/T] ✔ job-1 completed`
- **✅ Excel Parsing**: File count + sheet analysis
- **✅ Integration**: `All tests passed! 🎉`

### **Common Issues & Solutions**

| Issue | Cause | Solution |
|-------|-------|----------|
| "Invalid username" | Old Docker images | `./build-custom-images.sh openfn-cli-test` |
| "Node.js not found" | Missing local deps | Use `./run-tests.sh` (Docker fallback) |
| "TypeError: fn is not a function" | Complex SFTP syntax | Use simple syntax: `list('/path', callback)` |
| "ENOENT: file not found" | Wrong state file | Use `-s` flag, check fixture path |
| "Connection refused" | Wrong host address | Linux: use `172.17.0.1`, Mac/Win: use `host.docker.internal` |

#### **Docker Networking Note** 🐧
- **Linux**: Use `172.17.0.1` (Docker bridge network IP)
- **Mac/Windows**: Use `host.docker.internal` 
- This affects SFTP host configuration when connecting from Docker containers to host services

## 🔧 **Maintenance & Updates**

### **When to Rebuild Docker Images**
- OpenFN CLI version updates
- SFTP adaptor version changes  
- Node.js version updates
- Dependency conflicts

### **Test File Organization**
- **Active tests**: `tests/` (version controlled)
- **Fixtures**: `tests/fixtures/` (shared test data)
- **Outputs**: `tests/outputs/` (gitignored, generated)
- **Archive**: `tests/.archive/` (historical, obsolete)

### **Configuration Updates**
- **Test config**: `config/test-config.json`
- **Endpoints**: `config/endpoints.json`
- **Docker settings**: Dockerfiles in project directories

## 🚀 **Quick Reference Commands**

```bash
# Emergency: Just test if SFTP works
cd projects/indicator_workflow_testing && ./run-tests.sh --cli-workflow

# Full validation before deployment
cd projects/indicator_workflow_testing && ./run-tests.sh

# Specific test categories
./run-tests.sh --api          # API only
./run-tests.sh --excel        # Excel only  
./run-tests.sh --integration  # End-to-end only

# Build fresh Docker images
./build-custom-images.sh && ./build-image.sh

# Interactive debugging
docker run --rm -it openfn-cli-test:latest /bin/bash
```

## 📈 **Success Metrics**

- **⭐ CLI Tests**: 2 minutes, validates 3 test patterns
- **🔄 Integration**: 2 minutes, validates full data pipeline  
- **🌐 API Tests**: 30 seconds, confirms OpenFN status
- **📊 Excel Tests**: 1 minute, processes multi-sheet files
- **🎯 Overall**: ~5 minutes for complete validation

---

**🎉 This framework provides comprehensive Docker-based testing for the entire SFTP → Excel → DHIS2 pipeline with working official packages and proper instant OpenHIE v2 CLI deployment!**