import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from 'cors';
import { createServer } from "./server.js";
import {
  logSecurityEvent,
  logInfo,
  logError,
  SecuritySeverity,
  SecurityEventType
} from './logger.js';

console.error('Starting Sequential Thinking SSE server...');

const app = express();
app.use(express.json()); // Parse JSON bodies

// Secure CORS configuration for local-only deployment
const ALLOWED_LOCALHOST_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
  'http://[::1]',
  // Add specific ports if needed for known clients
  'http://localhost:3000',  // Claude Desktop
  'http://localhost:5173',  // Vite dev server
  'http://localhost:8080',  // Common dev server
];

// CORS validation function
function isAllowedOrigin(origin: string | undefined): boolean {
  // Allow requests with no origin (same-origin, curl, Postman)
  if (!origin) {
    return true;
  }

  // Check if origin starts with any allowed localhost pattern
  const isAllowed = ALLOWED_LOCALHOST_ORIGINS.some(allowed =>
    origin.startsWith(allowed)
  );

  // Log CORS violations for security monitoring
  if (!isAllowed) {
    logSecurityEvent(
      SecurityEventType.CORS_VIOLATION,
      SecuritySeverity.HIGH,
      'CORS violation detected',
      {
        origin,
        details: {
          allowedOrigins: ALLOWED_LOCALHOST_ORIGINS
        }
      }
    );
  }

  return isAllowed;
}

// Apply secure CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS policy. Only localhost connections are permitted.`));
    }
  },
  methods: ['GET', 'POST', 'DELETE'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  credentials: true,  // Allow credentials for same-origin requests
  maxAge: 600  // Cache preflight requests for 10 minutes
}));

// Add CORS error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.message.includes('not allowed by CORS')) {
    logSecurityEvent(
      SecurityEventType.CORS_VIOLATION,
      SecuritySeverity.HIGH,
      'CORS policy blocked request',
      {
        origin: req.headers.origin,
        clientIP: req.ip,
        details: {
          method: req.method,
          path: req.path
        }
      }
    );

    res.status(403).json({
      error: 'CORS policy violation',
      message: 'Only localhost connections are allowed',
      allowedOrigins: ['localhost', '127.0.0.1']
    });
  } else {
    next(err);
  }
});

const transports: Map<string, SSEServerTransport> = new Map<string, SSEServerTransport>();
const servers: Map<string, any> = new Map<string, any>();

// Session timeout management
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || '3600000', 10); // 1 hour default
const MAX_CONCURRENT_SESSIONS = parseInt(process.env.MAX_CONCURRENT_SESSIONS || '100', 10);
const sessionTimeouts = new Map<string, NodeJS.Timeout>();
const sessionCreationTimes = new Map<string, number>();
const sessionActivityTimes = new Map<string, number>();

// Helper function to cleanup session
function cleanupSession(sessionId: string, reason: string = 'timeout') {
  logSecurityEvent(
    SecurityEventType.SESSION_TERMINATED,
    SecuritySeverity.INFO,
    'Session cleanup initiated',
    {
      sessionId,
      details: {
        reason,
        duration: sessionCreationTimes.has(sessionId)
          ? Date.now() - sessionCreationTimes.get(sessionId)!
          : 0
      }
    }
  );

  // Clear timeout
  const timeoutId = sessionTimeouts.get(sessionId);
  if (timeoutId) {
    clearTimeout(timeoutId);
    sessionTimeouts.delete(sessionId);
  }

  // Remove session data
  const transport = transports.get(sessionId);
  transports.delete(sessionId);
  servers.delete(sessionId);
  sessionCreationTimes.delete(sessionId);
  sessionActivityTimes.delete(sessionId);

  // Close transport if still open
  if (transport) {
    try {
      // Transport cleanup (if needed)
    } catch (error) {
      logError('Failed to cleanup transport', error, { sessionId });
    }
  }
}

