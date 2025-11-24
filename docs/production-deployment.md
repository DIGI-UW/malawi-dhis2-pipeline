# Production Deployment Guide

**Based on Analysis Report (Nov 2025)**

## 1. Deployment Prerequisites

### Git Submodules
Ensure all submodules are initialized and updated:
```bash
git submodule update --init --recursive
```

### Environment Variables
Create a production `.env` file based on `.env.example`. Ensure strict security for credentials:
- `SFTP_PASSWORD`: Use a strong, unique password.
- `DHIS2_ADMIN_PASSWORD`: Change from default.
- `OPENFN_ADMIN_PASSWORD`: Change from default.
- `POSTGRES_PASSWORD`: Change from default.

### Hardware Requirements
- **RAM**: Minimum 8GB (DHIS2 requires ~4GB, OpenFN ~2GB).
- **Storage**: SSD recommended for database performance.
- **Network**: Internal Docker network for service communication; exposed ports only for Nginx (80/443) and SFTP (2225).

## 2. Deployment Steps

### Option A: Automated Deployment (Recommended)
Use the `mk.sh` script which handles environment validation, initialization, and deployment.

```bash
./mk.sh
```

### Option B: Manual Deployment via Instant CLI
1. Initialize the project:
   ```bash
   ./instant project init --env-file .env
   ```
2. Deploy packages sequentially to ensure dependency order:
   ```bash
   ./instant package init -n database-postgres -d
   ./instant package init -n reverse-proxy-nginx -d
   ./instant package init -n dhis2-instance -d
   # Wait for DHIS2 to start (check logs)
   ./instant package init -n sftp-storage -d
   ./instant package init -n openfn -d
   ```

## 3. Post-Deployment Configuration

### Security
1. **SSL/TLS**: Configure Nginx with valid SSL certificates.
2. **Firewall**: Restrict access to port 2225 (SFTP) to known IP ranges if possible.
3. **Secrets**: Verify that Docker secrets are being used for sensitive environment variables.

### Monitoring & Logging
*Current Status: Basic Docker logging only.*

**Recommended Setup:**
1. **Service Logs**: Monitor using `docker service logs -f <service_name>`.
2. **Health Checks**:
   - OpenFN: `http://localhost:4000/health`
   - DHIS2: `http://localhost:8080/api/system/info`
3. **Alerting**: Setup external monitoring (e.g., UptimeRobot, Prometheus) to ping health endpoints.

### Backup Strategy
1. **Database**:
   - Automated daily dumps of PostgreSQL (`postgres` and `lightning_dev` databases).
   - Script: `volume-backup.sh` (ensure this is configured and scheduled via cron).
2. **SFTP Data**:
   - Backup the `sftp-storage` volume content regularly.
3. **Configuration**:
   - Version control `project.yaml` and job files.
   - Backup `.env` (securely).

## 4. Troubleshooting Production Issues

### Services Not Starting
- Check `docker service ls` for replica counts (0/1 indicates failure).
- Inspect logs: `docker service logs --tail 100 <service_name>`.
- Check resource limits: Ensure Docker has enough memory allocated.

### Integration User Issues
- If data uploads fail, verify the `openfn_integration` user exists in DHIS2 and has:
  - `ALL` authority (or sufficient write permissions).
  - Assignment to all relevant Organization Units.

### Workflow Failures
- Check OpenFN UI "Activity" tab for error logs.
- Common errors:
  - `409 Conflict`: Data value already exists (handled by `CREATE_AND_UPDATE` strategy usually).
  - `400 Bad Request`: Invalid metadata mapping (check Data Element IDs).
