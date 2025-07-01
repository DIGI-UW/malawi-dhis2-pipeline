# SFTP Storage Package

This package provides an SFTP server with a web-based UI for storing and accessing Excel data files in the OpenFN workflow.

## Overview

The SFTP storage package deploys:
- **SFTP Server**: Secure file access via SFTP protocol  
- **Web UI (Filebrowser)**: Browse and download files via web interface
- **Automatic Data Import**: Uses Docker configs to import Excel files on initialization
- **Demo-friendly**: Web UI makes it easy to view files during demonstrations
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
| `SFTP_WEB_PORT` | `8090` | External web UI port (Filebrowser) |
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

### SFTP Access
OpenFN workflows can access files via:
- Host: `sftp-server` (internal network) or `localhost:2222` (external)
- Username: `openfn`
- Password: `instant101`
- Path: `/data/excel-files/`

### Web UI Access (FileGator)
A modern, feature-rich file manager is available for easy file viewing and management:
- URL: `http://localhost:8090` (configurable via `SFTP_WEB_PORT`)
- **Guest Access**: Enabled with read/download permissions
- **Admin Access**: Login with `admin/admin123` for full management
- Features:
  - Modern single-page application built with Vue.js
  - Multi-user support with roles and permissions
  - Browse and download SFTP files through web interface
  - Search functionality across files and folders
  - File preview for images and documents
  - Chunked uploads for large files (if write enabled)
  - Mobile-friendly responsive design
  - Dark mode support

## Files Available

The following Excel files are available via SFTP:
- `DHIS2_HIV Indicators.xlsx`
- `Direct Queries - Q1 2025 MoH Reports.xlsx`
- `Q2FY25_DQ_253_sites.xlsx`
