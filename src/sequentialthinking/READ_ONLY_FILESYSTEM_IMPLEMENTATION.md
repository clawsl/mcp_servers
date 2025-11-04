# Read-Only Root Filesystem Implementation Plan

## Document Information
- **Date:** November 4, 2025
- **Version:** 1.0
- **Author:** DevOps Security Engineer
- **Target:** Sequential Thinking MCP Server

---

## 1. Security Benefits

### Immutable Container Principle
A read-only root filesystem enforces the immutable infrastructure principle, where the container's application layer cannot be modified after deployment. This provides:

- **Integrity Assurance:** Application binaries and libraries cannot be tampered with during runtime
- **Predictable Behavior:** Container always runs the same code that was built into the image
- **Audit Trail:** Changes to the system must go through the image build process, creating a complete audit trail

### Attack Surface Reduction
By making the root filesystem read-only, we eliminate several attack vectors:

- **Malware Prevention:** Attackers cannot install persistent malware or backdoors
- **Script Injection:** Cannot write malicious scripts to system directories
- **Binary Modification:** Cannot replace system binaries with trojaned versions
- **Configuration Tampering:** Cannot modify system configuration files

### CIS Docker Benchmark Compliance
This implementation aligns with CIS Docker Benchmark 5.12:

> **5.12 Ensure that the container's root filesystem is mounted as read-only**
>
> Mounting the container's root filesystem as read-only provides additional defense-in-depth. It prevents the container from writing to locations outside the volumes, thus reducing the attack surface.

### Defense in Depth
Read-only filesystem is one layer in our defense-in-depth strategy:

```
┌─────────────────────────────────────┐
│ Application Security                │
│ - Input validation                  │
│ - Thought limits                    │
│ - Session timeouts                  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ Container Security                  │
│ - Non-root user (UID 1000)          │
│ - Dropped capabilities              │
│ - no-new-privileges                 │
│ ➤ READ-ONLY ROOT FILESYSTEM         │ ← This implementation
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│ Resource Security                   │
│ - Memory limits                     │
│ - CPU limits                        │
│ - PID limits                        │
└─────────────────────────────────────┘
```

---

## 2. Technical Requirements

### Directories Requiring Write Access

Based on analysis of the Sequential Thinking MCP Server, the following directories need write access:

#### `/tmp` - Temporary Files
- **Purpose:** Node.js runtime temporary operations, OS temporary files
- **Solution:** Mount as `tmpfs` (in-memory filesystem)
- **Size:** 100MB (sufficient for temporary operations)
- **Permissions:** 1777 (sticky bit, world-writable)
- **Lifecycle:** Cleared on container restart

#### `/app/logs` - Application Logs
- **Purpose:** Winston logger output (security, error, combined logs)
- **Solution:** Volume mount to host filesystem
- **Size:** Managed by Winston rotation (20MB per file, 90-day retention for security logs)
- **Permissions:** 0755 (owned by mcpuser)
- **Lifecycle:** Persistent across container restarts

#### `/run` - Runtime State (Optional)
- **Purpose:** PID files, socket files, runtime state
- **Solution:** Mount as `tmpfs` (in-memory filesystem)
- **Size:** 10MB (minimal, only if needed)
- **Permissions:** 0755
- **Lifecycle:** Cleared on container restart

### Node.js Runtime Requirements

Node.js 22 LTS requirements for read-only filesystem:

1. **NPM Cache:** Not needed in production (dependencies already installed)
2. **V8 Code Cache:** Node can operate without writable cache
3. **Home Directory:** Not required for our use case
4. **Temporary Compilation:** Uses `/tmp` for any runtime compilation

Our application does NOT require:
- JIT compilation write access
- Dynamic library loading
- Module installation at runtime
- Configuration file modification

### Winston Logger Requirements

Winston with `winston-daily-rotate-file` needs:

1. **Log Directory:** `/app/logs` must be writable
2. **File Creation:** Must create new log files daily
3. **File Rotation:** Must rename/archive old log files
4. **File Permissions:** Must set appropriate permissions on created files

Configuration in `logger.ts`:
```typescript
const logDir = process.env.LOG_DIR || './logs';

// Daily rotation files
new DailyRotateFile({
  filename: path.join(logDir, 'combined-%DATE%.log'),
  maxSize: '20m',
  maxFiles: '14d',
  // Requires write access to logDir
})
```

