# Implementation Checklist

**Project**: Malawi DHIS2 HIV/TB Indicators Pipeline  
**Date**: November 24, 2025  
**Purpose**: Step-by-step checklist to fix critical issues and verify implementation

---

## 🔴 CRITICAL: Fix Before Any Work

### ✅ Task 1: Initialize Git Submodules

**Problem**: Required OpenFN adaptors and Lightning source code are missing

**Steps**:
```bash
cd /workspace

# Initialize and clone submodules
git submodule update --init --recursive

# Verify submodules are populated
ls -la projects/lightning/
ls -la projects/openfn-custom-adaptors/

# Check submodule status
git submodule status
```

**Expected Output**:
```
✅ projects/lightning/ should contain source files
✅ projects/openfn-custom-adaptors/ should contain adaptor packages
✅ git submodule status should show commits (no '-' prefix)
```

**Time**: 2-5 minutes (depending on network speed)

---

## 🟢 VERIFICATION: Test Build Process

### ✅ Task 2: Build Custom Docker Images

**Purpose**: Verify all custom images build successfully

**Steps**:
```bash
cd /workspace

# Build all custom images
./build-custom-images.sh all

# Expected images:
# - openfn-custom:latest
# - openfn-cli-test:latest
# - openfn-workflows:local
# - sftp-with-data:latest
```

**Verification**:
```bash
# Check images exist
docker images | grep -E "(openfn-custom|openfn-cli-test|openfn-workflows|sftp-with-data)"

# Expected output: 4 images listed
```

**Time**: 5-10 minutes

**Troubleshooting**:
- If build fails with "directory not found" → Submodules not initialized
- If build fails with npm errors → Check internet connection
- If disk space errors → Run `docker system prune -a`

---

### ✅ Task 3: Build Main Platform Image

**Purpose**: Build the instant OpenHIE platform image

**Steps**:
```bash
./build-image.sh
```

**Verification**:
```bash
docker images | grep malawi-dhis2-indicators
# Expected: malawi-dhis2-indicators:latest
```

**Time**: 3-5 minutes

---

## 🔧 DEPLOYMENT: Initialize Services

### ✅ Task 4: Configure Environment

**Purpose**: Set up environment variables

**Steps**:
```bash
# Copy environment template
cp .env.example .env

# Edit configuration (optional for testing)
nano .env

# Minimum required (defaults should work):
# - SFTP_USER=openfn
# - SFTP_PASSWORD=instant101
# - DHIS2_ADMIN_PASSWORD=district
# - OPENFN_ADMIN_PASSWORD=instant101secure
```

**Verification**:
```bash
# Check .env file exists
ls -la .env

# Verify key variables are set
grep -E "SFTP_USER|DHIS2_ADMIN_PASSWORD|OPENFN_ADMIN_PASSWORD" .env
```

**Time**: 2 minutes

---

### ✅ Task 5: Initialize Docker Swarm

**Purpose**: Enable Docker Swarm mode (required by instant)

**Steps**:
```bash
# Check if already initialized
docker info | grep "Swarm: active"

# If not active, initialize
docker swarm init

# If multiple network interfaces:
# docker swarm init --advertise-addr <your-ip>
```

**Verification**:
```bash
docker info | grep "Swarm: active"
# Expected: "Swarm: active"
```

**Time**: 30 seconds

---

### ✅ Task 6: Deploy All Services

**Purpose**: Deploy complete platform using instant CLI

**Option A: Automated (Recommended)**
```bash
# Complete initialization and deployment
./mk.sh

# This script:
# 1. Validates environment
# 2. Initializes instant project
# 3. Deploys all packages
# 4. Creates Docker secrets
# 5. Waits for services
# 6. Loads workflows
```

**Option B: Manual**
```bash
# 1. Initialize instant project
./instant project init --env-file .env

# 2. Deploy packages in order
./instant package init -n database-postgres -d
./instant package init -n reverse-proxy-nginx -d
./instant package init -n dhis2-instance -d
./instant package init -n sftp-storage -d
./instant package init -n openfn -d
```

**Verification**:
```bash
# Check all services are running
docker service ls

# Expected output (all showing 1/1):
# database-postgres_postgres-1
# reverse-proxy-nginx_nginx
# dhis2-instance_dhis2
# sftp-storage_sftp-server
# openfn_openfn
# openfn_worker
# openfn-workflows_workflow-loader
```

**Time**: 10-15 minutes (services need time to initialize)

