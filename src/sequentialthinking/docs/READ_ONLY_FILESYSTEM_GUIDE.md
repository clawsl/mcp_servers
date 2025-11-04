# Read-Only Filesystem User Guide

## Overview

The Sequential Thinking MCP Server runs with a **read-only root filesystem**, providing enhanced security through the principle of immutable infrastructure. This guide explains what this means, why it's important, and how to work with it.

### What is Read-Only Root Filesystem?

A read-only root filesystem means the container's application layer cannot be modified after deployment. All system files, application binaries, and configuration files are immutable during runtime.

**Filesystem Layout:**
```
/                    (read-only) - Root filesystem
├── app/            (read-only) - Application code
│   └── logs/       (writable)  - Volume mount for logs
├── bin/            (read-only) - System binaries
├── etc/            (read-only) - System configuration
├── tmp/            (writable)  - tmpfs (in-memory)
└── run/            (writable)  - tmpfs (in-memory)
```

### Security Benefits

1. **Immutable Container:** Application cannot be tampered with during runtime
2. **Attack Prevention:** Malware cannot write persistent files
3. **Integrity Assurance:** Code runs exactly as built
4. **Compliance:** Meets CIS Docker Benchmark 5.12
5. **Defense in Depth:** Additional security layer beyond user restrictions

---

## Quick Start

### Prerequisites

- Docker 20.10 or later
- Docker Compose 1.29 or later
- 1GB available RAM
- 500MB available disk space for logs

### Using Docker Compose (Recommended)

The easiest way to run the server with read-only filesystem:

```bash
# 1. Navigate to the project directory
cd /path/to/sequentialthinking

# 2. Create logs directory (if not exists)
mkdir -p logs

# 3. Start the server
docker-compose up -d sequential-thinking-sse

# 4. Verify it's running
docker ps --filter name=seq-thinking-secure

# 5. Check health
curl http://localhost:3001/health

# 6. View logs
docker-compose logs -f sequential-thinking-sse

# 7. Stop the server
docker-compose down
```

### Verify Read-Only Mode

Confirm the container is running with read-only filesystem:

```bash
# Check read-only flag
docker inspect seq-thinking-secure | jq '.[0].HostConfig.ReadonlyRootfs'
# Should return: true

# Test write protection (should fail)
docker exec seq-thinking-secure touch /test-file
# Should return: touch: /test-file: Read-only file system

# Test tmpfs is writable (should succeed)
docker exec seq-thinking-secure touch /tmp/test-file && echo "Success"

# Test logs volume is writable (should succeed)
docker exec seq-thinking-secure touch /app/logs/test-file && echo "Success"
```

### Check Logs on Host

Logs are written to the host filesystem and persist across container restarts:

```bash
# List log files
ls -la logs/

# View combined logs
tail -f logs/combined-*.log

# View security events
tail -f logs/security-*.log

# View errors only
tail -f logs/error-*.log
```

---

## Manual Docker Run

If you prefer to run the container manually without docker-compose:

### Full Command with All Options

```bash
docker run -d \
  --name seq-thinking-secure \
  --read-only \
  --tmpfs /tmp:mode=1777,size=100m,uid=1000,gid=1000 \
  --tmpfs /run:mode=0755,size=10m,uid=1000,gid=1000 \
  --volume $(pwd)/logs:/app/logs:rw \
  --user 1000:1000 \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --cap-add CHOWN \
  --cap-add SETGID \
  --cap-add SETUID \
  --memory=1g \
  --memory-swap=1g \
  --memory-reservation=512m \
  --cpus=1.0 \
  --pids-limit=100 \
  -e PORT=3001 \
  -e MAX_THOUGHTS_PER_SESSION=10000 \
  -e MAX_THOUGHT_LENGTH=10000 \
  -e SESSION_TIMEOUT_MS=3600000 \
  -e NODE_ENV=production \
  -p 127.0.0.1:3001:3001 \
  mcp/sequentialthinking:secure
```

### Command Breakdown

| Option | Purpose |
|--------|---------|
| `--read-only` | Enable read-only root filesystem |
| `--tmpfs /tmp:...` | In-memory temporary storage (100MB) |
| `--tmpfs /run:...` | Runtime state storage (10MB) |
| `--volume logs:/app/logs:rw` | Persistent log storage |
| `--user 1000:1000` | Run as non-root user |
| `--security-opt no-new-privileges` | Prevent privilege escalation |
| `--cap-drop ALL` | Drop all Linux capabilities |
| `--cap-add ...` | Add only required capabilities |
| `--memory=1g` | Limit container memory to 1GB |
| `--cpus=1.0` | Limit to 1 CPU core |
| `--pids-limit=100` | Limit process count |
| `-p 127.0.0.1:3001:3001` | Bind to localhost only |

