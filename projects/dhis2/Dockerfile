# Custom DHIS2 image that fixes permission issues for log directories
# This image inherits from the base DHIS2 image and ensures proper permissions
# for user ID 65534 to write to /opt/dhis2/logs, /opt/dhis2/apps, and /opt/dhis2/files

ARG DHIS2_BASE_IMAGE=dhis2/core:2.40.4
FROM ${DHIS2_BASE_IMAGE}

# Switch to root to fix permissions
USER root

# Create directories and set proper ownership for user 65534 (nobody)
# This fixes the permission denied errors when DHIS2 tries to create log files
RUN mkdir -p /opt/dhis2/logs /opt/dhis2/apps /opt/dhis2/files && \
    chown -R 65534:65534 /opt/dhis2/logs /opt/dhis2/apps /opt/dhis2/files && \
    chmod -R 755 /opt/dhis2/logs /opt/dhis2/apps /opt/dhis2/files

# Switch back to the original user (65534)
USER 65534

# Add labels for identification
LABEL maintainer="Malawi DHIS2 Indicators Project"
LABEL description="Custom DHIS2 image with fixed permissions for log directories"
LABEL version="1.0"
