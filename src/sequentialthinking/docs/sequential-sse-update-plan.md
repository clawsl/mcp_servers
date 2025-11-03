# Sequential Thinking MCP Server - SSE Mode Implementation Plan

**Branch:** `add-sse-sequential-thinking`
**Objective:** Add Server-Sent Events (SSE) transport mode to the sequential-thinking MCP server, enabling it to run as a web service in Docker with HTTP-based communication.

---

## Background

Currently, the sequential-thinking server only supports stdio transport, which works well for local CLI usage but doesn't support web-based clients or containerized deployments that need HTTP access. Adding SSE transport (following the pattern from the `everything` server) will enable:

- Running the server in Docker containers with HTTP endpoints
- Web-based MCP clients to connect to the server
- Better support for cloud deployments and development environments
- Consistent transport options across reference MCP servers

---

## Architecture Overview

### Current State
```
src/sequentialthinking/
├── index.ts          # Entry point (stdio only)
├── lib.ts            # SequentialThinkingServer class
├── package.json      # Dependencies
├── Dockerfile        # Single stdio entrypoint
└── README.md         # Documentation
```

### Target State
```
src/sequentialthinking/
├── index.ts          # Entry point (dispatcher)
├── stdio.ts          # Stdio transport implementation (NEW)
├── sse.ts            # SSE transport implementation (NEW)
├── lib.ts            # SequentialThinkingServer class (unchanged)
├── package.json      # Updated dependencies
├── Dockerfile        # Flexible entrypoint supporting args
└── README.md         # Updated with SSE usage
```

---

## Implementation Steps

### Step 1: Refactor Server Creation Logic

**File:** Create `src/sequentialthinking/stdio.ts`

**Rationale:** Extract stdio-specific code from `index.ts` to enable multiple transport implementations.

**Tasks:**
1. Create new file `stdio.ts`
2. Move stdio transport setup from `index.ts` to `stdio.ts`
3. Export a `createServer()` function that returns configured Server instance
4. Keep the main execution logic in `stdio.ts` (server.connect(), runServer(), etc.)
5. Ensure proper error handling and logging

**Reference:** Follow pattern from `src/everything/stdio.ts`

**Key Code Pattern:**
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SequentialThinkingServer } from './lib.js';

// Create and configure server
export function createServer() {
  const server = new Server({
    name: "sequential-thinking-server",
    version: "0.2.0",
  }, {
    capabilities: { tools: {} }
  });

  const thinkingServer = new SequentialThinkingServer();

  // Setup handlers...

  return { server, thinkingServer };
}

