#!/usr/bin/env node

/**
 * Google Sheets Connection Validation Script
 * 
 * This script validates the Google Sheets configuration and tests
 * the connection to ensure the OpenFn workflow will work correctly.
 */

const { google } = require('googleapis');
require('dotenv').config();

async function validateGoogleSheetsConnection() {
  console.log('🔍 Validating Google Sheets Configuration...\n');

  // Check environment variables
  const requiredEnvVars = [
    'GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_SHEETS_PRIVATE_KEY',
    'GOOGLE_SHEETS_PROJECT_ID',
    'GOOGLE_SHEETS_CLIENT_EMAIL',
    'GOOGLE_SHEETS_CLIENT_ID',
    'GOOGLE_SHEETS_SPREADSHEET_ID'
  ];

  console.log('✅ Checking environment variables...');
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    process.exit(1);
  }
  console.log('✅ All required environment variables are set\n');

  // Create credentials object
  const credentials = {
    type: 'service_account',
    project_id: process.env.GOOGLE_SHEETS_PROJECT_ID,
    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_SHEETS_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs'
  };

  try {
    // Create JWT client
    console.log('🔐 Creating authentication client...');
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    // Create Sheets API client
    const sheets = google.sheets({ version: 'v4', auth });
    console.log('✅ Authentication client created successfully\n');

    // Test connection by getting spreadsheet metadata
    console.log('📊 Testing connection to Google Sheets...');
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    const metadataResponse = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId
    });

    console.log('✅ Successfully connected to Google Sheets');
    console.log(`📋 Spreadsheet: "${metadataResponse.data.properties.title}"`);
    console.log(`🆔 Spreadsheet ID: ${spreadsheetId}`);
    
    // List available sheets
    console.log('\n📄 Available sheets:');
    metadataResponse.data.sheets.forEach((sheet, index) => {
      console.log(`   ${index + 1}. ${sheet.properties.title}`);
    });

    // Test data retrieval
    console.log('\n📊 Testing data retrieval...');
    const range = 'A1:F10'; // Test with first 10 rows
    
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: range,
      majorDimension: 'ROWS',
      valueRenderOption: 'UNFORMATTED_VALUE'
    });

    const rows = dataResponse.data.values || [];
    console.log(`✅ Retrieved ${rows.length} rows from range ${range}`);
    
    if (rows.length > 0) {
      console.log('\n📋 Sample data structure:');
      console.log('   Headers (if present):', rows[0]);
      if (rows.length > 1) {
        console.log('   First data row:', rows[1]);
      }
    }

    // Validate data structure
    console.log('\n🔍 Validating data structure...');
    if (rows.length < 2) {
      console.warn('⚠️  Warning: Spreadsheet appears to have no data rows');
    } else {
      const headers = rows[0];
      const dataRow = rows[1];
      
      console.log(`✅ Found ${headers.length} columns`);
      
      // Check for common indicator patterns
      const indicatorColumns = headers.map((header, index) => 
        header && header.toString().toLowerCase().includes('indicator') ? index : -1
      ).filter(index => index !== -1);
      
      const valueColumns = headers.map((header, index) => 
        header && (header.toString().toLowerCase().includes('value') || 
                  header.toString().toLowerCase().includes('count')) ? index : -1
      ).filter(index => index !== -1);

      if (indicatorColumns.length > 0) {
        console.log(`✅ Found potential indicator columns at positions: ${indicatorColumns}`);
      }
      
      if (valueColumns.length > 0) {
        console.log(`✅ Found potential value columns at positions: ${valueColumns}`);
      }

      // Check for numeric values
      const numericValues = dataRow.filter(cell => 
        cell !== null && cell !== undefined && !isNaN(parseFloat(cell))
      );
      
      if (numericValues.length > 0) {
        console.log(`✅ Found ${numericValues.length} numeric values in first data row`);
      } else {
        console.warn('⚠️  Warning: No numeric values found in first data row');
      }
    }

    console.log('\n🎉 Google Sheets validation completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Update the state files with correct column mappings');
    console.log('   2. Deploy the OpenFn workflow');
    console.log('   3. Test the complete pipeline');

  } catch (error) {
    console.error('\n❌ Validation failed:');
    console.error('Error:', error.message);
    
    if (error.code === 403) {
      console.error('\n💡 Troubleshooting tips:');
      console.error('   - Ensure the service account has access to the spreadsheet');
      console.error('   - Share the spreadsheet with the service account email');
      console.error('   - Check that Google Sheets API is enabled');
    } else if (error.code === 404) {
      console.error('\n💡 Troubleshooting tips:');
      console.error('   - Verify the spreadsheet ID is correct');
      console.error('   - Check the spreadsheet URL for the ID');
    } else if (error.message.includes('private_key')) {
      console.error('\n💡 Troubleshooting tips:');
      console.error('   - Check the private key format');
      console.error('   - Ensure newlines are properly escaped as \\n');
    }
    
    process.exit(1);
  }
}

// Handle command line execution
if (require.main === module) {
  validateGoogleSheetsConnection().catch(console.error);
}

module.exports = { validateGoogleSheetsConnection };
