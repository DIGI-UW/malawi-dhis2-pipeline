# Troubleshooting Guide

## Overview

This guide covers common issues encountered when developing and testing OpenFN workflows, with proven solutions based on our experience with the Malawi DHIS2 pipeline.

## Common Issues

### 1. "Invalid username" Error

**Symptom**: SFTP adaptor fails with "Invalid username" despite correct credentials

**Root Cause**: Broken pnpm symlinks in Docker images causing module loading failure

**Solution**:
```bash
# Rebuild custom images with npm instead of pnpm
./build-custom-images.sh openfn-cli-test openfn

# Verify image is using custom version
docker images | grep openfn
# Should show: openfn-cli-test:latest
```

**Prevention**: Always use custom Docker images for testing and deployment

### 2. "TypeError: fn is not a function"

**Symptom**: Complex nested functions fail with type errors

**Root Cause**: OpenFN runtime doesn't support certain JavaScript syntax patterns

**Bad Pattern**:
```javascript
list('/path', (state) => {
  return fn((state) => {
    // Nested function calls
  })(state);
});
```

**Good Pattern**:
```javascript
list('/path', state => {
  console.log('Files:', state.data);
  return state;
});
```

**Solution**: Use simple, flat function structures

### 3. Connection Refused to SFTP

**Symptom**: Cannot connect to SFTP server

**Diagnosis**:
```bash
# Check if service is running
docker service ls | grep sftp

# Test connectivity
nc -zv 172.17.0.1 2225
```

**Solutions**:

1. **Wrong Host IP**:
   - Linux: Use `172.17.0.1`
   - Mac/Windows: Use `host.docker.internal`

2. **Service Not Running**:
   ```bash
   ./instant package init -n sftp-storage -d
   ```

3. **Firewall Blocking**:
   ```bash
   sudo ufw allow 2225/tcp
   ```

### 4. Excel Files Not Found

**Symptom**: SFTP list returns empty or files not visible

**Check File Location**:
```bash
docker exec $(docker ps -q -f name=sftp-server) ls -la /data/excel-files/
```

**Common Issues**:

1. **Wrong Path**: Files must be in `/data/excel-files/`
2. **Permissions**: Files must be readable by `openfn` user
3. **File Names**: Special characters may cause issues

**Fix Permissions**:
```bash
docker exec $(docker ps -q -f name=sftp-server) \
  chown -R openfn:openfn /data/excel-files/
```

### 5. State Not Passing Between Jobs

**Symptom**: Second job doesn't receive data from first job

**Common Mistakes**:

1. **Clearing Configuration**:
   ```javascript
   // Bad - removes credentials
   return { data: results, configuration: {} };
   
   // Good - preserves credentials
   return { ...state, data: results };
   ```

2. **Not Returning State**:
   ```javascript
   // Bad - no return
   fn(state => {
     console.log('Done');
   });
   
   // Good - returns state
   fn(state => {
     console.log('Done');
     return state;
   });
   ```

### 6. Workflow Not Triggering

**Symptom**: Cron or webhook doesn't start workflow

**Debugging Steps**:

1. **Check Workflow Deployment**:
   ```bash
   curl http://localhost:4000/api/workflows | jq
   ```

2. **Verify Cron Expression**:
   ```yaml
   cron_expression: "*/5 * * * *"  # Every 5 minutes
   ```

3. **Test Webhook Manually**:
   ```bash
   curl -X POST http://localhost:4000/webhooks/sftp-file-change \
     -H "Content-Type: application/json" \
     -d '{"event": "test"}'
   ```

4. **Check Logs**:
   ```bash
   docker service logs openfn_openfn | grep -i trigger
   ```

### 7. DHIS2 Upload Failures

**Symptom**: Data doesn't appear in DHIS2

**Common Issues**:

1. **Invalid Metadata UIDs**:
   ```bash
   # Verify data element exists
   curl -u admin:district \
     http://localhost:8080/api/dataElements/de1a2b3c4d5e
   ```

