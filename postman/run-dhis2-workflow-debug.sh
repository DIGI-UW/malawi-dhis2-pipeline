#!/usr/bin/env bash
set -euo pipefail

# Location of this script and defaults
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
COLLECTION="$ROOT_DIR/DHIS2-Workflow-Debug.postman_collection.json"
ENV_FILE="${1:-$ROOT_DIR/DHIS2-Workflow-Debug.local.postman_environment.json}"

# Ensure Node.js (v16+) is available
need_node=0
if ! command -v node >/dev/null 2>&1; then
  need_node=1
else
  # Get version safely; if asdf shim is present without a version, node -v may fail
  if ! NODE_VER_RAW="$(node -v 2>/dev/null)"; then
    need_node=1
  else
    NODE_VER="${NODE_VER_RAW#v}"
    NODE_MAJOR="${NODE_VER%%.*}"
    if [[ -z "${NODE_MAJOR}" ]] || ! [[ ${NODE_MAJOR} =~ ^[0-9]+$ ]]; then
      need_node=1
    elif [[ "${NODE_MAJOR}" -lt 16 ]]; then
      need_node=1
    fi
  fi
fi

if [[ $need_node -eq 1 ]]; then
  echo "Node.js v16+ not found. Installing Node.js 20 (requires sudo)..." >&2
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo mkdir -p /etc/apt/keyrings
  TMP_GPG="$(mktemp)"
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$TMP_GPG"
  sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg "$TMP_GPG"
  rm -f "$TMP_GPG"
  NODE_MAJOR_CHANNEL=20
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR_CHANNEL}.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list >/dev/null
  sudo apt-get update || true
  sudo apt-get remove -y libnode-dev || true
  sudo apt-get install -y nodejs
  if ! command -v node >/dev/null 2>&1; then
    echo "Failed to install Node.js. Please install Node.js v16+ manually." >&2
    exit 1
  fi
fi

# Ensure newman is available
if ! command -v newman >/dev/null 2>&1; then
  echo "Installing newman (requires sudo npm)..." >&2
  sudo npm i -g newman
  if ! command -v newman >/dev/null 2>&1; then
    echo "Failed to install newman. Try: sudo npm i -g newman" >&2
    exit 1
  fi
fi

# Build newman flags
NEWMAN_FLAGS=(
  "run" "$COLLECTION"
  "--reporters" "cli,junit,json"
  "--reporter-junit-export" "$ROOT_DIR/report.junit.xml"
  "--reporter-json-export" "$ROOT_DIR/report.json"
  "--timeout" "300000"
  "--delay-request" "50"
  "--bail"
)

# If an environment file exists, include it
if [[ -f "$ENV_FILE" ]]; then
  NEWMAN_FLAGS+=("-e" "$ENV_FILE")
else
  echo "Environment file not found: $ENV_FILE (proceeding with --env-var overrides)" >&2
fi

# Always allow overriding key variables via environment
# Defaults align with our local dev setup
NEWMAN_FLAGS+=(
  "--env-var" "dhis2_base_url=${DHIS2_BASE_URL:-http://localhost:8080}"
  "--env-var" "dhis2_username=${DHIS2_USERNAME:-admin}"
  "--env-var" "dhis2_password=${DHIS2_PASSWORD:-district}"
  "--env-var" "integration_username=${INTEGRATION_USERNAME:-openfn_integration}"
  "--env-var" "integration_password=${INTEGRATION_PASSWORD:-OpenFn@2024!}"
)

echo "Running newman with collection: $COLLECTION"
if [[ -f "$ENV_FILE" ]]; then
  echo "Using environment: $ENV_FILE"
fi

newman "${NEWMAN_FLAGS[@]}"


