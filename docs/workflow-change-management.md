# OpenFN Workflow Change Management & Versioning

## Overview

This document outlines strategies for managing workflow changes between code (YAML/JS files) and the OpenFN Lightning UI, based on the [OpenFN Lightning provisioning API](https://openfn.github.io/lightning/provisioning.html#using-the-api).

## Key Challenges

1. **Bidirectional Changes**: Workflows can be modified both in code and through the OpenFN UI
2. **State Synchronization**: Need to track which version is "current" 
3. **Conflict Resolution**: Handle cases where both code and UI have changes
4. **UUID Management**: OpenFN requires UUIDs for all entities, but YAML uses keys

## OpenFN Versioning System

### Current Environment: Lightning v2.9.5
Our OpenFN Lightning instance (v2.9.5) provides basic versioning through:
- **Lock Version**: Incremental counter (`lock_version`) tracking modifications
- **Timestamps**: `inserted_at` and `updated_at` for change tracking
- **Snapshot System**: Automatic snapshots on saves and runs (UI-based access)

### Future Capabilities (v2.10.10+)
Newer OpenFN versions include:
- **[Workflows API](https://docs.openfn.org/documentation/build/workflows-api)**: REST endpoints for workflow management
- **[Workflow Snapshots](https://docs.openfn.org/documentation/workflow-snapshots)**: Full snapshot history with API access
- **Granular Versioning**: Per-step and per-workflow version control

### Current API Behavior (Provisioning API)

Based on the [provisioning API documentation](https://openfn.github.io/lightning/provisioning.html#using-the-api):

#### Full State Replacement
- API expects **all** existing entities in each provisioning document
- Missing entities are effectively deleted
- Requires fetching current state before making changes

#### UUID Requirements
- All entities (projects, workflows, jobs, triggers, edges) must have UUIDs
- New entities need client-generated UUIDs
- Existing entities are updated based on UUID matching

#### Version Tracking
- `lock_version` field increments with each modification
- Timestamps track creation and modification times
- UI changes increment version counter automatically

#### Conflict Detection
> "If the document provided is out of date (e.g. a new job was added on the server), a new reference document should be fetched and the changes applied to it."

## Proposed Change Management Strategies

### Strategy 1: Code-First with State Tracking

**Approach**: Treat code as source of truth, track UI changes for review

**Implementation**:
1. **State Tracking**: Store deployed state in `.deployed.json`
2. **Conflict Detection**: Compare current server state with last deployed state
3. **Change Review**: Prompt user when UI changes detected
4. **Merge Options**: Code-first (override), UI-first (preserve), or manual merge

**Pros**:
- Clear source of truth (code)
- Version control for workflows
- Predictable deployments

**Cons**:
- UI changes can be lost
- Requires discipline from users

### Strategy 2: Bidirectional Sync with Conflict Resolution

**Approach**: Support changes from both directions with smart merging

**Implementation**:
1. **Export Capability**: Convert server state back to YAML
2. **Change Detection**: Track modifications in both directions
3. **Merge Strategies**: Automatic for non-conflicting, manual for conflicts
4. **Backup System**: Save snapshots before major changes

**Pros**:
- Flexible workflow for different users
- Preserves work from both directions
- Better user experience

**Cons**:
- Complex implementation
- Potential for merge conflicts
- Harder to maintain consistency

### Strategy 3: Environment-Based Separation

**Approach**: Use different environments for different change methods

**Implementation**:
1. **Development Environment**: Code-first, frequent deployments
2. **Staging Environment**: UI testing and refinement
3. **Production Environment**: Locked-down, code-only deployments
4. **Promotion Pipeline**: Controlled movement between environments

**Pros**:
- Clear separation of concerns
- Reduced conflict potential
- Better governance

**Cons**:
- More infrastructure complexity
- Slower iteration cycles
- Multiple environments to maintain

## Recommended Implementation Plan

### Phase 1: Basic State Tracking
1. **Fetch Current State**: Use provisioning API to get current workflow state
2. **Store Deployment State**: Save state after each deployment
3. **Conflict Detection**: Compare current vs. last deployed state
4. **Warning System**: Alert users when UI changes detected

### Phase 2: Conflict Resolution Tools
1. **Export Functionality**: Convert JSON state back to YAML
2. **Merge Utilities**: Tools to combine code and UI changes
3. **Backup System**: Automatic snapshots before deployments
4. **Manual Resolution**: UI for reviewing and resolving conflicts

### Phase 3: Advanced Workflows
1. **Branch-Based Development**: Support multiple workflow versions
2. **Automated Testing**: Validate workflows before deployment
3. **Rollback Capability**: Quick reversion to previous states
4. **Change Tracking**: Audit trail of all modifications

## Implementation Example

### Workflow State Manager Script

```bash
#!/bin/bash
# scripts/workflow-state-manager.sh

# Fetch current state from OpenFN
fetch_state() {
    curl -H "Authorization: Bearer $API_KEY" \
         "$OPENFN_URL/api/provision/$PROJECT_ID" | jq .data
}

# Detect conflicts between local and server
detect_conflicts() {
    local current_state=$(fetch_state)
    local last_deployed=$(cat .deployed-state.json 2>/dev/null || echo '{}')
    
    # Compare timestamps, job bodies, trigger configurations
    # Return 0 if conflicts detected, 1 if clean
}

# Deploy with conflict checking
deploy_workflow() {
    if detect_conflicts && [[ "$1" != "--force" ]]; then
        echo "Conflicts detected. Use --force to override or resolve manually."
        return 1
    fi
    
    # Deploy via OpenFN CLI
    openfn deploy --project-config project.yaml
    
    # Save new state
    fetch_state > .deployed-state.json
}
```

### Usage Patterns

#### Development Workflow
```bash
# Check for UI changes before making code changes
./scripts/workflow-state-manager.sh status

# Make code changes
vim projects/openfn-workflows/workflows/sftp-dhis2/jobs/new-job.js

# Deploy with conflict checking
./scripts/workflow-state-manager.sh deploy

# Export UI changes to review
./scripts/workflow-state-manager.sh export
```

#### Production Deployment
```bash
# Strict deployment - no UI changes allowed
./scripts/workflow-state-manager.sh deploy --strict

# Or force deployment (overrides UI changes)
./scripts/workflow-state-manager.sh deploy --force
```

## File Structure

```
projects/openfn-workflows/workflows/sftp-dhis2/
├── project.yaml                 # Source of truth (YAML)
├── jobs/                        # Job definitions
├── .deployed-state.json         # Last deployed state
├── .current-state.json          # Current server state
├── .state-backups/              # Historical snapshots
│   ├── 2025-01-01-backup.json
│   └── 2025-01-02-backup.json
└── README.md                    # Workflow documentation
```

## Configuration Options

### Environment Variables
```bash
# Change management behavior
OPENFN_CHANGE_STRATEGY="code-first"  # code-first, ui-first, bidirectional
OPENFN_CONFLICT_RESOLUTION="prompt"  # prompt, auto-code, auto-ui, fail
OPENFN_BACKUP_ENABLED="true"         # Enable automatic backups
OPENFN_STATE_TRACKING="true"         # Track deployment state
```

### Project Configuration
```yaml
# project.yaml
metadata:
  change_management:
    strategy: "code-first"
    allow_ui_changes: false
    backup_before_deploy: true
    conflict_resolution: "prompt"
```

## Best Practices

### For Developers
1. **Always check status** before making changes
2. **Use descriptive commit messages** for workflow changes
3. **Test in development** before production deployment
4. **Review UI changes** before overriding

### For Business Users
1. **Communicate UI changes** to development team
2. **Use staging environment** for experimentation
3. **Export changes** to preserve work
4. **Follow change approval process** for production

### For DevOps
1. **Monitor deployment logs** for conflicts
2. **Maintain backup schedules** for workflow states
3. **Set up alerts** for unauthorized changes
4. **Document change procedures** clearly

## Future Enhancements

1. **Visual Diff Tool**: UI for comparing workflow versions
2. **Approval Workflows**: Require approval for production changes
3. **Integration Testing**: Automated testing of workflow changes
4. **Change Notifications**: Alert systems for workflow modifications
5. **Version Tagging**: Semantic versioning for workflow releases

## Conclusion

The recommended approach is to start with **Strategy 1 (Code-First with State Tracking)** as it provides:
- Clear governance model
- Version control integration  
- Predictable deployments
- Foundation for more advanced features

This can be enhanced over time with export capabilities and conflict resolution tools as the team's needs evolve. 