// Main execution for stdio transport
async function runServer() {
  const { server } = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sequential Thinking MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
```

---

### Step 2: Create SSE Transport Implementation

**File:** Create `src/sequentialthinking/sse.ts`

**Rationale:** Implement SSE transport to enable HTTP-based communication for web clients and Docker deployments.

**Tasks:**
1. Create new file `sse.ts`
2. Import and setup Express server with CORS middleware
3. Import `SSEServerTransport` from MCP SDK
4. Reuse `createServer()` function from `stdio.ts` (or create shared helper)
5. Implement GET `/sse` endpoint for SSE connection initialization
6. Implement POST `/message` endpoint for client messages
7. Manage transport sessions with Map<sessionId, SSEServerTransport>
8. Handle connection lifecycle (connect, disconnect, cleanup)
9. Configure port via `PORT` environment variable (default: 3001)
10. Add proper error logging

**Reference:** Follow pattern from `src/everything/sse.ts`

**Key Code Pattern:**
```typescript
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from 'cors';
import { createServer } from "./stdio.js";

const app = express();
app.use(cors({
  "origin": "*",
  "methods": "GET,POST",
  "preflightContinue": false,
  "optionsSuccessStatus": 204,
}));

const transports: Map<string, SSEServerTransport> = new Map();

app.get("/sse", async (req, res) => {
  const { server } = createServer();
  const transport = new SSEServerTransport("/message", res);
  transports.set(transport.sessionId, transport);

  await server.connect(transport);
  console.error("Client Connected:", transport.sessionId);

  server.onclose = async () => {
    console.error("Client Disconnected:", transport.sessionId);
    transports.delete(transport.sessionId);
  };
});

app.post("/message", async (req, res) => {
  const sessionId = req?.query?.sessionId as string;
  const transport = transports.get(sessionId);
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    console.error(`No transport found for sessionId ${sessionId}`);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.error(`Sequential Thinking SSE Server running on port ${PORT}`);
});
```

---

### Step 3: Update Entry Point Dispatcher

**File:** Modify `src/sequentialthinking/index.ts`

**Rationale:** Enable dynamic transport selection based on command-line arguments (similar to everything server).

**Tasks:**
1. Modify `index.ts` to act as a dispatcher
2. Parse command-line arguments to determine transport type
3. Dynamically import `stdio.js` or `sse.js` based on args
4. Default to `stdio` if no args provided
5. Add helpful error messages for unknown transport types
6. Keep the shebang (`#!/usr/bin/env node`) for CLI execution

**Reference:** Follow pattern from `src/everything/index.ts`

**Key Code Pattern:**
```typescript
#!/usr/bin/env node

const args = process.argv.slice(2);
const scriptName = args[0] || 'stdio';

async function run() {
  try {
    switch (scriptName) {
      case 'stdio':
        await import('./stdio.js');
        break;
      case 'sse':
        await import('./sse.js');
        break;
      default:
        console.error(`Unknown script: ${scriptName}`);
        console.log('Available scripts:');
        console.log('- stdio (default)');
        console.log('- sse');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error running script:', error);
    process.exit(1);
  }
}

run();
```

---

### Step 4: Update Package Dependencies

**File:** Modify `src/sequentialthinking/package.json`

**Rationale:** Add required dependencies for Express server and SSE transport.

**Tasks:**
1. Add `express` to dependencies (version `^4.21.1` to match everything server)
2. Add `cors` to dependencies (version `^2.8.5` to match everything server)
3. Add `@types/express` to devDependencies (version `^5.0.0` to match everything server)
4. Add `@types/cors` to devDependencies (version `^2.8.19` to match everything server)
5. Add `start:sse` script to run SSE server: `"start:sse": "node dist/sse.js"`
6. Update existing `start` script if needed to explicitly use stdio: `"start": "node dist/index.js"`

**Expected Dependencies Section:**
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.19.1",
    "chalk": "^5.3.0",
    "cors": "^2.8.5",
    "express": "^4.21.1",
    "yargs": "^17.7.2"
  },
  "devDependencies": {
    "@types/cors": "^2.8.19",
    "@types/express": "^5.0.0",
    "@types/node": "^22",
    "@types/yargs": "^17.0.32",
    "@vitest/coverage-v8": "^2.1.8",
    "shx": "^0.3.4",
    "typescript": "^5.3.3",
    "vitest": "^2.1.8"
  }
}
```

---

### Step 5: Update Dockerfile for Flexible Entrypoint

**File:** Modify `src/sequentialthinking/Dockerfile`

**Rationale:** Enable running the container with different transport modes via command-line arguments.

**Tasks:**
1. Change hardcoded `ENTRYPOINT` to support passing arguments
2. Use CMD to set default behavior (stdio) but allow override
3. Ensure the Node entrypoint can accept transport type argument
4. Test both stdio and sse modes in container

**Current Dockerfile Entry:**
```dockerfile
ENTRYPOINT ["node", "dist/index.js"]
```

**Updated Dockerfile Entry (Option 1 - CMD with default):**
```dockerfile
ENTRYPOINT ["node", "dist/index.js"]
CMD ["stdio"]
```

**Updated Dockerfile Entry (Option 2 - Flexible with default):**
```dockerfile
CMD ["node", "dist/index.js", "stdio"]
```

**Usage:**
```bash
# Run with stdio (default)
docker run -i mcp/sequentialthinking

# Run with SSE
docker run -p 3001:3001 mcp/sequentialthinking node dist/index.js sse

# Or with CMD override:
docker run -p 3001:3001 mcp/sequentialthinking sse
```

---

### Step 6: Test SSE Mode Locally

**Rationale:** Ensure SSE implementation works correctly before updating documentation.

**Tasks:**
1. Install dependencies: `cd src/sequentialthinking && npm install`
2. Build the project: `npm run build`
3. Test stdio mode: `npm start` or `node dist/index.js`
4. Test SSE mode: `npm run start:sse` or `node dist/index.js sse`
5. Verify SSE server starts on port 3001
6. Test SSE endpoints:
   - GET http://localhost:3001/sse (should establish SSE connection)
   - POST http://localhost:3001/message?sessionId=<id> (should handle messages)
7. Use MCP Inspector or curl to test the SSE endpoints
8. Verify sequential thinking tool works correctly via SSE
9. Test environment variable PORT override: `PORT=3002 npm run start:sse`
10. Check for any error handling issues

**Testing Commands:**
```bash
# Start SSE server
npm run start:sse

