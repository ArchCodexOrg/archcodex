/**
 * @arch archcodex.cli.types
 *
 * Formatter type definitions.
 */
import type { ValidationResult, BatchValidationResult } from '../../core/validation/types.js';

/**
 * Output format options.
 */
export type OutputFormat = 'human' | 'json' | 'compact';

/**
 * Options for output formatting.
 */
export interface FormatOptions {
  /** Output format */
  format: OutputFormat;
  /** Use colors in output */
  colors: boolean;
  /** Verbose output */
  verbose: boolean;
  /** Show passing files (default: false - only show warnings/errors) */
  showPassing: boolean;
  /** Only show errors, hide warnings (default: false) */
  errorsOnly: boolean;
}

/**
 * Interface for output formatters.
 */
export interface IFormatter {
  /**
   * Format a single validation result.
   */
  formatResult(result: ValidationResult): string;

  /**
   * Format multiple validation results.
   */
  formatBatch(result: BatchValidationResult): string;
}