---

## Log Management

### Log Files

The server creates three types of log files in `/app/logs` (mounted volume):

| File | Purpose | Retention | Max Size |
|------|---------|-----------|----------|
| `combined-YYYY-MM-DD.log` | All log events | 14 days | 20MB |
| `error-YYYY-MM-DD.log` | Errors only | 30 days | 20MB |
| `security-YYYY-MM-DD.log` | Security events | 90 days | 20MB |

### Log Rotation

Logs automatically rotate:
- **Daily:** New file created at midnight
- **Size-based:** When file reaches 20MB
- **Automatic cleanup:** Old files deleted per retention policy

### Viewing Logs

```bash
# Real-time combined logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# Search for errors
grep ERROR logs/error-*.log

# View security events
jq '.' logs/security-$(date +%Y-%m-%d).log

# Count events by type
jq -r '.eventType' logs/security-*.log | sort | uniq -c

# Find high-severity events
jq 'select(.severity=="HIGH" or .severity=="CRITICAL")' logs/security-*.log
```

### Log Backup

```bash
# Compress old logs
cd logs && tar -czf logs-backup-$(date +%Y%m%d).tar.gz *.log

# Sync to remote storage
rsync -avz logs/ user@backup-server:/backups/mcp-logs/

# Automated daily backup (crontab)
0 2 * * * cd /path/to/logs && tar -czf /backups/mcp-logs-$(date +\%Y\%m\%d).tar.gz *.log
```

### Log Analysis

```bash
# Extract session statistics
jq -r 'select(.eventType=="SESSION_CREATED") | .sessionId' logs/security-*.log | wc -l

# Find injection attempts
jq 'select(.eventType=="INJECTION_ATTEMPT")' logs/security-*.log

# Memory usage warnings
jq 'select(.eventType=="MEMORY_WARNING")' logs/security-*.log

# CORS violations
jq 'select(.eventType=="CORS_VIOLATION")' logs/security-*.log
```

---

## Troubleshooting

### Container Won't Start

**Symptom:** Container starts then immediately exits

**Diagnosis:**
```bash
# Check container logs
docker logs seq-thinking-secure

# Check exit code
docker inspect seq-thinking-secure | jq '.[0].State.ExitCode'
```

**Common Causes:**

1. **Missing logs directory**
   ```bash
   mkdir -p logs
   chmod 755 logs
   ```

2. **Permission denied on logs volume**
   ```bash
   # macOS/Linux with Docker Desktop (usually automatic)
   ls -la logs/

   # Linux with Docker Engine (may need ownership fix)
   chown 1000:1000 logs/
   ```

3. **Incorrect volume path**
   ```bash
   # Use absolute path
   --volume /full/path/to/logs:/app/logs:rw

   # Or relative path from docker-compose.yml location
   volumes:
     - ./logs:/app/logs:rw
   ```

### Health Check Failing

**Symptom:** Container shows as unhealthy

**Diagnosis:**
```bash
# Check health status
docker inspect seq-thinking-secure | jq '.[0].State.Health'

# Test health endpoint manually
curl http://localhost:3001/health
```

**Common Causes:**

1. **Port not accessible**
   ```bash
   # Check port binding
   docker port seq-thinking-secure

   # Verify firewall
   netstat -an | grep 3001
   ```

2. **Node.js process crashed**
   ```bash
   # Check logs for errors
   docker logs seq-thinking-secure 2>&1 | grep -i error
   ```

### Cannot Write to Logs

**Symptom:** No log files created or "Permission denied" errors

**Diagnosis:**
```bash
# Check volume mount
docker inspect seq-thinking-secure | jq '.[0].Mounts'

# Test write permission
docker exec seq-thinking-secure touch /app/logs/test-file
```

**Solutions:**

1. **Verify volume mount is read-write**
   ```bash
   docker inspect seq-thinking-secure | jq '.[0].Mounts[] | select(.Destination=="/app/logs") | .RW'
   # Should return: true
   ```

2. **Check host directory permissions**
   ```bash
   ls -ld logs/
   # Should be: drwxr-xr-x (755)

   # Fix if needed
   chmod 755 logs/
   ```

3. **On Linux, check ownership**
   ```bash
   # Should be owned by UID 1000
   stat -c '%u:%g' logs/

   # Fix if needed
   chown 1000:1000 logs/
   ```

### SELinux/AppArmor Issues (Linux Only)

