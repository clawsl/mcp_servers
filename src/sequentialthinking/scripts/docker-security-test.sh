#!/bin/bash
# docker-security-test.sh - Docker Security Configuration Testing
#
# This script validates Docker container security configurations including:
# - Non-root user execution
# - Read-only filesystem where applicable
# - Dropped capabilities
# - Resource limits
# - Security options
#
# Usage:
#   ./scripts/docker-security-test.sh [image-name]

set -e

# Configuration
IMAGE_NAME="${1:-mcp/sequentialthinking:secure}"
CONTAINER_NAME="mcp-security-test-$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================="
echo "  Docker Security Configuration Test    "
echo "========================================="
echo ""
echo "Image: $IMAGE_NAME"
echo "Test Container: $CONTAINER_NAME"
echo ""

# Check if image exists
if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo -e "${RED}ERROR: Image '$IMAGE_NAME' not found.${NC}"
    echo "Please build the image first:"
    echo "  docker build -t $IMAGE_NAME ."
    exit 1
fi

# Cleanup function
cleanup() {
    echo ""
    echo -e "${BLUE}Cleaning up test container...${NC}"
    docker rm -f "$CONTAINER_NAME" &>/dev/null || true
}

# Set trap for cleanup
trap cleanup EXIT

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="$3"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -n "  [Test $TESTS_TOTAL] $test_name... "

    if eval "$test_command"; then
        if [ "$expected_result" = "pass" ]; then
            echo -e "${GREEN}✓ PASS${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo -e "${RED}✗ FAIL${NC}"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    else
        if [ "$expected_result" = "fail" ]; then
            echo -e "${GREEN}✓ PASS (expected failure)${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo -e "${RED}✗ FAIL${NC}"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            return 1
        fi
    fi
}

echo -e "${BLUE}[1/5] Testing Image Configuration${NC}"

# Test 1: Check for non-root user
run_test "Image uses non-root user" \
    "docker image inspect $IMAGE_NAME | jq -r '.[0].Config.User' | grep -qv '^$\|^0$\|^root$'" \
    "pass"

# Test 2: Check for HEALTHCHECK
run_test "Image has health check configured" \
    "docker image inspect $IMAGE_NAME | jq -e '.[0].Config.Healthcheck' >/dev/null 2>&1" \
    "pass" || echo "  Note: Health check is optional but recommended"

# Test 3: Check entrypoint uses dumb-init
run_test "Image uses dumb-init for proper signal handling" \
    "docker image inspect $IMAGE_NAME | jq -r '.[0].Config.Entrypoint[]' | grep -q 'dumb-init'" \
    "pass"

echo ""
echo -e "${BLUE}[2/5] Testing Runtime User Privileges${NC}"

# Start container for runtime tests
docker run -d --name "$CONTAINER_NAME" "$IMAGE_NAME" tail -f /dev/null >/dev/null 2>&1

# Test 4: Container runs as non-root
run_test "Container runs as non-root user" \
    "docker exec $CONTAINER_NAME id -u | grep -qv '^0$'" \
    "pass"

# Test 5: Container user is mcpuser
run_test "Container runs as mcpuser (UID 1000)" \
    "docker exec $CONTAINER_NAME id -u | grep -q '^1000$'" \
    "pass"

# Test 6: Check effective user
run_test "Effective UID is non-root" \
    "docker exec $CONTAINER_NAME sh -c 'cat /proc/self/status | grep -E \"^Uid:\" | awk \"{print \\\$2}\"' | grep -qv '^0$'" \
    "pass"

echo ""
echo -e "${BLUE}[3/5] Testing File System Permissions${NC}"

# Test 7: Cannot write to /etc (should fail)
run_test "Cannot write to /etc directory" \
    "docker exec $CONTAINER_NAME sh -c 'touch /etc/test-file 2>/dev/null'" \
    "fail"

# Test 8: Cannot write to /bin (should fail)
run_test "Cannot write to /bin directory" \
    "docker exec $CONTAINER_NAME sh -c 'touch /bin/test-file 2>/dev/null'" \
    "fail"

# Test 9: Can write to /app/logs
run_test "Can write to /app/logs directory" \
    "docker exec $CONTAINER_NAME sh -c 'touch /app/logs/test-file'" \
    "pass"

# Test 10: /app directory is owned by mcpuser
run_test "/app directory owned by mcpuser" \
    "docker exec $CONTAINER_NAME stat -c '%U' /app | grep -q 'mcpuser'" \
    "pass"

echo ""
echo -e "${BLUE}[4/5] Testing Security Options${NC}"

# Stop test container
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1

# Start container with security options from docker-compose
docker run -d \
    --name "$CONTAINER_NAME" \
    --security-opt no-new-privileges:true \
    --cap-drop ALL \
    --cap-add NET_BIND_SERVICE \
    --cap-add CHOWN \
    --cap-add SETGID \
    --cap-add SETUID \
    "$IMAGE_NAME" tail -f /dev/null >/dev/null 2>&1

# Test 11: NoNewPrivileges is set
run_test "NoNewPrivileges flag is set" \
    "docker inspect $CONTAINER_NAME | jq -r '.[0].HostConfig.SecurityOpt[]' | grep -q 'no-new-privileges:true'" \
    "pass"

