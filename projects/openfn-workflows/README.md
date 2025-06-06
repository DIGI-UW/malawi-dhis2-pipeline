# OpenFN Workflows Manager

This project provides a centralized workflow management system for OpenFN, with support for multiple workflow configurations and deployment strategies. It serves as both a package lifecycle component and a standalone CLI utility for managing OpenFN workflows.

## 🏗️ Architecture Overview

The OpenFN Workflows Manager uses a **dual-purpose Docker image** that can operate in two modes:

### 1. **Package Lifecycle Integration**
- Automatically deployed as part of the OpenFN package via `swarm.sh`
- Workflows are baked into the Docker image at build time
- Runs as a service within the Docker Swarm stack
- Environment variables configure which workflow to deploy

### 2. **Standalone CLI Utility**
- Independent workflow management outside package lifecycle
- Supports volume mounting for development workflows
- Direct workflow deployment to any OpenFN instance
- Useful for testing, development, and manual operations

## 📁 Project Structure

```
projects/openfn-workflows/
├── workflows/                    # All workflow configurations
│   ├── sftp-dhis2/              # SFTP to DHIS2 workflow
│   │   ├── project.yaml         # OpenFN project configuration
│   │   └── jobs/                # Individual job files
│   ├── google-sheets-dhis2/     # Google Sheets to DHIS2 workflow (future)
│   └── hybrid-workflow/         # Combined workflow (future)
├── shared/                      # Shared utilities and libraries
│   ├── jobs/                    # Reusable job components
│   ├── utils/                   # Helper functions
│   │   ├── excel-validator.js   # Excel data validation
│   │   └── dhis2-helpers.js     # DHIS2 integration utilities
│   └── templates/               # Job templates
├── docker/                     # Docker configurations
│   ├── Dockerfile              # Main workflow manager image
│   └── entrypoint.sh           # Smart entrypoint script
├── scripts/                    # Management scripts
│   ├── deploy-workflow.sh      # Deploy specific workflow
│   ├── list-workflows.sh       # List available workflows
│   └── validate-workflow.sh    # Validate workflow configuration
├── build.sh                   # Build the workflow manager image
└── package-metadata.json      # Integration metadata
```

## 🚀 Scripts and Usage

### Core Scripts

#### **`build.sh`**
Builds the OpenFN Workflows Manager Docker image with all workflows baked in.

```bash
# Build with default 'latest' tag
./build.sh

# Build with custom tag
./build.sh v1.0.0

# Build for development
./build.sh development
```

**What it does:**
- Builds Docker image from `docker/Dockerfile`
- Copies all workflows into the image
- Tags image appropriately
- Shows usage examples

#### **`scripts/deploy-workflow.sh`**
Deploys a specific workflow to an OpenFN instance (standalone mode).

```bash
# Basic deployment
./scripts/deploy-workflow.sh sftp-dhis2

# Deploy to specific endpoint
./scripts/deploy-workflow.sh sftp-dhis2 http://openfn.example.com:4000

# Dry run (validation only)
./scripts/deploy-workflow.sh sftp-dhis2 --dry-run

# With authentication
./scripts/deploy-workflow.sh sftp-dhis2 --api-key your-api-key
./scripts/deploy-workflow.sh sftp-dhis2 --user admin --password secret
```

**What it does:**
- Validates workflow exists and is properly configured
- Builds workflow manager image if needed
- Deploys workflow to specified OpenFN instance
- Supports both API key and username/password authentication
- Provides dry-run mode for testing

#### **`scripts/list-workflows.sh`**
Lists all available workflows and their descriptions.

```bash
./scripts/list-workflows.sh
```

**Output example:**
```
Available workflows in /app/workflows:
  - sftp-dhis2: SFTP Excel to DHIS2 HIV Indicators Pipeline with Cron and Webhook Triggers
  - google-sheets-dhis2: Google Sheets to DHIS2 integration workflow
```

#### **`scripts/validate-workflow.sh`**
Validates workflow configurations without deploying.

```bash
# Validate all workflows
./scripts/validate-workflow.sh

# Validate specific workflow
./scripts/validate-workflow.sh sftp-dhis2
```

**What it checks:**
- YAML syntax in `project.yaml`
- Required job files exist
- Workflow structure integrity
- OpenFN configuration validity

### Docker Entrypoint (`docker/entrypoint.sh`)

The smart entrypoint handles both package lifecycle and CLI utility modes:

**Environment Variables:**
- `MODE`: Operation mode (`list`, `validate`, `deploy`)
- `WORKFLOW_NAME`: Which workflow to deploy
- `OPENFN_ENDPOINT`: Target OpenFN instance URL
- `OPENFN_API_KEY`: API key authentication
- `OPENFN_ADMIN_USER`/`OPENFN_ADMIN_PASSWORD`: Username/password auth
- `DRY_RUN`: Set to `true` for validation only
- `PACKAGE_LIFECYCLE`: Set to `true` to keep container alive after deployment

