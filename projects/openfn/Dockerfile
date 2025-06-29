# Define build argument at the top level
ARG OPENFN_BASE_IMAGE=openfn/lightning:v2.13.3

# Stage 1: Build custom OpenFN SFTP adaptor with enhanced debugging
FROM node:18-alpine AS adaptor-builder

# Install pnpm for building OpenFN adaptors
RUN npm install -g pnpm

# Set working directory for adaptor build
WORKDIR /build

# Copy our custom adaptors project - use absolute path from build context
COPY openfn-adaptors/ ./

# Install dependencies and build only the SFTP adaptor
RUN pnpm install
RUN cd packages/sftp && pnpm build

# Stage 2: Extend OpenFN Lightning with custom adaptor
FROM ${OPENFN_BASE_IMAGE}

# Switch to root to make modifications
USER root

# Install npm for dependency management and debugging tools
RUN apt-get update && apt-get install -y \
    curl \
    netcat-openbsd \
    iputils-ping \
    ssh-client \
    && rm -rf /var/lib/apt/lists/*

# Create backup of original adaptor
RUN if [ -d "/app/priv/openfn/@openfn/language-sftp" ]; then \
      mv /app/priv/openfn/@openfn/language-sftp /app/priv/openfn/@openfn/language-sftp.original; \
    fi

# Copy our custom SFTP adaptor source and built files
COPY --from=adaptor-builder /build/packages/sftp/ /app/priv/openfn/@openfn/language-sftp/

# Install fresh dependencies in the final image using npm (not pnpm)
WORKDIR /app/priv/openfn/@openfn/language-sftp

# Fix package.json to replace workspace dependencies with actual versions
RUN rm -rf node_modules package-lock.json && \
    sed -i 's/"@openfn\/language-common": "workspace:\*"/"@openfn\/language-common": "^2.5.0"/' package.json && \
    npm install --omit=dev && \
    chown -R lightning:root /app/priv/openfn/@openfn/language-sftp

# Install additional debugging utilities globally
RUN npm install -g ssh2-sftp-client@9.0.4

# Switch back to lightning user
USER lightning

# Set working directory back to app root
WORKDIR /app

# Add environment variable to identify custom build
ENV CUSTOM_SFTP_ADAPTOR=true
ENV SFTP_ADAPTOR_VERSION=debug-enhanced 