// Helper function to reset session timeout
function resetSessionTimeout(sessionId: string) {
  // Clear existing timeout
  const existingTimeout = sessionTimeouts.get(sessionId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Update activity time
  sessionActivityTimes.set(sessionId, Date.now());

  // Set new timeout
  const timeoutId = setTimeout(() => {
    logSecurityEvent(
      SecurityEventType.SESSION_TIMEOUT,
      SecuritySeverity.LOW,
      'Session timeout due to inactivity',
      {
        sessionId,
        details: {
          inactivityPeriod: SESSION_TIMEOUT_MS
        }
      }
    );
    cleanupSession(sessionId, 'inactivity_timeout');
  }, SESSION_TIMEOUT_MS);

  sessionTimeouts.set(sessionId, timeoutId);
}

// Health check endpoint (no CORS restrictions needed)
app.get("/health", (req, res) => {
  const health = {
    status: 'healthy',
    uptime: process.uptime(),
    activeSessions: transports.size,
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      port: PORT,
      maxThoughtsPerSession: process.env.MAX_THOUGHTS_PER_SESSION || '1000',
      sessionTimeout: process.env.SESSION_TIMEOUT_MS || '3600000'
    }
  };

  res.status(200).json(health);
});

// Metrics endpoint for monitoring
app.get("/metrics", (req, res) => {
  const metrics = {
    sessions: {
      active: transports.size,
      total: transports.size
    },
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };

  res.status(200).json(metrics);
});

app.get("/sse", async (req, res) => {
  let transport: SSEServerTransport;

  if (req?.query?.sessionId) {
    const sessionId = (req?.query?.sessionId as string);
    transport = transports.get(sessionId) as SSEServerTransport;

    if (!transport) {
      console.error('[ERROR] Session not found for reconnection:', sessionId);
      res.status(404).json({
        error: 'Session not found',
        message: 'Session may have expired or been cleaned up'
      });
      return;
    }

    console.error("Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.", transport?.sessionId);
  } else {
    // Check session limit (prevent DoS via session creation)
    if (transports.size >= MAX_CONCURRENT_SESSIONS) {
      logSecurityEvent(
        SecurityEventType.SESSION_LIMIT_REACHED,
        SecuritySeverity.MEDIUM,
        'Maximum concurrent sessions reached',
        {
          details: {
            current: transports.size,
            limit: MAX_CONCURRENT_SESSIONS
          }
        }
      );

      res.status(429).json({
        error: 'Too many active sessions',
        message: 'Maximum concurrent sessions limit reached. Please try again later.'
      });
      return;
    }

    // Create server and transport for new session
    const { server } = createServer();

    // Use "/sse" so POST requests go to /sse?sessionId=xxx
    transport = new SSEServerTransport("/sse", res);
    const sessionId = transport.sessionId;

    transports.set(sessionId, transport);
    servers.set(sessionId, server);
    sessionCreationTimes.set(sessionId, Date.now());
    sessionActivityTimes.set(sessionId, Date.now());

    // Set initial timeout
    resetSessionTimeout(sessionId);

    // Connect server to transport (don't await!)
    server.connect(transport);

    logSecurityEvent(
      SecurityEventType.SESSION_CREATED,
      SecuritySeverity.INFO,
      'New session created',
      {
        sessionId,
        details: {
          activeSessions: transports.size,
          timeout: SESSION_TIMEOUT_MS
        }
      }
    );

    // Handle client disconnect
    req.on('close', () => {
      console.error('[SECURITY] Client disconnected', {
        sessionId,
        duration: Date.now() - sessionCreationTimes.get(sessionId)!,
        timestamp: new Date().toISOString()
      });

      cleanupSession(sessionId, 'client_disconnect');
    });

    // Handle transport errors
    transport.onerror = (error: unknown) => {
      logError('SSE transport error', error, { sessionId });
      logSecurityEvent(
        SecurityEventType.TRANSPORT_ERROR,
        SecuritySeverity.MEDIUM,
        'Transport error occurred',
        {
          sessionId,
          details: {
            error: error instanceof Error ? error.message : String(error)
          }
        }
      );

      cleanupSession(sessionId, 'transport_error');
    };
  }
});

