# Malawi DHIS2 HIV/TB Indicators Importer 

## Overview
This project extracts key HIV/TB indicators from Google Sheets, transforms them into the DHIS2 `dataValueSets` format, and loads them into a DHIS2 instance via the DHIS2 Web API. The process is implemented as OpenFn workflows using an example Google Sheets to DHIS2 pipeline.

1. **Data Extraction**: `get-googlesheets-data.js` connects to Google Sheets using the Google Sheets API to fetch HIV indicator data for specified reporting periods and organizational units.
2. **Payload Generation**: `generate-dhis2-payload.js` maps extracted values to DHIS2 Data Element UIDs (configured in `state/generate-dhis2-payload.json`), building the `dataValueSets` payload with support for exact and partial indicator name matching.
3. **Upload**: `upload-to-dhis2.js` posts the payload to the DHIS2 `/dataValueSets` endpoint with enhanced logging and error handling. DHIS2 Indicator Project

Configuration is managed through:
- `state/get-googlesheets-data.json`: Google Sheets access configuration, data structure definitions, and processing options
- `state/generate-dhis2-payload.json`: DHIS2 indicator mappings and transformation rules

## Running the Workflow (Docker Swarm Mode)

This project is designed to be deployed using Docker Swarm.

1.  **Environment Setup**:
    *   Copy the example environment file: `cp .env.example .env`
    *   Edit the `.env` file to update necessary variables (e.g., `YOUR_HOST_IP`, DHIS2 credentials and URLs, Google Sheets service account credentials, OpenFn settings). Ensure all variables referenced in the main `docker-compose.yml` are set.

2.  **Initialize Docker Swarm** (if not already initialized):
    ```bash
    docker swarm init
    ```

3. **Configure OpenFN**:
  Set the following in the `.env` file:
        - OPENFN_ENDPOINT: The URL where OpenFn will be accessible (e.g., `http://YOUR_HOST_IP:4000`)
        - OPENFN_API_KEY: The API key for OpenFn, which you can set in the OpenFn UI after initial deployment.

        export OPENFN_ENDPOINT=http://YOUR_HOST_IP:4000 
        export OPENFN_API_KEY=your_openfn_api_key # Use the API key set in your .env for OPENFN_API_KEY
        ```
4. **Bring up the packages using Instant OpenHIE**:
    ```bash
    ./get-cli.sh linux latest
    ./build-image.sh
    ./instant project init --env-file .env -dev
    ```

5.  **Access the OpenFn UI**:
    *   URL: `http://YOUR_HOST_IP:4000` (or the appropriate address where OpenFn is exposed)
    *   Default Email (from setup): The email you configured via `OPENFN_ADMIN_EMAIL` in your `.env` file.
    *   Default Password (from setup): The password you configured via `OPENFN_ADMIN_PASSWORD` in your `.env` file.
    *   After deployment, you might need to enable collections or verify trigger configurations in the OpenFn UI.

6.  **Monitor and Verify**:
    *   Check service logs: \
        ```bash
        docker service ls
        docker service logs <dhis2_service_name>
        ```


## Extending for New Indicators
1.  Add new indicator mappings in `packages/openfn/importer/workflows/state/generate-dhis2-payload.json` to map Google Sheets indicator names to DHIS2 Data Element UIDs.
2.  Update Google Sheets configuration in `packages/openfn/importer/workflows/state/get-googlesheets-data.json` if new data structure or filtering is needed.
3.  Update `packages/openfn/importer/workflows/reports-data-upload-workflow/project.yaml` if new jobs are added or existing ones modified.
4.  Redeploy the OpenFn project:
    ```bash
    cd packages/openfn/importer/workflows/reports-data-upload-workflow/
    openfn deploy -c project.yaml
    ```
5.  Run the workflow and verify payload in DHIS2.

## Google Sheets Setup and Validation

Before deploying the workflow, you need to set up Google Sheets integration:

### 1. Google Sheets Configuration
Follow the detailed setup guide in `docs/google-sheets-setup.md` to:
- Create a Google Cloud project and enable Google Sheets API
- Create a service account and download credentials
- Configure environment variables in `.env`
- Share your Google Sheets with the service account

### 2. Validate Google Sheets Connection
Before deploying, test your Google Sheets configuration:

```bash
# Install dependencies
npm install

# Run validation script
npm run validate-sheets
```