### Health Check Requirements

The Docker health check executes Node.js code:
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3001/health', ...)"
```

Requirements:
- Node.js must be able to execute ephemeral scripts
- Uses `/tmp` for any temporary operations
- No persistent filesystem writes needed

---

## 3. Implementation Strategy

### Phase 1: Analysis (Current Phase)
- [x] Document security benefits
- [x] Identify write access requirements
- [x] Analyze Node.js and Winston needs
- [x] Create implementation plan

### Phase 2: Testing
- [ ] Build current image: `docker build -t mcp/sequentialthinking:secure .`
- [ ] Test with read-only mode manually
- [ ] Document any failures or errors
- [ ] Validate tmpfs and volume configurations

### Phase 3: Configuration Updates
- [ ] Update `docker-compose.yml` with read-only settings
- [ ] Update `docker-compose.prod.yml` with read-only settings
- [ ] Create host `logs/` directory with correct permissions
- [ ] Validate both compose files

### Phase 4: Security Test Enhancement
- [ ] Add read-only filesystem verification tests
- [ ] Add tmpfs write tests
- [ ] Add volume write tests
- [ ] Update test count from 16 to 21
- [ ] Add test result validation

### Phase 5: Validation
- [ ] Run full security test suite
- [ ] Verify 21/21 tests passing
- [ ] Test SSE endpoint functionality
- [ ] Test health check
- [ ] Verify log file creation and rotation

### Phase 6: Documentation
- [ ] Create user-facing guide: `docs/READ_ONLY_FILESYSTEM_GUIDE.md`
- [ ] Update `CLAUDE.md` with read-only section
- [ ] Document troubleshooting procedures
- [ ] Create production deployment checklist

### Dockerfile Changes
**No changes required.** The current Dockerfile is already compatible:
- Uses non-root user (mcpuser)
- Creates `/app/logs` directory
- No hardcoded write operations to root filesystem
- Compatible with external volume mounts

### docker-compose.yml Changes
Add these configurations:

```yaml
services:
  sequential-thinking-sse:
    # Enable read-only root filesystem
    read_only: true

    # In-memory temporary filesystems
    tmpfs:
      - /tmp:mode=1777,size=100m,uid=1000,gid=1000
      - /run:mode=0755,size=10m,uid=1000,gid=1000

    # Persistent log volume
    volumes:
      - ./logs:/app/logs:rw

    # Existing security options (preserve)
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
      - CHOWN
      - SETGID
      - SETUID
```

### Volume Mount Configuration

**Host Directory Preparation:**
```bash
# Create logs directory on host
mkdir -p /Users/klaus.fleck/dev/mcp_eval/sequentialthinking/logs

# Set appropriate permissions
chmod 755 /Users/klaus.fleck/dev/mcp_eval/sequentialthinking/logs
```

**Docker Compose Volume Syntax:**
```yaml
volumes:
  - ./logs:/app/logs:rw  # Relative path, read-write
```

**Direct Docker Run Syntax:**
```bash
--volume /Users/klaus.fleck/dev/mcp_eval/sequentialthinking/logs:/app/logs:rw
```

### tmpfs Configuration

**Purpose:** Provide writable temporary space in memory

**Configuration:**
```yaml
tmpfs:
  - /tmp:mode=1777,size=100m,uid=1000,gid=1000    # World-writable temp
  - /run:mode=0755,size=10m,uid=1000,gid=1000    # Runtime state
```

**Parameters Explained:**
- `mode=1777`: Permissions (sticky bit + rwxrwxrwx for /tmp)
- `mode=0755`: Permissions (rwxr-xr-x for /run)
- `size=100m`: Maximum size in memory (100 megabytes for /tmp)
- `size=10m`: Maximum size in memory (10 megabytes for /run)
- `uid=1000`: Owner user ID (mcpuser)
- `gid=1000`: Owner group ID (mcpuser)

### Testing Approach

#### Manual Testing Procedure
```bash
# 1. Build image
cd /Users/klaus.fleck/dev/mcp_eval/sequentialthinking
npm run build
docker build -t mcp/sequentialthinking:secure .

# 2. Create logs directory
mkdir -p logs
chmod 755 logs

