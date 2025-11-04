#!/bin/bash
# trivy-scan.sh - Multi-architecture vulnerability scanning with Trivy
#
# This script scans Docker images for security vulnerabilities across multiple architectures.
# It supports both linux/amd64 and linux/arm64 platforms.
#
# Usage:
#   ./scripts/trivy-scan.sh [image-name]
#
# Environment Variables:
#   IMAGE_NAME        - Docker image to scan (default: mcp/sequentialthinking:secure)
#   REPORT_DIR        - Directory for scan reports (default: ./security-reports)
#   FAIL_ON_CRITICAL  - Exit with error if CRITICAL vulns found (default: true)
#   FAIL_ON_HIGH      - Exit with error if HIGH vulns found (default: true)

set -e

# Configuration
IMAGE_NAME="${IMAGE_NAME:-mcp/sequentialthinking:secure}"
REPORT_DIR="${REPORT_DIR:-./security-reports}"
FAIL_ON_CRITICAL="${FAIL_ON_CRITICAL:-true}"
FAIL_ON_HIGH="${FAIL_ON_HIGH:-true}"

# Platform architectures to scan
ARCHITECTURES=("linux/amd64" "linux/arm64")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "======================================"
echo "  Trivy Security Vulnerability Scan  "
echo "======================================"
echo ""
echo "Image: $IMAGE_NAME"
echo "Report Directory: $REPORT_DIR"
echo "Architectures: ${ARCHITECTURES[*]}"
echo ""

# Create report directory
mkdir -p "$REPORT_DIR"

# Check if Trivy is installed
if ! command -v trivy &> /dev/null; then
    echo -e "${RED}ERROR: Trivy is not installed.${NC}"
    echo ""
    echo "Please install Trivy:"
    echo "  macOS:  brew install trivy"
    echo "  Linux:  https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
    echo ""
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}ERROR: Docker is not running.${NC}"
    exit 1
fi

# Check if Docker buildx is available
if ! docker buildx version &> /dev/null; then
    echo -e "${RED}ERROR: Docker buildx is not available.${NC}"
    echo "Please upgrade Docker to a version that supports buildx."
    exit 1
fi

echo -e "${BLUE}[1/6] Creating multi-architecture builder...${NC}"
docker buildx create --use --name multiarch-builder 2>/dev/null || docker buildx use multiarch-builder
echo -e "${GREEN}✓ Builder ready${NC}"
echo ""

echo -e "${BLUE}[2/6] Building multi-architecture Docker images...${NC}"
for ARCH in "${ARCHITECTURES[@]}"; do
  PLATFORM_TAG="${IMAGE_NAME}-${ARCH//\//-}"
  echo -e "${YELLOW}  Building for ${ARCH}...${NC}"

  docker buildx build \
    --platform "$ARCH" \
    --tag "$PLATFORM_TAG" \
    --load \
    . 2>&1 | grep -E "(^Step |^Successfully built|^ERROR)" || true

  if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo -e "${GREEN}  ✓ Built ${PLATFORM_TAG}${NC}"
  else
    echo -e "${RED}  ✗ Failed to build ${PLATFORM_TAG}${NC}"
    exit 1
  fi
done
echo ""

# Scan function
scan_image() {
  local PLATFORM=$1
  local PLATFORM_TAG="${IMAGE_NAME}-${PLATFORM//\//-}"
  local PLATFORM_SAFE="${PLATFORM//\//_}"
  local REPORT_BASE="${REPORT_DIR}/trivy-${PLATFORM_SAFE}"

  echo -e "${BLUE}[3/6] Scanning ${PLATFORM}...${NC}"
  echo "  Image: $PLATFORM_TAG"

  # Run Trivy scan
  echo -e "${YELLOW}  Running vulnerability scan...${NC}"

  # Scan and save to JSON
  trivy image \
    --format json \
    --output "${REPORT_BASE}.json" \
    --severity CRITICAL,HIGH,MEDIUM,LOW \
    "$PLATFORM_TAG"

  # Generate HTML report
  trivy image \
    --format template \
    --template "@contrib/html.tpl" \
    --output "${REPORT_BASE}.html" \
    --severity CRITICAL,HIGH,MEDIUM,LOW \
    "$PLATFORM_TAG"

  # Generate table output for console
  trivy image \
    --format table \
    --severity CRITICAL,HIGH,MEDIUM,LOW \
    "$PLATFORM_TAG"

  echo ""
  echo -e "${GREEN}  ✓ Scan complete${NC}"
  echo "  JSON report: ${REPORT_BASE}.json"
  echo "  HTML report: ${REPORT_BASE}.html"
  echo ""
}

# Scan all architectures
for ARCH in "${ARCHITECTURES[@]}"; do
  scan_image "$ARCH"
done

echo -e "${BLUE}[4/6] Analyzing results...${NC}"
echo ""

# Parse results and count vulnerabilities
TOTAL_CRITICAL=0
TOTAL_HIGH=0
TOTAL_MEDIUM=0
TOTAL_LOW=0

