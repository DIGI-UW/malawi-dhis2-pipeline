ARG SFTP_BASE_IMAGE=atmoz/sftp:latest
FROM ${SFTP_BASE_IMAGE}

# Copy all files to the SFTP server's data directory
COPY data/ /home/openfn/data/

# Copy test files for debugging and testing
# COPY data/excel-files/test.json /home/openfn/data/excel-files/test.json 
# COPY data/excel-files/test.csv /home/openfn/data/excel-files/test.csv 
# COPY data/excel-files/test.txt /home/openfn/data/excel-files/test.txt 

# Copy SSH configuration for OpenFN compatibility
COPY sshd_config_legacy.conf /tmp/sshd_config_legacy.conf

# Configure SSH to support legacy algorithms for OpenFN compatibility
RUN echo "" >> /etc/ssh/sshd_config && \
    echo "# OpenFN SFTP Adaptor Compatibility Settings" >> /etc/ssh/sshd_config && \
    cat /tmp/sshd_config_legacy.conf >> /etc/ssh/sshd_config && \
    rm /tmp/sshd_config_legacy.conf && \
    ssh-keygen -t rsa -b 2048 -f /etc/ssh/ssh_host_rsa_key -N "" || true

# Set proper ownership for the SFTP user
RUN chown -R 1001:1001 /home/openfn/data/excel-files/ && \
    chmod -R 755 /home/openfn/data/excel-files/
