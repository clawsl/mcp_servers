#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from './server.js';
import {
  logSecurityEvent,
  logError,
  SecuritySeverity,
  SecurityEventType
} from './logger.js';

async function runStdioServer() {
  const { server } = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logSecurityEvent(
    SecurityEventType.SERVER_STARTED,
    SecuritySeverity.INFO,
    'Sequential Thinking MCP Server started in stdio mode',
    {}
  );
  console.error("Sequential Thinking MCP Server running on stdio");
}

// Run the stdio server (called from index.ts when mode is 'stdio')
runStdioServer().catch((error) => {
  logError("Fatal error running server", error);
  console.error("Fatal error running server:", error);
  process.exit(1);
});