for ARCH in "${ARCHITECTURES[@]}"; do
  PLATFORM_SAFE="${ARCH//\//_}"
  REPORT_JSON="${REPORT_DIR}/trivy-${PLATFORM_SAFE}.json"

  if [ -f "$REPORT_JSON" ]; then
    # Count vulnerabilities by severity
    CRITICAL=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="CRITICAL")] | length' "$REPORT_JSON" 2>/dev/null || echo 0)
    HIGH=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="HIGH")] | length' "$REPORT_JSON" 2>/dev/null || echo 0)
    MEDIUM=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="MEDIUM")] | length' "$REPORT_JSON" 2>/dev/null || echo 0)
    LOW=$(jq '[.Results[]?.Vulnerabilities[]? | select(.Severity=="LOW")] | length' "$REPORT_JSON" 2>/dev/null || echo 0)

    echo "  Platform: $ARCH"
    echo "    CRITICAL: $CRITICAL"
    echo "    HIGH:     $HIGH"
    echo "    MEDIUM:   $MEDIUM"
    echo "    LOW:      $LOW"
    echo ""

    TOTAL_CRITICAL=$((TOTAL_CRITICAL + CRITICAL))
    TOTAL_HIGH=$((TOTAL_HIGH + HIGH))
    TOTAL_MEDIUM=$((TOTAL_MEDIUM + MEDIUM))
    TOTAL_LOW=$((TOTAL_LOW + LOW))
  fi
done

echo -e "${BLUE}[5/6] Summary across all architectures:${NC}"
echo ""
echo "  Total Vulnerabilities:"
echo -e "    ${RED}CRITICAL: $TOTAL_CRITICAL${NC}"
echo -e "    ${YELLOW}HIGH:     $TOTAL_HIGH${NC}"
echo "    MEDIUM:   $TOTAL_MEDIUM"
echo "    LOW:      $TOTAL_LOW"
echo ""

# Configuration scanning
echo -e "${BLUE}[6/6] Scanning for misconfigurations...${NC}"
for ARCH in "${ARCHITECTURES[@]}"; do
  PLATFORM_TAG="${IMAGE_NAME}-${ARCH//\//-}"
  PLATFORM_SAFE="${ARCH//\//_}"
  CONFIG_REPORT="${REPORT_DIR}/trivy-config-${PLATFORM_SAFE}.json"

  echo "  Scanning $ARCH for misconfigurations..."
  trivy image \
    --format json \
    --output "$CONFIG_REPORT" \
    --scanners config \
    --severity CRITICAL,HIGH,MEDIUM,LOW \
    "$PLATFORM_TAG" 2>/dev/null || true

  # Check for misconfigurations
  if [ -f "$CONFIG_REPORT" ]; then
    MISCONFIG_COUNT=$(jq '[.Results[]?.Misconfigurations[]?] | length' "$CONFIG_REPORT" 2>/dev/null || echo 0)
    if [ "$MISCONFIG_COUNT" -gt 0 ]; then
      echo -e "    ${YELLOW}Found $MISCONFIG_COUNT misconfiguration(s)${NC}"
    else
      echo -e "    ${GREEN}✓ No misconfigurations found${NC}"
    fi
  fi
done
echo ""

# Final verdict
echo "======================================"
echo "  Final Assessment"
echo "======================================"
echo ""

EXIT_CODE=0

if [ "$TOTAL_CRITICAL" -gt 0 ]; then
  echo -e "${RED}✗ CRITICAL vulnerabilities found: $TOTAL_CRITICAL${NC}"
  if [ "$FAIL_ON_CRITICAL" = "true" ]; then
    EXIT_CODE=1
  fi
fi

if [ "$TOTAL_HIGH" -gt 0 ]; then
  echo -e "${YELLOW}⚠ HIGH vulnerabilities found: $TOTAL_HIGH${NC}"
  if [ "$FAIL_ON_HIGH" = "true" ]; then
    EXIT_CODE=1
  fi
fi

if [ "$EXIT_CODE" -eq 0 ]; then
  echo -e "${GREEN}✓ No CRITICAL or HIGH vulnerabilities found${NC}"
  echo ""
  echo "Security scan PASSED"
else
  echo ""
  echo -e "${RED}Security scan FAILED${NC}"
  echo ""
  echo "Please review the vulnerability reports in: $REPORT_DIR"
  echo ""
  echo "Remediation steps:"
  echo "  1. Review detailed reports (HTML and JSON)"
  echo "  2. Update base images and dependencies"
  echo "  3. Apply security patches"
  echo "  4. Document accepted risks in VULNERABILITY_ACCEPTANCE.md"
  echo ""
fi

echo "Reports generated:"
for ARCH in "${ARCHITECTURES[@]}"; do
  PLATFORM_SAFE="${ARCH//\//_}"
  echo "  - ${REPORT_DIR}/trivy-${PLATFORM_SAFE}.json"
  echo "  - ${REPORT_DIR}/trivy-${PLATFORM_SAFE}.html"
done
echo ""

exit $EXIT_CODE
