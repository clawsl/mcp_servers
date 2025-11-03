# SSE Transport Debugging Summary

## Problem Statement

After implementing SSE (Server-Sent Events) transport for the Sequential Thinking MCP server, Claude Code was unable to connect successfully. The server would show "failed" status and clients would connect then immediately disconnect.

## Timeline of Issues and Fixes

### Issue 1: Wrong Transport Type in Configuration
**Symptom**: Server added to Claude Code but showing as "failed" status

**Initial Config** (`~/.claude.json`):
```json
{
  "mcpServers": {
    "seq_think": {
      "type": "http",  // ❌ WRONG
      "url": "http://127.0.0.1:3002/sse"
    }
  }
}
```

**Fix**: Change transport type from `"http"` to `"sse"`
```json
{
  "mcpServers": {
    "seq_think": {
      "type": "sse",  // ✅ CORRECT
      "url": "http://127.0.0.1:3002/sse"
    }
  }
}
```

**CLI Command**:
```bash
claude mcp remove seq_think
claude mcp add --scope user --transport sse seq_think http://127.0.0.1:3002/sse
```

**Lesson**: SSE transport requires explicit `type: "sse"` configuration.

---

### Issue 2: Incorrect SSE Endpoint Format
**Symptom**: Server still failing after transport type fix

**Problem**: SSE endpoint event was sending wrong message format

**Initial Code**:
```typescript
transport = new SSEServerTransport("/message", res);
// This would make POST go to: /message?sessionId=xxx
```

**Hints from Working Setup**:
- ✅ Correct: GET /mcp/sse then POST /mcp?sessionId=<id>
- ❌ Wrong: POST /mcp/sse
- Session ID must come from SSE stream, not generated randomly
- Session ID must be in query parameter, not header or body

**Fix**:
```typescript
transport = new SSEServerTransport("/sse", res);
// Now POST goes to: /sse?sessionId=xxx
```

**Lesson**: The first parameter to `SSEServerTransport` becomes the POST endpoint path. It must match your POST route handler.

---

### Issue 3: Missing Express JSON Body Parser
**Symptom**: Clients connecting but immediately disconnecting

**Problem**: Express wasn't parsing POST request bodies

**Initial Code**:
```typescript
const app = express();
app.use(cors({ ... }));
// Missing: express.json()
```

**Fix**:
```typescript
const app = express();
app.use(express.json()); // ✅ CRITICAL - parses POST body
app.use(cors({ ... }));
```

**Lesson**: `express.json()` middleware is essential for the MCP SDK to receive message payloads.

---

### Issue 4: Wrong POST Endpoint Path
**Symptom**: 404 errors when client tried to send messages

**Initial Code**:
```typescript
app.post("/message", async (req, res) => {
  // Handler code
});
```

**Fix**:
```typescript
app.post("/sse", async (req, res) => {
  // Handler code - now matches SSEServerTransport parameter
});
```

**Lesson**: POST endpoint must match the path given to `SSEServerTransport` constructor.

---

### Issue 5: THREE CRITICAL SSE IMPLEMENTATION BUGS

After examining a working reference implementation (`/Users/klaus.fleck/dev/cipher/src/app/mcp/mcp_sse_server.ts`), we discovered **three critical implementation errors**:

#### Critical Bug 1: Awaiting `server.connect(transport)` Blocks SSE Stream

**Wrong Code**:
```typescript
transport = new SSEServerTransport("/sse", res);
await server.connect(transport);  // ❌ BLOCKS the response!
console.error("Client Connected:", transport.sessionId);
```

**Why It Fails**:
- The SSE transport MUST send HTTP headers and start the event stream immediately
- Awaiting `connect()` blocks the response, preventing the SSE handshake
- Client never receives the initial `event: endpoint` message with session ID

**Correct Code**:
```typescript
transport = new SSEServerTransport("/sse", res);
server.connect(transport);  // ✅ NO await - lets SSE stream establish
console.error("Client Connected:", transport.sessionId);
```

**Reference**: `/Users/klaus.fleck/dev/cipher/src/app/mcp/mcp_sse_server.ts:140`

---

#### Critical Bug 2: Missing Third Parameter to `handlePostMessage()`

**Wrong Code**:
```typescript
app.post("/sse", async (req, res) => {
  const transport = transports.get(sessionId);
  await transport.handlePostMessage(req, res);  // ❌ Missing req.body!
});
```

**Why It Fails**:
- The MCP SDK expects the message payload as the third parameter
- Without it, the transport cannot parse MCP protocol messages
- Results in silent failures or protocol errors

**Correct Code**:
```typescript
app.post("/sse", async (req, res) => {
  const transport = transports.get(sessionId);
  await transport.handlePostMessage(req, res, req.body);  // ✅ Three parameters
});
```

**Reference**: `/Users/klaus.fleck/dev/cipher/src/app/mcp/mcp_sse_server.ts:231`

---

#### Critical Bug 3: Wrong Disconnect Detection Method

**Wrong Code**:
```typescript
const { server } = createServer();
const transport = new SSEServerTransport("/sse", res);
await server.connect(transport);

server.onclose = async () => {  // ❌ server.onclose doesn't exist!
  console.error("Client Disconnected:", transport.sessionId);
  transports.delete(transport.sessionId);
};
```

