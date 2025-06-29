# Nginx Reverse Proxy Updates Summary

## Overview

The nginx reverse proxy package has been updated to provide secure, production-ready subdomain routing for the Instant OpenHIE platform on mwdhis2.info. The updates focus on security, performance, and maintainability.

## Key Improvements

### 1. Enhanced Security Configuration

#### SSL/TLS Security
- **Modern TLS protocols**: Only TLS 1.2 and 1.3 are allowed
- **Strong cipher suites**: ECDHE and DHE ciphers with AES-256-GCM
- **Security headers**: Comprehensive security headers including:
  - HSTS with includeSubDomains and preload
  - X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
  - Referrer-Policy for privacy protection

#### Access Control
- **Default server block**: Unknown hosts are blocked with 444 response
- **Specific server names**: No wildcards, each service has explicit subdomain
- **Rate limiting**: Different limits for general traffic, API, and authentication

### 2. Subdomain Configuration

#### Before (Wildcards)
```nginx
server_name dhis2.*;
server_name openfn.*;
server_name sftp.*;
```

#### After (Specific Domains)
```nginx
server_name dhis2.mwdhis2.info;
server_name openfn.mwdhis2.info;
server_name sftp.mwdhis2.info;
```

### 3. Service-Specific Optimizations

#### DHIS2 (dhis2.mwdhis2.info)
- **Extended timeouts**: 600 seconds for analytics queries
- **Authentication rate limiting**: Separate limits for `/api/auth/` endpoints
- **DHIS2-specific headers**: X-Forwarded-Server, X-Original-URI

#### OpenFN (openfn.mwdhis2.info)
- **WebSocket support**: For real-time workflow updates
- **API rate limiting**: Separate limits for `/api/` endpoints
- **HTTP/1.1 upgrade support**: Connection upgrade headers

#### SFTP Storage (sftp.mwdhis2.info)
- **Large file uploads**: 100MB client_max_body_size
- **Upload rate limiting**: Strict limits for upload endpoints
- **Security headers**: Additional download protection headers

### 4. SSL Certificate Management

#### Improved Certificate Generation
- **Proper subdomain handling**: Each subdomain gets individual -d argument
- **Better error handling**: Enhanced logging and debugging
- **Staging support**: Let's Encrypt staging for testing

#### Certificate Script Updates
```bash
# Before
DOMAIN_ARGS=(-d "${DOMAIN_NAME},${SUBDOMAINS}")

# After
DOMAIN_ARGS=(-d "${DOMAIN_NAME}")
for subdomain in "${SUBDOMAIN_ARRAY[@]}"; do
    DOMAIN_ARGS+=(-d "$subdomain")
done
```

### 5. Performance Enhancements

- **HTTP/2**: Enabled for all HTTPS connections
- **Gzip compression**: Optimized for multiple content types
- **Proxy buffering**: 4k buffer size with 8 buffers
- **Connection management**: Proper timeout values (300s instead of 99999s)

### 6. Rate Limiting Strategy

```nginx
# General traffic: 10 req/s
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;

# Authentication: 5 req/s  
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;
```

## Files Updated

### Configuration Files
1. **`config/nginx-temp-secure.conf`**
   - Enhanced security headers
   - Better SSL configuration
   - Rate limiting zones
   - Default server block

2. **`package-conf-secure/http-dhis2-secure.conf`**
   - Specific subdomain (dhis2.mwdhis2.info)
   - Extended timeouts for analytics
   - Authentication rate limiting

3. **`package-conf-secure/http-openfn-secure.conf`**
   - Specific subdomain (openfn.mwdhis2.info)
   - WebSocket support
   - API endpoint rate limiting

4. **`package-conf-secure/http-sftp-secure.conf`**
   - Specific subdomain (sftp.mwdhis2.info)
   - Large file upload support
   - Upload/download rate limiting

### Scripts
5. **`set-secure-mode.sh`**
   - Improved certificate generation logic
   - Proper subdomain handling
   - Better error handling

### Documentation
6. **`README.md`** (new)
   - Comprehensive deployment guide
   - Troubleshooting section
   - Security considerations
   - Monitoring guidelines

7. **`deploy-secure.sh`** (new)
   - Automated deployment script
   - DNS verification
   - Firewall configuration
   - Health checks

## Deployment Process

### 1. DNS Configuration Required
```
mwdhis2.info           A    <server-ip>
dhis2.mwdhis2.info     A    <server-ip>
openfn.mwdhis2.info    A    <server-ip>
sftp.mwdhis2.info      A    <server-ip>
```

### 2. Quick Deployment
```bash
# Using the new deployment script
cd packages/reverse-proxy-nginx
sudo ./deploy-secure.sh

# Or manual deployment
./instant package init reverse-proxy-nginx
```

### 3. Verification
```bash
# Test all endpoints
curl -I https://dhis2.mwdhis2.info
curl -I https://openfn.mwdhis2.info
curl -I https://sftp.mwdhis2.info

# Check SSL configuration
echo | openssl s_client -connect dhis2.mwdhis2.info:443 2>/dev/null | openssl x509 -noout -text
```

## Security Benefits

1. **No Wildcard Certificates**: Each subdomain is explicitly configured
2. **HSTS Preload**: Maximum protection against downgrade attacks
3. **Rate Limiting**: Protection against DoS and brute force attacks
4. **Modern TLS**: Only secure protocols and ciphers
5. **Security Headers**: Comprehensive protection against XSS, clickjacking
6. **Unknown Host Blocking**: Invalid requests are dropped immediately

## Production Readiness

### Monitoring
- Service health checks
- Certificate expiry monitoring
- Rate limit monitoring
- Upstream service health

### Backup and Recovery
- Configuration version controlled
- Certificates stored in Docker secrets
- Automated certificate renewal

### Scalability
- Ready for multiple nginx replicas
- Load balancing configuration
- Resource limits configured

## Next Steps

1. **DNS Configuration**: Ensure all subdomains point to the server
2. **Production Certificates**: Set `STAGING=false` when ready
3. **Monitoring Setup**: Implement health checks and alerting
4. **Load Testing**: Verify rate limiting and performance
5. **Security Audit**: Regular security assessment

## Troubleshooting

Common issues and solutions are documented in the README.md file. Key areas to check:

1. DNS resolution
2. Port accessibility (80/443)
3. Certificate generation logs
4. Service connectivity
5. Firewall configuration

The deployment script (`deploy-secure.sh`) automates most of these checks and provides guided troubleshooting.