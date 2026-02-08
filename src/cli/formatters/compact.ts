/**
 * @arch archcodex.cli.formatter
 * @intent:cli-output
 *
 * Compact output formatter for CI/pre-commit hooks.
 * Provides single-line per issue output for easy parsing.
 */

import type { ValidationResult, BatchValidationResult } from '../../core/validation/types.js';
import type { Violation } from '../../core/constraints/types.js';
import type { IFormatter, FormatOptions } from './types.js';
import { formatConstraintValue } from '../../utils/format.js';

/**
 * Compact output formatter for CI and pre-commit hooks.
 * Format: file:line: SEVERITY [rule:value] message
 */
export class CompactFormatter implements IFormatter {
  private errorsOnly: boolean;

  constructor(options: Partial<FormatOptions> = {}) {
    this.errorsOnly = options.errorsOnly ?? false;
  }

  formatResult(result: ValidationResult): string {
    const lines: string[] = [];

    // Format errors
    for (const violation of result.violations) {
      lines.push(this.formatViolation(result.file, violation, 'ERROR'));
    }

    // Format warnings (skip if errorsOnly)
    if (!this.errorsOnly) {
      for (const warning of result.warnings) {
        lines.push(this.formatViolation(result.file, warning, 'WARN'));
      }
    }

    return lines.join('\n');
  }

  formatBatch(batch: BatchValidationResult): string {
    const lines: string[] = [];

    // Individual results (only files with issues)
    for (const result of batch.results) {
      const formatted = this.formatResult(result);
      if (formatted) {
        lines.push(formatted);
      }
    }

    // Summary line
    lines.push('');
    lines.push(this.formatSummary(batch));

    return lines.join('\n');
  }

  private formatViolation(
    file: string,
    violation: Violation,
    severity: 'ERROR' | 'WARN'
  ): string {
    const line = violation.line ?? 0;
    const value = this.formatValue(violation.value);
    const ruleValue = value ? `${violation.rule}:${value}` : violation.rule;

    return `${file}:${line}: ${severity} [${ruleValue}] ${violation.message}`;
  }

  private formatSummary(batch: BatchValidationResult): string {
    const { summary } = batch;
    const parts: string[] = [];

    if (summary.failed > 0) {
      parts.push(`${summary.failed} error${summary.failed !== 1 ? 's' : ''}`);
    }
    if (summary.warned > 0) {
      parts.push(`${summary.warned} warning${summary.warned !== 1 ? 's' : ''}`);
    }
    if (parts.length === 0) {
      parts.push('0 issues');
    }

    return `SUMMARY: ${parts.join(', ')} (${summary.total} file${summary.total !== 1 ? 's' : ''} checked)`;
  }

  private formatValue(value: unknown): string {
    return formatConstraintValue(value);
  }
}
