## OpenFn secrets (Docker Swarm)

This document describes how to set up Docker Swarm secrets for the OpenFn package while preserving simple env-based fallbacks for development.

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

### Create secrets (one-time)

Run the helper to create any missing secrets:

```bash
./scripts/setup-openfn-secrets.sh            # interactive
./scripts/setup-openfn-secrets.sh --from-env --yes   # read from env, non-interactive
./scripts/setup-openfn-secrets.sh --only openfn_api_key,openfn_admin_password
```

You can also create manually:

```bash
printf '%s' 'your-api-key' | docker secret create openfn_api_key -
printf '%s' 'super-secret' | docker secret create openfn_admin_password -
```

### How secrets are used

- `packages/openfn/docker-compose.yml` mounts the secrets and runs a small shell wrapper to export environment variables from `/run/secrets/<name>` if present; otherwise existing env vars are used. This keeps development simple (env-only) while using secrets in Swarm.
- `packages/openfn/swarm.sh` now reads sensitive values from in-container env via `System.get_env(...)`, so values provided by secrets are respected.
- The Postgres importer (`packages/openfn/importer/postgres/docker-compose.config.yml`) reads `POSTGRES_PASSWORD` and `NEW_DATABASE_PASSWORD` from secrets with env fallback.

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

### Notes

- Do not commit secret material to the repository.
- Keep env-based defaults for local development only.


