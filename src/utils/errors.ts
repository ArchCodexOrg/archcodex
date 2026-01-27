/**
 * @arch archcodex.common.errors
 *
 * Error types and codes for ArchCodex.
 * This is the error contract - all errors should extend ArchCodexError.
 */

/**
 * Base error class for all ArchCodex errors.
 * Includes error codes that match the specification.
 */
export class ArchCodexError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ArchCodexError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Configuration-related errors (loading, parsing, validation).
 */
export class ConfigError extends ArchCodexError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'ConfigError';
  }
}

/**
 * Registry-related errors (parsing, inheritance, mixins).
 */
export class RegistryError extends ArchCodexError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'RegistryError';
  }
}

/**
 * Validation errors for constraint violations.
 * Error codes: E001-E010
 */
export class ValidationError extends ArchCodexError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'ValidationError';
  }
}

/**
 * Override-related errors.
 * Error codes: O001-O005
 */
export class OverrideError extends ArchCodexError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'OverrideError';
  }
}

/**
 * System errors (file not found, parse errors, etc.).
 * Error codes: S001-S005
 */
export class SystemError extends ArchCodexError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'SystemError';
  }
}

/**
 * Security errors (path traversal, sandbox violations).
 */
export class SecurityError extends ArchCodexError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'SecurityError';
  }
}

// Error code constants matching the specification
export const ErrorCodes = {
  // Validation errors (E001-E016)
  MUST_EXTEND: 'E001',
  IMPLEMENTS: 'E002',
  FORBID_IMPORT: 'E003',
  REQUIRE_IMPORT: 'E004',
  REQUIRE_DECORATOR: 'E005',
  FORBID_DECORATOR: 'E006',
  NAMING_PATTERN: 'E007',
  LOCATION_PATTERN: 'E008',
  MAX_PUBLIC_METHODS: 'E009',
  MAX_FILE_LINES: 'E010',
  REQUIRE_TEST_FILE: 'E011',
  IMPORTABLE_BY: 'E012',
  FORBID_CIRCULAR_DEPS: 'E013',
  FORBID_CALL: 'E014',
  REQUIRE_TRY_CATCH: 'E015',
  FORBID_MUTATION: 'E016',
  REQUIRE_CALL: 'E017',
  REQUIRE_PATTERN: 'E018',
  REQUIRE_EXPORT: 'E019',
  REQUIRE_CALL_BEFORE: 'E020',
  FORBID_PATTERN: 'E021',
  REQUIRE_ONE_OF: 'E022',
  REQUIRE_COVERAGE: 'E023',
  MAX_SIMILARITY: 'E024',
  VERIFY_INTENT: 'E025',
  REQUIRE_COMPANION_CALL: 'E026',
  SINGLETON_VIOLATION: 'E027',
  REQUIRE_COMPANION_FILE: 'E028',

  // Intent errors (I001-I004)
  UNDEFINED_INTENT: 'I001',
  INTENT_PATTERN_VIOLATION: 'I002',
  INTENT_CONFLICT: 'I003',
  INTENT_REQUIRES_MISSING: 'I004',

  // Override errors (O001-O005)
  OVERRIDE_INVALID_SYNTAX: 'O001',
  OVERRIDE_MISSING_REASON: 'O002',
  OVERRIDE_EXPIRED: 'O003',
  OVERRIDE_UNKNOWN_RULE: 'O004',
  OVERRIDE_LIMIT_EXCEEDED: 'O005',

  // System errors (S001-S005)
  PARSE_ERROR: 'S001',
  UNKNOWN_ARCH: 'S002',
  CIRCULAR_INHERITANCE: 'S003',
  MISSING_MIXIN: 'S004',
  INVALID_REGISTRY: 'S005',

  // Security errors
  PATH_TRAVERSAL: 'SEC001',
  SANDBOX_VIOLATION: 'SEC002',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
