# SFTP Test Workflow

A simple standalone workflow to test SFTP connectivity and file listing, designed to match the CLI test behavior.

## Purpose

This workflow demonstrates proper credential management by separating sensitive authentication data (username/password) from non-sensitive configuration (host/port). This matches real-world best practices where credentials are managed separately in the platform.

## Structure

- **`project.yaml`** - The workflow definition with initial state (non-sensitive config only)
- **`jobs/list-files.js`** - The SFTP list operation
- **`config.json`** - OpenFN deployment endpoint configuration

## Credential Management

### Platform Deployment
- **Credential Reference**: The workflow references `sftp-test-credential` in the job configuration
- **Credential Creation**: During deployment, the credential is created with username/password only
- **State Configuration**: Host, port, and other non-sensitive config remain in initial state

### CLI Testing
The CLI test uses separate files:
- **State file** (`sftp-test-state.json`): Contains non-sensitive configuration
- **Credential file** (`sftp-test-credential.json`): Contains only username and password

## Running the Workflow

### Manual Testing in OpenFN Platform

When running manually in the OpenFN UI, provide this input:

```json
{
  "data": [],
  "configuration": {
    "host": "172.17.0.1",
    "port": 2225,
    "remoteDir": "/data/excel-files"
  }
}
```

The job will merge these values with defaults. The sensitive credentials (username/password) are provided by the `sftp-test-credential` referenced in the job.

### Cron Trigger

For the first cron run, the input will be `{}`. The job initializes default configuration values, so it will work automatically.

### CLI Testing

Use separate state and credential files:
- **State**: `sftp-test-state.json` (non-sensitive config)
- **Credentials**: `sftp-test-credential.json` (username/password only)

## Deployment

The deployment is handled by the workflow loader container that's already built via `build-custom-images.sh`:

```bash
# Make sure you're in the project root
cd /home/ubuntu/code/malawi-dhis2-pipeline

# Deploy using the pre-built workflow loader container
docker run --rm -it \
  -v "$(pwd)/projects/openfn-workflows/workflows:/app/workflows" \
  -e OPENFN_ENDPOINT="http://localhost:4000" \
  -e OPENFN_API_KEY="your-api-key" \
  -e WORKFLOW_NAME="sftp-test" \
  -e MODE="deploy" \
  openfn-workflows:latest
```

The `entrypoint.sh` script in the container will:
1. Find the workflow at `/app/workflows/sftp-test`
2. Create the appropriate `config.json` with your endpoint and API key
3. Deploy it to OpenFN

## Testing

### Trigger via Webhook

```bash
# Trigger the manual webhook
curl -X POST http://localhost:4000/webhooks/sftp-test-workflow/manual \
  -H "Content-Type: application/json" \
  -d '{"trigger": "manual test"}'
```

### Expected Output

```
=== SFTP Connection Test ===
Connected to SFTP successfully!
Host: 172.17.0.1:2225
Remote Directory: /data/excel-files
Workflow: sftp-test

Files found: 3
========================
1. ART_data_long_format.xlsx
   Type: file
   Size: 30.20 MB (31664640 bytes)
   Modified: 2024-01-01T00:00:00Z

2. Direct Queries - Q1 2025 MoH Reports.xlsx
   Type: file
   Size: 4.20 MB (4404224 bytes)
   Modified: 2024-01-01T00:00:00Z

3. Q2FY25_DQ_253_sites.xlsx
   Type: file
   Size: 3.20 MB (3355648 bytes)
   Modified: 2024-01-01T00:00:00Z

Excel files found: 3
Excel files:
  - ART_data_long_format.xlsx
  - Direct Queries - Q1 2025 MoH Reports.xlsx
  - Q2FY25_DQ_253_sites.xlsx
```

## Notes

- This workflow demonstrates proper credential separation (username/password in credentials, host/port in state)
- The deployment script automatically creates the `sftp-test-credential` for testing
- The workflow is configured as a separate project (`sftp-test`) to avoid conflicts
- A cron trigger runs every 2 minutes and is enabled by default for testing
- The `config.json` file is optional since `entrypoint.sh` creates it automatically

## Comparison with CLI Test

| Feature | CLI Test | OpenFN Workflow |
|---------|----------|-----------------|
| Credentials | Separate `-c` file | Credential reference in job |
| Configuration | State JSON file | Initial state in project.yaml |
| Execution | One-time via Docker | Triggered via webhook/cron |
| Logging | Console output | OpenFN run history |
| State Management | File-based | Platform-managed |

## Troubleshooting

1. **Connection refused**: Ensure SFTP service is running and accessible
2. **Invalid credentials**: Check the host IP matches your Docker setup (172.17.0.1 for Linux)
3. **No files found**: Verify SFTP has Excel files in `/data/excel-files` 