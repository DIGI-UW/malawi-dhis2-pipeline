# OpenFn DRC Project

This project provides two ways to run the workflows: using OpenFn Lightning (web UI) or directly with the OpenFn CLI.

## Prerequisites

- Docker and Docker Compose
- Node.js and npm
- OpenFn CLI (`npm install -g @openfn/cli`)

## Method 1: Using OpenFn Lightning (Web UI)

### 1. Environment Setup

```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file to update the following variables:
# - YOUR_HOST_IP: Your machine's IP address
# - YOUR_OPENMRS_IP: Your OpenMRS server's IP address
# - YOUR_DHIS2_IP: Your DHIS2 server's IP address
```

### 2. Initial Setup

```bash
# Start the setup containers
docker compose -f docker-compose-db.yml -f docker-compose-setup-openfn.yml up

# Once setup exits with code 0, stop with CTRL+C
# Clean up setup containers
docker compose -f docker-compose-db.yml -f docker-compose-setup-openfn.yml down
```

### 3. Start Lightning

```bash
# Start the main application
docker compose -f docker-compose-db.yml -f docker-compose-start-openfn.yml up
```

### 4. Deploy the Project

```bash
# Set environment variables (replace YOUR_HOST_IP with your machine's IP address)
export OPENFN_ENDPOINT=http://YOUR_HOST_IP:4000
export OPENFN_API_KEY=apiKey

# Deploy the project
openfn deploy -c project.yaml
```

### 5. Access the UI

- URL: http://YOUR_HOST_IP:4000/ (replace YOUR_HOST_IP with your machine's IP address)
- Email: admin@example.org
- Password: openfnadminpassword

Note: After deployment, you'll need to enable collections for the workflows to work properly.

### 6. Cleanup

```bash
# Tear down all containers and volumes
docker compose -f docker-compose-db.yml -f docker-compose-setup-openfn.yml -f docker-compose-start-openfn.yml down -v
```

## Method 2: Using OpenFn CLI Directly

### 1. Create Required State Files

Create the following files with your configuration:

#### `workflows/state/generate-dhis2-payload.json`
```json
{
    "reportConfig": {
        "catAttrCombo": "HllvX50cXC0",
        "dataSet": "necyFYLlEI0",
        "period": "202504",
        "orgUnit": "drsiURo4DeK",
        "reportUuid": "27b977d2-02bf-4ef9-b512-9b9c495962b8",
        "startDate": "2025-05-01",
        "endDate": "2025-05-31",
        "hivStagesReportMapping": {
            "Rapport sur les stades 3 et 4 du VIH en RDC.Mâles": "IQTe97w6j5I",
            "Rapport sur les stades 3 et 4 du VIH en RDC.Femmes": "b31fxPyPHdZ",
            "Rapport sur les stades 3 et 4 du VIH en RDC.Tout": "XMQfwO0ODSr",
            "Rapport sur les stades 3 et 4 du VIH en RDC.Moins de 1 an": "Yz7m8AH66in",
            "Rapport sur les stades 3 et 4 du VIH en RDC.1 à 4 ans": "Ius3vNNYVKm",
            "Rapport sur les stades 3 et 4 du VIH en RDC.5 à 9 ans": "xNtnllzbIGc",
            "Rapport sur les stades 3 et 4 du VIH en RDC.10 à 14 ans": "rmBvQxaGg5f",
            "Rapport sur les stades 3 et 4 du VIH en RDC.15 à 19 ans": "hbNT17TWRYF",
            "Rapport sur les stades 3 et 4 du VIH en RDC.20 à 24 ans": "xgycWMkqpHn",
            "Rapport sur les stades 3 et 4 du VIH en RDC.25 à 49 ans": "IDkk0WXXMQn",
            "Rapport sur les stades 3 et 4 du VIH en RDC.50 ans et plus": "hehguNKaht5"
        }
    }
}
```

#### `workflows/state/get-report-data.json`
```json
{
    "reportUuid": "27b977d2-02bf-4ef9-b512-9b9c495962b8",
    "startDate": "2025-05-01",
    "endDate": "2025-05-31"
}
```

### 2. Create Credentials Files

#### `workflows/credentials/openmrs-credentials.state.json`
```json
{
    "fhirVersion": "2.3.0-SNAPSHOT",
    "instanceUrl": "http://YOUR_OPENMRS_IP/openmrs",
    "password": "Admin123",
    "username": "Admin"
}
```

#### `workflows/credentials/dhis2-credentials.state.json`
```json
{
    "apiUrl": "http://YOUR_DHIS2_IP:8089",
    "username": "admin",
    "password": "district"
}
```

### 3. Run the Workflow

```bash
openfn workflows/reports-data-upload-workflow/workflow.json -o output.json
```

## Notes

- Make sure to update the UUIDs and configuration values according to your DHIS2 instance
- Update the URLs and credentials in the state files to match your environment:
  - Replace `YOUR_HOST_IP` with your machine's IP address
  - Replace `YOUR_OPENMRS_IP` with your OpenMRS server's IP address
  - Replace `YOUR_DHIS2_IP` with your DHIS2 server's IP address
- The Openmrs and DHIS2 server URLS should be accessible from your machine, and Docker should be able to reach them