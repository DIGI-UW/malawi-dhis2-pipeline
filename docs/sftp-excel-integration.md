# SFTP Excel Data Integration

This document describes the SFTP Excel data integration for the Malawi DHIS2 Indicators project.

## Overview

The project now supports two data sources for the OpenFN workflow:
1. **Google Sheets** (original) - Real-time data from Google Sheets
2. **SFTP Excel Files** (new) - Excel files stored on an SFTP server

## Architecture

```
Excel Files (SFTP) ────→ get-sftp-data.js ────→ process-excel-data.js ────┐
                                                                            │
Google Sheets ─────────→ get-googlesheets-data.js ─────────────────────────┤
                                                                            │
                                                                            ▼
                                                                generate-dhis2-payload.js ────→ upload-to-dhis2.js
```

## Components

### 1. SFTP Storage Package (`packages/sftp-storage/`)

- **Purpose**: Provides SFTP server for hosting Excel files
- **Image**: `atmoz/sftp:latest`
- **Network**: `sftp-storage_sftp`
- **Data Path**: `/home/openfn/data/excel-files/`
- **Access**: 
  - Host: `sftp-server` (internal) or `localhost:2222` (external)
  - Username: `openfn`
  - Password: `instant101`

### 2. OpenFN Jobs

#### `get-sftp-data.js`
- **Adaptor**: `@openfn/language-sftp@1.0.0`
- **Purpose**: Downloads Excel files from SFTP server
- **Input**: SFTP connection parameters
- **Output**: Downloaded file paths in state

#### `process-excel-data.js`
- **Adaptor**: `@openfn/language-common@2.4.0`
- **Purpose**: Parses Excel files and transforms to Google Sheets format
- **Input**: Downloaded Excel file paths
- **Output**: Transformed data compatible with existing workflow

#### `generate-dhis2-payload.js` (updated)
- **Purpose**: Handles data from both Google Sheets and SFTP sources
- **Input**: Either Google Sheets data or processed Excel data
- **Output**: DHIS2 dataValueSets payload

### 3. Workflow Configuration

The workflow now has two trigger paths:

1. **Google Sheets Path**:
   ```
   webhook → Get-GoogleSheets-Data → Generate-DHIS2-Payload → Upload-To-DHIS2
   ```

2. **SFTP Excel Path**:
   ```
   sftp-webhook → Get-SFTP-Data → Process-Excel-Data → Generate-DHIS2-Payload → Upload-To-DHIS2
   ```

## Supported Excel Files

The system processes these Excel files from the SFTP server:

1. **`DHIS2_HIV Indicators.xlsx`**
   - Contains HIV indicator data
   - Mapped to DHIS2 data elements

2. **`Direct Queries - Q1 2025 MoH Reports.xlsx`**
   - Contains direct query results from health facilities
   - Processed into DHIS2 format

## Environment Variables

### SFTP Storage Package
```bash
SFTP_IMAGE=atmoz/sftp:latest
SFTP_USER=openfn
SFTP_PASSWORD=instant101
SFTP_PORT=2222
SFTP_PLACEMENT=node-1
```

### OpenFN Workflow
```bash
SFTP_HOST=sftp-server
SFTP_PORT=22
SFTP_USER=openfn
SFTP_PASSWORD=instant101
```

## Deployment

### 1. Deploy SFTP Storage
```bash
cd packages/sftp-storage
./swarm.sh init
```

### 2. Deploy OpenFN Workflow
```bash
cd packages/openfn
./swarm.sh init
```

### 3. Test Integration
```bash
./test-sftp-integration.sh
```

## Usage

### Triggering SFTP Workflow

1. **Via Webhook**:
   ```bash
   curl -X POST http://localhost:4000/webhooks/sftp-webhook \
        -H 'Content-Type: application/json' \
        -d '{}'
   ```

2. **Via OpenFN Lightning UI**:
   - Navigate to `http://localhost:4000`
   - Go to Workflows → HIV-Indicators-GoogleSheets-to-DHIS2-Workflow
   - Trigger the `sftp-webhook` trigger

### Adding New Excel Files

1. Copy Excel files to SFTP storage:
   ```bash
   cp your-file.xlsx packages/sftp-storage/data/
   ```

2. Update `get-sftp-data.js` to include the new file:
   ```javascript
   const excelFiles = [
     'DHIS2_HIV Indicators.xlsx',
     'Direct Queries - Q1 2025 MoH Reports.xlsx',
     'your-file.xlsx'  // Add new file here
   ];
   ```

3. Update `process-excel-data.js` to handle the new file format if needed.

## Data Flow

1. **SFTP Data Retrieval**:
   - `get-sftp-data.js` connects to SFTP server
   - Downloads specified Excel files to `/tmp/`
   - Stores file paths in workflow state

2. **Excel Processing**:
   - `process-excel-data.js` parses downloaded Excel files
   - Transforms data to Google Sheets-compatible format
   - Stores processed data in workflow state

3. **DHIS2 Payload Generation**:
   - `generate-dhis2-payload.js` detects data source (Google Sheets or Excel)
   - Applies indicator mappings to generate DHIS2 dataValueSets
   - Prepares payload for DHIS2 upload

4. **DHIS2 Upload**:
   - `upload-to-dhis2.js` sends payload to DHIS2 instance
   - Returns success/failure status

## Monitoring

### SFTP Server Logs
```bash
docker service logs sftp-storage_sftp-server
```

### OpenFN Workflow Logs
```bash
docker service logs openfn_openfn_workflow_config
```

### File Listing
```bash
docker exec -it $(docker ps -qf 'label=com.docker.swarm.service.name=sftp-storage_sftp-server') \
  ls -la /home/openfn/data/excel-files/
```

## Troubleshooting

### SFTP Connection Issues
1. Check if SFTP service is running:
   ```bash
   docker service ls | grep sftp
   ```

2. Test SFTP connection:
   ```bash
   sftp -P 2222 openfn@localhost
   # Password: instant101
   ```

### Excel Processing Issues
1. Check file formats are supported (.xlsx)
2. Verify file structure matches expected format
3. Check OpenFN logs for parsing errors

### Network Issues
1. Ensure SFTP and OpenFN services are on same network
2. Check network connectivity:
   ```bash
   docker network ls | grep sftp
   ```

## Future Enhancements

1. **Real Excel Parsing**: Integrate actual Excel parsing library (e.g., `xlsx-js`)
2. **File Validation**: Add validation for Excel file structure
3. **Automated File Detection**: Monitor SFTP directory for new files
4. **Error Handling**: Enhanced error handling and retry logic
5. **Data Transformation**: More sophisticated data mapping capabilities
