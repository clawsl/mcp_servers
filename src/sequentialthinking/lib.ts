import chalk from 'chalk';
import {
  validateThoughtInput,
  ThoughtDataSchema,
  DEFAULT_VALIDATION_CONFIG,
  type ValidationConfig
} from './validation.js';
import {
  logSecurityEvent,
  logInfo,
  logWarn,
  logError,
  SecuritySeverity,
  SecurityEventType
} from './logger.js';

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
}

export interface SequentialThinkingConfig {
  maxThoughtsPerSession?: number;
  maxThoughtLength?: number;
  disableThoughtLogging?: boolean;
  enableSuspiciousPatternDetection?: boolean;
  strictValidationMode?: boolean;
}

const DEFAULT_CONFIG: Required<SequentialThinkingConfig> = {
  maxThoughtsPerSession: 10000,
  maxThoughtLength: 10000,
  disableThoughtLogging: false,
  enableSuspiciousPatternDetection: true,
  strictValidationMode: false
};

export class SequentialThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private config: Required<SequentialThinkingConfig>;
  private createdAt: number;

  constructor(config: SequentialThinkingConfig = {}) {
    // Merge with defaults
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      // Override with environment variables if present
      disableThoughtLogging:
        (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true"
        || config.disableThoughtLogging
        || DEFAULT_CONFIG.disableThoughtLogging,
      maxThoughtsPerSession:
        parseInt(process.env.MAX_THOUGHTS_PER_SESSION || '', 10)
        || config.maxThoughtsPerSession
        || DEFAULT_CONFIG.maxThoughtsPerSession,
      maxThoughtLength:
        parseInt(process.env.MAX_THOUGHT_LENGTH || '', 10)
        || config.maxThoughtLength
        || DEFAULT_CONFIG.maxThoughtLength,
      enableSuspiciousPatternDetection:
        (process.env.ENABLE_SUSPICIOUS_PATTERN_DETECTION || "").toLowerCase() !== "false"
        && (config.enableSuspiciousPatternDetection ?? DEFAULT_CONFIG.enableSuspiciousPatternDetection),
      strictValidationMode:
        (process.env.STRICT_VALIDATION_MODE || "").toLowerCase() === "true"
        || config.strictValidationMode
        || DEFAULT_CONFIG.strictValidationMode
    };

    this.createdAt = Date.now();

    // Log configuration on startup (security event)
    logSecurityEvent(
      SecurityEventType.CONFIGURATION_LOADED,
      SecuritySeverity.INFO,
      'SequentialThinkingServer initialized',
      {
        details: {
          maxThoughtsPerSession: this.config.maxThoughtsPerSession,
          maxThoughtLength: this.config.maxThoughtLength,
          disableThoughtLogging: this.config.disableThoughtLogging,
          enableSuspiciousPatternDetection: this.config.enableSuspiciousPatternDetection,
          strictValidationMode: this.config.strictValidationMode
        }
      }
    );
  }

  // Add getter for metrics
  public getMetrics() {
    return {
      thoughtCount: this.thoughtHistory.length,
      branchCount: Object.keys(this.branches).length,
      maxThoughtsPerSession: this.config.maxThoughtsPerSession,
      utilizationPercent: (this.thoughtHistory.length / this.config.maxThoughtsPerSession) * 100,
      uptimeMs: Date.now() - this.createdAt
    };
  }

  private validateThoughtData(input: unknown): ThoughtData {
    const data = input as Record<string, unknown>;

    // Step 1: Joi schema validation (type checking, required fields)
    const { error: schemaError, value: validatedData } = ThoughtDataSchema.validate(data, {
      abortEarly: false  // Return all errors, not just first
    });

    if (schemaError) {
      const errorMessages = schemaError.details.map(detail => detail.message).join('; ');

      logSecurityEvent(
        SecurityEventType.VALIDATION_FAILED,
        SecuritySeverity.HIGH,
        'Validation failed - schema errors',
        {
          details: {
            errors: errorMessages,
            inputPreview: JSON.stringify(data).substring(0, 200)
          }
        }
      );

      throw new Error(`Validation failed: ${errorMessages}`);
    }

    // Step 2: Content validation and sanitization
    const validationConfig: ValidationConfig = {
      maxThoughtLength: this.config.maxThoughtLength,
      enableSuspiciousPatternDetection: this.config.enableSuspiciousPatternDetection,
      strictMode: this.config.strictValidationMode
    };

    const { isValid, sanitized, errors, warnings } = validateThoughtInput(
      validatedData.thought,
      validationConfig
    );

    // Log warnings (suspicious patterns detected)
    if (warnings.length > 0) {
      logSecurityEvent(
        SecurityEventType.SUSPICIOUS_PATTERN_DETECTED,
        SecuritySeverity.MEDIUM,
        'Suspicious thought content detected',
        {
          details: {
            warnings,
            thoughtPreview: sanitized.substring(0, 100),
            thoughtNumber: validatedData.thoughtNumber
          }
        }
      );
    }

    // Reject if validation failed
    if (!isValid) {
      logSecurityEvent(
        SecurityEventType.VALIDATION_FAILED,
        SecuritySeverity.HIGH,
        'Thought content validation failed',
        {
          details: {
            errors,
            thoughtPreview: (validatedData.thought as string).substring(0, 100),
            thoughtNumber: validatedData.thoughtNumber
          }
        }
      );

      throw new Error(`Content validation failed: ${errors.join('; ')}`);
    }

    // Return validated and sanitized data
    return {
      thought: sanitized,  // Use sanitized version
      thoughtNumber: validatedData.thoughtNumber,
      totalThoughts: validatedData.totalThoughts,
      nextThoughtNeeded: validatedData.nextThoughtNeeded,
      isRevision: validatedData.isRevision,
      revisesThought: validatedData.revisesThought,
      branchFromThought: validatedData.branchFromThought,
      branchId: validatedData.branchId,
      needsMoreThoughts: validatedData.needsMoreThoughts,
    };
  }

  private formatThought(thoughtData: ThoughtData): string {
    const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId } = thoughtData;

    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 Revision');
      context = ` (revising thought ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 Branch');
      context = ` (from thought ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('💭 Thought');
      context = '';
    }

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const border = '─'.repeat(Math.max(header.length, thought.length) + 4);

    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │
