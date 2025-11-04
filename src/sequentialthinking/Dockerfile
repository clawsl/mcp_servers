# Dockerfile - Secure configuration with Node.js 22 LTS
# Using Node.js 22 "Jod" - Active LTS (supported until 2027-04-30)
# Alpine 3.20 base for minimal attack surface
FROM node:22-alpine

# Install security updates and required tools
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Create non-root user and group
# Note: node:alpine already has 'node' user (UID 1000), we create our own
RUN deluser --remove-home node 2>/dev/null || true && \
    addgroup -g 1000 mcpuser && \
    adduser -u 1000 -G mcpuser -s /bin/sh -D mcpuser

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install production dependencies only (skip scripts since we have pre-built dist)
RUN npm install --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy pre-built application (build locally before Docker)
COPY dist ./dist

# Change ownership to non-root user
RUN chown -R mcpuser:mcpuser /app

# Create logs directory with correct permissions
RUN mkdir -p /app/logs && \
    chown -R mcpuser:mcpuser /app/logs

# Switch to non-root user
USER mcpuser

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js", "sse"]
