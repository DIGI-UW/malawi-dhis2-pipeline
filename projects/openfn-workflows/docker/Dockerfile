# OpenFN Workflows Container with Fixed SFTP Adaptor
FROM node:18-alpine

# Install OpenFN CLI and necessary tools
RUN npm install -g @openfn/cli@latest

# Install utilities
RUN apk add --no-cache curl bash jq

# Fix SFTP adaptor installation (same fix as main openfn container)
# Create directory for proper SFTP adaptor installation  
RUN mkdir -p /usr/local/lib/node_modules/@openfn/language-sftp

WORKDIR /usr/local/lib/node_modules/@openfn/language-sftp

# Install the official SFTP package with PROPER npm install (not broken symlinks)
# This ensures the workflow loader can validate SFTP workflows properly
RUN echo '{"name":"@openfn/language-sftp","version":"2.0.14","main":"dist/index.js"}' > package.json && \
    npm init -y && \
    rm -rf node_modules package-lock.json && \
    npm install --no-optional --no-package-lock @openfn/language-sftp@2.0.14 && \
    # Copy the properly installed package to the correct location
    cp -r node_modules/@openfn/language-sftp/* . && \
    # Clean up temporary installation
    rm -rf node_modules package-lock.json && \
    # Install final dependencies properly
    npm install --omit=dev

# Verify SFTP adaptor installation worked
RUN ls -la /usr/local/lib/node_modules/@openfn/language-sftp/ && \
    if [ -f "/usr/local/lib/node_modules/@openfn/language-sftp/dist/index.js" ]; then \
        echo "✅ SFTP adaptor properly installed in workflows container"; \
    else \
        echo "❌ SFTP adaptor installation failed" && exit 1; \
    fi

# Create app directory structure
WORKDIR /app
RUN mkdir -p /app/workflows /app/shared /app/scripts /app/configs

# Copy the workflows and related assets into the image
COPY workflows/. /app/workflows/
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

# Add environment variable to identify this as having the official package fix
ENV OFFICIAL_SFTP_ADAPTOR=true
ENV SFTP_ADAPTOR_VERSION=2.0.17-custom

# Simple healthcheck - just check if the process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD pgrep -f entrypoint.sh || exit 1

# Default command
ENTRYPOINT ["/app/entrypoint.sh"]