2. **Wrong Period Format**:
   ```javascript
   // Bad: "2024-01"
   // Good: "202401"
   ```

3. **Missing Required Fields**:
   ```javascript
   // Required fields for dataValueSets
   {
     dataElement: "uid",
     period: "202401",
     orgUnit: "uid",
     value: "123"
   }
   ```

### 8. Memory/Performance Issues

**Symptom**: Workflow crashes or runs slowly with large files

**Solutions**:

1. **Process in Batches**:
   ```javascript
   fn(state => {
     const BATCH_SIZE = 1000;
     const batches = [];
     
     for (let i = 0; i < state.data.length; i += BATCH_SIZE) {
       batches.push(state.data.slice(i, i + BATCH_SIZE));
     }
     
     return { ...state, batches };
   });
   ```

2. **Increase Container Resources**:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G
   ```

3. **Stream Large Files**:
   ```javascript
   // Use streaming for files > 10MB
   getAsStream('/large-file.xlsx', '/tmp/download.xlsx');
   ```

## Debugging Techniques

### 1. Enable Verbose Logging

```javascript
fn(state => {
  console.log('=== STATE DEBUG ===');
  console.log(JSON.stringify(state, null, 2));
  console.log('==================');
  return state;
});
```

### 2. Test Jobs in Isolation

```bash
# Create minimal test case
cat > test-job.js << 'EOF'
fn(state => {
  console.log('Test successful');
  return { ...state, test: true };
});
EOF

# Run with CLI
docker run --rm -it openfn-cli-test:latest \
  openfn test-job.js -a common@latest -s minimal-state.json
```

### 3. Use Step Caching

```bash
# Cache intermediate results
openfn workflow.json --cache-steps

# Check cached results
ls -la .cli-cache/workflow-name/
```

### 4. Monitor Resource Usage

```bash
# Watch container stats
docker stats $(docker ps -q -f name=openfn)

# Check logs for memory errors
docker service logs openfn_openfn | grep -i "memory\|heap"
```

## Quick Fixes

### Reset Everything

```bash
#!/bin/bash
# reset-environment.sh

# Stop all services
docker service rm $(docker service ls -q)

# Remove volumes (WARNING: deletes data)
docker volume prune -f

# Rebuild images
./build-custom-images.sh openfn-cli-test openfn

# Restart services
./instant package init -n sftp-storage -d
./instant package init -n dhis2-instance -d
./instant package init -n openfn -d
```

### Test Connectivity Script

```bash
#!/bin/bash
# test-connectivity.sh

echo "Testing service connectivity..."

# SFTP
if timeout 5 bash -c "</dev/tcp/172.17.0.1/2225"; then
  echo "✅ SFTP: Connected"
else
  echo "❌ SFTP: Failed"
fi

# DHIS2
if curl -sf -u admin:district http://localhost:8080/api/system/info >/dev/null; then
  echo "✅ DHIS2: Connected"
else
  echo "❌ DHIS2: Failed"
fi

# OpenFN
if curl -sf http://localhost:4000/health_check >/dev/null; then
  echo "✅ OpenFN: Connected"
else
  echo "❌ OpenFN: Failed"
fi
```

## Getting Help

### 1. Check Logs

Always start with logs:
```bash
# Service logs
docker service logs --tail 100 sftp-storage_sftp-server
docker service logs --tail 100 openfn_openfn

# Container logs
docker logs $(docker ps -q -f name=sftp-server)
```

### 2. Validate Configuration

```bash
# Check workflow syntax
cd projects/openfn-workflows
./scripts/validate-workflow.sh sftp-dhis2

