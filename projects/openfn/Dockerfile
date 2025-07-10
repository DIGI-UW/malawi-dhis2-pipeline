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

# Copy the built packages from the submodule location
COPY openfn-custom-adaptors/packages/common/ /app/openfn-adaptors/packages/common/
COPY openfn-custom-adaptors/packages/http/ /app/openfn-adaptors/packages/http/
COPY openfn-custom-adaptors/packages/sftp/ /app/openfn-adaptors/packages/sftp/

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