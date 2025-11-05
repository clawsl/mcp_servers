#!/bin/bash
#
# Build script for Option 2 POC: Bun + Distroless
#
# Usage:
#   ./build.sh [--platform PLATFORM] [--tag TAG]
#
# Options:
#   --platform    Target platform (linux/amd64, linux/arm64, or linux/amd64,linux/arm64)
#                 Default: linux/amd64
#   --tag         Docker image tag
#                 Default: mcp/sequentialthinking:bun-poc
#

set -e  # Exit on error

# Default values
PLATFORM="${PLATFORM:-linux/amd64}"
TAG="${TAG:-mcp/sequentialthinking:bun-poc}"
DOCKERFILE="distroless/option2/Dockerfile.bun"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [--platform PLATFORM] [--tag TAG]"
      echo ""
      echo "Options:"
      echo "  --platform    Target platform (default: linux/amd64)"
      echo "  --tag         Docker image tag (default: mcp/sequentialthinking:bun-poc)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run '$0 --help' for usage"
      exit 1
      ;;
  esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Building Bun + Distroless POC${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Platform: ${YELLOW}${PLATFORM}${NC}"
echo -e "Tag:      ${YELLOW}${TAG}${NC}"
echo -e "Dockerfile: ${YELLOW}${DOCKERFILE}${NC}"
echo ""

# Check if Dockerfile exists
if [ ! -f "$DOCKERFILE" ]; then
  echo -e "${RED}Error: Dockerfile not found: $DOCKERFILE${NC}"
  exit 1
fi

# Build the image
echo -e "${GREEN}Building Docker image...${NC}"
docker buildx build \
  --platform "$PLATFORM" \
  --tag "$TAG" \
  --file "$DOCKERFILE" \
  --load \
  .

if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}Build Successful!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""

  # Show image details
  echo -e "${GREEN}Image Details:${NC}"
  docker images "$TAG" --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

  echo ""
  echo -e "${GREEN}Next Steps:${NC}"
  echo -e "1. Run tests: ${YELLOW}./distroless/option2/test.sh${NC}"
  echo -e "2. Test SSE mode: ${YELLOW}docker run -p 3001:3001 $TAG sse${NC}"
  echo -e "3. Test stdio mode: ${YELLOW}docker run -i $TAG stdio${NC}"

else
  echo ""
  echo -e "${RED}Build failed!${NC}"
  exit 1
fi
