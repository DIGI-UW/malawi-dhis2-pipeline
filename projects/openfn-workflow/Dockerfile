# OpenFN Workflow Configuration Container
# This container sets up the OpenFN CLI and manages workflow deployment

ARG OPENFN_WORKFLOW_BASE_IMAGE=node:20-alpine3.20
FROM ${OPENFN_WORKFLOW_BASE_IMAGE}

# Install required system packages
RUN apk add --no-cache \
    bash \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create app directory structure
RUN mkdir -p /app/project/jobs /app/project/state

# Install OpenFN CLI globally
RUN npm install -g @openfn/cli

# Setup PATH environment in multiple locations for compatibility
RUN echo 'export PATH="/usr/local/bin:$PATH"' >> /etc/profile && \
    echo 'export PATH="/usr/local/bin:$PATH"' >> /root/.bashrc && \
    echo 'export PATH="/usr/local/bin:$PATH"' >> /root/.profile

# Create symbolic link for easier access
RUN ln -sf /usr/local/bin/openfn /usr/bin/openfn

# Set working directory
WORKDIR /app/project

# Copy the startup script
COPY setup-workflow.sh /usr/local/bin/setup-workflow.sh
RUN chmod +x /usr/local/bin/setup-workflow.sh

# Verify OpenFN CLI installation
RUN /usr/local/bin/openfn --version

# Set the default command
CMD ["/usr/local/bin/setup-workflow.sh"]
