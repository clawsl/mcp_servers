# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the official Model Context Protocol (MCP) servers repository, containing reference implementations that demonstrate MCP features and capabilities. The repository is a **monorepo** using npm workspaces, with each server in `src/` as an independent package.

## Architecture

### Monorepo Structure
- **Root**: Contains workspace configuration and shared TypeScript config
- **src/**: Each subdirectory is a separate MCP server package with its own:
  - `package.json` - Server-specific dependencies and scripts
  - `README.md` - Server documentation and usage instructions
  - `index.ts` - Entry point (typically with shebang for CLI execution)
  - `Dockerfile` - Multi-stage Docker build configuration
  - `__tests__/` - Vitest test suite (if applicable)
  - `vitest.config.ts` - Test configuration (if tests exist)

### Server Types
Reference servers demonstrating MCP protocol features:
- **everything**: Comprehensive test/reference server exercising all MCP protocol features (Tools, Resources, Prompts). Supports multiple transports: stdio, SSE, streamableHttp
- **filesystem**: Secure file operations with configurable access controls, demonstrates Roots protocol for dynamic directory permissions
- **memory**: Knowledge graph-based persistent memory using entities, relations, and observations
- **sequential-thinking**: Dynamic problem-solving through thought sequences
- **fetch**: Web content fetching and conversion
- **git**: Git repository operations
- **time**: Time and timezone utilities

### Key Architectural Patterns

**Transport Flexibility**: Servers support different transports (stdio, SSE, HTTP). The `everything` server demonstrates all transport options via different entry points (`stdio.ts`, `sse.ts`, `streamableHttp.ts`).

**Roots Protocol**: The filesystem server demonstrates dynamic access control via the Roots protocol - clients can update allowed directories at runtime without server restart.

**Knowledge Graph Pattern**: The memory server implements a graph structure with entities (nodes), relations (edges), and observations (node attributes).

## Development Commands

### Workspace-Level (Root)
```bash
npm run build           # Build all servers in workspaces
npm run watch          # Watch mode for all servers
npm run publish-all    # Publish all workspace packages to npm
npm run link-all       # Link all workspace packages locally
```

### Server-Level (in src/[server-name])
```bash
npm ci                          # Clean install dependencies
npm run build                   # Compile TypeScript to dist/
npm run watch                   # Watch mode for development
npm run prepare                 # Build step (runs automatically on npm install)
npm test                        # Run tests with vitest (if tests exist)
npm test -- --coverage          # Run tests with coverage report
```

### Running Servers Locally
```bash
# After building, run directly:
node src/[server-name]/dist/index.js [args]

# Or via npm in server directory:
npm start

# For servers with multiple transport support:
node src/[server-name]/dist/index.js stdio          # stdio transport (default)
node src/[server-name]/dist/index.js sse            # SSE transport
npm run start:sse                                   # SSE via npm script

# Everything server:
npm run start          # stdio (default)
npm run start:sse      # SSE transport
npm run start:streamableHttp  # streamable HTTP transport
```

### Docker Build
```bash
# Build from repository root:
docker build -t mcp/[server-name] -f src/[server-name]/Dockerfile .

# Example:
docker build -t mcp/filesystem -f src/filesystem/Dockerfile .

# Multi-architecture build (ARM64 + AMD64):
docker build --platform linux/amd64,linux/arm64 -t mcp/[server-name] -f src/[server-name]/Dockerfile .
```

### Docker Compose
```bash
# Start services (if docker-compose.yml exists in server directory):
docker-compose -f src/[server-name]/docker-compose.yml up -d

# View logs:
docker-compose -f src/[server-name]/docker-compose.yml logs -f

# Stop services:
docker-compose -f src/[server-name]/docker-compose.yml down

# Rebuild after code changes:
docker-compose -f src/[server-name]/docker-compose.yml up -d --build
```

## Testing

- **Framework**: Vitest (required for all new tests per CONTRIBUTING.md)
- **Test Location**: `src/[server-name]/__tests__/` directory
- **Naming**: `*.test.ts` files
- **Configuration**: `vitest.config.ts` in each server directory
- **Coverage**: Use `npm test -- --coverage` to generate coverage reports
- **Single test**: Run `npm test -- __tests__/filename.test.ts` to run a specific test file

Servers with tests: memory, filesystem, sequential-thinking

## TypeScript Configuration

- **Target**: ES2022
- **Module**: Node16 (ESM with .js extensions in imports)
- **Strict mode**: Enabled
- All source files use ES modules (`"type": "module"` in package.json)
- Import paths must include `.js` extension even for `.ts` files

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- **typescript.yml**: Main workflow for TS servers
  - Auto-detects packages via `find . -name package.json`
  - Runs tests (if they exist) for each server
  - Builds all servers
  - Publishes to npm on release events
- **python.yml**: For Python servers
- **release.yml**: Release automation
- **claude.yml**: Claude-specific checks

## Contributing Guidelines

From CONTRIBUTING.md:
- **Accepted**: Bug fixes, usability improvements, enhancements demonstrating MCP protocol features (especially underutilized features like Resources, Prompts, Roots)
- **Selective**: New features not core to server purpose or highly opinionated
- **Not Accepted**: New server implementations (publish independently and add to README)
- **Testing**: Use Vitest for all TypeScript tests
- **Documentation**: Focus on ergonomic improvements over documenting pain points

## Docker Patterns

All Dockerfiles follow multi-stage build pattern:
1. **Builder stage**: Install deps, run TypeScript compilation
2. **Release stage**: Copy only dist/ and production dependencies
3. Use `node:22-alpine` for minimal image size
4. Use npm cache mounts for faster builds
5. Entrypoint directly executes compiled `dist/index.js`

## Server-Specific Notes

### filesystem
- Supports two directory access control methods: command-line args or dynamic Roots protocol
- Roots protocol allows runtime directory updates via `roots/list_changed` notifications
- Always restricts operations to explicitly allowed directories
- Test path validation and roots utilities separately

### memory
- Storage: JSONL file format (default: `memory.jsonl` in server directory)
- Environment variable: `MEMORY_FILE_PATH` for custom storage location
- Backward compatibility: Migrates old `memory.json` to `memory.jsonl` automatically
- Graph operations: Entities (nodes), Relations (edges), Observations (node data)

### everything
- Entry point (`index.ts`) dispatches to different transport implementations
- Accepts script name as first arg: `stdio` (default), `sse`, or `streamableHttp`
- Uses zod for input validation with zod-to-json-schema for MCP schema conversion
- Demonstrates all MCP capabilities: Tools, Resources, Prompts, sampling, roots, logging levels

### sequential-thinking
- Uses chalk for colored console output
- yargs for CLI argument parsing
- Designed for iterative, reflective problem-solving with thought sequences
- Supports both stdio and SSE transports
- SSE server runs on port 3001 by default (configurable via PORT env var)
- Environment variable: `DISABLE_THOUGHT_LOGGING` to control logging verbosity

## SSE Transport Implementation

For servers implementing SSE (Server-Sent Events) transport, follow these critical patterns:

### Three Critical Requirements

1. **DO NOT await `server.connect(transport)`**
   ```typescript
   // ❌ WRONG - blocks the SSE stream
   await server.connect(transport);

   // ✅ CORRECT - allows immediate connection
   server.connect(transport);
   ```

2. **Pass THREE parameters to `handlePostMessage()`**
   ```typescript
   // ❌ WRONG - missing request body
   await transport.handlePostMessage(req, res);

   // ✅ CORRECT - includes parsed JSON body
   await transport.handlePostMessage(req, res, req.body);
   ```

3. **Use `req.on('close')` for disconnect handling**
   ```typescript
   // ❌ WRONG - server.onclose doesn't exist
   server.onclose = async () => { /* cleanup */ };

   // ✅ CORRECT - HTTP request close event
   req.on('close', () => {
     transports.delete(sessionId);
     servers.delete(sessionId);
   });
   ```

### SSE Endpoint Pattern

**GET /sse** - Initiates SSE connection
- Creates SSEServerTransport with endpoint path
- Sends `event: endpoint` with session ID
- Keeps connection open for server-to-client events

**POST /sse?sessionId=xxx** - Sends MCP messages
- Session ID from query parameter or `x-session-id` header
- Request body contains MCP protocol message
- Routes to correct transport by session ID

### Required Express Middleware

```typescript
app.use(express.json());  // CRITICAL - parses POST body
app.use(cors({
  origin: "*",
  methods: "GET,POST"
}));
```

### Session Management

Session ID has fallback logic for single-connection scenarios:
- Primary: query parameter `?sessionId=xxx`
- Fallback: `x-session-id` header
- Optional: If only one transport exists, use it automatically

See `src/sequentialthinking/CLAUDE.md` for comprehensive SSE debugging guide
