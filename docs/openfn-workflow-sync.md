# OpenFN Workflow Sync Documentation

## Overview

The OpenFN Workflow Sync system provides seamless bidirectional synchronization between OpenFN UI and local workflow code. It integrates with the instant package lifecycle to ensure workflows stay in sync across development, testing, and production environments.

## Key Features

- **Bidirectional Sync**: Download workflows from UI or upload from code
- **Version Management**: Track workflow versions with lock_version support
- **Conflict Resolution**: Automatic or manual conflict resolution strategies
- **Snapshot System**: Automatic snapshots before changes
- **Package Integration**: Seamless integration with instant package lifecycle
- **Watch Mode**: Auto-sync workflows on changes
- **State Tracking**: Maintain sync state across deployments

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenFN Package                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐         ┌─────────────────┐           │
│  │  workflow-sync  │ ◄────►  │ OpenFN Lightning│           │
│  │     Manager     │         │   (UI/API)      │           │
│  └────────┬────────┘         └─────────────────┘           │
│           │                                                  │
│  ┌────────▼────────┐         ┌─────────────────┐           │
│  │ Local Workflows │         │ Version History │           │
│  │   (Code Repo)   │         │  & Snapshots    │           │
│  └─────────────────┘         └─────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Check Sync Status
```bash
./packages/openfn/instant-workflow-sync.sh status
```

### 2. Download Workflows from UI
```bash
# Download all workflows
./packages/openfn/instant-workflow-sync.sh download

# Download specific workflow
./packages/openfn/instant-workflow-sync.sh download sftp-dhis2
```

### 3. Upload Workflows to UI
```bash
# Upload all workflows
./packages/openfn/instant-workflow-sync.sh upload

# Upload specific workflow
./packages/openfn/instant-workflow-sync.sh upload sftp-dhis2
```

### 4. Enable Auto-Sync
```bash
# Start watch mode
./packages/openfn/instant-workflow-sync.sh watch
```

## Configuration

### Environment Variables

Configure workflow sync behavior through environment variables in your `.env` file:

```bash
# Sync Mode Configuration
OPENFN_SYNC_MODE=manual                    # manual|auto-download|auto-upload
OPENFN_SYNC_INTERVAL=300                   # Sync interval in seconds (for watch mode)
OPENFN_CONFLICT_RESOLUTION=prompt          # prompt|local-wins|remote-wins
OPENFN_ENABLE_AUTO_SNAPSHOT=true           # Enable automatic snapshots
OPENFN_SYNC_ON_DEPLOY=true                 # Sync check on deployment
OPENFN_SYNC_ON_STARTUP=false               # Sync on package startup

# Directory Configuration
OPENFN_WORKFLOW_BASE_DIR=projects/openfn-workflows/workflows
OPENFN_STATE_DIR=.openfn-sync
```

### Sync Modes

1. **Manual Mode** (default)
   - Requires explicit sync commands
   - Full control over when syncs happen

2. **Auto-Download Mode**
   - Automatically downloads UI changes
   - Local changes require manual upload

3. **Auto-Upload Mode**
   - Automatically uploads local changes
   - UI changes require manual download

### Conflict Resolution Strategies

1. **Prompt** (default)
   - Interactive prompt when conflicts detected
   - Choose resolution per conflict

2. **Local-Wins**
   - Always use local code version
   - Overwrites UI changes

3. **Remote-Wins**
   - Always use UI version
   - Overwrites local changes

## Workflow Development Lifecycle

### 1. Initial Setup
```bash
# Initialize OpenFN package
./instant package init -n openfn

# Download existing workflows from UI
./packages/openfn/instant-workflow-sync.sh download
```

### 2. Development Workflow

#### Option A: UI-First Development
1. Make changes in OpenFN UI
2. Test workflows in UI
3. Download to code:
   ```bash
   ./packages/openfn/instant-workflow-sync.sh download
   ```
4. Commit changes to git

#### Option B: Code-First Development
1. Edit workflow files locally
2. Upload to test:
   ```bash
   ./packages/openfn/instant-workflow-sync.sh upload
   ```
3. Test in UI
4. Commit changes to git

