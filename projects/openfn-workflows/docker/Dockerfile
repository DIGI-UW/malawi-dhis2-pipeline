# Stage 1: Build custom OpenFN SFTP adaptor with enhanced debugging
FROM node:18-alpine AS adaptor-builder

# Install pnpm for building OpenFN adaptors
RUN npm install -g pnpm

# Set working directory for adaptor build
WORKDIR /build

# Copy our custom adaptors project (relative to openfn-workflows directory)
COPY ../openfn-adaptors/ ./

# Install dependencies and build only the SFTP adaptor
RUN pnpm install
RUN cd packages/sftp && pnpm build

# Stage 2: Main OpenFN container with custom adaptor
FROM node:18-alpine

# Install OpenFN CLI and necessary tools
RUN npm install -g @openfn/cli@latest

# Install utilities
RUN apk add --no-cache curl bash jq

# Create directory for custom SFTP adaptor and copy our enhanced version
RUN mkdir -p /usr/local/lib/node_modules/@openfn/language-sftp/dist
COPY --from=adaptor-builder /build/packages/sftp/dist/ /usr/local/lib/node_modules/@openfn/language-sftp/dist/
COPY --from=adaptor-builder /build/packages/sftp/package.json /usr/local/lib/node_modules/@openfn/language-sftp/
COPY --from=adaptor-builder /build/packages/sftp/configuration-schema.json /usr/local/lib/node_modules/@openfn/language-sftp/

# Install our custom adaptor's dependencies
RUN cd /usr/local/lib/node_modules/@openfn/language-sftp && npm install

# Create app directory structure
WORKDIR /app
RUN mkdir -p /app/workflows /app/shared /app/scripts /app/configs

# Copy the workflows and shared components
COPY workflows/. /app/workflows/
COPY shared/ /app/shared/
COPY scripts/ /app/scripts/
COPY configs/ /app/configs/
COPY docker/entrypoint.sh /app/entrypoint.sh

# Make scripts executable
RUN chmod +x /app/scripts/*.sh /app/entrypoint.sh

# Environment variables with defaults (non-sensitive only)
# Sensitive variables (OPENFN_API_KEY, OPENFN_ADMIN_USER, OPENFN_ADMIN_PASSWORD) 
# should be provided at runtime via docker run -e or docker-compose environment section
ENV OPENFN_ENDPOINT=""
ENV WORKFLOW_NAME=""
ENV WORKFLOW_PATH="/app/workflows"
ENV CONFIG_PATH="/app/configs"
ENV MODE="deploy"
ENV DRY_RUN="false"

# Simple healthcheck - just check if the process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD pgrep -f entrypoint.sh || exit 1

# Default command
ENTRYPOINT ["/app/entrypoint.sh"]