// Handle POST requests to /sse with sessionId query parameter
app.post("/sse", async (req, res) => {
  const sessionId = (req?.query?.sessionId as string) || (req.headers['x-session-id'] as string);

  if (!sessionId) {
    console.error('[ERROR] No session ID provided in POST request');
    res.status(400).json({
      error: 'Session ID required',
      message: 'Include sessionId as query parameter or X-Session-ID header'
    });
    return;
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    console.error('[ERROR] Session not found for POST request:', {
      sessionId,
      timestamp: new Date().toISOString()
    });

    res.status(404).json({
      error: 'Session not found',
      message: 'Session may have expired or been cleaned up. Please reconnect.'
    });
    return;
  }

  // Reset timeout on activity
  resetSessionTimeout(sessionId);

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    logError('Failed to handle POST message', error, { sessionId });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process message'
    });
  }
});

// Session management endpoints

// Get session information
app.get("/session/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;

  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const creationTime = sessionCreationTimes.get(sessionId) || 0;
  const activityTime = sessionActivityTimes.get(sessionId) || 0;
  const now = Date.now();

  res.json({
    sessionId,
    createdAt: new Date(creationTime).toISOString(),
    lastActivityAt: new Date(activityTime).toISOString(),
    ageMs: now - creationTime,
    idleMs: now - activityTime,
    timeoutMs: SESSION_TIMEOUT_MS,
    remainingMs: Math.max(0, SESSION_TIMEOUT_MS - (now - activityTime))
  });
});

// List all active sessions
app.get("/sessions", (req, res) => {
  const sessions = [];
  const now = Date.now();

  for (const [sessionId] of transports.entries()) {
    const creationTime = sessionCreationTimes.get(sessionId) || 0;
    const activityTime = sessionActivityTimes.get(sessionId) || 0;

    sessions.push({
      sessionId,
      ageMs: now - creationTime,
      idleMs: now - activityTime,
      remainingMs: Math.max(0, SESSION_TIMEOUT_MS - (now - activityTime))
    });
  }

  res.json({
    totalSessions: sessions.length,
    timeoutMs: SESSION_TIMEOUT_MS,
    sessions
  });
});

// Delete/terminate session
app.delete("/session/:sessionId", (req, res) => {
  const sessionId = req.params.sessionId;

  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  cleanupSession(sessionId, 'manual_termination');

  res.json({
    message: 'Session terminated',
    sessionId
  });
});

// Add periodic cleanup job (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  let cleanedSessions = 0;

  for (const [sessionId, creationTime] of sessionCreationTimes.entries()) {
    const age = now - creationTime;
    const MAX_SESSION_AGE = SESSION_TIMEOUT_MS * 2; // 2x timeout as absolute max

    if (age > MAX_SESSION_AGE) {
      console.warn('[SECURITY] Cleaning up stale session', {
        sessionId,
        ageMs: age,
        maxAgeMs: MAX_SESSION_AGE,
        timestamp: new Date().toISOString()
      });

      cleanupSession(sessionId, 'stale_session');
      cleanedSessions++;
    }
  }

  if (cleanedSessions > 0) {
    console.error('[MAINTENANCE] Periodic cleanup completed', {
      cleanedSessions,
      activeSessions: transports.size,
      timestamp: new Date().toISOString()
    });
  }
}, 5 * 60 * 1000); // Every 5 minutes

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  logSecurityEvent(
    SecurityEventType.SERVER_STARTED,
    SecuritySeverity.INFO,
    'Sequential Thinking SSE Server started',
    {
      details: {
        port: PORT,
        sessionTimeout: SESSION_TIMEOUT_MS,
        maxConcurrentSessions: MAX_CONCURRENT_SESSIONS
      }
    }
  );
  console.error(`Sequential Thinking SSE Server running on port ${PORT}`);
});

// Add graceful shutdown handler
process.on('SIGTERM', () => {
  logSecurityEvent(
    SecurityEventType.SERVER_SHUTDOWN,
    SecuritySeverity.INFO,
    'Server shutdown initiated (SIGTERM)',
    {
      details: {
        activeSessions: transports.size
      }
    }
  );
  console.error('[SHUTDOWN] SIGTERM received, closing server...');

  // Close all active sessions
  for (const [sessionId] of transports.entries()) {
    cleanupSession(sessionId, 'server_shutdown');
  }

  // Close HTTP server
  server.close(() => {
    console.error('[SHUTDOWN] Server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('[SHUTDOWN] Forcing shutdown');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.error('[SHUTDOWN] SIGINT received');
  process.emit('SIGTERM' as any);
});