**Symptom:** "Permission denied" despite correct ownership

**Diagnosis:**
```bash
# Check for SELinux denials
ausearch -m avc -ts recent | grep docker

# Check SELinux status
getenforce
```

**Solution for SELinux:**
```bash
# Add :z flag to volume mount
volumes:
  - ./logs:/app/logs:rw,z
```

**Solution for AppArmor:**
```bash
# Check AppArmor status
aa-status | grep docker

# Reload AppArmor profile if needed
apparmor_parser -r /etc/apparmor.d/docker
```

### High Memory Usage

**Symptom:** Container approaching 1GB memory limit

**Diagnosis:**
```bash
# Check current memory usage
docker stats seq-thinking-secure --no-stream

# Check memory warnings in logs
jq 'select(.eventType=="MEMORY_WARNING")' logs/security-*.log
```

**Solutions:**

1. **Reduce thought limit**
   ```bash
   # In docker-compose.yml
   environment:
     - MAX_THOUGHTS_PER_SESSION=5000  # Lower from 10000
   ```

2. **Check for memory leaks**
   ```bash
   # Monitor over time
   docker stats seq-thinking-secure

   # Look for climbing RSS
   docker exec seq-thinking-secure cat /proc/1/status | grep VmRSS
   ```

3. **Restart container periodically**
   ```bash
   # Add to cron for daily restart
   0 3 * * * docker restart seq-thinking-secure
   ```

### tmpfs Full

**Symptom:** "No space left on device" for /tmp

**Diagnosis:**
```bash
# Check tmpfs usage
docker exec seq-thinking-secure df -h /tmp
```

**Solution:**
```bash
# Increase tmpfs size in docker-compose.yml
tmpfs:
  - /tmp:mode=1777,size=200m,uid=1000,gid=1000  # Increased from 100m
```

---

## Production Considerations

### Log Aggregation

For production deployments, consider centralized logging:

**Using Docker log driver:**
```yaml
services:
  sequential-thinking-sse:
    logging:
      driver: "syslog"
      options:
        syslog-address: "tcp://log-server:514"
        tag: "mcp-sequential-thinking"
```

