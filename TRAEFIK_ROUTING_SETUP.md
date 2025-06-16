# Traefik Subdomain Routing Configuration

## Overview

This document explains the Traefik configuration changes made to enable subdomain-based routing for your `mwdhis2.info` domain in the Docker Swarm setup.

## Changes Made

### 1. Traefik Configuration Fixes (`packages/reverse-proxy-traefik/docker-compose.yml`)

Fixed entry point naming inconsistencies:
- Changed `--entryPoints.websecure.address=:443` to `--entrypoints.websecure.address=:443`
- Updated router entry point references from `http` to `web` and `websecure`

### 2. DHIS2 Service Configuration (`packages/dhis2-instance/docker-compose.yml`)

Added Traefik labels to route DHIS2 on the root domain:
- **Root Domain**: `mwdhis2.info` and `www.mwdhis2.info`
- **HTTPS**: Automatic SSL certificate generation via Let's Encrypt
- **HTTP Redirect**: Automatically redirects HTTP to HTTPS
- **Network**: Added to `traefik` network for routing

### 3. OpenFN Service Configuration (`packages/openfn/docker-compose.yml`)

Added Traefik labels to route OpenFN on subdomain:
- **Subdomain**: `openfn.mwdhis2.info`
- **HTTPS**: Automatic SSL certificate generation via Let's Encrypt
- **HTTP Redirect**: Automatically redirects HTTP to HTTPS
- **Network**: Added to `traefik` network for routing

## Required Environment Variables

Add these variables to your `.env` file for Traefik configuration:

```bash
# Traefik Configuration
DOMAIN_NAME=mwdhis2.info
ACME_EMAIL=your-email@example.com
TLS_CHALLENGE=true
CA_SERVER=https://acme-v02.api.letsencrypt.org/directory
CERT_RESOLVER=le
TLS=true
REDIRECT_TO_HTTPS=true
ENABLE_TRAEFIK_DASHBOARD=true
LOG_LEVEL=INFO
INSECURE_SKIP_VERIFY=false
PLACEMENT_ROLE_CONSTRAINTS=manager

# Traefik Dashboard Authentication (automatically generated during deployment)
USERNAME=admin
TRAEFIK_PASSWORD=your_secure_password_here
# PASSWORD will be auto-generated from TRAEFIK_PASSWORD during deployment
```

## DNS Configuration Required

Set up these DNS A records pointing to your server IP:

```
mwdhis2.info           → YOUR_SERVER_IP
www.mwdhis2.info       → YOUR_SERVER_IP
openfn.mwdhis2.info    → YOUR_SERVER_IP
traefik.mwdhis2.info   → YOUR_SERVER_IP
```

## Service Access URLs

After deployment, your services will be accessible at:

- **DHIS2**: `https://mwdhis2.info` or `https://www.mwdhis2.info`
- **OpenFN**: `https://openfn.mwdhis2.info`
- **Traefik Dashboard**: `https://traefik.mwdhis2.info`
- **SFTP**: `sftp://mwdhis2.info:22` (port 22, no HTTP routing needed)

## Adding New Services

To add subdomain routing for additional services, add these labels to the service's `deploy` section:

```yaml
deploy:
  labels:
    # Enable Traefik
    - traefik.enable=true
    
    # HTTPS router
    - traefik.http.routers.{service-name}.rule=Host(`{subdomain}.mwdhis2.info`)
    - traefik.http.routers.{service-name}.entrypoints=websecure
    - traefik.http.routers.{service-name}.tls=true
    - traefik.http.routers.{service-name}.tls.certresolver=le
    - traefik.http.services.{service-name}.loadbalancer.server.port={service-port}
    
    # HTTP to HTTPS redirect
    - traefik.http.routers.{service-name}-http.rule=Host(`{subdomain}.mwdhis2.info`)
    - traefik.http.routers.{service-name}-http.entrypoints=web
    - traefik.http.routers.{service-name}-http.middlewares=to-https
    
    # Optional: Apply large file middleware
    - traefik.http.routers.{service-name}.middlewares=bigfiles
```

And ensure the service is on the traefik network:

```yaml
networks:
  - traefik

networks:
  traefik:
    name: reverse-proxy-traefik_public
    external: true
```

## Security Features

- **Automatic HTTPS**: Let's Encrypt certificates are automatically generated and renewed
- **HTTP Redirect**: All HTTP traffic is automatically redirected to HTTPS
- **Large File Support**: Configured to handle uploads up to 100MB
- **Basic Auth**: Traefik dashboard is protected with basic authentication
- **Timeouts**: Configured with appropriate forwarding timeouts for reliability

## Authentication Setup

The Traefik dashboard authentication is now handled automatically during deployment. The `swarm.sh` script will:

1. Use the `USERNAME` from your environment variables (defaults to "admin")
2. Use the `TRAEFIK_PASSWORD` from your environment variables (defaults to "changeme123")
3. Automatically generate a bcrypt hash of the password
4. Export the hashed `PASSWORD` variable for Docker Compose

### Manual Authentication Generation

If you need to generate authentication manually, you can still use the helper script:

```bash
./generate-traefik-auth.sh admin your_secure_password
```

This will output the properly formatted `USERNAME` and `PASSWORD` variables for your `.env` file.

## Deployment Order

1. Ensure DNS records are configured
2. Update environment variables
3. Deploy Traefik reverse proxy first
4. Deploy other services (DHIS2, OpenFN, etc.)

## Troubleshooting

- Check Traefik logs: `docker service logs reverse-proxy-traefik_reverse-proxy-traefik`
- Verify DNS resolution: `nslookup mwdhis2.info`
- Check service discovery: Visit Traefik dashboard at `https://traefik.mwdhis2.info`
- Ensure all services are on the correct networks
- Verify Let's Encrypt rate limits if certificate generation fails
