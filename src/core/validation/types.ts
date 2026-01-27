/**
 * @arch archcodex.core.types
 *
 * Validation type definitions.
 */
import type { Violation } from '../constraints/types.js';
import type { Severity } from '../registry/schema.js';

/**
 * Active override information.
 */
export interface ActiveOverride {
  /** The rule being overridden */
  rule: string;
  /** The value being overridden */
  value: string;
  /** Reason for the override */
  reason: string;
  /** Expiration date (ISO format) */
  expires?: string;
  /** Ticket reference */
  ticket?: string;
  /** Who approved */
  approvedBy?: string;
  /** Any warnings about the override */
  warning?: string;
}

/**
 * Complete validation result for a file.
 */
export interface ValidationResult {
  /** Overall status */
  status: 'pass' | 'fail' | 'warn';
  /** File path */
  file: string;
  /** Architecture ID from @arch tag, null if not found */
  archId: string | null;
  /** Inheritance chain if arch was found */
  inheritanceChain: string[];
  /** Applied mixins */
  mixinsApplied: string[];
  /** Error-level violations */
  violations: Violation[];
  /** Warning-level violations */
  warnings: Violation[];
  /** Active overrides */
  overridesActive: ActiveOverride[];
  /** Whether validation passed */
  passed: boolean;
  /** Total error count */
  errorCount: number;
  /** Total warning count */
  warningCount: number;
  /** Timing information */
  timing?: {
    parseMs: number;
    resolutionMs: number;
    validationMs: number;
    totalMs: number;
  };
  /** Whether validation was skipped (e.g., no validator for file type) */
  skipped?: boolean;
  /** Reason validation was skipped */
  skipReason?: string;
}

/**
 * Options for validation.
 */
export interface ValidationOptions {
  /** Treat warnings as errors */
  strict?: boolean;
  /** Only check specific severities */
  severities?: Severity[];
  /** Skip certain rules */
  skipRules?: string[];
}

/**
 * Result of validating multiple files.
 */
export interface BatchValidationResult {
  /** Individual results */
  results: ValidationResult[];
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    totalErrors: number;
    totalWarnings: number;
    activeOverrides: number;
  };
}