# Validate JSON configs
jq . configs/file-types/*.json
```

### 3. Test with Known Working Examples

Use the proven test scripts:
```bash
cd projects/indicator_workflow_testing
./tests/cli/test-sftp-working-command.sh
```

### 4. Community Resources

- [OpenFN Community Forum](https://community.openfn.org/)
- [OpenFN Documentation](https://docs.openfn.org/)
- [DHIS2 Community](https://community.dhis2.org/)

## Prevention Strategies

1. **Always use custom Docker images**
2. **Test incrementally - don't skip steps**
3. **Keep jobs simple and focused**
4. **Use proven patterns from working tests**
5. **Monitor logs during development**
6. **Document issues and solutions**

## Known Working Configurations

### SFTP Connection
```json
{
  "host": "172.17.0.1",
  "port": 2225,
  "username": "openfn",
  "password": "instant101"
}
```

### OpenFN CLI Command
```bash
docker run --rm -it \
  -v "$(pwd):/workspace" \
  openfn-cli-test:latest \
  openfn /workspace/job.js \
    -a sftp@2.0.14 \
    -s /workspace/state.json \
    -o output.json
```

### Working Job Pattern
```javascript
list('/data/excel-files', state => {
  console.log(`Found ${state.data.length} files`);
  return state;
});
```

## Appendix: SFTP Adaptor Docker Fix Discovery

### The Journey to Fix "Invalid username" Error

This section documents the investigation and resolution of a critical Docker bundling issue affecting the OpenFN SFTP adaptor. **Important: No changes were made to the SFTP adaptor itself - the issue was purely with how it was bundled in Docker images.**

#### Problem
- OpenFN SFTP adaptor failed in Docker with "Invalid username" errors
- Credentials were correct and manual SFTP connections worked
- Affected all Docker users of `@openfn/language-sftp`
- **The adaptor code itself was never broken**

#### Root Cause Discovery
Through extensive debugging, we discovered:

1. **The error message was misleading** - "Invalid username" actually meant module loading failure
2. **Broken pnpm symlinks** in Docker multi-stage builds prevented dependencies from loading
3. **The official package was never broken** - `@openfn/language-sftp@2.0.14` works perfectly when installed correctly
4. **The issue was purely in the Docker bundling process** - pnpm symlinks don't survive Docker layer copying

#### Evidence Gathering
```bash
# Manual SFTP connection worked
sftp -P 2225 openfn@172.17.0.1
# Connected successfully

# Direct ssh2-sftp-client usage worked
node test-ssh2-client.js
# Connected successfully

# OpenFN adaptor failed (when bundled with broken symlinks)
openfn job.js -a sftp@2.0.14
# Error: Invalid username
```

#### The Fix (Docker Bundling Only)
The solution was to change how the adaptor is installed in Docker images:

```dockerfile
# ❌ BROKEN: Copying pnpm symlinks from build stage
COPY --from=adaptor-builder /build/packages/sftp/ ./

# ✅ WORKING: Proper npm install in final image
RUN npm install @openfn/language-sftp@2.0.14
```

**No changes were made to the SFTP adaptor code** - we simply fixed how it's installed in Docker containers.

#### Test Results After Docker Fix
```bash
[CLI] ✔ Installed @openfn/language-sftp@2.0.14  # Official, unmodified package
Connected
[R/T] ✔ job-1 completed in 891ms
Files Found:
• Direct Queries - Q1 2025 MoH Reports.xlsx (4.2MB)
• Q2FY25_DQ_253_sites.xlsx (3.2MB)
• ART_data_long_format.xlsx (30.2MB)
```

#### Key Learnings
1. **Always question error messages** - they may be symptoms, not causes
2. **Docker build processes need special attention** with modern package managers using symlinks
3. **Test in isolation** to identify the exact failure point
4. **The adaptor code was perfect** - the issue was purely with Docker bundling
5. **The community benefits** from documenting build process fixes

This Docker bundling fix is now incorporated into our custom Docker images (`openfn-cli-test:latest` and `openfn-custom:latest`), allowing the official SFTP adaptor to work correctly in containerized environments. 