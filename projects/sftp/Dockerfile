ARG SFTP_BASE_IMAGE=atmoz/sftp:latest
FROM ${SFTP_BASE_IMAGE}

# Copy Excel files to the SFTP server's data directory
COPY data/*.xlsx /home/openfn/data/excel-files/

# Set proper ownership for the SFTP user
RUN chown -R 1001:1001 /home/openfn/data/excel-files/ && \
    chmod -R 755 /home/openfn/data/excel-files/