**Common Issues**:
- DHIS2 takes 2-5 minutes to start fully
- PostgreSQL must be ready before other services
- Check logs: `docker service logs <service-name>`

---

## 🧪 TESTING: Verify Functionality

### ✅ Task 7: Service Health Checks

**Purpose**: Verify all services are accessible

**Steps**:
```bash
# Wait for services to be ready
sleep 120  # 2 minutes

# Check OpenFN
curl -f http://localhost:4000/health || echo "OpenFN not ready"

# Check DHIS2 (may take longer)
curl -f http://localhost:8080/api/system/info -u admin:district || echo "DHIS2 not ready"

# Check SFTP
nc -zv localhost 2225 || echo "SFTP not accessible"
```

**Manual Verification**:
1. **OpenFN**: http://localhost:4000
   - Login: root@openhim.org / instant101secure
   - Should see projects and workflows

2. **DHIS2**: http://localhost:8080
   - Login: admin / district
   - Should see dashboard

3. **SFTP**: Use SFTP client
   - Host: localhost:2225
   - User: openfn / instant101
   - Should see `/data/excel-files/` directory

**Time**: 5 minutes

---

### ✅ Task 8: Run Test Suite

**Purpose**: Validate workflows and integrations

**Steps**:
```bash
cd /workspace/projects/indicator_workflow_testing

# Quick validation (2 minutes)
./run-tests.sh --cli-workflow

# Full test suite (5 minutes)
./run-tests.sh
```

**Expected Results**:
```
✅ CLI SFTP Basic tests passed
✅ CLI Simple Job tests passed
✅ CLI SFTP Workflow tests passed
✅ API connectivity tests passed
✅ Excel parsing tests passed
✅ Integration tests passed
```

**Time**: 2-5 minutes

**Troubleshooting**:
- If SFTP tests fail: Check SFTP service is running
- If "Invalid username" error: Rebuild images (submodule issue)
- If Excel tests fail: Check test files exist in SFTP
- Enable verbose: `./run-tests.sh --cli-workflow --verbose`

---

### ✅ Task 9: Verify Workflows Loaded

**Purpose**: Confirm workflows are deployed in OpenFN

**Steps**:
```bash
# Check workflow loader logs
docker service logs openfn-workflows_workflow-loader

# Look for: "Workflow deployed successfully"
```

**Manual Verification**:
1. Go to http://localhost:4000
2. Navigate to Projects
3. Should see: "upload-indicator-files-to-dhis2"
4. Click on project → Should see 5 jobs

**Expected Jobs**:
1. ScanSftpForChanges
2. CheckForTargetFile
3. ParseExcelMetadata
4. CheckAndSetupMetadata
5. ProcessAllChunksSequentially

**Time**: 2 minutes

---

### ✅ Task 10: Test SFTP File Processing

**Purpose**: End-to-end test with actual file

**Steps**:
```bash
# 1. Check SFTP has sample files
docker exec $(docker ps -q -f name=sftp-server) ls -la /data/excel-files/

# Expected files:
# - ART_data_long_format.xlsx
# - Direct Queries - Q1 2025 MoH Reports.xlsx
# - Q2FY25_DQ_253_sites.xlsx
# - PEPFAR_TxCURR_*.csv (if present)

# 2. Upload a test CSV file (optional)
cat > /tmp/test_pepfar.csv << 'EOF'
site_id,facility,indicator,sex,age_group,Date_Submitted,tx_curr
1,Test Facility,TX_CURR,Male,15-19,2024-03-01,100
EOF

# Upload via SFTP
sftp -P 2225 openfn@localhost:/data << EOF
put /tmp/test_pepfar.csv
quit
EOF

# 3. Trigger workflow manually (or wait for cron)
# Go to OpenFN UI → Workflows → Run workflow

# 4. Check workflow run in OpenFN UI
# Go to Activity → Should see recent run
```

**Time**: 5 minutes

---

## 📊 VERIFICATION CHECKLIST

After completing all tasks, verify:

### System Status
- [ ] Git submodules initialized and populated
- [ ] All Docker images built successfully
- [ ] Docker Swarm mode active
- [ ] All services running (docker service ls shows 1/1)

### Service Access
- [ ] OpenFN UI accessible at http://localhost:4000
- [ ] DHIS2 accessible at http://localhost:8080
- [ ] SFTP accessible at localhost:2225
- [ ] Can login to all services with credentials

### Workflow Status
- [ ] Workflows visible in OpenFN UI
- [ ] All 5 jobs present in project
- [ ] Workflow loader logs show success
- [ ] Test workflow run completes