# 3. Test with read-only mode
docker run --rm \
  --read-only \
  --tmpfs /tmp:mode=1777,size=100m \
  --tmpfs /run:mode=0755,size=10m \
  --volume $(pwd)/logs:/app/logs:rw \
  -e MAX_THOUGHTS_PER_SESSION=10000 \
  -e NODE_ENV=production \
  -p 127.0.0.1:3001:3001 \
  mcp/sequentialthinking:secure sse &

# 4. Wait for startup
sleep 5

# 5. Test endpoints
curl http://localhost:3001/health
curl -N http://localhost:3001/sse &
sleep 2
kill %2

# 6. Check logs
ls -la logs/
cat logs/combined-*.log | head -20

# 7. Verify read-only
CONTAINER_ID=$(docker ps -q --filter ancestor=mcp/sequentialthinking:secure)
docker exec $CONTAINER_ID sh -c 'touch /test-file 2>&1' | grep -q 'Read-only' && echo "✓ Read-only verified"

# 8. Cleanup
docker stop $CONTAINER_ID
```

#### Automated Testing
Run the enhanced security test script:
```bash
./scripts/docker-security-test.sh mcp/sequentialthinking:secure
# Expected: 21/21 tests PASSED
```

---

## 4. Potential Challenges and Solutions

### Challenge 1: Node.js Module Cache
**Issue:** Node.js may try to write compiled module cache

**Detection:**
- Error: `EROFS: read-only file system`
- Failed to start container
- Module loading errors

**Solution:**
- Use `/tmp` (tmpfs) for any cache needs
- Set `NODE_ENV=production` to disable development caching
- Pre-build all modules in Dockerfile

**Status:** No issues expected (modules pre-built)

### Challenge 2: NPM Operations
**Issue:** NPM tries to write to cache/lock files

**Detection:**
- `npm WARN` messages
- Lock file errors
- Cache directory errors

**Solution:**
- Use `--omit=dev --ignore-scripts` in Dockerfile
- No NPM operations at runtime
- All dependencies installed at build time

**Status:** Already implemented in Dockerfile

### Challenge 3: Winston Logger File Handles
**Issue:** Winston needs to create and rotate log files

**Detection:**
- No log files created
- `EACCES` or `EROFS` errors
- Logger initialization failures

**Solution:**
- Mount `/app/logs` as volume with write access
- Ensure correct ownership (uid=1000, gid=1000)
- Pre-create logs directory on host

**Status:** Will be implemented via volume mount

### Challenge 4: Health Check Temporary Files
**Issue:** Health check script may need temporary space

**Detection:**
- Health check failures
- Container marked unhealthy
- Temporary file errors

**Solution:**
- Provide `/tmp` as tmpfs
- Health check uses only ephemeral operations
- No persistent files needed

**Status:** Solved by tmpfs /tmp

### Challenge 5: File Upload/Processing (Future)
**Issue:** If future features need file upload handling

**Detection:**
- Upload failures
- File processing errors
- Storage errors

**Solution:**
- Use `/tmp` (tmpfs) for temporary upload storage
- Process files in memory when possible
- Clean up after processing

**Status:** Not applicable to current version

### Challenge 6: Database/Cache Files (Future)
**Issue:** If future features add SQLite or cache files

**Detection:**
- Database lock errors
- Write errors
- Cache failures

**Solution:**
- Mount additional volumes for persistent data
- Use external databases (PostgreSQL, Redis)
- Configure cache to use mounted volumes

**Status:** Not applicable to current version

### Challenge 7: Permission Denied on Logs Volume
**Issue:** Host directory permissions prevent writing

**Detection:**
- `EACCES: permission denied` in logs
- Container starts but no logs created
- Ownership mismatch errors

**Solution:**
```bash
# On host, ensure correct permissions
mkdir -p logs
chmod 755 logs

# On macOS/Linux with Docker Desktop
# The host user owns the directory, Docker handles mapping

# On Linux with Docker Engine
chown 1000:1000 logs  # Match container UID/GID
```

**Status:** Will be documented in user guide

### Challenge 8: SELinux/AppArmor Conflicts
**Issue:** Host security policies may block volume access

**Detection:**
- `Permission denied` despite correct ownership
- SELinux AVC denials
- AppArmor denials in logs

**Solution:**
```bash
# SELinux: Add :z or :Z flag
volumes:
  - ./logs:/app/logs:rw,z  # Private unshared

# AppArmor: Check Docker profile
docker info | grep -i security