└${border}┘`;
  }

  public processThought(input: unknown): { content: Array<{ type: string; text: string }>; isError?: boolean } {
    try {
      const validatedInput = this.validateThoughtData(input);

      // Check thought count limit BEFORE adding
      if (this.thoughtHistory.length >= this.config.maxThoughtsPerSession) {
        const metrics = this.getMetrics();

        // Log security event
        logSecurityEvent(
          SecurityEventType.THOUGHT_LIMIT_EXCEEDED,
          SecuritySeverity.MEDIUM,
          'Thought limit exceeded for session',
          {
            details: {
              limit: this.config.maxThoughtsPerSession,
              current: this.thoughtHistory.length,
              attemptedThoughtNumber: validatedInput.thoughtNumber
            }
          }
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: `Maximum thoughts per session limit reached (${this.config.maxThoughtsPerSession})`,
              status: 'thought_limit_exceeded',
              currentCount: this.thoughtHistory.length,
              limit: this.config.maxThoughtsPerSession,
              suggestion: 'Please start a new session to continue reasoning',
              metrics: metrics
            }, null, 2)
          }],
          isError: true
        };
      }

      // Existing validation logic
      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      this.thoughtHistory.push(validatedInput);

      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }

      // Log warning when approaching limit
      const utilizationPercent = (this.thoughtHistory.length / this.config.maxThoughtsPerSession) * 100;
      if (utilizationPercent >= 80 && utilizationPercent < 100) {
        logSecurityEvent(
          SecurityEventType.MEMORY_WARNING,
          SecuritySeverity.LOW,
          'Thought limit approaching',
          {
            details: {
              current: this.thoughtHistory.length,
              limit: this.config.maxThoughtsPerSession,
              utilizationPercent: utilizationPercent.toFixed(1),
              remainingThoughts: this.config.maxThoughtsPerSession - this.thoughtHistory.length
            }
          }
        );
      }

      if (!this.config.disableThoughtLogging) {
        const formattedThought = this.formatThought(validatedInput);
        console.error(formattedThought);
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            thoughtNumber: validatedInput.thoughtNumber,
            totalThoughts: validatedInput.totalThoughts,
            nextThoughtNeeded: validatedInput.nextThoughtNeeded,
            branches: Object.keys(this.branches),
            thoughtHistoryLength: this.thoughtHistory.length,
            metrics: this.getMetrics()
          }, null, 2)
        }]
      };
    } catch (error) {
      logError(
        'Failed to process thought',
        error,
        {
          inputPreview: JSON.stringify(input).substring(0, 200)
        }
      );

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }
}
