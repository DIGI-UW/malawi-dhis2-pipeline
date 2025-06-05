# SFTP Storage Package

This package provides an SFTP server for storing and accessing Excel data files in the OpenFN workflow.

## Overview

The SFTP storage package deploys an SFTP server that:
- Hosts Excel files for OpenFN workflow consumption
- Provides secure file access via SFTP protocol
- **Uses Docker configs to import Excel files automatically on initialization**
- Supports both development and production deployment modes
- Follows OpenHIE Instant v2 importer patterns for data seeding

## Automatic Data Import

On initialization, the package automatically imports Excel files using a config-based importer:

### Importer Architecture
- **Config Importer**: Uses Docker configs to mount Excel files
- **Temporary Container**: Alpine container copies files to SFTP volume
- **Volume Mount**: Files are available in SFTP server at `/home/openfn/data/excel-files/`
- **Cleanup**: Importer container is automatically removed after completion

### Files Imported
The following Excel files are automatically imported on `./swarm.sh init`:
- `DHIS2_HIV Indicators.xlsx` (79KB)
- `Direct Queries - Q1 2025 MoH Reports.xlsx` (4.2MB)
- `Q2FY25_DQ_253_sites.xlsx` (3.2MB)

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SFTP_IMAGE` | `atmoz/sftp:latest` | Docker image for SFTP server |
| `SFTP_USER` | `openfn` | SFTP username |
| `SFTP_PASSWORD` | `instant101` | SFTP password |
| `SFTP_PORT` | `2222` | External SFTP port |
| `SFTP_PLACEMENT` | `node-1` | Node placement constraint |

### Resource Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `SFTP_CPU_LIMIT` | `0` | CPU limit (0 = unlimited) |
| `SFTP_CPU_RESERVE` | `0` | CPU reservation |
| `SFTP_MEMORY_LIMIT` | `500M` | Memory limit |
| `SFTP_MEMORY_RESERVE` | `100M` | Memory reservation |

## File Structure

The SFTP server exposes files at:
- `/home/openfn/data/excel-files/` - Contains the Excel files from the local `data/` directory

## Integration with OpenFN

Once deployed, OpenFN workflows can access files via:
- Host: `sftp-server` (internal network) or `localhost:2222` (external)
- Username: `openfn`
- Password: `instant101`
- Path: `/data/excel-files/`

## Files Available

The following Excel files are available via SFTP:
- `DHIS2_HIV Indicators.xlsx`
- `Direct Queries - Q1 2025 MoH Reports.xlsx`
- `Q2FY25_DQ_253_sites.xlsx`
