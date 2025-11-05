#!/bin/bash
#
# Production Build Script for Distroless Implementation
#
# This script builds the Sequential Thinking MCP Server for distroless deployment
# using Bun compilation with esbuild bundling for optimal dead code elimination.
#
# Build Process:
#   1. TypeScript compilation (tsc)
#   2. esbuild bundling with tree-shaking and minification
#   3. Bun compilation to standalone binaries (AMD64 + ARM64)
#   4. Docker multi-arch image build
#
# Usage:
#   ./build-distroless.sh [--skip-npm] [--skip-bun] [--skip-docker] [--platform PLATFORMS]
#
# Options:
#   --skip-npm      Skip npm build step (use existing dist/bundle.js)
#   --skip-bun      Skip Bun compilation (use existing binaries)
#   --skip-docker   Skip Docker build (just compile binaries)
#   --platform      Docker platforms (default: linux/amd64,linux/arm64)
#   --tag           Docker image tag (default: mcp/sequentialthinking:distroless)
#   --help          Show this help message
#

set -e  # Exit on error
set -o pipefail  # Catch errors in pipes

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Default values
SKIP_NPM=false
SKIP_BUN=false
SKIP_DOCKER=false
PLATFORM="linux/amd64,linux/arm64"
TAG="mcp/sequentialthinking:distroless"
DOCKERFILE="Dockerfile.distroless"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-npm)
      SKIP_NPM=true
      shift
      ;;
    --skip-bun)
      SKIP_BUN=true
      shift
      ;;
    --skip-docker)
      SKIP_DOCKER=true
      shift
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --help)
      head -n 25 "$0" | tail -n +2
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Run '$0 --help' for usage"
      exit 1
      ;;
  esac
done

# Print header
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Sequential Thinking MCP Server${NC}"
echo -e "${GREEN}Distroless Production Build${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Configuration summary
echo -e "${BLUE}Build Configuration:${NC}"
echo -e "  Platform:  ${YELLOW}${PLATFORM}${NC}"
echo -e "  Tag:       ${YELLOW}${TAG}${NC}"
echo -e "  Dockerfile: ${YELLOW}${DOCKERFILE}${NC}"
echo -e "  Skip npm:  ${YELLOW}${SKIP_NPM}${NC}"
echo -e "  Skip Bun:  ${YELLOW}${SKIP_BUN}${NC}"
echo -e "  Skip Docker: ${YELLOW}${SKIP_DOCKER}${NC}"
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js not found${NC}"
  exit 1
fi
echo -e "  ✅ Node.js: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
  echo -e "${RED}Error: npm not found${NC}"
  exit 1
fi
echo -e "  ✅ npm: $(npm --version)"

# Check Bun
if ! command -v bun &> /dev/null; then
  echo -e "${RED}Error: Bun not found${NC}"
  echo -e "${YELLOW}Install Bun: curl -fsSL https://bun.sh/install | bash${NC}"
  exit 1
fi
echo -e "  ✅ Bun: $(bun --version)"

# Check Docker
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Error: Docker not found${NC}"
  exit 1
fi
echo -e "  ✅ Docker: $(docker --version | head -n1)"

echo ""

# Step 1: npm build (TypeScript + esbuild)
if [ "$SKIP_NPM" = false ]; then
  echo -e "${GREEN}Step 1: Building with npm (TypeScript + esbuild)...${NC}"
  echo -e "${YELLOW}Running: npm run build${NC}"
  npm run build

  # Verify bundle.js exists
  if [ ! -f "dist/bundle.js" ]; then
    echo -e "${RED}Error: dist/bundle.js not created${NC}"
    exit 1
  fi

  # Show bundle size
  BUNDLE_SIZE=$(ls -lh dist/bundle.js | awk '{print $5}')
  echo -e "  ✅ Bundle created: ${GREEN}dist/bundle.js${NC} (${BUNDLE_SIZE})"
  echo ""
else
  echo -e "${YELLOW}Step 1: Skipped (using existing dist/bundle.js)${NC}"
  if [ ! -f "dist/bundle.js" ]; then
    echo -e "${RED}Error: dist/bundle.js not found${NC}"
    exit 1
  fi
  echo ""
fi