# Verify no denials
ausearch -m avc -ts recent | grep docker
```

**Status:** Platform-specific, will document

---

## 5. Verification Checklist

### Pre-Implementation
- [x] Document security benefits
- [x] Analyze write access requirements
- [x] Identify potential challenges
- [x] Create implementation plan

### Implementation
- [ ] Update docker-compose.yml
- [ ] Update docker-compose.prod.yml
- [ ] Update security test script
- [ ] Create logs directory with correct permissions

### Testing
- [ ] Build image successfully
- [ ] Start container with read-only mode
- [ ] Health check passes
- [ ] SSE endpoint responds
- [ ] Logs written to volume
- [ ] Cannot write to root filesystem
- [ ] Can write to /tmp
- [ ] Can write to /app/logs
- [ ] All 21 security tests pass

### Documentation
- [ ] Create READ_ONLY_FILESYSTEM_GUIDE.md
- [ ] Update CLAUDE.md
- [ ] Document troubleshooting
- [ ] Create production checklist

### Production Readiness
- [ ] Test log rotation works
- [ ] Test container restart (logs persist)
- [ ] Test multiple instances
- [ ] Verify performance (no degradation)
- [ ] Document backup procedures

---

## 6. Success Criteria

The implementation will be considered successful when:

1. **Functionality:**
   - ✅ Container starts successfully with `read_only: true`
   - ✅ SSE endpoint responds to connections
   - ✅ Health check passes continuously
   - ✅ Sequential thinking tool works as expected

2. **Logging:**
   - ✅ Winston creates log files in `/app/logs` volume
   - ✅ Log rotation works correctly
   - ✅ All log types written (combined, error, security)
   - ✅ Logs persist across container restarts

3. **Security:**
   - ✅ Cannot write to `/` directory
   - ✅ Cannot write to `/app` directory
   - ✅ Cannot write to `/etc` directory
   - ✅ Cannot write to `/bin` directory
   - ✅ Can write to `/tmp` (tmpfs)
   - ✅ Can write to `/app/logs` (volume)

4. **Testing:**
   - ✅ 21/21 security tests pass
   - ✅ Read-only tests included
   - ✅ No test regressions

5. **Documentation:**
   - ✅ Implementation plan complete
   - ✅ User guide created
   - ✅ CLAUDE.md updated
   - ✅ Troubleshooting documented

---

## 7. Risk Assessment

### Low Risk
- **Impact:** Container fails to start
- **Mitigation:** Easy rollback, testing catches early
- **Recovery:** Remove `read_only: true`, restart

### Medium Risk
- **Impact:** Logs not written to volume
- **Mitigation:** Pre-test volume mounts, verify permissions
- **Recovery:** Fix permissions, recreate volume mount

### Low Risk
- **Impact:** Health check fails with read-only
- **Mitigation:** Health check uses only ephemeral operations
- **Recovery:** Adjust health check command if needed

### Negligible Risk
- **Impact:** Performance degradation
- **Mitigation:** tmpfs is in-memory (faster than disk)
- **Recovery:** No recovery needed (performance likely improves)

---

## 8. Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Planning | 1 hour | ✅ Complete |
| Testing | 30 minutes | ⏳ In Progress |
| Implementation | 1 hour | 🔜 Pending |
| Validation | 1 hour | 🔜 Pending |
| Documentation | 1 hour | 🔜 Pending |
| **Total** | **4.5 hours** | **25% Complete** |

---

## 9. Next Steps

1. **Immediate:**
   - Test current image with read-only mode
   - Document any errors encountered
   - Verify tmpfs and volume configurations work

2. **Short-term:**
   - Update docker-compose files
   - Enhance security tests
   - Run validation suite

3. **Before Production:**
   - Complete user documentation
   - Update CLAUDE.md
   - Create production deployment guide

---

## 10. References

- **CIS Docker Benchmark:** https://www.cisecurity.org/benchmark/docker
- **Docker Security Best Practices:** https://docs.docker.com/engine/security/
- **OWASP Container Security:** https://owasp.org/www-project-docker-top-10/
- **Node.js Security:** https://nodejs.org/en/docs/guides/security/
- **Winston Logger:** https://github.com/winstonjs/winston

---

**Document Status:** APPROVED FOR IMPLEMENTATION
**Next Review:** Post-implementation validation
**Approval:** DevOps Security Engineer
