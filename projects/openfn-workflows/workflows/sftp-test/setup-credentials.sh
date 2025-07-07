#!/bin/bash

# Setup script for sftp-test workflow credentials
# Run this after deploying the workflow to configure the SFTP credential

echo "=== SFTP Test Workflow Credential Setup ==="
echo
echo "After deploying the sftp-test workflow, you need to configure the credential."
echo
echo "Option 1: Using OpenFN UI"
echo "1. Go to your OpenFN project"
echo "2. Navigate to Credentials"
echo "3. Find 'SFTP Test Server' (sftp-test-credential)"
echo "4. Edit and set the following values:"
echo "   - username: openfn"
echo "   - password: instant101"
echo "   - host: 172.17.0.1 (optional, handled in job)"
echo "   - port: 2225 (optional, handled in job)"
echo
echo "Option 2: Using OpenFN CLI (if supported)"
echo "openfn credential set sftp-test-credential \\"
echo "  --username openfn \\"
echo "  --password instant101"
echo
echo "Note: The workflow job initializes host/port with defaults,"
echo "so only username and password are required in the credential." 