**Why It Fails**:
- The MCP `Server` object doesn't have an `onclose` handler
- This code creates a property but nothing ever calls it
- Resources never get cleaned up when clients disconnect

**Correct Code**:
```typescript
const { server } = createServer();
const transport = new SSEServerTransport("/sse", res);
server.connect(transport);  // No await

// Listen to HTTP request close event
req.on('close', () => {  // ✅ Correct disconnect detection
  console.error("Client Disconnected:", transport.sessionId);
  transports.delete(transport.sessionId);
  servers.delete(transport.sessionId);
});
```

**Additional Error Handling**:
```typescript
transport.onerror = (error: unknown) => {
  console.error("SSE transport error:", error);
  transports.delete(transport.sessionId);
  servers.delete(transport.sessionId);
};
```

**Reference**: `/Users/klaus.fleck/dev/cipher/src/app/mcp/mcp_sse_server.ts:153-167, 170-173`

---

## Final Working Implementation

```typescript
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from 'cors';
import { createServer } from "./stdio.js";

const app = express();
app.use(express.json()); // CRITICAL
app.use(cors({
  "origin": "*",
  "methods": "GET,POST",
  "preflightContinue": false,
  "optionsSuccessStatus": 204,
}));

const transports: Map<string, SSEServerTransport> = new Map();
const servers: Map<string, any> = new Map();

app.get("/sse", async (req, res) => {
  const { server } = createServer();

  const transport = new SSEServerTransport("/sse", res);
  transports.set(transport.sessionId, transport);
  servers.set(transport.sessionId, server);

  // CRITICAL: Don't await - blocks SSE stream
  server.connect(transport);
  console.error("Client Connected:", transport.sessionId);

  // CRITICAL: Use req.on('close') not server.onclose
  req.on('close', () => {
    console.error("Client Disconnected:", transport.sessionId);
    transports.delete(transport.sessionId);
    servers.delete(transport.sessionId);
  });

  // Handle transport errors
  transport.onerror = (error: unknown) => {
    console.error("SSE transport error:", error);
    transports.delete(transport.sessionId);
    servers.delete(transport.sessionId);
  };
});

app.post("/sse", async (req, res) => {
  const sessionId = (req?.query?.sessionId as string) ||
                    (req.headers['x-session-id'] as string);

  if (!sessionId) {
    res.status(400).json({ error: "Session ID required" });
    return;
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // CRITICAL: Pass three parameters
  await transport.handlePostMessage(req, res, req.body);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.error(`Server running on port ${PORT}`);
});
```

## Session ID Handling

The implementation supports flexible session ID handling:

```typescript
// Primary: Query parameter or header
const sessionId = (req?.query?.sessionId as string) ||
                  (req.headers['x-session-id'] as string);

// Optional: Fallback to only transport in single-connection scenarios
if (!sessionId && transports.size === 1) {
  sessionId = Array.from(transports.keys())[0];
}
```

This makes session ID:
- **Required** when multiple clients are connected
- **Optional** when only one client is connected (uses the only available transport)

## Key Takeaways

### The Three Must-Have Fixes
1. **Never await `server.connect(transport)`** - It blocks the SSE stream
2. **Always pass three parameters to `handlePostMessage(req, res, req.body)`** - Otherwise messages can't be parsed
3. **Use `req.on('close')` for disconnect handling** - `server.onclose` doesn't exist

### SSE Endpoint Pattern
- GET /sse → Client initiates connection, receives session ID
- POST /sse?sessionId=xxx → Client sends MCP messages
- The constructor parameter to `SSEServerTransport` determines the POST path

### Express Configuration
```typescript
app.use(express.json());  // REQUIRED for message parsing
app.use(cors({ ... }));    // REQUIRED for cross-origin requests
```

### Client Configuration
```json
{
  "type": "sse",  // NOT "http"
  "url": "http://localhost:3002/sse"
}
```

## Reference Implementation

The debugging breakthrough came from examining a working SSE implementation at:
`/Users/klaus.fleck/dev/cipher/src/app/mcp/mcp_sse_server.ts`

This reference implementation revealed all three critical bugs in our initial code.

## Testing the Connection

```bash
# Test SSE endpoint
curl -N http://localhost:3002/sse

# Expected output:
event: endpoint
data: /sse

event: message
data: {"jsonrpc":"2.0","id":1234,"method":"initialize",...}

# Test with Claude Code CLI
claude mcp add --scope user --transport sse seq_think http://127.0.0.1:3002/sse
claude mcp list
# Should show status: "connected"
```

## Production Deployment

The final setup includes:
- **Docker Compose** with multi-architecture support (ARM64 + AMD64)
- **Nginx reverse proxy** for dual endpoints:
  - HTTP on port 3002 for Claude Code
  - HTTPS on port 8043 for Cursor/Windsurf
- **Self-signed SSL certificate** for HTTPS endpoint

See `docker-compose.yml` and `nginx/nginx-dual.conf` for configuration details.

## Conclusion

SSE transport for MCP requires careful attention to:
1. Async flow control (no await on connect)
2. Correct parameter passing (three params to handlePostMessage)
3. Proper event handling (req.on('close') not server.onclose)
4. Express middleware configuration (express.json())
5. Client configuration (type: "sse")

Following these patterns ensures reliable SSE connections with MCP clients.