### Testing
- [ ] CLI workflow tests pass
- [ ] API connectivity tests pass
- [ ] Excel parsing tests pass
- [ ] Integration tests pass
- [ ] Can manually trigger workflow

### File Processing
- [ ] SFTP contains sample Excel files
- [ ] Can upload files via SFTP
- [ ] Workflow detects new files
- [ ] Data processes successfully

---

## 🐛 TROUBLESHOOTING GUIDE

### Issue: Submodules Still Empty After Init

**Symptoms**: `ls projects/lightning/` shows empty directory

**Solution**:
```bash
# Force update
git submodule update --init --recursive --force

# Or manually clone
cd projects
git clone https://github.com/OpenFn/lightning.git
git clone https://github.com/OpenFn/adaptors.git openfn-custom-adaptors
cd ..
```

---

### Issue: Docker Build Fails

**Symptoms**: `./build-custom-images.sh` errors

**Solution**:
```bash
# Check Docker is running
docker info

# Free up disk space
docker system prune -a

# Retry with verbose output
docker build --no-cache -t openfn-custom:latest projects/openfn/

# Check submodules are present
ls -la projects/lightning/
ls -la projects/openfn-custom-adaptors/
```

---

### Issue: Services Won't Start

**Symptoms**: `docker service ls` shows 0/1 replicas

**Solution**:
```bash
# Check service logs
docker service logs <service-name> --tail 50

# Common fixes:
# - Wait longer (DHIS2 takes 3-5 minutes)
# - Check port conflicts: lsof -i :4000
# - Verify .env file has correct values
# - Restart service: docker service update --force <service-name>
```

---

### Issue: Tests Fail with "Invalid Username"

**Symptoms**: SFTP tests show authentication errors

**Solution**:
```bash
# This means SFTP adaptor not properly built
# Rebuild with proper npm install:
./build-custom-images.sh openfn-cli-test

# Verify adaptor in image:
docker run --rm openfn-cli-test:latest ls -la /adaptors/node_modules/@openfn/language-sftp
```

---

### Issue: Workflows Not Loading

**Symptoms**: OpenFN UI shows no workflows

**Solution**:
```bash
# Check loader logs
docker service logs openfn-workflows_workflow-loader

# Force reload
docker service update --force openfn-workflows_workflow-loader

# Manual deployment
cd projects/openfn-workflows
./scripts/deploy-workflow.sh upload-indicator-files-to-dhis2
```

---

### Issue: DHIS2 Not Accessible

**Symptoms**: http://localhost:8080 doesn't respond

**Solution**:
```bash
# Check DHIS2 logs
docker service logs dhis2-instance_dhis2 --tail 100

# Wait for startup message
docker service logs dhis2-instance_dhis2 | grep "Server startup"

# Increase memory if needed
docker service update --limit-memory 4G dhis2-instance_dhis2

# Check database connection
docker service logs database-postgres_postgres-1
```

---

## 📈 SUCCESS CRITERIA

You've successfully completed implementation when:

✅ **All services running**
- Docker service ls shows all services at 1/1 replicas
- All services accessible via browser/SFTP

✅ **Tests passing**
- CLI workflow tests: PASS
- Integration tests: PASS
- Can manually run workflow in UI

✅ **End-to-end working**
- Can upload file via SFTP
- Workflow detects and processes file
- Data visible in DHIS2

✅ **Documentation verified**
- Can follow setup guide successfully
- All referenced files exist
- Commands work as documented

---

## 🎯 NEXT STEPS AFTER IMPLEMENTATION

### Immediate
1. Review workflow configuration in OpenFN UI
2. Test with actual data files
3. Monitor first production run

### Short-term
1. Set up monitoring and alerting
2. Document backup procedures
3. Create operator runbook

### Long-term
1. Configure high availability
2. Set up external database
3. Implement disaster recovery

---

## 📞 SUPPORT

If you encounter issues not covered here:

1. Check logs: `docker service logs <service-name>`
2. Review documentation: `docs/environment-setup.md`
3. Check troubleshooting guide: `projects/openfn-workflows/docs/06-troubleshooting.md`
4. Review testing guide: `projects/indicator_workflow_testing/TESTING-INDEX.md`

---

**Status Tracking**:
- [ ] Critical Issues Fixed
- [ ] Build Process Verified
- [ ] Services Deployed
- [ ] Tests Passing
- [ ] End-to-End Working

**Completion Date**: _________________

**Completed By**: _________________

---

**Next Document**: See `PROJECT_ANALYSIS_REPORT.md` for detailed analysis
