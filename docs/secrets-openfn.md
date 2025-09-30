## OpenFn secrets (Docker Swarm)

This document describes how Docker Swarm secrets are managed for the OpenFn package with automatic creation from environment variables for seamless development and deployment.

### Secrets managed

- openfn_secret_key_base → exported as `SECRET_KEY_BASE`
- openfn_primary_encryption_key → `PRIMARY_ENCRYPTION_KEY`
- openfn_worker_runs_private_key → `WORKER_RUNS_PRIVATE_KEY`
- openfn_worker_secret → `WORKER_SECRET`
- openfn_api_key → `OPENFN_API_KEY`
- openfn_admin_password → `OPENFN_ADMIN_PASSWORD`
- openfn_database_url → `DATABASE_URL`
- dhis2_admin_password → `DHIS2_ADMIN_PASSWORD`
- dhis2_password → `DHIS2_PASSWORD`
- postgres_password → `POSTGRES_PASSWORD` (importer only)
- openfn_db_user_password → `NEW_DATABASE_PASSWORD` (importer only)

All secrets are declared as external in `packages/openfn/docker-compose.yml` and `packages/openfn/importer/postgres/docker-compose.config.yml`.

### Automatic Secrets Creation (Recommended)

**No manual setup required!** The deployment system automatically creates missing secrets from environment variables defined in `packages/openfn/package-metadata.json`.

When you run:
```bash
./instant package init -n openfn -d
```

The system will:
1. Check if each required secret exists in Docker Swarm
2. Automatically create any missing secrets from corresponding environment variables
3. Wait for Docker Swarm to propagate the secrets
4. Continue with deployment

This happens transparently during both:
- **Config importer deployment** (for postgres secrets)
- **Main service deployment** (for all OpenFN secrets)

**Environment Variable Mappings:**
- `OPENFN_SECRET_KEY_BASE` → `openfn_secret_key_base`
- `OPENFN_PRIMARY_ENCRYPTION_KEY` → `openfn_primary_encryption_key`
- `OPENFN_WORKER_RUNS_PRIVATE_KEY` → `openfn_worker_runs_private_key`
- `OPENFN_WORKER_SECRET` → `openfn_worker_secret`
- `OPENFN_API_KEY` → `openfn_api_key`
- `OPENFN_ADMIN_PASSWORD` → `openfn_admin_password`
- `OPENFN_DATABASE_URL` → `openfn_database_url`
- `DHIS2_ADMIN_PASSWORD` → `dhis2_admin_password`
- `DHIS2_PASSWORD` → `dhis2_password`
- `POSTGRES_PASSWORD` → `postgres_password`
- `OPENFN_POSTGRESQL_PASSWORD` → `openfn_db_user_password`

### Manual Secrets Creation (Optional)

If you prefer to create secrets manually or need to override the automatic creation:

Run the helper script:
```bash
./scripts/setup-openfn-secrets.sh            # interactive
./scripts/setup-openfn-secrets.sh --from-env --yes   # read from env, non-interactive
./scripts/setup-openfn-secrets.sh --only openfn_api_key,openfn_admin_password
```

Or create individually:
```bash
printf '%s' 'your-api-key' | docker secret create openfn_api_key -
printf '%s' 'super-secret' | docker secret create openfn_admin_password -
```

### How secrets are used

- `packages/openfn/docker-compose.yml` mounts the secrets and runs a small shell wrapper to export environment variables from `/run/secrets/<name>` if present; otherwise existing env vars are used. This keeps development simple (env-only) while using secrets in Swarm.
- `packages/openfn/swarm.sh` reads sensitive values from in-container env via `System.get_env(...)`, so values provided by secrets are respected.
- The Postgres importer (`packages/openfn/importer/postgres/docker-compose.config.yml`) reads `POSTGRES_PASSWORD` and `NEW_DATABASE_PASSWORD` from secrets with env fallback.

### How automatic secrets creation works

The automatic secrets creation is implemented in `utils/config-utils.sh` via the `config::ensure_external_secrets_existence()` function:

1. **Deployment Integration**: Called automatically during:
   - Config importer deployment (`docker::deploy_config_importer` in `utils/docker-utils.sh`)
   - Main service deployment (`docker::deploy_service` in `utils/docker-utils.sh`)

2. **Secret Detection**: Parses docker-compose files to identify external secrets using pure bash (no external dependencies)

3. **Automatic Creation**: For each missing secret:
   - Maps secret name to corresponding environment variable
   - Creates the secret in Docker Swarm from the env var value
   - Waits for propagation before continuing deployment

4. **Zero Configuration**: Works out-of-the-box with environment variables from `package-metadata.json`

### Redeploy and verify

```bash
./instant package up -n openfn -d
docker service ps openfn_openfn
docker service ps openfn_worker
```

To verify inside a running container:

```bash
docker exec -it $(docker ps -qf "label=com.docker.swarm.service.name=openfn_openfn") sh -lc 'ls /run/secrets && env | grep -E "OPENFN_|SECRET_KEY_BASE|PRIMARY_ENCRYPTION_KEY|WORKER_SECRET"'
```

### Secret rotation

1) Create a new secret (e.g., `openfn_api_key_v2`).
2) Update the compose to point to the new secret name (or temporarily add both and export from the new one).
3) Redeploy the stack.
4) Remove the old secret when all tasks are updated.

### Troubleshooting

#### Secrets Not Being Created

If automatic secret creation isn't working:

1. **Check environment variables are set:**
   ```bash
   # Verify env vars are loaded
   grep OPENFN_SECRET_KEY_BASE packages/openfn/package-metadata.json
   ```

2. **Check Docker Swarm is initialized:**
   ```bash
   docker info | grep "Swarm: active"
   # If not active, initialize: docker swarm init
   ```

3. **Check deployment logs:**
   ```bash
   # Look for secret creation messages
   ./instant package init -n openfn -d 2>&1 | grep -i secret
   ```

4. **Manually verify secrets exist:**
   ```bash
   docker secret ls
   ```

#### Secret Already Exists with Wrong Value

If a secret exists but has the wrong value, you need to recreate it:

```bash
# Remove the old secret
docker secret rm openfn_api_key

# Redeploy (will auto-create from env)
./instant package up -n openfn -d
```

**Note**: You cannot update existing secrets in Docker Swarm; they must be removed and recreated.

### Notes

- Do not commit secret material to the repository
- Keep env-based defaults for local development only
- The automatic creation system ensures dev environments work without manual setup
- Production deployments can override by creating secrets manually before deployment



