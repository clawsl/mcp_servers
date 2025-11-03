# Cursor/Windsurf Configuration

This document explains how to configure the Sequential Thinking MCP server for use with Cursor or Windsurf.

## HTTPS Endpoint (Required for Cursor/Windsurf)

Cursor and Windsurf require HTTPS for remote MCP connections. The server is configured to provide both HTTP and HTTPS endpoints:

- **HTTP**: `http://localhost:3002/sse` (for Claude Code)
- **HTTPS**: `https://localhost:8043/sse` (for Cursor/Windsurf)

## Configuration

### Cursor

Add this to your Cursor settings (usually in `.cursor/mcp.json` or settings UI):

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "url": "https://localhost:8043/sse",
      "transport": "sse"
    }
  }
}
```

### Windsurf

Add this to your Windsurf settings:

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "url": "https://localhost:8043/sse",
      "transport": "sse"
    }
  }
}
```

## Certificate Trust

Since the server uses a self-signed SSL certificate, you'll need to trust it. See [HTTPS-SETUP.md](./HTTPS-SETUP.md) for detailed instructions on trusting the certificate on your OS.

### Quick macOS Setup

```bash
# Trust the certificate system-wide
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ssl/server.crt

# Verify it's trusted
security find-certificate -c localhost -a | grep localhost
```

## Testing the Connection

```bash
# Test HTTPS endpoint
curl -k https://localhost:8043/health
# Should return: healthy (HTTPS)

# Test SSE connection
curl -k -N https://localhost:8043/sse
# Should return SSE event stream
```

## Architecture

```
┌─────────────────┐
│ Cursor/Windsurf │
└────────┬────────┘
         │ HTTPS (8043)
         ▼
┌─────────────────┐
│  Nginx Proxy    │
│  SSL Enabled    │
└────────┬────────┘
         │ HTTP (3001)
         ▼
┌─────────────────┐
│   MCP Server    │
│  (SSE Backend)  │
└─────────────────┘
```

## Troubleshooting

### Certificate Not Trusted

**Problem**: "Certificate is not trusted" error

**Solution**: Follow the certificate trust instructions in [HTTPS-SETUP.md](./HTTPS-SETUP.md)

### Connection Refused

**Problem**: Cannot connect to `https://localhost:8043`

**Solution**:
```bash
# Check containers are running
docker-compose ps

# Check nginx logs
docker-compose logs nginx-proxy

# Verify port 8043 is not in use by another process
lsof -i :8043
```

### SSE Connection Drops

**Problem**: Connection establishes but drops immediately

**Solution**:
```bash
# Check backend logs
docker-compose logs sequential-thinking-sse

# Verify backend is healthy
curl http://localhost:3001/sse
```

## Multiple Endpoints

You can configure both HTTP and HTTPS endpoints if needed:

```json
{
  "mcpServers": {
    "sequential-thinking-http": {
      "url": "http://localhost:3002/sse",
      "transport": "sse"
    },
    "sequential-thinking-https": {
      "url": "https://localhost:8043/sse",
      "transport": "sse"
    }
  }
}
```

This allows testing both connections or using different endpoints for different purposes.

## Managing the Server

See [README.md](../src/sequentialthinking/README.md) for full server management instructions.

Quick commands:

```bash
# Start server
docker-compose up -d

# Stop server
docker-compose down

# View logs
docker-compose logs -f

# Restart server
docker-compose restart
```

## See Also

- [HTTPS Setup Guide](./HTTPS-SETUP.md) - Detailed SSL certificate setup
- [Sequential Thinking README](../src/sequentialthinking/README.md) - Full server documentation
- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification
