import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from 'cors';
import { createServer } from "./stdio.js";

console.error('Starting Sequential Thinking SSE server...');

const app = express();
app.use(express.json()); // Parse JSON bodies
app.use(cors({
  "origin": "*", // use "*" with caution in production
  "methods": "GET,POST",
  "preflightContinue": false,
  "optionsSuccessStatus": 204,
})); // Enable CORS for all routes so Inspector can connect

const transports: Map<string, SSEServerTransport> = new Map<string, SSEServerTransport>();
const servers: Map<string, any> = new Map<string, any>();

app.get("/sse", async (req, res) => {
  let transport: SSEServerTransport;

  if (req?.query?.sessionId) {
    const sessionId = (req?.query?.sessionId as string);
    transport = transports.get(sessionId) as SSEServerTransport;
    console.error("Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.", transport?.sessionId);
  } else {
    // Create server and transport for new session
    const { server } = createServer();

    // Use "/sse" so POST requests go to /sse?sessionId=xxx
    transport = new SSEServerTransport("/sse", res);
    transports.set(transport.sessionId, transport);
    servers.set(transport.sessionId, server);

    // Connect server to transport (don't await!)
    server.connect(transport);
    console.error("Client Connected:", transport.sessionId);

    // Handle client disconnect
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
  }
});

// Handle POST requests to /sse with sessionId query parameter
app.post("/sse", async (req, res) => {
  const sessionId = (req?.query?.sessionId as string) || (req.headers['x-session-id'] as string);

  if (!sessionId) {
    console.error("No session ID provided in POST request");
    res.status(400).json({ error: "Session ID required" });
    return;
  }

  const transport = transports.get(sessionId);
  if (transport) {
    console.error("Client Message from", sessionId);
    await transport.handlePostMessage(req, res, req.body);
  } else {
    console.error(`No transport found for sessionId ${sessionId}`);
    res.status(404).json({ error: "Session not found" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.error(`Sequential Thinking SSE Server running on port ${PORT}`);
});
