# OpenFN Lightning with Official SFTP Package (Fixed Build)
ARG OPENFN_BASE_IMAGE=openfn/lightning:v2.13.3

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

# Create backup of original adaptor if it exists
RUN if [ -d "/app/priv/openfn/@openfn/language-sftp" ]; then \
      mv /app/priv/openfn/@openfn/language-sftp /app/priv/openfn/@openfn/language-sftp.original; \
    fi

# Create directory for proper SFTP adaptor installation
RUN mkdir -p /app/priv/openfn/@openfn/language-sftp

# Install the official SFTP package with PROPER npm install (not broken symlinks)
# This is the key fix - ensure clean installation without pnpm symlink issues
WORKDIR /app/priv/openfn/@openfn/language-sftp

# Create a proper package.json and install officially
RUN echo '{"name":"@openfn/language-sftp","version":"2.0.14","main":"dist/index.js"}' > package.json && \
    npm init -y && \
    rm -rf node_modules package-lock.json && \
    npm install --no-optional --no-package-lock @openfn/language-sftp@2.0.14 && \
    # Copy the properly installed package to the correct location
    cp -r node_modules/@openfn/language-sftp/* . && \
    # Clean up temporary installation
    rm -rf node_modules package-lock.json && \
    # Install final dependencies properly
    npm install --omit=dev && \
    chown -R lightning:root /app/priv/openfn/@openfn/language-sftp

# Verify installation worked
RUN ls -la /app/priv/openfn/@openfn/language-sftp/ && \
    if [ -f "/app/priv/openfn/@openfn/language-sftp/dist/index.js" ]; then \
        echo "✅ SFTP adaptor properly installed"; \
    else \
        echo "❌ SFTP adaptor installation failed" && exit 1; \
    fi

# Switch back to lightning user
USER lightning

# Set working directory back to app root
WORKDIR /app

# Add environment variable to identify this as the official package fix
ENV OFFICIAL_SFTP_ADAPTOR=true
ENV SFTP_ADAPTOR_VERSION=2.0.14-official-fixed 