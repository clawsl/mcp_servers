// logger.ts - Centralized security logging module

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

/**
 * Security event severity levels
 */
export enum SecuritySeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Security event types
 */
export enum SecurityEventType {
  // Authentication/Authorization
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_TERMINATED = 'SESSION_TERMINATED',
  SESSION_TIMEOUT = 'SESSION_TIMEOUT',
  CORS_VIOLATION = 'CORS_VIOLATION',

  // Input Validation
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  SUSPICIOUS_PATTERN_DETECTED = 'SUSPICIOUS_PATTERN_DETECTED',
  INJECTION_ATTEMPT = 'INJECTION_ATTEMPT',

  // Resource Management
  THOUGHT_LIMIT_EXCEEDED = 'THOUGHT_LIMIT_EXCEEDED',
  MEMORY_WARNING = 'MEMORY_WARNING',
  SESSION_LIMIT_REACHED = 'SESSION_LIMIT_REACHED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // System Events
  SERVER_STARTED = 'SERVER_STARTED',
  SERVER_SHUTDOWN = 'SERVER_SHUTDOWN',
  CONFIGURATION_LOADED = 'CONFIGURATION_LOADED',

  // Errors
  TRANSPORT_ERROR = 'TRANSPORT_ERROR',
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR'
}

/**
 * Security event metadata interface
 */
export interface SecurityEventMetadata {
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  sessionId?: string;
  clientIP?: string;
  origin?: string;
  thoughtNumber?: number;
  details?: Record<string, any>;
  timestamp: string;
}

/**
 * Create Winston logger instance
 */
function createLogger() {
  const logDir = process.env.LOG_DIR || './logs';
  const logLevel = process.env.LOG_LEVEL || 'info';

  // Console format
  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${level}] ${message} ${metaStr}`;
    })
  );

  // File format (JSON for parsing)
  const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  // Transports
  const transports: winston.transport[] = [];

  // Console transport (development)
  if (process.env.NODE_ENV !== 'production' || process.env.LOG_TO_CONSOLE === 'true') {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
        level: logLevel
      })
    );
  }

  // File transports (production)
  // Combined log
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: fileFormat,
      level: logLevel
    })
  );

  // Error log
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
      level: 'error'
    })
  );

  // Security log (dedicated for security events)
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '90d',  // Longer retention for security events
      format: fileFormat,
      level: 'warn'  // Security events logged at warn level or higher
    })
  );

  return winston.createLogger({
    transports,
    exitOnError: false
  });
}

// Create logger instance
const logger = createLogger();

/**
 * Log security event
 */
export function logSecurityEvent(
  eventType: SecurityEventType,
  severity: SecuritySeverity,
  message: string,
  metadata: Partial<SecurityEventMetadata> = {}
): void {
  const event: SecurityEventMetadata = {
    eventType,
    severity,
    timestamp: new Date().toISOString(),
    ...metadata
  };

  const logLevel = severity === SecuritySeverity.CRITICAL || severity === SecuritySeverity.HIGH
    ? 'error'
    : severity === SecuritySeverity.MEDIUM
    ? 'warn'
    : 'info';

  logger.log(logLevel, message, event);

  // Also log to console.error for visibility (will be captured by Docker logs)
  if (severity === SecuritySeverity.HIGH || severity === SecuritySeverity.CRITICAL) {
    console.error(`[SECURITY][${severity}] ${message}`, event);
  }
}

/**
 * Log general application event
 */
export function logInfo(message: string, metadata: Record<string, any> = {}): void {
  logger.info(message, { timestamp: new Date().toISOString(), ...metadata });
}

/**
 * Log warning
 */
export function logWarn(message: string, metadata: Record<string, any> = {}): void {
  logger.warn(message, { timestamp: new Date().toISOString(), ...metadata });
}

/**
 * Log error
 */
export function logError(message: string, error: Error | unknown, metadata: Record<string, any> = {}): void {
  const errorDetails = error instanceof Error ? {
    errorMessage: error.message,
    errorStack: error.stack,
    errorName: error.name
  } : {
    error: String(error)
  };

  logger.error(message, {
    timestamp: new Date().toISOString(),
    ...errorDetails,
    ...metadata
  });
}

/**
 * Get logger instance for advanced usage
 */
export function getLogger(): winston.Logger {
  return logger;
}

export default {
  logSecurityEvent,
  logInfo,
  logWarn,
  logError,
  getLogger,
  SecuritySeverity,
  SecurityEventType
};
