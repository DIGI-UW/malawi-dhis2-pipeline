# Google Sheets Setup Guide

This guide walks you through setting up Google Sheets integration for the Malawi DHIS2 Indicators project.

## Prerequisites

- Google Cloud Platform account
- Google Sheets spreadsheet with HIV indicator data
- Access to create service accounts in Google Cloud

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID for later use

## Step 2: Enable Google Sheets API

1. In the Google Cloud Console, navigate to APIs & Services > Library
2. Search for "Google Sheets API"
3. Click on it and click "Enable"

## Step 3: Create a Service Account

1. Navigate to IAM & Admin > Service Accounts
2. Click "Create Service Account"
3. Provide a name (e.g., "malawi-dhis2-openfn")
4. Add description: "Service account for OpenFn access to Google Sheets"
5. Click "Create and Continue"
6. Skip role assignment for now (we'll set permissions at the sheet level)
7. Click "Done"

## Step 4: Generate Service Account Key

1. Click on the created service account
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Select JSON format
5. Download the key file and keep it secure

## Step 5: Extract Credentials from JSON Key

From the downloaded JSON file, extract these values for your `.env` file:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
  "client_id": "client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

## Step 6: Update Environment Variables

Add these variables to your `.env` file:

```bash
# Google Sheets API Configuration
GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----
GOOGLE_SHEETS_PROJECT_ID=your-google-cloud-project-id
GOOGLE_SHEETS_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_SHEETS_CLIENT_ID=your-client-id
GOOGLE_SHEETS_SPREADSHEET_ID=your-google-sheets-spreadsheet-id
```

## Step 7: Share Google Sheets with Service Account

1. Open your Google Sheets document
2. Click "Share" button
3. Add the service account email address (`client_email` from JSON)
4. Give it "Viewer" or "Editor" permissions as needed
5. Click "Send"

## Step 8: Prepare Your Google Sheets Data

Ensure your Google Sheets has the following structure:

| Indicator Name | Value | Period | Org Unit | Age Group | Gender |
|---------------|--------|---------|----------|-----------|---------|
| Number of adults and children who are currently receiving antiretroviral therapy (ART) | 1250 | 202312 | Site001 | 15+ | All |
| Number of adults and children newly enrolled on antiretroviral therapy (ART) | 85 | 202312 | Site001 | 15+ | All |

### Required Columns:
- **Indicator Name**: Text descriptions matching DHIS2 indicator names
- **Value**: Numeric values for each indicator

### Optional Columns:
- **Period**: Reporting period (format: YYYYMM)
- **Org Unit**: Organization unit code
- **Age Group**: Age categorization
- **Gender**: Gender categorization

## Step 9: Configure OpenFn State Files

Update the state files to match your Google Sheets structure:

### `state/get-googlesheets-data.json`:
```json
{
  "googleSheetsConfig": {
    "spreadsheetId": "your-spreadsheet-id",
    "range": "Sheet1!A:F",
    "majorDimension": "ROWS",
    "valueRenderOption": "UNFORMATTED_VALUE"
  },
  "dataStructure": {
    "indicatorNameColumn": 0,
    "valueColumn": 1,
    "periodColumn": 2,
    "orgUnitColumn": 3,
    "ageGroupColumn": 4,
    "genderColumn": 5
  }
}
```

## Step 10: Test the Connection

1. Deploy your OpenFn workflow
2. Run the `get-googlesheets-data` job
3. Check the logs to ensure successful data retrieval
4. Verify the data structure matches expectations

## Troubleshooting

### Permission Errors
- Ensure the service account has access to the Google Sheets document
- Check that the Google Sheets API is enabled
- Verify the service account key is valid

### Data Retrieval Issues
- Check the spreadsheet ID in the URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
- Verify the range notation (e.g., "Sheet1!A:F")
- Ensure column mappings match your data structure

### Authentication Errors
- Verify the private key format includes proper line breaks (`\n`)
- Check that all required environment variables are set
- Ensure the project ID matches your Google Cloud project

## Security Best Practices

1. **Rotate Keys Regularly**: Create new service account keys periodically
2. **Limit Permissions**: Give the service account only necessary access
3. **Monitor Usage**: Review API usage in Google Cloud Console
4. **Secure Storage**: Store credentials securely and never commit them to version control
5. **Use Dedicated Service Accounts**: Create separate service accounts for different environments (dev, staging, prod)

## Data Structure Guidelines

### Indicator Names
- Use consistent naming that matches DHIS2 data elements
- Consider using indicator codes if names are too long
- Implement both exact and partial matching for flexibility

### Data Validation
- Ensure numeric values are properly formatted
- Handle missing or null values appropriately
- Implement data type validation in your workflow

### Performance Optimization
- Use specific ranges instead of entire sheets when possible
- Consider pagination for large datasets
- Implement caching for frequently accessed data
