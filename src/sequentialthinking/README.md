# Sequential Thinking MCP Server

An MCP server implementation that provides a tool for dynamic and reflective problem-solving through a structured thinking process.

## Features

- Break down complex problems into manageable steps
- Revise and refine thoughts as understanding deepens
- Branch into alternative paths of reasoning
- Adjust the total number of thoughts dynamically
- Generate and verify solution hypotheses

## Tool

### sequential_thinking

Facilitates a detailed, step-by-step thinking process for problem-solving and analysis.

**Inputs:**
- `thought` (string): The current thinking step
- `nextThoughtNeeded` (boolean): Whether another thought step is needed
- `thoughtNumber` (integer): Current thought number
- `totalThoughts` (integer): Estimated total thoughts needed
- `isRevision` (boolean, optional): Whether this revises previous thinking
- `revisesThought` (integer, optional): Which thought is being reconsidered
- `branchFromThought` (integer, optional): Branching point thought number
- `branchId` (string, optional): Branch identifier
- `needsMoreThoughts` (boolean, optional): If more thoughts are needed

## Usage

The Sequential Thinking tool is designed for:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

## Transport Modes

The Sequential Thinking server supports two transport modes:

### stdio (default)
Standard input/output communication, suitable for local CLI usage and tools like Claude Desktop.

```bash
npx -y @modelcontextprotocol/server-sequential-thinking
# or
node dist/index.js
# or
node dist/index.js stdio
```

### sse
Server-Sent Events over HTTP, suitable for web-based clients and Docker deployments.

```bash
node dist/index.js sse
```

The SSE server runs on port 3001 by default (configurable via `PORT` environment variable).

**Example with custom port:**
```bash
PORT=3002 node dist/index.js sse
```

## Environment Variables

- `PORT`: Port number for SSE server (default: 3001)
- `DISABLE_THOUGHT_LOGGING`: Set to `true` to disable thought logging output (default: false)

## Configuration

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

#### npx

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sequential-thinking"
      ]
    }
  }
}
```

#### docker (stdio mode)

```json
{
  "mcpServers": {
    "sequentialthinking": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "mcp/sequentialthinking"
      ]
    }
  }
}
```

#### docker (SSE mode)

For web-based clients or when you need HTTP access:

```json
{
  "mcpServers": {
    "sequentialthinking-sse": {
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
    "sequentialthinking-sse": {
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

### Usage with VS Code

For quick installation, click one of the installation buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sequentialthinking&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-sequential-thinking%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sequentialthinking&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-sequential-thinking%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sequentialthinking&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22--rm%22%2C%22-i%22%2C%22mcp%2Fsequentialthinking%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=sequentialthinking&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22--rm%22%2C%22-i%22%2C%22mcp%2Fsequentialthinking%22%5D%7D&quality=insiders)

For manual installation, you can configure the MCP server using one of these methods:

**Method 1: User Configuration (Recommended)**
Add the configuration to your user-level MCP configuration file. Open the Command Palette (`Ctrl + Shift + P`) and run `MCP: Open User Configuration`. This will open your user `mcp.json` file where you can add the server configuration.

**Method 2: Workspace Configuration**
Alternatively, you can add the configuration to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> For more details about MCP configuration in VS Code, see the [official VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/mcp).

For NPX installation:

```json
{
  "servers": {
    "sequential-thinking": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-sequential-thinking"
      ]
    }
  }
}
```

For Docker installation (stdio mode):

```json
{
  "servers": {
    "sequential-thinking": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "mcp/sequentialthinking"
      ]
    }
  }
}
```

For Docker installation (SSE mode):

```json
{
  "servers": {
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

## Building

Docker:

```bash
docker build -t mcp/sequentialthinking -f src/sequentialthinking/Dockerfile .
```

## Production with Docker Compose (Dual Endpoint)

A `docker-compose.yml` file is provided that runs the MCP server with both HTTP and HTTPS endpoints through an nginx reverse proxy.

### Architecture

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

### Quick Start

```bash
# Start all services (backend + nginx proxy)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Test Endpoints

```bash
# Test HTTP endpoint (for Claude Code)
curl http://localhost:3002/health
curl -N http://localhost:3002/sse

# Test HTTPS endpoint (for Cursor/Windsurf)
curl -k https://localhost:8043/health
curl -k -N https://localhost:8043/sse
```

### Configuration

**Claude Code** (`~/.claude/mcp.json`):
```json
{
  "mcpServers": {
    "sequential-thinking": {
      "url": "http://localhost:3002/sse",
      "transport": "sse"
    }
  }
}
```

**Cursor/Windsurf** (see [CURSOR-WINDSURF-CONFIG.md](../../docs/CURSOR-WINDSURF-CONFIG.md)):
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

### SSL Certificate

The HTTPS endpoint uses a self-signed certificate. For production use or to avoid certificate warnings:

1. Trust the certificate (see [HTTPS-SETUP.md](../../docs/HTTPS-SETUP.md))
2. Or use a valid certificate from Let's Encrypt

### Multi-Architecture Support

The Docker image supports both ARM64 (Apple Silicon) and AMD64 (Intel/AMD) architectures:

```bash
# Images are built for both platforms automatically
docker-compose build
```

### Environment Variables

- `PORT` - Backend server port (default: 3001)
- `DISABLE_THOUGHT_LOGGING` - Disable thought logging (default: false)

### Managing Services

```bash
# Start services
docker-compose up -d

# Restart specific service
docker-compose restart sequential-thinking-sse
docker-compose restart nginx-proxy

# View logs
docker-compose logs -f sequential-thinking-sse
docker-compose logs -f nginx-proxy

# Stop and remove containers
docker-compose down

# Rebuild and restart
docker-compose up -d --build
```

## Development with Docker Compose

For local development without the nginx proxy:

```bash
# Run backend directly on port 3001
docker run -p 3001:3001 -e PORT=3001 seq_think_sse:1.0 sse

# Test the SSE endpoint
curl -N http://localhost:3001/sse
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