**Features:**
- **Health Check Server**: Runs on port 3000 for container health monitoring
- **OpenFN Readiness Check**: Waits for OpenFN to be available before deployment
- **Authentication Handling**: Supports both API key and username/password
- **Graceful Shutdown**: Handles SIGTERM/SIGINT properly
- **Error Handling**: Comprehensive error reporting and validation

## 🔄 Integration with Package Lifecycle

### OpenFN Package Integration

The OpenFN package (`packages/openfn/`) uses this workflow manager through:

1. **Environment Variables** (in `package-metadata.json`):
   ```json
   {
     "OPENFN_WORKFLOWS_IMAGE": "openfn-workflows:latest",
     "OPENFN_WORKFLOW_NAME": "sftp-dhis2",
     "OPENFN_LOAD_WORKFLOW_ON_STARTUP": "true"
   }
   ```

2. **Docker Compose Integration**:
   ```yaml
   # packages/openfn/importer/workflows/docker-compose.config.yml
   services:
     openfn_workflow_manager:
       image: ${OPENFN_WORKFLOWS_IMAGE:-openfn-workflows:latest}
       environment:
         OPENFN_ENDPOINT: ${OPENFN_ENDPOINT:-http://openfn:4000}
         WORKFLOW_NAME: ${OPENFN_WORKFLOW_NAME:-sftp-dhis2}
         MODE: deploy
         PACKAGE_LIFECYCLE: "true"
         # Additional SFTP and DHIS2 configuration variables
   ```

3. **Build Integration**:
   - Included in global `build-custom-images.sh`
   - Built automatically when running `./build-custom-images.sh openfn-workflows`

4. **Consolidated Configuration**:
   - All workflow configuration consolidated into single `docker-compose.config.yml`
   - No external file mounting - workflows baked into Docker image
   - Environment variable-driven configuration
   - Supports both OpenFN package lifecycle and standalone usage

### Deployment Flow

1. **Build Phase**: `build-custom-images.sh` builds the workflow manager image
2. **Package Start**: OpenFN package starts via `swarm.sh`
3. **Workflow Deployment**: Workflow manager container deploys specified workflow
4. **Health Monitoring**: Container provides health endpoint and stays alive
5. **Graceful Shutdown**: Container handles shutdown signals properly

## 📋 Available Workflows

### sftp-dhis2
**SFTP-focused workflow with cron and webhook triggers for processing Excel files and uploading to DHIS2.**

**Features:**
- **Periodic File Checking**: Cron-based monitoring every 15 minutes
- **Real-time Processing**: Webhook triggers for immediate file processing
- **Excel Processing**: Robust Excel file parsing with validation
- **DHIS2 Integration**: Automatic payload generation and upload
- **File Tracking**: Prevents reprocessing of already-handled files
- **Error Handling**: Comprehensive error reporting and recovery

**Jobs:**
1. **`check-sftp-files.js`**: Monitors SFTP directory for new/updated files
2. **`download-sftp-files.js`**: Downloads files from SFTP server
3. **`process-excel-data.js`**: Parses and validates Excel data
4. **`generate-dhis2-payload.js`**: Creates DHIS2-compatible data structures
5. **`upload-to-dhis2.js`**: Uploads data to DHIS2 instance
6. **`update-file-tracking.js`**: Updates file processing state

**Triggers:**
- **`cron-file-check`**: Runs every 15 minutes (`*/15 * * * *`)
- **`file-change-webhook`**: For external file system notifications
- **`manual-trigger`**: For testing and manual execution

**Workflow Flow:**
```
Cron Trigger → Check SFTP Files → Download Files → Process Excel → Generate DHIS2 Payload → Upload to DHIS2 → Update Tracking
                     ↑                                                                                              ↓
Webhook Trigger → Download Files ←─────────────────────────────────────────────────────────────────────────────────┘
```

**Configuration:**
- SFTP directory: `/uploads/hiv-indicators/`
- Supported formats: `.xlsx`, `.xls`
- File types: HIV Indicators, Direct Queries, DQ Sites
- DHIS2 data elements: Configurable via mappings

### google-sheets-dhis2 (Future)
Google Sheets integration workflow for legacy support and alternative data sources.

### hybrid-workflow (Future)
Combined workflow supporting both SFTP and Google Sheets sources with intelligent routing.

## 🛠️ Development

### Adding New Workflows

1. **Create Workflow Directory**:
   ```bash
   mkdir workflows/my-new-workflow
   cd workflows/my-new-workflow
   ```

2. **Create Project Configuration**:
   ```yaml
   # project.yaml
   name: my-workflow
   description: Description of my workflow
   workflows:
     My-Workflow:
       name: My Workflow
       jobs:
         # Define your jobs here
       triggers:
         # Define your triggers here
       edges:
         # Define job flow here
   ```

3. **Create Job Files**:
   ```bash
   mkdir jobs
   # Add your .js job files in the jobs/ directory
   ```

4. **Use Shared Utilities**:
   ```javascript
   // In your job files
   import { validateExcelData } from '../../../shared/utils/excel-validator.js';
   import { generateDataValueSets } from '../../../shared/utils/dhis2-helpers.js';
   ```