This script will:
- Verify all required environment variables are set
- Test authentication with Google Sheets API
- Retrieve sample data to validate structure
- Provide troubleshooting guidance if issues are found

### 3. Required Google Sheets Structure
Your spreadsheet should have columns for:
- **Indicator Name**: Text descriptions of HIV indicators
- **Value**: Numeric values for each indicator
- **Period**: Reporting period (optional)
- **Org Unit**: Organization unit identifier (optional)
- **Age Group**: Age categorization (optional)
- **Gender**: Gender categorization (optional)

Example:
| Indicator Name | Value | Period | Org Unit |
|---------------|-------|---------|----------|
| Number of adults and children currently receiving ART | 1250 | 202312 | Site001 |

## Prerequisites

- Docker and Docker Compose (Docker Swarm mode enabled)
- Node.js and npm (for OpenFn CLI usage and validation scripts)
- OpenFn CLI (`npm install -g @openfn/cli`)
- Google Cloud Platform account with Google Sheets API access
- Google Sheets spreadsheet with properly formatted HIV indicator data

## Method 1: Using OpenFn Lightning (Web UI) 
### This section needs to be updated to align with the Docker Swarm deployment. The primary method is now via `docker stack deploy`.

## Method 2: Using OpenFn CLI Directly (for workflow execution, not initial deployment)

This method can be used for local testing or direct execution of a defined workflow if the OpenFn instance is already running and configured.

### 1. Ensure State and Credentials Files are Correct
The necessary state and credential files are now located within the `packages/openfn/importer/workflows/` directory structure.
- `packages/openfn/importer/workflows/state/generate-dhis2-payload.json`
- `packages/openfn/importer/workflows/state/get-googlesheets-data.json`

Credentials should be configured within the OpenFn instance itself during the setup phase (handled by the `openfn-setup` service in Docker Swarm). Google Sheets credentials require a service account with appropriate permissions to access the target spreadsheet.

The `project.yaml` references credentials like `admin@example.org-GoogleSheets` and `admin@example.org-DHIS2`. These must exist in the target OpenFn instance.

### 2. Run the Workflow via CLI (against a running OpenFn instance)

If you have deployed the stack and the OpenFn project, you can trigger workflows via the UI or API.
To run a specific workflow defined in a local JSON file (e.g., `workflow.json` from the `project.yaml` definition) directly using the CLI for testing (this bypasses the OpenFn server's scheduling/triggering but executes jobs through its adaptors if configured):

```bash
# Navigate to the workflow definition directory
cd packages/openfn/importer/workflows/reports-data-upload-workflow/

# Ensure OPENFN_ENDPOINT and OPENFN_API_KEY are set if your jobs need to communicate
# with the OpenFn instance for things like state or logging.
# The command below assumes workflow.json is a valid OpenFn workflow definition.
# You might need to extract/generate this from your project.yaml or have it separately.
# openfn /path/to/your/workflow.json -o output.json --adaptors=@openfn/language-googlesheets,@openfn/language-common,@openfn/language-dhis2

# Note: The direct CLI execution of a full project.yaml is usually for deployment.
# Individual workflow execution via CLI often points to a specific workflow.json file.
# The project.yaml defines how to deploy the workflow TO an OpenFn server.
```
The `openfn deploy` command is the standard way to get the project onto the server.

## Notes

- Make sure to update the UUIDs and configuration values in `packages/openfn/importer/workflows/state/` files according to your DHIS2 instance.
- Update all necessary environment variables in your `.env` file.
- The Google Sheets API should be accessible from the Docker containers, and proper service account credentials should be configured.

## Documentation

- **[Google Sheets Setup Guide](docs/google-sheets-setup.md)**: Comprehensive guide for setting up Google Sheets integration
- **[Testing Guide](docs/testing-guide.md)**: Complete testing procedures for the Google Sheets to DHIS2 pipeline
- **[Migration Guide](docs/migration-guide.md)**: Documentation of the migration from PostgreSQL to Google Sheets approach

## Quick Start

1. **Setup Google Sheets**: Follow `docs/google-sheets-setup.md`
2. **Configure Environment**: Update `.env` file with Google Sheets credentials
3. **Validate Connection**: Run `npm run validate-sheets`
4. **Deploy Stack**: `docker stack deploy -c docker-compose.yml malawi_dhis2_stack`
5. **Deploy Workflow**: `openfn deploy -c project.yaml`
6. **Test Pipeline**: Follow procedures in `docs/testing-guide.md`