# In another terminal, test connection (basic check)
curl -N http://localhost:3001/sse

# For full MCP protocol testing, use MCP Inspector:
# https://github.com/modelcontextprotocol/inspector
```

---

### Step 7: Build and Test Docker Image

**Rationale:** Ensure Docker container works with SSE mode and exposes the correct port.

**Tasks:**
1. Build Docker image from repository root:
   ```bash
   docker build -t mcp/sequentialthinking-sse -f src/sequentialthinking/Dockerfile .
   ```
2. Test stdio mode (default):
   ```bash
   docker run -i --rm mcp/sequentialthinking-sse
   ```
3. Test SSE mode with port mapping:
   ```bash
   docker run -p 3001:3001 --rm mcp/sequentialthinking-sse sse
   ```
4. Test with custom port:
   ```bash
   docker run -p 3002:3002 -e PORT=3002 --rm mcp/sequentialthinking-sse sse
   ```
5. Verify server is accessible from host:
   ```bash
   curl -N http://localhost:3001/sse
   ```
6. Test with MCP Inspector or client
7. Check Docker logs for proper startup messages
8. Verify graceful shutdown works

---

### Step 8: Update README Documentation

**File:** Modify `src/sequentialthinking/README.md`

**Rationale:** Document new SSE capabilities and usage instructions for users.

**Tasks:**
1. Add new "Transport Modes" section explaining stdio vs SSE
2. Update Configuration section with SSE examples
3. Add Docker SSE usage examples for Claude Desktop
4. Add Docker SSE usage examples for VS Code
5. Add environment variables documentation (PORT, DISABLE_THOUGHT_LOGGING)
6. Add "Running Locally" section with both transport modes
7. Update building instructions to include running SSE server
8. Add troubleshooting section for common SSE issues

**New Sections to Add:**

#### Transport Modes
```markdown
## Transport Modes

The Sequential Thinking server supports two transport modes:

1. **stdio** (default): Standard input/output communication, suitable for local CLI usage
2. **sse**: Server-Sent Events over HTTP, suitable for web-based clients and Docker deployments

### Running with stdio (default)
```bash
npx -y @modelcontextprotocol/server-sequential-thinking
# or
node dist/index.js
# or
npm start
```

### Running with SSE
```bash
node dist/index.js sse
# or
npm run start:sse
```

The SSE server runs on port 3001 by default (configurable via PORT environment variable).
```

#### Docker SSE Configuration
```markdown
### Docker with SSE (for web-based clients)

```json
{
  "mcpServers": {
    "sequential-thinking-sse": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-p", "3001:3001",
        "mcp/sequentialthinking",
        "sse"
      ]
    }
  }
}
```

With custom port:
```json
{
  "mcpServers": {
    "sequential-thinking-sse": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-p", "3002:3002",
        "-e", "PORT=3002",
        "mcp/sequentialthinking",
        "sse"
      ]
    }
  }
}
```
```

#### Environment Variables
```markdown
## Environment Variables

- `PORT`: Port number for SSE server (default: 3001)
- `DISABLE_THOUGHT_LOGGING`: Set to `true` to disable thought logging output (default: false)
```

---

### Step 9: Add Docker Compose Example (Optional)

**File:** Create `src/sequentialthinking/docker-compose.yml`

**Rationale:** Provide easy local development setup for testing SSE mode.

**Tasks:**
1. Create docker-compose.yml file
2. Define service for sequential-thinking SSE server
3. Configure port mapping and environment variables
4. Add comments explaining usage
5. Update README with docker-compose instructions

**Example docker-compose.yml:**
```yaml
version: '3.8'

services:
  sequential-thinking-sse:
    build:
      context: ../..
      dockerfile: src/sequentialthinking/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - PORT=3001
      - DISABLE_THOUGHT_LOGGING=false
    command: ["sse"]
    restart: unless-stopped

  # Optional: Run stdio version (requires stdin)
  sequential-thinking-stdio:
    build:
      context: ../..
      dockerfile: src/sequentialthinking/Dockerfile
    command: ["stdio"]
    stdin_open: true
    tty: true
```

**Usage:**
```bash
# Start SSE server
docker-compose up sequential-thinking-sse

# Start in background
docker-compose up -d sequential-thinking-sse

# View logs
docker-compose logs -f sequential-thinking-sse

