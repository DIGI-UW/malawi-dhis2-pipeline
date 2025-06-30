# GitHub Actions CI Workflows

This directory contains GitHub Actions workflows for continuous integration testing of the Malawi DHIS2 HIV/TB Indicators Pipeline.

## Workflows

### 1. CI - Environment Setup (`ci-environment.yml`)

**Purpose**: Tests the complete instant OpenHIE environment setup and verifies all services are healthy.

**Triggers**:
- Push to `main` or `develop` branches (when infrastructure files change)
- Pull requests to `main` or `develop` branches
- Manual workflow dispatch

**What it tests**:
- ✅ Builds all custom Docker images
- ✅ Deploys PostgreSQL database
- ✅ Deploys SFTP storage with test Excel files
- ✅ Deploys DHIS2 instance
- ✅ Deploys OpenFN Lightning platform
- ✅ Verifies all services are healthy and responding

**Key features**:
- Runs in dev mode with exposed ports (no reverse proxy)
- Timeout of 30 minutes for full environment setup
- Comprehensive health checks for all services
- Collects logs on failure for debugging

### 2. CI - Workflow Tests (`ci-workflow-tests.yml`)

**Purpose**: Tests the OpenFN workflows using the CLI-based testing framework.

**Triggers**:
- Push to `main` or `develop` branches (when workflow files change)
- Pull requests to `main` or `develop` branches
- Manual workflow dispatch
- Automatically after successful environment setup (optional)

**What it tests**:
- ✅ Builds the CLI test Docker image
- ✅ Runs 3 CLI-based workflow tests:
  - SFTP connectivity test
  - Simple inline SFTP job test
  - Complete SFTP→Excel→DHIS2 workflow test
- ✅ Verifies workflow files exist and are valid
- ✅ Tests Excel file processing capabilities

**Key features**:
- Minimal environment setup (only required services)
- Timeout of 20 minutes
- Uploads test results as artifacts
- Debug information on failure

## Usage

### Running Manually

You can trigger these workflows manually from the GitHub Actions tab:

1. Go to Actions tab in your repository
2. Select the workflow you want to run
3. Click "Run workflow"
4. Select the branch and click "Run workflow"

### Viewing Results

- **Success**: Green checkmark ✅ indicates all tests passed
- **Failure**: Red X ❌ indicates tests failed - check logs for details
- **Artifacts**: Test results are uploaded and available for download for 7 days

### Debugging Failures

When a workflow fails:

1. Click on the failed workflow run
2. Expand the failed step to see detailed logs
3. Check the "Collect logs on failure" step for service logs
4. Download test artifacts for detailed test outputs

## Local Testing

To run these tests locally using the same workflow definitions:

### Using the provided script

```bash
# Install act (required)
# macOS: brew install act
# Linux: curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run workflows
./scripts/run-ci-locally.sh              # All workflows
./scripts/run-ci-locally.sh --env-setup  # Environment setup only
./scripts/run-ci-locally.sh --workflow-tests  # Workflow tests only
```

### Using act directly

```bash
# List all workflows and jobs
act -l

# Run specific workflow
act -W .github/workflows/ci-environment.yml
act -W .github/workflows/ci-workflow-tests.yml

# Run with environment variables
act -W .github/workflows/ci-environment.yml --env-file .env

# Dry run (see what would execute)
act -n

# Run specific job
act -j build-images -W .github/workflows/ci-environment.yml
```

The advantage of using `act` is that it runs the exact same workflow definitions as GitHub Actions, eliminating discrepancies between local and CI environments.

## Environment Variables

The workflows use these key environment variables:

- `MODE=dev` - Run in development mode with exposed ports
- `CLUSTERED_MODE=false` - Single node deployment
- `OPENFN_LOAD_WORKFLOWS_ON_STARTUP=true` - Auto-load workflows
- `VERBOSE=true` - Detailed test output

## Extending the Tests

To add new tests:

1. **For environment tests**: Add health checks in the "Service Health Checks" step
2. **For workflow tests**: Add new test cases in `projects/indicator_workflow_testing/tests/cli/`

## Best Practices

1. **Keep tests fast**: CLI tests should complete in under 20 minutes
2. **Use artifacts**: Upload important test outputs for debugging
3. **Health checks first**: Ensure services are ready before testing
4. **Fail fast**: Use appropriate timeouts to avoid hanging tests
5. **Clear logging**: Include descriptive messages for each test step

## Troubleshooting

Common issues and solutions:

| Issue | Solution |
|-------|----------|
| Docker build fails | Check Dockerfile syntax and base image availability |
| Service won't start | Check logs in "Collect logs on failure" step |
| SFTP connection fails | Verify port 2225 is available and credentials are correct |
| DHIS2 timeout | DHIS2 takes 3-5 minutes to start, increase timeout if needed |
| CLI tests fail | Check that test files exist and Docker image was built |

## Future Improvements

- [ ] Add service mocking for faster CLI tests
- [ ] Implement test result reporting (e.g., to Slack)
- [ ] Add performance benchmarking
- [ ] Create composite actions for common steps
- [ ] Add matrix testing for multiple configurations 