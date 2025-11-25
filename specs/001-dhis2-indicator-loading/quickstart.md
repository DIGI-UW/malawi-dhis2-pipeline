# Quick Start Guide: DHIS2 Indicator Loading Pipeline

**Purpose**: Enable local team to deploy and test the pipeline on a new DHIS2 instance
**Audience**: System administrators deploying to government DHIS2 instance

## Prerequisites

Before starting, ensure you have:
- [ ] Docker 20.10+ with Swarm mode enabled
- [ ] Git with submodule support
- [ ] 8GB RAM minimum, 20GB disk space
- [ ] Ubuntu 20.04+ or similar Linux
- [ ] Admin access to target DHIS2 instance
- [ ] DHIS2 service account credentials with data import permissions

## Step 1: Clone and Initialize

```bash
# Clone repository
git clone https://github.com/DIGI-UW/malawi-dhis2-pipeline.git
cd malawi-dhis2-pipeline

# Initialize submodules (CRITICAL!)
git submodule update --init --recursive

# Copy environment template
cp .env.example .env
```

## Step 2: Configure Environment

Edit `.env` with your settings:

```bash
# DHIS2 Target Configuration (CRITICAL FOR PRODUCTION)
DHIS2_URL=https://your-dhis2-instance.gov.mw
DHIS2_ADMIN_USER=admin
DHIS2_ADMIN_PASSWORD=your-admin-password

# Integration User (for data uploads)
DHIS2_INTEGRATION_USER=openfn_integration
DHIS2_INTEGRATION_PASSWORD=secure-password-here

# SFTP Configuration
SFTP_USER=openfn
SFTP_PASSWORD=secure-sftp-password

# OpenFN Admin
OPENFN_ADMIN_EMAIL=root@openhim.org
OPENFN_ADMIN_PASSWORD=your-openfn-password
```

## Step 3: Build and Deploy

```bash
# Install instant CLI
./get-cli.sh linux

# Build custom Docker images
./build-custom-images.sh all

# Deploy all services
./mk.sh
```

Wait 5-10 minutes for all services to initialize.

## Step 4: Configure Credentials in OpenFN

**This is the critical step for production deployment.**

1. **Access OpenFN UI**: http://localhost:4000 (or your server IP)
2. **Login**: Use OPENFN_ADMIN_EMAIL and OPENFN_ADMIN_PASSWORD from .env
3. **Navigate to**: Projects → upload-indicator-files-to-dhis2 → Credentials

### Configure dhis2-credential (for metadata operations)

| Field | Value |
|-------|-------|
| Name | dhis2-credential |
| Username | Your DHIS2 admin username |
| Password | Your DHIS2 admin password |
| Host URL | `https://your-dhis2-instance.gov.mw` |

### Configure combined-sftp-dhis2-credential (for data uploads)

| Field | Value |
|-------|-------|
| Name | combined-sftp-dhis2-credential |
| SFTP Host | Your SFTP server IP |
| SFTP Port | 2225 (or your SFTP port) |
| SFTP Username | openfn |
| SFTP Password | Your SFTP password |
| DHIS2 Host URL | `https://your-dhis2-instance.gov.mw` |
| DHIS2 Username | openfn_integration |
| DHIS2 Password | Integration user password |

## Step 5: Verify DHIS2 Integration User

Ensure the integration user exists in DHIS2 with proper permissions:

1. **Login to DHIS2** as admin
2. **Navigate to**: Users → User Management
3. **Find or Create**: User named `openfn_integration`
4. **Assign Roles**:
   - Data Entry (minimum)
   - Or: ALL authority for full auto-create capabilities
5. **Assign Organization Units**:
   - Check all org units the pipeline should import to
   - At minimum: Malawi root org unit and all health facilities

## Step 6: Test the Pipeline

### Option A: Manual Trigger via OpenFN UI

1. Go to OpenFN UI → Projects → upload-indicator-files-to-dhis2
2. Find the workflow "Upload Indicator Files to DHIS2 Workflow"
3. Click "Run" to manually trigger
4. Watch the Activity tab for progress

### Option B: Upload Test File

1. Upload a sample file to SFTP:
   ```bash
   sftp -P 2225 openfn@localhost
   # XLSX sample
   put projects/sftp/data/excel-files/ART_data_long_format.xlsx /data/
   # Or PEPFAR CSV sample
   put projects/sftp/data/samples/pepfar/PEPFAR_TxCURR_*.csv /data/
   ```
2. Wait for cron trigger (5 minutes) or manually trigger workflow
3. Check OpenFN Activity tab for results
4. Verify data in DHIS2 Data Entry or Analytics

**Available Sample Files**:
- XLSX: `projects/sftp/data/excel-files/` (ART Data, DQ Sites, Direct Queries)
- PEPFAR CSV: `projects/sftp/data/samples/pepfar/` (TX_CURR, TX_MMD, TX_ML, TX_NEW, TX_RTT)
- MOH CSV: `projects/sftp/data/samples/moh/` (Cohort, Regimen, Survival, TPT)

### Option C: Run Test Suite

```bash
cd projects/indicator_workflow_testing
./run-tests.sh --api          # Test API connectivity
./run-tests.sh --integration  # End-to-end tests
```

## Troubleshooting

### Credential Errors

**Symptom**: "Invalid credentials" or "401 Unauthorized" in OpenFN logs

**Fix**:
1. Verify DHIS2 URL is correct (no trailing slash)
2. Verify username/password in OpenFN credentials
3. Test credentials manually: `curl -u user:pass https://dhis2-url/api/me`

### Permission Errors

**Symptom**: "403 Forbidden" or "Access denied" errors

**Fix**:
1. Login to DHIS2 as admin
2. Check integration user has correct roles
3. Verify org unit assignments include all target facilities

### Metadata Errors

**Symptom**: "Data element not found" or "Organisation unit not found"

**Fix**:
1. Either pre-create metadata in DHIS2 OR
2. Ensure admin credential has CREATE permission for metadata
3. Check DHIS2 logs for specific error details

### File Not Processing

**Symptom**: Files uploaded but nothing happens

**Check**:
1. Is cron trigger enabled in project.yaml?
2. Does file name match a pattern in FILE_TYPE_CONFIGS?
3. Check OpenFN Activity tab for workflow runs

## Key Files Reference

| Purpose | Location |
|---------|----------|
| Workflow definition | `projects/openfn-workflows/workflows/upload-indicator-files-to-dhis2/project.yaml` |
| Job 0: SFTP scan + configs | `jobs/00-scan-sftp-for-changes.js` |
| Job 3: DHIS2 metadata | `jobs/03-check-and-setup-metadata.js` |
| Job 4: Data upload | `jobs/04-process-all-chunks-sequentially.js` |
| Sample XLSX files | `projects/sftp/data/excel-files/` |
| Sample PEPFAR CSV | `projects/sftp/data/samples/pepfar/` |
| Sample MOH CSV | `projects/sftp/data/samples/moh/` |
| Test runner | `projects/indicator_workflow_testing/run-tests.sh` |
| Documentation | `docs/` |

## Getting Help

1. **OpenFN Activity Logs**: Check run history for specific error messages
2. **Docker Service Logs**: `docker service logs openfn-workflows_workflow-loader`
3. **DHIS2 Logs**: Check DHIS2 container logs for API errors
4. **Documentation**: See `docs/` folder for detailed guides
5. **Repository**: https://github.com/DIGI-UW/malawi-dhis2-pipeline/issues
