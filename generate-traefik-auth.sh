#!/bin/bash

# Generate htpasswd hash for Traefik dashboard authentication
# Usage: ./generate-traefik-auth.sh username password

if [ $# -ne 2 ]; then
    echo "Usage: $0 <username> <password>"
    echo "Example: $0 admin mypassword"
    exit 1
fi

USERNAME=$1
PASSWORD=$2

# Check if htpasswd is available
if ! command -v htpasswd &> /dev/null; then
    echo "htpasswd not found. Installing apache2-utils..."
    sudo apt-get update && sudo apt-get install -y apache2-utils
fi

# Generate the hash
HASH=$(htpasswd -nb "$USERNAME" "$PASSWORD")

echo "Generated hash for Traefik dashboard authentication:"
echo "USERNAME=$USERNAME"
echo "PASSWORD=$HASH"
echo ""
echo "Add these lines to your .env file:"
echo "USERNAME=$USERNAME"
echo "PASSWORD=$HASH"