# Step 2: Bun compilation
if [ "$SKIP_BUN" = false ]; then
  echo -e "${GREEN}Step 2: Compiling with Bun...${NC}"

  # Create binaries directory
  mkdir -p binaries

  # Compile for AMD64
  echo -e "${YELLOW}Compiling for linux/amd64...${NC}"
  bun build --compile --target=bun-linux-x64 \
    ./dist/bundle.js \
    --outfile binaries/server-bun-amd64

  AMD64_SIZE=$(ls -lh binaries/server-bun-amd64 | awk '{print $5}')
  echo -e "  ✅ AMD64 binary: ${GREEN}binaries/server-bun-amd64${NC} (${AMD64_SIZE})"

  # Compile for ARM64
  echo -e "${YELLOW}Compiling for linux/arm64...${NC}"
  bun build --compile --target=bun-linux-arm64 \
    ./dist/bundle.js \
    --outfile binaries/server-bun-arm64

  ARM64_SIZE=$(ls -lh binaries/server-bun-arm64 | awk '{print $5}')
  echo -e "  ✅ ARM64 binary: ${GREEN}binaries/server-bun-arm64${NC} (${ARM64_SIZE})"

  echo ""
else
  echo -e "${YELLOW}Step 2: Skipped (using existing binaries)${NC}"

  # Verify binaries exist
  if [ ! -f "binaries/server-bun-amd64" ] || [ ! -f "binaries/server-bun-arm64" ]; then
    echo -e "${RED}Error: Required binaries not found${NC}"
    exit 1
  fi
  echo ""
fi

# Step 3: Docker build
if [ "$SKIP_DOCKER" = false ]; then
  echo -e "${GREEN}Step 3: Building Docker image...${NC}"

  # Check if Dockerfile exists
  if [ ! -f "$DOCKERFILE" ]; then
    echo -e "${RED}Error: Dockerfile not found: $DOCKERFILE${NC}"
    exit 1
  fi

  echo -e "${YELLOW}Building for: ${PLATFORM}${NC}"
  docker buildx build \
    --platform "$PLATFORM" \
    --tag "$TAG" \
    --file "$DOCKERFILE" \
    --load \
    .

  if [ $? -eq 0 ]; then
    echo -e "  ✅ ${GREEN}Docker image built successfully${NC}"
    echo ""

    # Show image details
    echo -e "${BLUE}Image Details:${NC}"
    docker images "$TAG" --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    echo ""
  else
    echo -e "${RED}Error: Docker build failed${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}Step 3: Skipped (no Docker build)${NC}"
  echo ""
fi

# Build complete
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Build Complete! ✅${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Show summary
echo -e "${BLUE}Build Summary:${NC}"
if [ -f "dist/bundle.js" ]; then
  BUNDLE_SIZE=$(ls -lh dist/bundle.js | awk '{print $5}')
  echo -e "  Bundle:     ${BUNDLE_SIZE}"
fi
if [ -f "binaries/server-bun-amd64" ]; then
  AMD64_SIZE=$(ls -lh binaries/server-bun-amd64 | awk '{print $5}')
  echo -e "  AMD64:      ${AMD64_SIZE}"
fi
if [ -f "binaries/server-bun-arm64" ]; then
  ARM64_SIZE=$(ls -lh binaries/server-bun-arm64 | awk '{print $5}')
  echo -e "  ARM64:      ${ARM64_SIZE}"
fi
if [ "$SKIP_DOCKER" = false ]; then
  CONTAINER_SIZE=$(docker images "$TAG" --format "{{.Size}}")
  echo -e "  Container:  ${CONTAINER_SIZE}"
fi
echo ""

# Next steps
echo -e "${BLUE}Next Steps:${NC}"
if [ "$SKIP_DOCKER" = false ]; then
  echo -e "  1. Test SSE mode:   ${YELLOW}docker run -p 3001:3001 -v \$(pwd)/logs:/app/logs $TAG sse${NC}"
  echo -e "  2. Test stdio mode: ${YELLOW}docker run -i $TAG stdio${NC}"
  echo -e "  3. Run tests:       ${YELLOW}./scripts/docker-security-test.sh $TAG${NC}"
  echo -e "  4. Security scan:   ${YELLOW}trivy image --severity HIGH,CRITICAL $TAG${NC}"
else
  echo -e "  1. Test binary:     ${YELLOW}./binaries/server-bun-arm64 sse${NC}"
  echo -e "  2. Build Docker:    ${YELLOW}$0 --skip-npm --skip-bun${NC}"
fi
echo ""

# Performance hints
echo -e "${BLUE}Performance Note:${NC}"
echo -e "  The bundled binary uses esbuild for optimal dead code elimination."
echo -e "  Expected size reduction: ~20-30% compared to unbundled version."
echo ""

exit 0
