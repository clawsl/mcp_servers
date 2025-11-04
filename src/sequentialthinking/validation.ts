// validation.ts - Input validation and sanitization module

import Joi from 'joi';

/**
 * Configuration for validation rules
 */
export interface ValidationConfig {
  maxThoughtLength: number;
  enableSuspiciousPatternDetection: boolean;
  strictMode: boolean;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  maxThoughtLength: 10000,  // 10KB per thought
  enableSuspiciousPatternDetection: true,
  strictMode: false  // If true, reject suspicious patterns; if false, only warn
};

/**
 * Suspicious patterns that may indicate prompt injection attempts
 */
const SUSPICIOUS_PATTERNS = [
  // Direct instruction injection
  /ignore\s+(all\s+)?previous\s+(instructions?|thoughts?|context)/i,
  /disregard\s+(all\s+)?(previous|above|earlier)/i,
  /forget\s+(everything|all|previous)/i,

  // Instruction override
  /new\s+instructions?:/i,
  /from\s+now\s+on[,:]/i,
  /instead[,:]?\s+(do|say|respond|output)/i,

  // System/role manipulation
  /you\s+are\s+now/i,
  /act\s+as\s+(if|a|an)/i,
  /system:\s*/i,
  /assistant:\s*/i,

  // Template/variable injection
  /\{\{.*\}\}/,  // Mustache-style
  /\$\{.*\}/,    // Template literal
  /%\(.*\)s/,    // Python-style

  // Script injection
  /<script[\s\S]*?>/i,
  /<iframe[\s\S]*?>/i,
  /javascript:/i,
  /on\w+\s*=/i,  // Event handlers: onclick=, onerror=, etc.

  // SQL injection patterns (though unlikely in this context)
  /'\s*(or|and)\s*'?\d/i,
  /union\s+select/i,
  /;\s*drop\s+table/i,

  // Command injection
  /;\s*rm\s+-rf/i,
  /\|\s*bash/i,
  /`.*`/,  // Backticks for command substitution

  // Data exfiltration attempts
  /repeat\s+(?:this|the\s+(?:above|previous))/i,
  /output\s+(?:all|everything|your\s+(?:instructions|prompts?))/i,
];

/**
 * Sanitize control characters from input
 */
export function sanitizeControlCharacters(input: string): string {
  // Remove control characters (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F, 0x7F)
  // Keep: 0x09 (tab), 0x0A (LF), 0x0D (CR)
  return input.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Trim excessive whitespace
 */
export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\t+/g, ' ')      // Replace tabs with single space
    .replace(/\r\n/g, '\n')    // Normalize line endings
    .replace(/\r/g, '\n')      // Normalize line endings
    .replace(/ +/g, ' ')       // Collapse multiple spaces
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();
}

/**
 * Check for suspicious patterns that may indicate injection attempts
 */
export function detectSuspiciousPatterns(input: string): {
  isSuspicious: boolean;
  matchedPatterns: string[];
  severity: 'low' | 'medium' | 'high';
} {
  const matchedPatterns: string[] = [];

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(input)) {
      matchedPatterns.push(pattern.toString());
    }
  }

  const isSuspicious = matchedPatterns.length > 0;

  // Determine severity based on number and type of matches
  let severity: 'low' | 'medium' | 'high' = 'low';
  if (matchedPatterns.length >= 3) {
    severity = 'high';
  } else if (matchedPatterns.length >= 1) {
    severity = 'medium';
  }

  return { isSuspicious, matchedPatterns, severity };
}

/**
 * Validate and sanitize thought input
 */
export function validateThoughtInput(
  input: string,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): {
  isValid: boolean;
  sanitized: string;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Length validation
  if (input.length === 0) {
    errors.push('Thought cannot be empty');
    return { isValid: false, sanitized: '', errors, warnings };
  }

  if (input.length > config.maxThoughtLength) {
    errors.push(`Thought exceeds maximum length of ${config.maxThoughtLength} characters (got ${input.length})`);
    return { isValid: false, sanitized: '', errors, warnings };
  }

  // Step 2: Sanitize control characters
  let sanitized = sanitizeControlCharacters(input);

  // Step 3: Normalize whitespace
  sanitized = normalizeWhitespace(sanitized);

  // Check if sanitization resulted in empty string
  if (sanitized.length === 0) {
    errors.push('Thought contains only control characters or whitespace');
    return { isValid: false, sanitized: '', errors, warnings };
  }

  // Step 4: Detect suspicious patterns (if enabled)
  if (config.enableSuspiciousPatternDetection) {
    const { isSuspicious, matchedPatterns, severity } = detectSuspiciousPatterns(sanitized);

    if (isSuspicious) {
      const message = `Thought contains ${matchedPatterns.length} suspicious pattern(s) that may indicate injection attempt`;

      if (config.strictMode) {
        // In strict mode, reject suspicious input
        errors.push(message);
        errors.push(`Matched patterns: ${matchedPatterns.slice(0, 3).join(', ')}`);
        return { isValid: false, sanitized, errors, warnings };
      } else {
        // In non-strict mode, allow but warn
        warnings.push(message);
        warnings.push(`Severity: ${severity}`);
        warnings.push(`Matched ${matchedPatterns.length} pattern(s)`);
      }
    }
  }

  return {
    isValid: true,
    sanitized,
    errors,
    warnings
  };
}

/**
 * Joi schema for ThoughtData validation
 */
export const ThoughtDataSchema = Joi.object({
  thought: Joi.string()
    .min(1)
    .max(10000)
    .required()
    .messages({
      'string.base': 'Thought must be a string',
      'string.empty': 'Thought cannot be empty',
      'string.min': 'Thought must be at least 1 character',
      'string.max': 'Thought cannot exceed 10000 characters',
      'any.required': 'Thought is required'
    }),

  thoughtNumber: Joi.number()
    .integer()
    .min(1)
    .required()
    .messages({
      'number.base': 'Thought number must be a number',
      'number.integer': 'Thought number must be an integer',
      'number.min': 'Thought number must be at least 1',
      'any.required': 'Thought number is required'
    }),

  totalThoughts: Joi.number()
    .integer()
    .min(1)
    .required()
    .messages({
      'number.base': 'Total thoughts must be a number',
      'number.integer': 'Total thoughts must be an integer',
      'number.min': 'Total thoughts must be at least 1',
      'any.required': 'Total thoughts is required'
    }),

  nextThoughtNeeded: Joi.boolean()
    .required()
    .messages({
      'boolean.base': 'Next thought needed must be a boolean',
      'any.required': 'Next thought needed is required'
    }),

  isRevision: Joi.boolean()
    .optional(),

  revisesThought: Joi.number()
    .integer()
    .min(1)
    .optional()
    .when('isRevision', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),

  branchFromThought: Joi.number()
    .integer()
    .min(1)
    .optional(),

  branchId: Joi.string()
    .optional()
    .when('branchFromThought', {
      is: Joi.number().required(),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),

  needsMoreThoughts: Joi.boolean()
    .optional()
}).options({ stripUnknown: true });
