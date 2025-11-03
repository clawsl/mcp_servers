# MCP Sequential Thinking Server - Development Guidelines

## Build, Test & Run Commands
- Build: `npm run build` - Compiles TypeScript to JavaScript
- Watch mode: `npm run watch` - Watches for changes and rebuilds automatically
- Run stdio server: `npm run start` or `node dist/index.js` - Starts with stdio transport
- Run SSE server: `node dist/index.js sse` - Starts with SSE transport on port 3001 (configurable via PORT env var)
- Docker build: `docker build -t mcp/sequentialthinking-sse -f src/sequentialthinking/Dockerfile .`
- Docker Compose (production): `docker-compose up -d` - Starts dual HTTP/HTTPS endpoints

## SSE Implementation - Critical Learnings

### The Three Critical Fixes for SSE Transport

After debugging connection issues with Claude Code, we identified **three critical implementation details** that are essential for SSE transport to work correctly:

#### 1. DO NOT await `server.connect(transport)`
```typescript
// ❌ WRONG - blocks the SSE stream from being established
await server.connect(transport);

// ✅ CORRECT - allows SSE connection to establish immediately
server.connect(transport);
```

**Why**: The SSE transport must send headers and start the event stream immediately. Awaiting the connect() call blocks the response, preventing the client from receiving the initial SSE handshake.

#### 2. Pass THREE parameters to `handlePostMessage()`
```typescript
// ❌ WRONG - missing request body
await transport.handlePostMessage(req, res);

// ✅ CORRECT - includes the parsed JSON body
await transport.handlePostMessage(req, res, req.body);
```

**Why**: The MCP SDK's SSEServerTransport expects the message payload as the third parameter. Without it, the transport cannot process incoming MCP protocol messages.

#### 3. Use `req.on('close')` for disconnect handling
```typescript
// ❌ WRONG - server.onclose doesn't exist
server.onclose = async () => {
  transports.delete(transport.sessionId);
};

// ✅ CORRECT - listen to HTTP request close event
req.on('close', () => {
  console.error("Client Disconnected:", transport.sessionId);
  transports.delete(transport.sessionId);
  servers.delete(transport.sessionId);
});
```

**Why**: The HTTP request object's 'close' event is the proper way to detect client disconnection in Express/Node.js. The MCP Server object doesn't have an onclose handler.

### SSE Endpoint Pattern

The correct SSE transport pattern follows this flow:

1. **GET /sse** - Client initiates SSE connection
   - Server creates SSEServerTransport with endpoint path "/sse"
   - Server sends `event: endpoint` with session ID
   - Connection stays open for server-to-client events

2. **POST /sse?sessionId=xxx** - Client sends MCP messages
   - Session ID comes from query parameter or x-session-id header
   - Request body contains the MCP protocol message
   - Server routes to correct transport by session ID

```typescript
// Correct SSEServerTransport initialization
transport = new SSEServerTransport("/sse", res);
// This makes POST messages go to: /sse?sessionId=xxx
```

### Session ID Handling

The session ID has **fallback logic** for convenience:

```typescript
// Try query param or header first
const sessionId = (req?.query?.sessionId as string) || (req.headers['x-session-id'] as string);

// Optional: Fallback to only active transport in single-connection scenarios
if (!sessionId && transports.size === 1) {
  sessionId = Array.from(transports.keys())[0];
}
```

This makes session ID:
- **Required** when multiple clients are connected
- **Optional** when only one client is connected (server uses the only available transport)

### Required Express Middleware

```typescript
app.use(express.json()); // CRITICAL - parses POST body for handlePostMessage()
app.use(cors({
  "origin": "*",
  "methods": "GET,POST",
  "preflightContinue": false,
  "optionsSuccessStatus": 204,
}));
```

## Production Docker Setup

### Architecture: Dual Endpoint Setup