### 3. Deployment Process
```bash
# Check for conflicts before deployment
./packages/openfn/instant-workflow-sync.sh sync

# Deploy with automatic sync check
./instant package up -n openfn
```

## Directory Structure

```
projects/openfn-workflows/workflows/
├── sftp-dhis2/
│   ├── project.yaml           # Workflow configuration
│   ├── jobs/                  # Job definitions
│   ├── .versions/             # Downloaded versions
│   │   ├── server-2025-01-01_12-00-00.json
│   │   └── latest-*.json
│   └── .snapshots/            # Workflow snapshots
│       ├── 2025-01-01_12-00-00/
│       │   ├── metadata.json
│       │   ├── project.yaml
│       │   └── jobs/
│       └── latest -> 2025-01-01_12-00-00
└── .openfn-sync/              # Sync state files
    └── sftp-dhis2.state.json
```

## Advanced Usage

### Creating Snapshots
```bash
# Manual snapshot
./packages/openfn/instant-workflow-sync.sh snapshot sftp-dhis2 "Before major changes"
```

### Extracting Workflows
```bash
# Extract workflow from downloaded state file
./packages/openfn/instant-workflow-sync.sh extract \
  projects/openfn-workflows/workflows/sftp-dhis2/.versions/latest-project.json \
  extracted-workflow/
```

### Package Lifecycle Hooks

The workflow sync integrates with instant package lifecycle:

```bash
# Pre-deployment hook (automatic if OPENFN_SYNC_ON_DEPLOY=true)
./packages/openfn/workflow-sync.sh hook pre-deploy

# Post-deployment hook
./packages/openfn/workflow-sync.sh hook post-deploy

# Startup hook (automatic if OPENFN_SYNC_ON_STARTUP=true)
./packages/openfn/workflow-sync.sh hook startup
```

## Troubleshooting

### Common Issues

1. **Workflow Not Found**
   - Ensure workflow name in project.yaml matches OpenFN project name
   - Check if project exists in OpenFN UI

2. **Version Conflicts**
   - Use `sync` command to check conflicts
   - Choose appropriate resolution strategy
   - Create snapshot before resolving

3. **Upload Failures**
   - Check if OpenFN service is running
   - Verify API credentials in .env
   - Check Docker logs: `docker service logs openfn_openfn`

### Debug Commands

```bash
# Check OpenFN service status
docker service ls | grep openfn

# View sync state
cat .openfn-sync/*.state.json | jq .

# List all versions
find projects/openfn-workflows/workflows -name "*.json" -path "*/.versions/*" -ls

# Check workflow loader logs
docker service logs openfn_workflow-loader
```

## Best Practices

1. **Always Create Snapshots**
   - Before major changes
   - Before resolving conflicts
   - Keep OPENFN_ENABLE_AUTO_SNAPSHOT=true

2. **Use Version Control**
   - Commit workflow changes to git
   - Include .versions/ in .gitignore
   - Track .snapshots/ for important milestones

3. **Test Before Production**
   - Use separate environments
   - Test workflows in UI before deployment
   - Verify sync status before deploying

4. **Regular Syncs**
   - Run sync checks regularly
   - Use watch mode during active development
   - Download UI changes promptly

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Sync OpenFN Workflows
  run: |
    # Download latest from production
    OPENFN_CONFLICT_RESOLUTION=remote-wins \
    ./packages/openfn/instant-workflow-sync.sh download
    
    # Check for uncommitted changes
    git diff --exit-code || echo "::warning::Uncommitted workflow changes detected"
```

### Pre-commit Hook Example
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check workflow sync status
./packages/openfn/instant-workflow-sync.sh sync
if [ $? -ne 0 ]; then
    echo "Workflow sync issues detected. Please resolve before committing."
    exit 1
fi
```

## Security Considerations

1. **API Credentials**
   - Store credentials in .env file
   - Never commit credentials to git
   - Use environment-specific credentials

2. **Snapshots**
   - May contain sensitive data
   - Consider encryption for snapshots
   - Limit snapshot retention

3. **Network Security**
   - Use HTTPS for API connections
   - Verify SSL certificates
   - Use VPN for remote access 