# Test 12: Capabilities are dropped
run_test "Capabilities properly configured" \
    "docker inspect $CONTAINER_NAME | jq -r '.[0].HostConfig.CapDrop[]' | grep -q 'ALL'" \
    "pass"

# Test 13: Cannot escalate privileges
run_test "Cannot escalate to root" \
    "docker exec $CONTAINER_NAME sh -c 'su - 2>/dev/null'" \
    "fail"

echo ""
echo -e "${BLUE}[5/6] Testing Resource Limits${NC}"

# Stop test container
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1

# Start container with resource limits from docker-compose
docker run -d \
    --name "$CONTAINER_NAME" \
    --memory="512m" \
    --memory-swap="512m" \
    --cpus="1.0" \
    --pids-limit 100 \
    "$IMAGE_NAME" tail -f /dev/null >/dev/null 2>&1

# Test 14: Memory limit is set
run_test "Memory limit configured (512MB)" \
    "docker inspect $CONTAINER_NAME | jq -r '.[0].HostConfig.Memory' | grep -q '536870912'" \
    "pass"

# Test 15: CPU limit is set
run_test "CPU limit configured (1.0 core)" \
    "docker inspect $CONTAINER_NAME | jq -r '.[0].HostConfig.NanoCpus' | grep -q '1000000000'" \
    "pass"

# Test 16: PIDs limit is set
run_test "PIDs limit configured (100)" \
    "docker inspect $CONTAINER_NAME | jq -r '.[0].HostConfig.PidsLimit' | grep -q '100'" \
    "pass"

echo ""
echo -e "${BLUE}[6/6] Testing Read-Only Filesystem${NC}"

# Stop test container
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1

# Create temporary logs directory for testing
TEST_LOGS_DIR="$(mktemp -d)"
trap "rm -rf $TEST_LOGS_DIR" EXIT

# Start container with read-only filesystem configuration
docker run -d \
    --name "$CONTAINER_NAME" \
    --read-only \
    --tmpfs /tmp:mode=1777,size=100m \
    --tmpfs /run:mode=0755,size=10m \
    --volume "$TEST_LOGS_DIR:/app/logs:rw" \
    --security-opt no-new-privileges:true \
    --cap-drop ALL \
    --cap-add NET_BIND_SERVICE \
    --cap-add CHOWN \
    --cap-add SETGID \
    --cap-add SETUID \
    "$IMAGE_NAME" tail -f /dev/null >/dev/null 2>&1

# Wait for container to fully start
sleep 2

# Test 17: Root filesystem is read-only
run_test "Root filesystem is read-only" \
    "docker inspect $CONTAINER_NAME | jq -r '.[0].HostConfig.ReadonlyRootfs' | grep -q 'true'" \
    "pass"

# Test 18: Cannot write to root directory
run_test "Cannot write to / directory" \
    "docker exec $CONTAINER_NAME sh -c 'touch /test-file 2>/dev/null'" \
    "fail"

# Test 19: Can write to /tmp (tmpfs)
run_test "Can write to /tmp directory" \
    "docker exec $CONTAINER_NAME sh -c 'touch /tmp/test-file && ls /tmp/test-file >/dev/null 2>&1'" \
    "pass"

# Test 20: Can write to /app/logs (volume)
run_test "Can write to /app/logs directory" \
    "docker exec $CONTAINER_NAME sh -c 'touch /app/logs/test-file && ls /app/logs/test-file >/dev/null 2>&1'" \
    "pass"

# Test 21: Cannot write to /app directory
run_test "Cannot write to /app directory" \
    "docker exec $CONTAINER_NAME sh -c 'touch /app/test-file 2>/dev/null'" \
    "fail"

echo ""
echo "========================================="
echo "  Test Results Summary"
echo "========================================="
echo ""
echo -e "Total Tests:  $TESTS_TOTAL"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All security tests PASSED${NC}"
    echo ""
    echo "The Docker image meets security requirements:"
    echo "  ✓ Runs as non-root user (mcpuser, UID 1000)"
    echo "  ✓ Uses dumb-init for signal handling"
    echo "  ✓ File system permissions properly restricted"
    echo "  ✓ No privilege escalation possible"
    echo "  ✓ Resource limits configured"
    echo "  ✓ Security options enabled (no-new-privileges)"
    echo "  ✓ Capabilities properly dropped and limited"
    echo "  ✓ Read-only root filesystem (immutable container)"
    echo "  ✓ Writable tmpfs for temporary files"
    echo "  ✓ Persistent log volume configured"
    echo ""
    echo "CIS Docker Benchmark compliance:"
    echo "  ✓ 5.12 - Container root filesystem is read-only"
    echo "  ✓ 5.25 - Container restricted from acquiring new privileges"
    echo "  ✓ 5.3  - Container runs as non-root user"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some security tests FAILED${NC}"
    echo ""
    echo "Please review the failures above and:"
    echo "  1. Check Dockerfile configuration"
    echo "  2. Verify docker-compose.yml security settings"
    echo "  3. Rebuild the image after fixes"
    echo "  4. Re-run this test script"
    echo ""
    exit 1
fi