5. **Test and Validate**:
   ```bash
   ./scripts/validate-workflow.sh my-new-workflow
   ```

### Development Workflow

```bash
# 1. Make changes to workflows
vim workflows/sftp-dhis2/jobs/my-job.js

# 2. Validate changes
./scripts/validate-workflow.sh sftp-dhis2

# 3. Test with volume mount (development mode)
docker run --rm \
  -v $(pwd)/workflows:/app/workflows \
  -e OPENFN_ENDPOINT="http://localhost:4000" \
  -e WORKFLOW_NAME="sftp-dhis2" \
  -e MODE="deploy" \
  -e DRY_RUN="true" \
  openfn-workflows:latest

# 4. Build new image when ready
./build.sh

# 5. Deploy to test environment
./scripts/deploy-workflow.sh sftp-dhis2 http://test-openfn:4000
```

### Shared Components

**Excel Validator (`shared/utils/excel-validator.js`)**:
- Validation schemas for different data types
- Data sanitization functions
- Column validation utilities

**DHIS2 Helpers (`shared/utils/dhis2-helpers.js`)**:
- Data value set generation
- Validation functions
- Common mappings (periods, org units)

**Usage in Jobs**:
```javascript
import { validateExcelData, sanitizeValue } from '../../../shared/utils/excel-validator.js';
import { generateDataValueSets, validateDataValueSet } from '../../../shared/utils/dhis2-helpers.js';

// Validate parsed Excel data
const validation = validateExcelData(excelData, 'hiv_indicators');

// Generate DHIS2 payload
const dataValueSet = generateDataValueSets(indicators, orgUnit, period);
```

## 🔧 Environment Variables Reference

### Required Variables
- **`OPENFN_ENDPOINT`**: OpenFN instance URL (e.g., `http://openfn:4000`)
- **`WORKFLOW_NAME`**: Name of workflow to deploy (for deploy mode)

### Authentication (Choose One)
- **`OPENFN_API_KEY`**: API key for authentication
- **`OPENFN_ADMIN_USER`** + **`OPENFN_ADMIN_PASSWORD`**: Username/password authentication

### Optional Variables
- **`MODE`**: Operation mode (`list`, `validate`, `deploy`) - default: `deploy`
- **`WORKFLOW_PATH`**: Custom path to workflows - default: `/app/workflows`
- **`DRY_RUN`**: Set to `true` for validation only - default: `false`
- **`PACKAGE_LIFECYCLE`**: Set to `true` to keep container alive after deployment

### Package Lifecycle Variables
- **`OPENFN_WORKFLOWS_IMAGE`**: Docker image name - default: `openfn-workflows:latest`
- **`OPENFN_LOAD_WORKFLOW_ON_STARTUP`**: Whether to deploy workflows on startup

## 🧹 Cleanup and Migration

This project consolidates and replaces several older implementations:

### Replaced/Deprecated
- **`projects/openfn-sftp-workflow/`**: Migrated to `workflows/sftp-dhis2/`
- **`projects/openfn-workflow/`**: Functionality absorbed into this project
- **`packages/openfn/Dockerfile.workflow-manager`**: Replaced by `docker/Dockerfile`
- **`packages/openfn/deploy-workflows.sh`**: Replaced by `scripts/deploy-workflow.sh`

### Integration Points
1. **Global Build**: Included in `build-custom-images.sh`
2. **Package Integration**: Referenced in `packages/openfn/package-metadata.json`
3. **Environment Config**: Uses main pipeline's environment system
4. **Volume Mounting**: Supports development workflows with local mounts

## 📚 Troubleshooting

### Common Issues

**Workflow deployment fails**:
```bash
# Check if OpenFN is ready
curl -f http://localhost:4000/health

# Validate workflow first
./scripts/validate-workflow.sh sftp-dhis2

# Check logs
docker logs <container-id>
```

**Authentication errors**:
```bash
# Test with API key
./scripts/deploy-workflow.sh sftp-dhis2 --api-key your-key

# Test with username/password
./scripts/deploy-workflow.sh sftp-dhis2 --user admin --password secret
```

**File not found errors**:
```bash
# List available workflows
./scripts/list-workflows.sh

# Check workflow structure
ls -la workflows/sftp-dhis2/
```

### Debug Mode

```bash
# Dry run for testing
./scripts/deploy-workflow.sh sftp-dhis2 --dry-run

# Volume mount for development
docker run --rm \
  -v $(pwd)/workflows:/app/workflows \
  -e MODE="validate" \
  openfn-workflows:latest
```

## 🤝 Contributing

1. **Follow the workflow structure**: Use the established pattern for new workflows
2. **Use shared utilities**: Leverage `shared/utils/` for common functionality
3. **Validate before committing**: Run validation scripts
4. **Update documentation**: Keep this README current with changes
5. **Test both modes**: Verify package lifecycle and standalone operation

---

This OpenFN Workflows Manager provides a scalable, maintainable solution for managing complex OpenFN deployments while supporting both automated package lifecycle integration and flexible standalone usage.
