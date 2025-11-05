# Migration Guide: Alpine to Distroless

**Version:** 1.0
**Date:** November 4, 2025
**From:** sse_secure (Alpine Linux 3.22.2)
**To:** sse_distroless (Google Distroless)

---

## Table of Contents

1. [Overview](#overview)
2. [Should You Migrate?](#should-you-migrate)
3. [Pre-Migration Checklist](#pre-migration-checklist)
4. [Migration Steps](#migration-steps)
5. [Post-Migration Validation](#post-migration-validation)
6. [Rollback Procedure](#rollback-procedure)
7. [Key Differences](#key-differences)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This guide helps you migrate from the Alpine-based implementation (`sse_secure`) to the Distroless implementation (`sse_distroless`).

### Why Migrate?

**Security Improvements:**
- ✅ 97.5% attack surface reduction (40 binaries → 1)
- ✅ Zero shell access (no /bin/sh)
- ✅ Zero package manager (no apk)
- ✅ 45% smaller container (342MB → 189MB)

**What Stays the Same:**
- ✅ 100% functional parity
- ✅ Same performance
- ✅ Same configuration
- ✅ Same security posture (0 vulnerabilities)

### Migration Complexity

**Difficulty:** 🟢 Low (15-30 minutes)
**Downtime:** 2-5 minutes
**Reversibility:** ✅ Fully reversible

---

## Should You Migrate?

### Recommended For

✅ **Production environments** seeking maximum security
✅ **Security-conscious deployments** requiring minimal attack surface
✅ **Resource-constrained environments** (45% smaller container)
✅ **Compliance-driven projects** (CIS Benchmark best practices)

### Not Required For

⚠️ **Development environments** where debugging is frequent
⚠️ **Legacy systems** that depend on Alpine-specific features
⚠️ **Short-term deployments** that will be decommissioned soon

### Decision Matrix

| Requirement | Alpine | Distroless | Recommendation |
|-------------|--------|------------|----------------|
| **Maximum Security** | Good | **Excellent** | → Migrate |
| **Minimal Size** | Good | **Excellent** | → Migrate |
| **Shell Access Needed** | Yes | **No** | → Stay on Alpine |
| **Package Manager Needed** | Yes | **No** | → Stay on Alpine |
| **Debugging Frequently** | Easy | Harder | → Stay on Alpine |
| **Production Deployment** | Good | **Excellent** | → Migrate |

---

## Pre-Migration Checklist

### 1. Verify Current Installation

```bash
# Check current version
docker images | grep mcp/sequentialthinking

# Should see: mcp/sequentialthinking:secure (342MB)

# Test current installation
curl http://localhost:3001/health

# Backup logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/
```

### 2. System Requirements

**Same as Alpine deployment:**
- Docker 20.10+ with buildx
- 2GB RAM (container uses 1GB)
- 1GB disk space
- Bun runtime (for building)

**Additional requirement:**
- Logs directory must be writable by UID 65532 (vs UID 1000 in Alpine)

### 3. Prepare Migration

```bash
# Create backup
docker commit seq-thinking-secure seq-thinking-backup

# Stop current container
docker-compose -f docker-compose.yml down

# Backup configuration
cp docker-compose.yml docker-compose.yml.backup
```

---

## Migration Steps

### Step 1: Build Distroless Image

```bash
# Navigate to project directory
cd /path/to/sequentialthinking

# Build distroless image
./build-distroless.sh

# Verify build
docker images mcp/sequentialthinking:distroless
# Expected: 189MB
```

### Step 2: Update Configuration

**No configuration changes needed!** Environment variables and volumes are the same.

**Optional:** Review `docker-compose.distroless.yml` for any custom adjustments.

### Step 3: Update Logs Permissions

The distroless image runs as UID 65532 (nonroot) instead of UID 1000 (mcpuser).

```bash
# Option 1: Let Docker handle it (recommended)
mkdir -p logs && chmod 755 logs
# Docker will create files with correct ownership

# Option 2: Set ownership manually (if needed)
sudo chown -R 65532:65532 logs/

# Verify
ls -la logs/
```

### Step 4: Deploy Distroless

```bash
# Start distroless version
docker-compose -f docker-compose.distroless.yml up -d

# Wait for startup (2-3 seconds)
sleep 3

# Verify running
docker ps | grep distroless
```

### Step 5: Verify Deployment

```bash
# Test health endpoint
curl http://localhost:3001/health

# Expected response:
# {"status":"healthy","uptime":...}

# Test SSE endpoint
curl -N http://localhost:3001/sse | head -n 3

# Expected:
# event: endpoint
# data: {"sessionId":"..."}

# Check logs
tail -f logs/combined-$(date +%Y-%m-%d).log
```

### Step 6: Update Client Configuration

**No changes needed!** Client configuration is identical:

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

### Step 7: Run Security Tests

```bash
# Run distroless security tests
./scripts/docker-security-test-distroless.sh mcp/sequentialthinking:distroless

# Expected: 21/21 tests PASSED

# Scan for vulnerabilities
trivy image --severity HIGH,CRITICAL mcp/sequentialthinking:distroless

# Expected: 0 HIGH/CRITICAL vulnerabilities
```

---

## Post-Migration Validation

### Functional Validation

**Test Checklist:**

```bash
# 1. Health endpoint
curl http://localhost:3001/health
# ✅ Should return 200 OK with JSON

# 2. SSE connection
curl -N http://localhost:3001/sse
# ✅ Should establish session

# 3. Logging
tail -f logs/combined-$(date +%Y-%m-%d).log
# ✅ Should show new log entries

# 4. MCP client test
# ✅ Use Claude Code to test sequential thinking tool

# 5. Resource usage
docker stats seq-thinking-distroless --no-stream
# ✅ Memory should be <200MB
# ✅ CPU should be <1%
```

### Security Validation

```bash
# 1. Verify read-only filesystem
docker inspect seq-thinking-distroless | jq '.[0].HostConfig.ReadonlyRootfs'
# ✅ Should return: true

# 2. Verify non-root user
docker top seq-thinking-distroless
# ✅ Should show UID 65532 (nonroot)

# 3. Verify no shell
docker exec seq-thinking-distroless sh
# ✅ Should fail with: "executable file not found"

# 4. Run security test suite
./scripts/docker-security-test-distroless.sh mcp/sequentialthinking:distroless
# ✅ Should show: 21/21 tests PASSED
```

### Performance Validation

**Baseline (Alpine):**
- Startup: ~1 second
- Memory (idle): 51MB
- CPU (idle): 0.35%

**Distroless (Expected):**
- Startup: <1 second (slightly faster)
- Memory (idle): 51MB (same)
- CPU (idle): 0.35% (same)

```bash
# Monitor for 5 minutes
docker stats seq-thinking-distroless
```

---

## Rollback Procedure

If issues arise, you can quickly rollback to Alpine:

### Quick Rollback

```bash
# Stop distroless
docker-compose -f docker-compose.distroless.yml down

# Start Alpine version
docker-compose -f docker-compose.yml.backup up -d

# Verify
curl http://localhost:3001/health

# Restore logs permissions (if needed)
sudo chown -R 1000:1000 logs/
```

### Full Rollback

```bash
# Remove distroless image
docker rmi mcp/sequentialthinking:distroless

# Remove distroless configuration
rm docker-compose.distroless.yml

# Restore Alpine
docker-compose -f docker-compose.yml up -d
```

**Rollback Time:** ~2 minutes

---

## Key Differences

### Runtime User

| Aspect | Alpine | Distroless |
|--------|--------|------------|
| **User** | mcpuser | nonroot |
| **UID** | 1000 | 65532 |
| **GID** | 1000 | 65532 |
| **Home** | /home/mcpuser | /nonexistent |

**Impact:** Log file ownership will differ. Use `chmod 755 logs/` to allow both users.

### Shell and Debugging

| Feature | Alpine | Distroless |
|---------|--------|------------|
| **Shell** | /bin/sh | ❌ None |
| **docker exec** | ✅ Works | ❌ Limited (no shell) |
| **Package Manager** | apk | ❌ None |
| **Debugging** | Easy | External only |

**Impact:** Debugging requires external tools (logs, docker logs, monitoring).

### Container Size

| Metric | Alpine | Distroless | Change |
|--------|--------|------------|--------|
| **Total Size** | 342MB | 189MB | -45% |
| **Base Image** | ~200MB | ~10MB | -95% |
| **Binary** | Interpreted JS | Standalone binary | N/A |

**Impact:** Faster pulls, less disk space, better caching.

### Attack Surface

| Component | Alpine | Distroless | Change |
|-----------|--------|------------|--------|
| **Binaries** | ~40 | 1 | -97.5% |
| **Shell** | Present | Absent | -100% |
| **Package Manager** | Present | Absent | -100% |

**Impact:** Significantly reduced attack surface, better security posture.

---

## Migration Scenarios

### Scenario 1: Single Server Migration

**Downtime:** 2-3 minutes

```bash
# 1. Stop Alpine
docker-compose -f docker-compose.yml down

# 2. Build distroless
./build-distroless.sh

# 3. Start distroless
docker-compose -f docker-compose.distroless.yml up -d

# 4. Verify
curl http://localhost:3001/health
```

### Scenario 2: Blue-Green Deployment

**Downtime:** 0 minutes (seamless switch)

```bash
# 1. Start distroless on different port
docker-compose -f docker-compose.distroless.yml up -d
# (Edit port to 3002 first)

# 2. Verify distroless works
curl http://localhost:3002/health

# 3. Update client to point to 3002
# (Edit ~/.claude.json)

# 4. After validation, stop Alpine
docker-compose -f docker-compose.yml down

# 5. Change distroless port back to 3001
# (Edit docker-compose.distroless.yml, port 3001)
docker-compose -f docker-compose.distroless.yml up -d --force-recreate
```

### Scenario 3: Gradual Migration (Multiple Clients)

**Approach:** Migrate clients one at a time

```bash
# 1. Run both Alpine (3001) and Distroless (3002) simultaneously

# 2. Update clients gradually:
# Client 1: http://localhost:3001/sse (Alpine)
# Client 2: http://localhost:3002/sse (Distroless)

# 3. Monitor both for a period (hours/days)

# 4. When confident, migrate all clients to distroless

# 5. Shut down Alpine
```

---

## Troubleshooting

### Issue: Logs Not Written After Migration

**Symptom:** `logs/` directory empty or permission errors

**Cause:** User ID changed from 1000 (mcpuser) to 65532 (nonroot)

**Solution:**
```bash
# Option 1: Delete old logs, let Docker recreate
rm -rf logs/*
docker-compose -f docker-compose.distroless.yml restart

# Option 2: Fix permissions
sudo chown -R 65532:65532 logs/

# Option 3: Use permissive permissions
chmod 777 logs/
```

### Issue: Container Exits Immediately

**Symptom:** `docker ps` shows no running container

**Diagnosis:**
```bash
docker logs seq-thinking-distroless
```

**Common Causes:**
1. **Logs directory permissions** - Fix with `chmod 755 logs/`
2. **Port already in use** - Change port or stop conflicting service
3. **Missing volume mount** - Check docker-compose.distroless.yml

### Issue: "Cannot Execute Binary" Error

**Symptom:** Container fails with "cannot execute binary file"

**Cause:** Architecture mismatch (AMD64 vs ARM64)

**Solution:**
```bash
# Check architecture
uname -m

# Rebuild for correct architecture
./build-distroless.sh --platform linux/$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/')
```

### Issue: Client Cannot Connect

**Symptom:** Claude Code shows "Failed to connect"

**Diagnosis:**
```bash
# Test endpoint
curl -N http://localhost:3001/sse

# Check container is running
docker ps | grep distroless

# Check logs
docker logs seq-thinking-distroless
```

**Solution:**
```bash
# Ensure container is running
docker-compose -f docker-compose.distroless.yml up -d

# Verify health
curl http://localhost:3001/health

# Restart Claude Code
```

---

## Comparison Summary

| Aspect | Alpine (sse_secure) | Distroless (sse_distroless) | Winner |
|--------|-------------------|---------------------------|--------|
| **Security** | Excellent (0 vulns) | **Excellent (0 vulns)** | Tie |
| **Attack Surface** | Low (~40 binaries) | **Minimal (1 binary)** | Distroless |
| **Container Size** | 342MB | **189MB** | Distroless |
| **Shell Access** | Yes | No | Alpine |
| **Debugging** | Easy | Harder | Alpine |
| **Package Manager** | Yes (apk) | No | Alpine |
| **Performance** | Good | Good | Tie |
| **Functionality** | 100% | 100% | Tie |
| **Compliance** | CIS compliant | **CIS compliant** | Tie |
| **Startup Time** | ~1s | **<1s** | Distroless |

**Recommendation:** Migrate to Distroless for production environments prioritizing security.

---

## Next Steps After Migration

1. **Monitor for 24-48 hours**
   - Check logs daily
   - Monitor resource usage
   - Verify client connections

2. **Update documentation**
   - Update internal deployment guides
   - Update client configuration docs
   - Note migration date

3. **Schedule security scans**
   - Weekly Trivy scans
   - Monthly security test runs
   - Quarterly reviews

4. **Clean up**
   - After 1 week, remove Alpine image
   - Archive Alpine backups
   - Update CI/CD pipelines

---

## Support

**Documentation:**
- Deployment Guide: `docs/DISTROLESS_DEPLOYMENT_GUIDE.md`
- Security Assessment: `DISTROLESS_SECURITY_ASSESSMENT.md`
- Comparison Matrix: `comparison/COMPARISON_MATRIX.md`

**Troubleshooting:**
- See this guide's Troubleshooting section
- Check GitHub issues
- Review security test logs

---

**Document Version:** 1.0
**Last Updated:** November 4, 2025
**Status:** Production Ready

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