# Stop
docker-compose down
```

---

## Testing Plan

### Unit Tests
- No changes needed to existing tests in `__tests__/lib.test.ts`
- Consider adding integration tests for SSE endpoints (optional)

### Integration Tests

1. **Stdio Transport:**
   - Verify existing stdio functionality still works
   - Test with MCP client (Claude Desktop, VS Code)
   - Ensure backward compatibility

2. **SSE Transport:**
   - Test GET /sse endpoint establishes connection
   - Test POST /message endpoint handles messages
   - Test sessionId management
   - Test multiple concurrent sessions
   - Test connection cleanup on disconnect
   - Verify CORS headers are present
   - Test sequential thinking tool via SSE

3. **Docker:**
   - Test stdio mode in container
   - Test SSE mode in container with port mapping
   - Test environment variable configuration
   - Test graceful shutdown

### Manual Testing Checklist
- [ ] Build project successfully
- [ ] Run stdio mode locally
- [ ] Run SSE mode locally
- [ ] Connect MCP Inspector to SSE server
- [ ] Invoke sequential thinking tool via SSE
- [ ] Build Docker image successfully
- [ ] Run Docker container in stdio mode
- [ ] Run Docker container in SSE mode
- [ ] Access SSE endpoints from host
- [ ] Test with custom PORT variable
- [ ] Verify DISABLE_THOUGHT_LOGGING works
- [ ] Test graceful shutdown
- [ ] Verify documentation accuracy

---

## Rollout Plan

1. **Development:**
   - Complete implementation steps 1-5
   - Local testing (step 6)

2. **Testing:**
   - Docker testing (step 7)
   - Integration testing with MCP clients

3. **Documentation:**
   - Update README (step 8)
   - Add docker-compose example (step 9)

4. **Review:**
   - Code review
   - Documentation review
   - User testing

5. **Merge:**
   - Merge to main branch
   - Tag release version
   - Publish to npm (if applicable)

---

## Success Criteria

- [ ] Sequential-thinking server supports both stdio and SSE transports
- [ ] Entry point (index.ts) correctly dispatches to selected transport
- [ ] SSE server runs on configurable port (default 3001)
- [ ] Docker container supports both transport modes via arguments
- [ ] All existing stdio functionality continues to work
- [ ] README includes clear SSE usage instructions
- [ ] No breaking changes to existing users
- [ ] Code follows repository patterns (matches everything server approach)
- [ ] Proper error handling and logging in place

---

## Potential Issues and Mitigations

### Issue 1: Shared Server Creation Logic
**Problem:** Both stdio.ts and sse.ts need to create servers with identical configuration.

**Solution:**
- Option A: Export `createServer()` from stdio.ts and import in sse.ts
- Option B: Create shared `server.ts` file with server creation logic (like everything.ts)
- **Recommendation:** Option B for cleaner separation and future maintainability

### Issue 2: Dockerfile Argument Passing
**Problem:** Docker ENTRYPOINT vs CMD complexity for argument passing.

**Solution:**
- Use flexible CMD that allows override: `CMD ["node", "dist/index.js", "stdio"]`
- Or use ENTRYPOINT + CMD combination for better flexibility
- **Recommendation:** Test both approaches and use the one that's most intuitive for users

### Issue 3: Port Conflicts in Docker
**Problem:** Port 3001 might already be in use on host.

**Solution:**
- Document PORT environment variable clearly
- Provide examples with different ports
- Include in troubleshooting section
- **Recommendation:** Use docker-compose for easier port management

### Issue 4: Session Management Memory Leaks
**Problem:** TransportMap might grow indefinitely if cleanup fails.

**Solution:**
- Implement proper cleanup on server.onclose
- Add session timeout mechanism
- Monitor and log active sessions
- **Recommendation:** Follow everything server pattern exactly, add debug logging

---

## Future Enhancements (Out of Scope)

- Add WebSocket transport support
- Add metrics/monitoring endpoints
- Add health check endpoint for Docker
- Add session persistence across restarts
- Add authentication/authorization for SSE endpoints
- Add rate limiting for production deployments

---

## References

- MCP SDK Documentation: https://modelcontextprotocol.io
- Everything Server SSE Implementation: `src/everything/sse.ts`
- MCP Inspector: https://github.com/modelcontextprotocol/inspector
- Express.js Documentation: https://expressjs.com
- Server-Sent Events Specification: https://html.spec.whatwg.org/multipage/server-sent-events.html