**Using Filebeat:**
```yaml
# filebeat.yml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /path/to/logs/*.log
    json.keys_under_root: true
    json.add_error_key: true

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

**Using Fluentd:**
```yaml
<source>
  @type tail
  path /path/to/logs/*.log
  pos_file /var/log/mcp-sequential.pos
  tag mcp.sequential
  <parse>
    @type json
  </parse>
</source>

<match mcp.sequential>
  @type elasticsearch
  host elasticsearch
  port 9200
  index_name mcp-sequential
</match>
```

### Monitoring

**Health Check Monitoring:**
```bash
#!/bin/bash
# health-monitor.sh
while true; do
  if ! curl -sf http://localhost:3001/health > /dev/null; then
    echo "Health check failed at $(date)" | mail -s "MCP Server Alert" admin@example.com
    docker restart seq-thinking-secure
  fi
  sleep 60
done
```

**Prometheus Metrics (Future Enhancement):**
```yaml
# Add metrics endpoint
environment:
  - ENABLE_METRICS=true
  - METRICS_PORT=9090
```

### Backup Strategy

**Automated Log Backup:**
```bash
#!/bin/bash
# backup-logs.sh

DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/mcp-logs"
LOG_DIR="/path/to/logs"

# Create backup
tar -czf "$BACKUP_DIR/mcp-logs-$DATE.tar.gz" -C "$LOG_DIR" .

# Upload to S3
aws s3 cp "$BACKUP_DIR/mcp-logs-$DATE.tar.gz" s3://my-bucket/mcp-logs/

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "mcp-logs-*.tar.gz" -mtime +30 -delete

# Cleanup old logs (already rotated by Winston, but double-check)
find "$LOG_DIR" -name "*.log" -mtime +90 -delete
```

**Cron Schedule:**
```cron
# Run daily at 2 AM
0 2 * * * /path/to/backup-logs.sh >> /var/log/mcp-backup.log 2>&1
```

### High Availability

**Multiple Instances with Load Balancer:**
```yaml
# docker-compose-ha.yml
version: '3.8'

services:
  mcp-server-1:
    extends:
      file: docker-compose.yml
      service: sequential-thinking-sse
    container_name: seq-thinking-1
    volumes:
      - ./logs/server1:/app/logs:rw
    ports:
      - "127.0.0.1:3001:3001"

  mcp-server-2:
    extends:
      file: docker-compose.yml
      service: sequential-thinking-sse
    container_name: seq-thinking-2
    volumes:
      - ./logs/server2:/app/logs:rw
    ports:
      - "127.0.0.1:3002:3001"

  nginx-lb:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      - mcp-server-1
      - mcp-server-2
```

### Security Scanning

**Regular vulnerability scanning:**
```bash
# Scan with Trivy
trivy image --severity HIGH,CRITICAL mcp/sequentialthinking:secure

# Expected output: 0 HIGH/CRITICAL vulnerabilities

# Scan with Docker Scout
docker scout cves mcp/sequentialthinking:secure

# Automated scanning (CI/CD)
# In .github/workflows/security-scan.yml
- name: Scan image
  run: |
    trivy image --exit-code 1 --severity HIGH,CRITICAL mcp/sequentialthinking:secure
```

**Quarterly review schedule:**
1. Run vulnerability scan
2. Update base image if needed
3. Re-run security tests
4. Update documentation

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | production | Node environment |
| `MAX_THOUGHTS_PER_SESSION` | 10000 | Maximum thoughts per session |
| `MAX_THOUGHT_LENGTH` | 10000 | Maximum characters per thought |
| `SESSION_TIMEOUT_MS` | 3600000 | Session timeout (1 hour) |
| `DISABLE_THOUGHT_LOGGING` | false | Disable thought logging |
| `LOG_DIR` | ./logs | Log directory path |
| `LOG_LEVEL` | info | Logging level |

### Volume Mounts

| Container Path | Purpose | Type | Required |
|----------------|---------|------|----------|
| `/app/logs` | Log storage | Volume | Yes |
| `/tmp` | Temporary files | tmpfs | Yes |
| `/run` | Runtime state | tmpfs | Optional |

### Resource Limits

| Resource | Limit | Soft Limit | Purpose |
|----------|-------|------------|---------|
| Memory | 1GB | 512MB | Prevent memory exhaustion |
| CPU | 1.0 core | N/A | Limit CPU usage |
| PIDs | 100 | N/A | Prevent fork bombs |
| Thoughts | 10000 | N/A | Memory management |

### Security Options

| Option | Value | Purpose |
|--------|-------|---------|
| Read-Only FS | true | Immutable container |
| No New Privileges | true | Prevent escalation |
| User | 1000:1000 | Non-root execution |
| Capabilities | Minimal set | Least privilege |

---

## FAQ

### Q: Why read-only filesystem?

**A:** Read-only filesystem prevents attackers from modifying the container, installing malware, or tampering with application code. It's a key security control.

### Q: What happens if I try to write to read-only areas?

**A:** You'll get an error: `Read-only file system`. Use `/tmp` for temporary files or configure additional volume mounts.

### Q: Can I disable read-only mode?

**A:** Yes, but not recommended. Remove `read_only: true` from docker-compose.yml. This reduces security.

### Q: How much disk space do logs need?

**A:** Approximately 20-50MB per day depending on usage. Logs auto-rotate and cleanup after retention period.

### Q: Does read-only mode affect performance?

**A:** No. In fact, tmpfs (in-memory) storage for /tmp is faster than disk-based storage.

### Q: Can I run multiple instances?

**A:** Yes. Give each instance a unique name and separate log directory:
```yaml
volumes:
  - ./logs/instance1:/app/logs:rw
```

### Q: What if container fills up memory?

**A:** Container will be killed by Docker's OOM killer. Reduce `MAX_THOUGHTS_PER_SESSION` or increase memory limit.

### Q: How do I update the application?

**A:** Rebuild the image and restart:
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### Q: Are logs secure?

**A:** Logs contain security events but not sensitive data. They're written to host filesystem with restrictive permissions (755).

### Q: Can I use network storage for logs?

**A:** Yes. Mount NFS/CIFS to host, then volume mount to container:
```yaml
volumes:
  - /mnt/nfs-logs:/app/logs:rw
```

---

## Additional Resources

- **CIS Docker Benchmark:** https://www.cisecurity.org/benchmark/docker
- **Docker Security:** https://docs.docker.com/engine/security/
- **Node.js Security:** https://nodejs.org/en/docs/guides/security/
- **Winston Logger:** https://github.com/winstonjs/winston

---

## Support

For issues or questions:
1. Check logs: `docker logs seq-thinking-secure`
2. Run security tests: `./scripts/docker-security-test.sh`
3. Review troubleshooting section above
4. Check GitHub issues
5. Contact DevOps Security Team

---

**Last Updated:** November 4, 2025
**Version:** 1.0
**Applies to:** Sequential Thinking MCP Server v0.6.2+
