#!/bin/bash

set -euo pipefail

required_secrets=(
  openfn_secret_key_base
  openfn_primary_encryption_key
  openfn_worker_runs_private_key
  openfn_worker_secret
  openfn_api_key
  openfn_admin_password
  openfn_database_url
  dhis2_admin_password
  dhis2_password
  postgres_password
  openfn_db_user_password
)

print() { echo -e "$1"; }
exists() { docker secret ls -qf name="^$1$" >/dev/null 2>&1 && docker secret ls -qf name="^$1$" | grep -q .; }

usage() {
  cat <<EOF
Setup OpenFn Docker Swarm secrets

This script creates the secrets required by the OpenFn package.

Options:
  --from-env      Read secret values from environment variables with same names in UPPER_SNAKE
                  mapping (e.g. openfn_api_key <- OPENFN_API_KEY)
  --yes           Non-interactive; auto-create any missing secrets by prompting once per secret
  --only LIST     Comma-separated subset of secrets to manage (names as listed below)

Secrets to create by default:
  ${required_secrets[*]}

Examples:
  ./scripts/setup-openfn-secrets.sh
  ./scripts/setup-openfn-secrets.sh --from-env --yes
  ./scripts/setup-openfn-secrets.sh --only openfn_api_key,openfn_admin_password
EOF
}

FROM_ENV=false
NON_INTERACTIVE=false
ONLY_LIST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-env) FROM_ENV=true; shift ;;
    --yes) NON_INTERACTIVE=true; shift ;;
    --only) ONLY_LIST="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) print "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if ! docker info >/dev/null 2>&1 || ! docker info | grep -q "Swarm: active"; then
  print "Swarm is not active. Initializing..."
  docker swarm init >/dev/null 2>&1 || true
fi

IFS=',' read -r -a only <<< "$ONLY_LIST"
filter_secret() {
  if [[ -z "$ONLY_LIST" ]]; then return 0; fi
  local s="$1"
  for x in "${only[@]}"; do [[ "$x" == "$s" ]] && return 0; done
  return 1
}

created=()
skipped=()
for name in "${required_secrets[@]}"; do
  filter_secret "$name" || { skipped+=("$name"); continue; }

  if exists "$name"; then
    print "✅ Secret exists: $name"
    continue
  fi

  value=""
  if $FROM_ENV; then
    # Primary mapping: snake_case secret name -> UPPERCASE env var
    # Example: openfn_api_key -> OPENFN_API_KEY
    env_name=$(echo "$name" | tr '[:lower:]' '[:upper:]')
    value="${!env_name-}"

    # Fallback mappings for secrets whose env var names differ
    # This allows running in dev without swarm secrets by deriving
    # the secret value from existing package env vars.
    if [[ -z "$value" ]]; then
      case "$name" in
        # openfn_db_user_password should default from OPENFN_POSTGRESQL_PASSWORD
        openfn_db_user_password)
          value="${OPENFN_POSTGRESQL_PASSWORD-}"
          ;;
      esac
    fi
  fi

  if [[ -z "$value" ]]; then
    if $NON_INTERACTIVE; then
      print "⚠️  No value for $name; skipping in non-interactive mode"
      continue
    fi
    print "Enter value for secret $name (input hidden):"
    read -rs value
    echo
  fi

  printf '%s' "$value" | docker secret create "$name" - >/dev/null
  print "➕ Created secret: $name"
  created+=("$name")
done

print "\nSummary:"
print "  Created: ${#created[@]}"
for s in "${created[@]}"; do print "   - $s"; done
print "  Skipped: ${#skipped[@]}" >/dev/null || true

print "\nNext steps:"
print "  - Redeploy OpenFn: ./instant package up -n openfn -d"
print "  - Verify: docker service ps openfn_openfn && docker service ps openfn_worker"