```
┌──────────────┐         ┌──────────────┐
│ Claude Code  │────────>│   Port 3002  │
└──────────────┘  HTTP   │   (HTTP)     │
                          │              │
┌──────────────┐         │    Nginx     │
│Cursor/       │────────>│   Port 8043  │
│Windsurf      │  HTTPS  │   (HTTPS)    │
└──────────────┘         └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │  MCP Server  │
                          │  Port 3001   │
                          └──────────────┘
```

### Multi-Architecture Support

The Docker setup supports both ARM64 (Apple Silicon) and AMD64 (Intel/AMD):

```yaml
build:
  context: .
  dockerfile: src/sequentialthinking/Dockerfile
  platforms:
    - linux/amd64
    - linux/arm64
```

This allows:
- **Apple Silicon Macs** to run native ARM64 containers (no Rosetta emulation)
- **Intel/AMD systems** to run AMD64 containers
- **Cross-platform deployment** with the same image

### Client Configuration

**Claude Code** (`~/.claude.json`):
```json
{
  "mcpServers": {
    "sequential-thinking": {
      "type": "sse",
      "url": "http://localhost:3002/sse"
    }
  }
}

// Or via CLI:
// claude mcp add --scope user --transport sse seq_think http://127.0.0.1:3002/sse
```

**Important**: Must use `type: "sse"` not `type: "http"` for SSE transport!

**Cursor/Windsurf** (see `docs/CURSOR-WINDSURF-CONFIG.md`):
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

### Docker Compose Commands

```bash
# Start all services (backend + nginx proxy)
docker-compose up -d

# View logs
docker-compose logs -f sequential-thinking-sse
docker-compose logs -f nginx-proxy

# Test endpoints
curl -N http://localhost:3002/sse          # HTTP endpoint
curl -k -N https://localhost:8043/sse      # HTTPS endpoint

# Rebuild after code changes
docker-compose down
docker-compose up -d --build

# Stop all services
docker-compose down
```

## Code Style Guidelines

- Use ES modules with `.js` extension in import paths
- Strictly type all functions and variables with TypeScript
- Follow zod schema patterns for tool input validation
- Prefer async/await over callbacks and Promise chains
- Place all imports at top of file, grouped by external then internal
- Use descriptive variable names that clearly indicate purpose
- Implement proper cleanup for timers and resources in server shutdown
- Follow camelCase for variables/functions, PascalCase for types/classes, UPPER_CASE for constants
- Handle errors with try/catch blocks and provide clear error messages
- Use consistent indentation (2 spaces) and trailing commas in multi-line objects

## Debugging SSE Connections

### Common Issues and Solutions

1. **"Failed to reconnect" in Claude Code**
   - Check transport type is `"sse"` not `"http"` in config
   - Verify server is running: `curl -N http://localhost:3002/sse`
   - Check server logs: `docker-compose logs --tail=20 sequential-thinking-sse`

2. **Client connects then immediately disconnects**
   - Ensure `express.json()` middleware is present
   - Verify NOT awaiting `server.connect(transport)`
   - Check `handlePostMessage()` receives three parameters

3. **"Session not found" errors on POST requests**
   - Verify session ID in query param: `/sse?sessionId=xxx`
   - Check transport is stored in Map after GET /sse
   - Ensure session ID matches between GET and POST

### Logging and Monitoring

The server logs key events to stderr (configurable via `DISABLE_THOUGHT_LOGGING`):

```typescript
console.error('Client Connected:', transport.sessionId);
console.error('Client Message from', sessionId);
console.error('Client Disconnected:', transport.sessionId);
console.error('SSE transport error:', error);
```

View logs in Docker:
```bash
docker-compose logs -f sequential-thinking-sse
```

## Environment Variables

- `PORT` - Server port (default: 3001)
- `DISABLE_THOUGHT_LOGGING` - Set to `true` to disable thought logging (default: false)

## Reference Implementation

The SSE implementation was debugged by comparing against a working reference implementation at:
`/Users/klaus.fleck/dev/cipher/src/app/mcp/mcp_sse_server.ts`

Key insights came from this reference implementation that resolved connection issues.
