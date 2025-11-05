# Sequential Thinking MCP Server - Distroless Deployment Guide

**Version:** 1.0
**Date:** November 4, 2025
**Branch:** sse_distroless
**Image:** mcp/sequentialthinking:distroless

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Building the Image](#building-the-image)
4. [Deployment Methods](#deployment-methods)
5. [Configuration](#configuration)
6. [Security Hardening](#security-hardening)
7. [Monitoring and Logging](#monitoring-and-logging)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Build the Distroless Image

```bash
# Navigate to the project directory
cd /path/to/sequentialthinking

# Run the build script
./build-distroless.sh
```

### 2. Deploy with Docker Compose

```bash
# Create logs directory
mkdir -p logs && chmod 755 logs

# Start the service
docker-compose -f docker-compose.distroless.yml up -d

# Verify it's running
curl http://localhost:3001/health
```

### 3. Configure Your MCP Client

**Claude Code (`~/.claude.json`):**
```json
{
  "mcpServers": {
    "sequential-thinking": {
      "type": "sse",
      "url": "http://localhost:3001/sse"
    }
  }
}
```

**Done!** Your distroless Sequential Thinking server is running.

---

## Prerequisites

### System Requirements

**Minimum:**
- Docker 20.10+ with buildx support
- 2GB available RAM
- 1GB available disk space
- x86_64 (AMD64) or ARM64 architecture

**Recommended:**
- Docker 24.0+
- 4GB available RAM
- 2GB available disk space
- Docker Compose 2.0+

### Required Tools

1. **Docker** with buildx
   ```bash
   docker version
   docker buildx version
   ```

2. **Bun Runtime** (for building binaries)
   ```bash
   # Install Bun
   curl -fsSL https://bun.sh/install | bash

   # Verify installation
   bun --version
   ```

3. **Node.js 20+** and **npm** (for building TypeScript)
   ```bash
   node --version  # Should be 20.x or higher
   npm --version
   ```

4. **Git** (for cloning repository)
   ```bash
   git --version
   ```

5. **jq** (for JSON processing in tests)
   ```bash
   jq --version
   ```

### Optional Tools

- **Trivy** (for security scanning)
- **curl** (for testing endpoints)
- **docker-compose** (for orchestration)

---

## Building the Image

### Automated Build (Recommended)

Use the provided build script for a fully automated build:

```bash
./build-distroless.sh
```

This script:
1. Compiles TypeScript with esbuild bundling
2. Creates Bun binaries for AMD64 and ARM64
3. Builds the multi-architecture Docker image
4. Validates the build

### Build Options

```bash
# Build with custom platform
./build-distroless.sh --platform linux/amd64

# Build with custom tag
./build-distroless.sh --tag myregistry/sequentialthinking:v1.0

# Skip npm build (use existing bundle)
./build-distroless.sh --skip-npm

# Skip Bun compilation (use existing binaries)
./build-distroless.sh --skip-bun

# Skip Docker build (just compile binaries)
./build-distroless.sh --skip-docker
```

### Manual Build Process

If you need to build manually:

```bash
# Step 1: Build TypeScript and create esbuild bundle
npm run build

# Step 2: Compile Bun binaries
mkdir -p binaries
bun build --compile --target=bun-linux-x64 ./dist/bundle.js --outfile binaries/server-bun-amd64
bun build --compile --target=bun-linux-arm64 ./dist/bundle.js --outfile binaries/server-bun-arm64

# Step 3: Build Docker image
docker buildx build --platform linux/amd64,linux/arm64 \
  -t mcp/sequentialthinking:distroless \
  -f Dockerfile.distroless --load .
```

### Verifying the Build

```bash
# Check image size
docker images mcp/sequentialthinking:distroless

# Expected: ~189MB

# Run security tests
./scripts/docker-security-test-distroless.sh mcp/sequentialthinking:distroless

# Expected: 21/21 tests PASSED

# Scan for vulnerabilities
trivy image --severity HIGH,CRITICAL mcp/sequentialthinking:distroless

# Expected: 0 HIGH/CRITICAL vulnerabilities
```

---

## Deployment Methods

### Method 1: Docker Compose (Recommended)

**Advantages:**
- Production-ready configuration
- All security options preconfigured
- Easy to manage and update
- Persistent logs
- Resource limits enforced

**Deployment:**

```bash
# Create logs directory
mkdir -p logs && chmod 755 logs

# Start service
docker-compose -f docker-compose.distroless.yml up -d

# View logs
docker-compose -f docker-compose.distroless.yml logs -f

# Stop service
docker-compose -f docker-compose.distroless.yml down
```

### Method 2: Docker Run (Manual)

**For testing or custom setups:**

```bash
# Create logs directory
mkdir -p logs && chmod 755 logs

# Run with full security hardening
docker run -d \
  --name seq-thinking-distroless \
  --read-only \
  --tmpfs /tmp:mode=1777,size=100m,uid=65532,gid=65532 \
  -v $(pwd)/logs:/app/logs:rw \
  -p 127.0.0.1:3001:3001 \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --cap-add CHOWN \
  --cap-add SETGID \
  --cap-add SETUID \
  --memory=1g \
  --memory-swap=1g \
  --cpus=1.0 \
  --pids-limit=100 \
  -e MAX_THOUGHTS_PER_SESSION=10000 \
  -e SESSION_TIMEOUT_MS=3600000 \
  mcp/sequentialthinking:distroless sse
```

### Method 3: Stdio Mode (MCP Stdio Transport)

**For direct stdio communication:**

```bash
# Interactive mode
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | \
  docker run --rm -i -v $(pwd)/logs:/app/logs mcp/sequentialthinking:distroless stdio

# Claude Desktop config (stdio mode)
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "-v", "/path/to/logs:/app/logs", "mcp/sequentialthinking:distroless", "stdio"]
    }
  }
}
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | SSE server port |
| `NODE_ENV` | `production` | Environment (production/development) |
| `MAX_THOUGHTS_PER_SESSION` | `10000` | Maximum thoughts per session |
| `SESSION_TIMEOUT_MS` | `3600000` | Session timeout (1 hour) |
| `LOG_LEVEL` | `info` | Logging level (debug/info/warn/error) |
| `DISABLE_THOUGHT_LOGGING` | `false` | Disable detailed thought logging |

**Example:**

```bash
docker run -d \
  -e PORT=3002 \
  -e MAX_THOUGHTS_PER_SESSION=5000 \
  -e SESSION_TIMEOUT_MS=1800000 \
  -e LOG_LEVEL=debug \
  -p 127.0.0.1:3002:3002 \
  mcp/sequentialthinking:distroless sse
```

### Volume Mounts

#### Required Volumes

**Logs Directory:**
```bash
-v $(pwd)/logs:/app/logs:rw
```
- **Purpose:** Persistent log storage
- **Permissions:** Must be writable by UID 65532 (nonroot user)
- **Files:** `combined-*.log`, `error-*.log`, `security-*.log`

#### Optional Volumes

**Configuration (if needed):**
```bash
-v $(pwd)/config:/app/config:ro
```
- **Purpose:** Custom configuration files
- **Permissions:** Read-only

### Port Mapping

**Security Best Practice:** Bind to localhost only

```bash
# Correct (localhost only)
-p 127.0.0.1:3001:3001

# Incorrect (accessible from network)
-p 3001:3001
```

---

## Security Hardening

### Security Options (All Recommended)

```yaml
security_opt:
  - no-new-privileges:true  # Prevent privilege escalation

cap_drop:
  - ALL                      # Drop all capabilities

cap_add:
  - NET_BIND_SERVICE         # Bind to port 3001
  - CHOWN                    # Change file ownership (logs)
  - SETGID                   # Set group ID
  - SETUID                   # Set user ID

read_only: true              # Immutable root filesystem

tmpfs:
  - /tmp:mode=1777,size=100m,uid=65532,gid=65532  # Writable temp

mem_limit: 1g                # Memory limit
memswap_limit: 1g            # Same as mem_limit (no swap)
cpus: 1.0                    # CPU limit
pids_limit: 100              # Process limit
```

### Read-Only Root Filesystem

**Benefits:**
- Immutable container (CIS 5.12)
- Prevents malware persistence
- Defense in depth

**Requirements:**
- `/tmp` as tmpfs for temporary files
- `/app/logs` as volume for persistent logs

**Validation:**
```bash
# Verify read-only mode
docker inspect seq-thinking-distroless | jq '.[0].HostConfig.ReadonlyRootfs'
# Should return: true

# Test write to root (should fail)
docker exec seq-thinking-distroless touch /test-file
# Expected error: Read-only file system
```

### Network Security

**Localhost-Only Binding:**
```yaml
ports:
  - "127.0.0.1:3001:3001"  # Only accessible from localhost
```

**Why:** Prevents network exposure; only local clients can connect.

**If remote access needed:**
```yaml
# Use reverse proxy (nginx, traefik, etc.)
# DO NOT expose directly to network
```

---

## Monitoring and Logging

### Health Check

**Endpoint:** `GET /health`

```bash
# Check health
curl http://localhost:3001/health

# Response (healthy):
{
  "status": "healthy",
  "uptime": 123.45,
  "activeSessions": 2,
  "timestamp": "2025-11-04T...",
  "environment": {
    "nodeVersion": "v24.3.0",
    "port": "3001",
    "maxThoughtsPerSession": "10000",
    "sessionTimeout": "3600000"
  }
}
```

**Docker Compose Health Check:**
```yaml
# Healthcheck is monitored by Docker
# View health status
docker-compose -f docker-compose.distroless.yml ps
```

### Log Files

**Location:** `./logs/` (host) → `/app/logs` (container)

**Files:**
- `combined-YYYY-MM-DD.log` - All logs
- `error-YYYY-MM-DD.log` - Errors only
- `security-YYYY-MM-DD.log` - Security events

**Viewing Logs:**
```bash
# Real-time combined logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# Real-time errors
tail -f logs/error-$(date +%Y-%m-%d).log

# Real-time security events
tail -f logs/security-$(date +%Y-%m-%d).log

# Container logs (stdout/stderr)
docker logs -f seq-thinking-distroless
```

**Log Rotation:**
- Automatic daily rotation
- 90-day retention
- Managed by Winston

### Monitoring Recommendations

**Resource Usage:**
```bash
# Current stats
docker stats seq-thinking-distroless --no-stream

# Continuous monitoring
docker stats seq-thinking-distroless
```

**Key Metrics:**
- Memory: Should stay under 1GB (limit)
- CPU: Typically <5% (idle), <50% (active)
- Network: Depends on usage

**Alert Thresholds:**
- Memory >80%: Warning
- Memory >90%: Critical
- CPU >90%: Warning
- Container restarts: Alert immediately

---

## Troubleshooting

### Container Won't Start

**Symptom:** Container exits immediately

**Diagnostics:**
```bash
# Check logs
docker logs seq-thinking-distroless

# Common issues:
# 1. Logs directory permissions
# 2. Port already in use
# 3. Memory limit too low
```

**Solutions:**

**Issue: Logs directory permissions**
```bash
# Fix permissions
chmod 755 logs
chown -R 65532:65532 logs  # nonroot user

# Or use docker-compose (handles automatically)
docker-compose -f docker-compose.distroless.yml up -d
```

**Issue: Port already in use**
```bash
# Check what's using port 3001
lsof -i :3001
# Or on Linux:
netstat -tlnp | grep 3001

# Stop conflicting service or change port
docker run -e PORT=3002 -p 127.0.0.1:3002:3002 ...
```

### Health Endpoint Not Responding

**Symptom:** `curl http://localhost:3001/health` fails

**Diagnostics:**
```bash
# Check container is running
docker ps | grep seq-thinking

# Check container logs
docker logs seq-thinking-distroless

# Check port binding
docker port seq-thinking-distroless
```

**Solutions:**
```bash
# Verify port mapping
# Should show: 3001/tcp -> 127.0.0.1:3001

# Test from inside container (if debugging)
docker exec seq-thinking-distroless curl -s http://localhost:3001/health
# Note: Distroless has no curl, so this won't work
# Use external curl from host
```

### Logs Not Being Written

**Symptom:** `logs/` directory is empty

**Diagnostics:**
```bash
# Check volume mount
docker inspect seq-thinking-distroless | jq '.[0].Mounts'

# Check permissions
ls -la logs/

# Check container logs
docker logs seq-thinking-distroless 2>&1 | grep -i "log\|error"
```

**Solutions:**
```bash
# Ensure volume mount is correct
-v $(pwd)/logs:/app/logs:rw

# Create directory with correct permissions
mkdir -p logs && chmod 755 logs

# Restart container
docker-compose -f docker-compose.distroless.yml restart
```

### Out of Memory Errors

**Symptom:** Container keeps restarting, "Out of Memory" in logs

**Diagnostics:**
```bash
# Check memory usage
docker stats seq-thinking-distroless --no-stream

# Check memory limit
docker inspect seq-thinking-distroless | jq '.[0].HostConfig.Memory'
```

**Solutions:**
```bash
# Option 1: Increase memory limit (if justified)
# Edit docker-compose.distroless.yml
mem_limit: 2g
memswap_limit: 2g

# Option 2: Reduce thought limit
-e MAX_THOUGHTS_PER_SESSION=5000

# Option 3: Check for memory leaks
# Monitor over time, review logs
```

### SSE Connection Fails

**Symptom:** Claude Code shows "Failed to connect"

**Diagnostics:**
```bash
# Test SSE endpoint
curl -N http://localhost:3001/sse

# Should show:
# event: endpoint
# data: {"sessionId":"..."}
```

**Solutions:**
```bash
# Verify client configuration
# ~/.claude.json must have:
{
  "mcpServers": {
    "sequential-thinking": {
      "type": "sse",  # NOT "http"
      "url": "http://localhost:3001/sse"
    }
  }
}

# Restart Claude Code after config change
```

### Binary Compatibility Issues

**Symptom:** "cannot execute binary file" or "exec format error"

**Cause:** Architecture mismatch (AMD64 vs ARM64)

**Solution:**
```bash
# Check your architecture
uname -m
# x86_64 = AMD64
# aarch64 = ARM64

# Rebuild for correct architecture
./build-distroless.sh --platform linux/$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')
```

---

## Best Practices

### 1. Use Docker Compose

**Recommended** for production deployments:
- Preconfigured security options
- Easy updates and rollbacks
- Persistent logs
- Health monitoring

### 2. Bind to Localhost Only

```yaml
ports:
  - "127.0.0.1:3001:3001"  # Correct
  # NOT: - "3001:3001"      # Incorrect (network exposure)
```

### 3. Enable Read-Only Root Filesystem

```yaml
read_only: true
tmpfs:
  - /tmp:mode=1777,size=100m,uid=65532,gid=65532
volumes:
  - ./logs:/app/logs:rw
```

### 4. Monitor Resource Usage

```bash
# Set up monitoring
docker stats seq-thinking-distroless

# Alert on:
# - Memory >80%
# - Container restarts
# - Health check failures
```

### 5. Regular Updates

```bash
# Pull latest distroless base
docker pull gcr.io/distroless/cc-debian12:latest

# Rebuild
./build-distroless.sh

# Deploy
docker-compose -f docker-compose.distroless.yml up -d --force-recreate
```

### 6. Security Scanning

```bash
# Scan before deployment
trivy image --severity HIGH,CRITICAL mcp/sequentialthinking:distroless

# Should show: 0 HIGH/CRITICAL vulnerabilities
```

---

## Next Steps

- **Developer Guide:** See `DISTROLESS_DEVELOPER_GUIDE.md`
- **Migration Guide:** See `DISTROLESS_MIGRATION_GUIDE.md`
- **Security Assessment:** See `DISTROLESS_SECURITY_ASSESSMENT.md`
- **Troubleshooting:** See issues above or GitHub

---

**Document Version:** 1.0
**Last Updated:** November 4, 2025
**Status:** Production Ready

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
