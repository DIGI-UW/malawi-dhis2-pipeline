FROM node:18-alpine

# Install OpenFN CLI and necessary tools
RUN npm install -g @openfn/cli@latest

# Install utilities
RUN apk add --no-cache curl bash jq

# Create app directory structure
WORKDIR /app
RUN mkdir -p /app/workflows /app/shared /app/scripts

# Copy the workflows and shared components
COPY workflows/. /app/workflows/
COPY shared/ /app/shared/
COPY scripts/ /app/scripts/
COPY docker/entrypoint.sh /app/entrypoint.sh

# Make scripts executable
RUN chmod +x /app/scripts/*.sh /app/entrypoint.sh

# Environment variables with defaults (non-sensitive only)
# Sensitive variables (OPENFN_API_KEY, OPENFN_ADMIN_USER, OPENFN_ADMIN_PASSWORD) 
# should be provided at runtime via docker run -e or docker-compose environment section
ENV OPENFN_ENDPOINT=""
ENV WORKFLOW_NAME=""
ENV WORKFLOW_PATH="/app/workflows"
ENV MODE="deploy"
ENV DRY_RUN="false"

# Simple healthcheck - just check if the process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD pgrep -f entrypoint.sh || exit 1

# Default command
ENTRYPOINT ["/app/entrypoint.sh"]
