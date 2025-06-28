#!/bin/bash

# Test SFTP connection to verify Excel files are accessible
echo "🔗 Testing SFTP connection to localhost:2225..."

# Create a temporary file with SFTP commands
cat > /tmp/sftp_commands << 'EOF'
ls
cd data
ls
cd excel-files
ls -la
pwd
quit
EOF

# Test SFTP connection
echo "📋 Testing SFTP with credentials openfn:instant101..."
sshpass -p "instant101" sftp -P 2225 -o StrictHostKeyChecking=no -b /tmp/sftp_commands openfn@localhost

echo "🧹 Cleaning up..."
rm -f /tmp/sftp_commands

echo "✅ SFTP test completed!"
