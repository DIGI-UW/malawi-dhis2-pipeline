# Nginx Reverse Proxy Package

This package provides secure reverse proxy configuration for the Instant OpenHIE v2 platform using nginx with SSL/TLS termination and subdomain routing.

## Overview

The reverse proxy is configured to route traffic to different services using subdomains:

- **dhis2.mwdhis2.info** - DHIS2 instance
- **openfn.mwdhis2.info** - OpenFN workflow engine
- **sftp.mwdhis2.info** - SFTP storage management UI
- **mwdhis2.info** - Main domain (redirects to DHIS2)

## Features

### Security
- **SSL/TLS Termination**: Automatic SSL certificate generation using Let's Encrypt
- **Security Headers**: Comprehensive security headers including HSTS, CSP, and XSS protection
- **Rate Limiting**: Different rate limits for API endpoints and authentication
- **Secure SSL Configuration**: Modern TLS protocols and cipher suites only

### Performance
- **HTTP/2 Support**: Enabled for all HTTPS connections
- **Gzip Compression**: Optimized for various content types
- **Proxy Buffering**: Configured for optimal performance
- **Connection Pooling**: Efficient upstream connection management

### Monitoring
- **Access Logs**: Detailed logging for all requests
- **Error Handling**: Graceful error pages and upstream failover
- **Health Checks**: Service availability monitoring

## Configuration

### Environment Variables

The following environment variables are configured in `package-metadata.json`:

```json
{
  "DOMAIN_NAME": "mwdhis2.info",
  "SUBDOMAINS": "openfn.mwdhis2.info,sftp.mwdhis2.info,dhis2.mwdhis2.info",
  "RENEWAL_EMAIL": "admin@mwdhis2.info",
  "STAGING": "true",
  "INSECURE": "false"
}
```

### Service-Specific Configuration

#### DHIS2 (`dhis2.mwdhis2.info`)
- **Upstream**: `dhis2:8080`
- **Features**: Extended timeouts for analytics, authentication rate limiting
- **Security**: Specific rate limits for auth endpoints

#### OpenFN (`openfn.mwdhis2.info`)
- **Upstream**: `openfn:3000`
- **Features**: WebSocket support for real-time updates
- **Security**: API endpoint rate limiting

#### SFTP Storage (`sftp.mwdhis2.info`)
- **Upstream**: `sftp-storage:80`
- **Features**: Large file upload support (100MB max)
- **Security**: Strict rate limiting for uploads, download controls

## Deployment

### Prerequisites

1. **DNS Configuration**: Ensure all subdomains point to your server's IP address:
   ```
   mwdhis2.info           A    <your-server-ip>
   dhis2.mwdhis2.info     A    <your-server-ip>
   openfn.mwdhis2.info    A    <your-server-ip>
   sftp.mwdhis2.info      A    <your-server-ip>
   ```

2. **Firewall Configuration**: Open ports 80 and 443:
   ```bash
   sudo ufw allow 80
   sudo ufw allow 443
   ```

### Deployment Steps

1. **Deploy the Stack**:
   ```bash
   ./instant package init reverse-proxy-nginx
   ```

2. **Check SSL Certificate Generation**:
   ```bash
   docker service logs reverse-proxy_reverse-proxy-nginx
   ```

3. **Verify Services**:
   ```bash
   # Check service status
   docker service ls
   
   # Test endpoints
   curl -I https://dhis2.mwdhis2.info
   curl -I https://openfn.mwdhis2.info
   curl -I https://sftp.mwdhis2.info
   ```

### SSL Certificate Management

#### Initial Setup
- Uses Let's Encrypt staging environment by default (`STAGING=true`)
- Generates certificates for main domain and all subdomains
- Certificates are automatically renewed

#### Production Certificates
To switch to production certificates:

1. Update configuration:
   ```bash
   # In package-metadata.json, set:
   "STAGING": "false"
   ```

2. Redeploy:
   ```bash
   ./instant package destroy reverse-proxy-nginx
   ./instant package init reverse-proxy-nginx
   ```

#### Manual Certificate Renewal
```bash
# Force certificate renewal
docker exec -it $(docker ps -qf "name=reverse-proxy_reverse-proxy-nginx") \
  certbot renew --force-renewal
```

## Troubleshooting

### Common Issues

#### Certificate Generation Fails
1. **Check DNS**: Ensure all subdomains resolve correctly
2. **Port Access**: Verify ports 80/443 are accessible from the internet
3. **Rate Limits**: Let's Encrypt has rate limits; wait if exceeded

#### Service Unavailable
1. **Check Upstream Services**: Ensure target services are running
2. **Network Connectivity**: Verify Docker network connectivity
3. **Logs**: Check nginx and service logs

#### SSL Errors
1. **Certificate Validation**: Check certificate chain and validity
2. **Clock Sync**: Ensure server time is synchronized
3. **Firewall**: Verify HTTPS traffic is allowed

### Debugging Commands

```bash
# Check nginx configuration
docker exec -it $(docker ps -qf "name=reverse-proxy_reverse-proxy-nginx") nginx -t

# View nginx logs
docker service logs reverse-proxy_reverse-proxy-nginx

# Check certificate details
echo | openssl s_client -connect dhis2.mwdhis2.info:443 2>/dev/null | openssl x509 -noout -text

# Test internal connectivity
docker exec -it $(docker ps -qf "name=reverse-proxy_reverse-proxy-nginx") \
  curl -I http://dhis2:8080
```

## Security Considerations

### Rate Limiting
- **General**: 10 requests/second
- **Authentication**: 5 requests/second
- **File Uploads**: 5 requests/second

### Headers
- **HSTS**: Enforced for all subdomains
- **CSP**: Content Security Policy
- **XSS Protection**: Enabled
- **Frame Options**: SAMEORIGIN

### Access Control
- **Unknown Hosts**: Blocked with 444 response
- **Default Server**: Catches undefined server names
- **SSL Only**: All HTTP traffic redirected to HTTPS

## Monitoring and Maintenance

### Log Locations
- **Access Logs**: `/var/log/nginx/access.log`
- **Error Logs**: `/var/log/nginx/error.log`
- **Service Logs**: `docker service logs reverse-proxy_reverse-proxy-nginx`

### Health Checks
- **Service Status**: Monitor docker service health
- **Certificate Expiry**: Monitor SSL certificate expiration
- **Upstream Availability**: Monitor backend service health

### Backup
- **Certificates**: Stored in Docker secrets
- **Configuration**: Version controlled in repository
- **Logs**: Consider log rotation and archival

## Advanced Configuration

### Custom Domains
To add additional domains:

1. Update `SUBDOMAINS` in `package-metadata.json`
2. Create corresponding nginx configuration files
3. Redeploy the service

### Custom SSL Certificates
To use custom certificates instead of Let's Encrypt:

1. Set `INSECURE=false` and provide certificate files
2. Update SSL configuration in nginx templates
3. Mount certificates as Docker secrets

### Load Balancing
For high availability:

1. Increase replica count in `docker-compose.yml`
2. Configure upstream load balancing
3. Implement health checks