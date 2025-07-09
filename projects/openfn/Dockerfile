# OpenFN Lightning with Custom SFTP Package (URI Fix)
ARG OPENFN_BASE_IMAGE=openfn/lightning:v2.13.3

FROM ${OPENFN_BASE_IMAGE}

# Switch to root to make modifications
USER root

# Install debugging tools and pnpm (Node.js and npm already available in base image)
RUN apt-get update && apt-get install -y \
    curl \
    netcat-openbsd \
    iputils-ping \
    ssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@8.15.0

# Create backup of original adaptor if it exists
RUN if [ -d "/app/priv/openfn/@openfn/language-sftp" ]; then \
      mv /app/priv/openfn/@openfn/language-sftp /app/priv/openfn/@openfn/language-sftp.original; \
    fi

# Create directory for local adaptors repository
RUN mkdir -p /app/openfn-adaptors

# Copy the entire adaptors repository for local adaptors mode
COPY openfn/openfn-custom-adaptors/ /app/openfn-adaptors/

# Build the specific packages we need for LOCAL_ADAPTORS
WORKDIR /app/openfn-adaptors
RUN echo "🔨 Installing dependencies..." && \
    pnpm install && \
    echo "🏗️ Building required packages for LOCAL_ADAPTORS..." && \
    pnpm -C packages/common build && \
    pnpm -C packages/sftp build && \
    pnpm -C packages/dhis2 build && \
    echo "✅ Required packages built successfully"

# Verify that key packages have proper dist files and dependencies
RUN echo "📦 Verifying built packages and dependencies:" && \
    for pkg in sftp dhis2; do \
        echo "Checking $pkg..."; \
        if [ -d "packages/$pkg/dist" ]; then \
            echo "  ✅ $pkg has dist/ directory"; \
            echo "  📁 Main dist files:"; \
            ls -la "packages/$pkg/dist/"*.{js,cjs} 2>/dev/null || echo "    No .js/.cjs files found"; \
        else \
            echo "  ❌ $pkg missing dist/ directory" && exit 1; \
        fi; \
        echo "  📦 Dependencies in root node_modules:"; \
        if [ -d "node_modules/@openfn/language-common" ]; then \
            echo "    ✅ @openfn/language-common found in root node_modules"; \
            if [ -d "node_modules/@openfn/language-common/dist" ]; then \
                echo "    ❌ @openfn/language-common still using node_modules, checking packages/common/dist"; \
            fi; \
        fi; \
        if [ -d "packages/common/dist" ]; then \
            echo "    ✅ packages/common/dist directory exists"; \
            ls -la "packages/common/dist/"*.{js,cjs} 2>/dev/null || echo "    No .js/.cjs files in common/dist"; \
        else \
            echo "    ❌ packages/common/dist missing" && exit 1; \
        fi; \
    done

# Reset working directory
WORKDIR /app


# Also install custom SFTP adaptor in traditional location as backup
RUN mkdir -p /app/priv/openfn/@openfn/language-sftp && \
    if [ -d "/app/openfn-adaptors/packages/sftp" ]; then \
        cp -r /app/openfn-adaptors/packages/sftp/* /app/priv/openfn/@openfn/language-sftp/; \
        chown -R lightning:root /app/priv/openfn/@openfn/language-sftp; \
        echo "✅ Custom SFTP adaptor also installed in traditional location"; \
    fi

# Switch back to lightning user
USER lightning

# Add environment variables to identify this as the custom URI-fixed package with local adaptors
ENV CUSTOM_SFTP_ADAPTOR=true
ENV SFTP_ADAPTOR_VERSION=2.0.14-custom-uri-fixed
ENV LOCAL_ADAPTORS_ENABLED=true
ENV CUSTOM_ADAPTORS_PATH=/app/openfn-adaptors 