/**
 * @arch archcodex.cli.formatter
 */
import chalk from 'chalk';
import type { ValidationResult, BatchValidationResult } from '../../core/validation/types.js';
import type { Violation } from '../../core/constraints/types.js';
import type { IFormatter, FormatOptions } from './types.js';
import type { ArchitectureSuggestion } from '../commands/check-helpers.js';
import { formatConstraintValue } from '../../utils/format.js';

/**
 * Human-readable output formatter.
 */
export class HumanFormatter implements IFormatter {
  private options: FormatOptions;

  constructor(options: Partial<FormatOptions> = {}) {
    this.options = {
      format: 'human',
      colors: options.colors ?? true,
      verbose: options.verbose ?? false,
      showPassing: options.showPassing ?? options.verbose ?? false,
      errorsOnly: options.errorsOnly ?? false,
    };
  }

  formatResult(result: ValidationResult): string {
    const lines: string[] = [];

    // Header with status
    const statusIcon = this.getStatusIcon(result.status);
    const statusText = this.colorize(
      result.status.toUpperCase(),
      result.status === 'pass' ? 'green' : result.status === 'fail' ? 'red' : 'yellow'
    );
    lines.push(`${statusIcon} ${statusText}: ${result.file}`);

    // Architecture info
    if (result.archId) {
      lines.push(`   Architecture: ${result.archId}`);
    } else {
      lines.push(`   Architecture: ${this.colorize('(none)', 'dim')}`);
    }

    // Verbose: show inheritance and mixins
    if (this.options.verbose && result.archId) {
      if (result.inheritanceChain.length > 1) {
        lines.push(
          `   Inheritance: ${result.inheritanceChain.join(' → ')}`
        );
      }
      if (result.mixinsApplied.length > 0) {
        lines.push(`   Mixins: ${result.mixinsApplied.join(', ')}`);
      }
    }

    // Errors
    if (result.violations.length > 0) {
      lines.push('');
      lines.push(
        `   ${this.colorize(`ERRORS (${result.errorCount}):`, 'red')}`
      );
      for (const violation of result.violations) {
        lines.push(...this.formatViolation(violation, 'red'));
      }
    }

    // Warnings (skip if errorsOnly)
    if (result.warnings.length > 0 && !this.options.errorsOnly) {
      lines.push('');
      lines.push(
        `   ${this.colorize(`WARNINGS (${result.warningCount}):`, 'yellow')}`
      );
      for (const warning of result.warnings) {
        lines.push(...this.formatViolation(warning, 'yellow'));
      }
    }

    // Active overrides
    if (result.overridesActive.length > 0) {
      lines.push('');
      lines.push(
        `   ${this.colorize(`ACTIVE OVERRIDES (${result.overridesActive.length}):`, 'blue')}`
      );
      for (const override of result.overridesActive) {
        lines.push(`      ${override.rule}:${override.value}`);
        lines.push(`        Reason: ${override.reason}`);
        if (override.expires) {
          lines.push(`        Expires: ${override.expires}`);
        }
        if (override.warning) {
          lines.push(
            `        ${this.colorize(`⚠ ${override.warning}`, 'yellow')}`
          );
        }
      }
    }

    return lines.join('\n');
  }

  formatBatch(batch: BatchValidationResult): string {
    const lines: string[] = [];

    // Individual results (skip passing files unless showPassing is true)
    // Also skip warn-only files if errorsOnly is true
    for (const result of batch.results) {
      if (!this.options.showPassing && result.status === 'pass') {
        continue;
      }
      if (this.options.errorsOnly && result.status === 'warn') {
        continue;
      }
      lines.push(this.formatResult(result));
      lines.push('');
    }

    // Summary
    lines.push(this.formatSummary(batch));

    return lines.join('\n');
  }

  private formatViolation(violation: Violation, _color: string): string[] {
    const lines: string[] = [];
    const location = violation.line
      ? `Line ${violation.line}`
      : 'Missing';

    lines.push(
      `      ${location}: ${violation.rule}:${this.formatValue(violation.value)}`
    );
    lines.push(`        ${violation.message}`);

    // Show constraint source if available (which architecture introduced it)
    if (violation.source) {
      lines.push(`        ${this.colorize(`Source: ${violation.source}`, 'dim')}`);
    }

    if (violation.why) {
      lines.push(`        ${this.colorize(`Why: ${violation.why}`, 'dim')}`);
    }

    if (violation.fixHint) {
      lines.push(
        `        ${this.colorize(`Fix: ${violation.fixHint}`, 'cyan')}`
      );
    }

    // Show alternatives from constraint definition
    if (violation.alternatives && violation.alternatives.length > 0) {
      lines.push(`        ${this.colorize('Alternatives:', 'cyan')}`);
      for (const alt of violation.alternatives) {
        const desc = alt.description ? ` - ${alt.description}` : '';
        const exp = alt.export ? `.${alt.export}` : '';
        lines.push(`          → import from "${alt.module}"${exp}${desc}`);
      }
    }

    // Show didYouMean from pattern registry
    if (violation.didYouMean) {
      const dym = violation.didYouMean;
      const exp = dym.export ? ` (use: ${dym.export})` : '';
      lines.push(`        ${this.colorize(`Did you mean: ${dym.file}${exp}`, 'cyan')}`);
      if (dym.description) {
        lines.push(`          ${dym.description}`);
      }
    }

    return lines;
  }

  private formatSummary(batch: BatchValidationResult): string {
    const { summary } = batch;
    const lines: string[] = [];

    lines.push('═'.repeat(60));

    const passedText = this.colorize(`${summary.passed} passed`, 'green');
    const failedText = this.colorize(`${summary.failed} failed`, 'red');
    const warnedText = this.colorize(`${summary.warned} warnings`, 'yellow');

    lines.push(`SUMMARY: ${passedText}, ${failedText}, ${warnedText}`);
    lines.push(`Total files: ${summary.total}`);

    if (summary.activeOverrides > 0) {
      lines.push(`Active overrides: ${summary.activeOverrides}`);
    }

    return lines.join('\n');
  }

  private getStatusIcon(status: 'pass' | 'fail' | 'warn'): string {
    switch (status) {
      case 'pass':
        return this.colorize('✓', 'green');
      case 'fail':
        return this.colorize('✗', 'red');
      case 'warn':
        return this.colorize('⚠', 'yellow');
    }
  }

  private formatValue(value: unknown): string {
    return formatConstraintValue(value, { arraySeparator: ', ' });
  }

  private colorize(
    text: string,
    color: 'red' | 'green' | 'yellow' | 'blue' | 'cyan' | 'dim' | string
  ): string {
    if (!this.options.colors) {
      return text;
    }

    switch (color) {
      case 'red':
        return chalk.red(text);
      case 'green':
        return chalk.green(text);
      case 'yellow':
        return chalk.yellow(text);
      case 'blue':
        return chalk.blue(text);
      case 'cyan':
        return chalk.cyan(text);
      case 'dim':
        return chalk.dim(text);
      default:
        return text;
    }
  }

  /**
   * Format alternative architecture suggestions for a file with violations.
   */
  formatSuggestions(archId: string, suggestions: ArchitectureSuggestion[]): string {
    if (suggestions.length === 0) return '';

    const lines: string[] = [];
    lines.push('');
    lines.push(this.colorize('   ALTERNATIVE ARCHITECTURES:', 'blue'));
    lines.push(this.colorize('   Consider switching to one of these:', 'dim'));

    for (const s of suggestions) {
      const relation = s.relationship === 'parent' ? '(parent)' : '(sibling)';
      const desc = s.description ? ` - ${s.description}` : '';
      lines.push(`      ${this.colorize('→', 'cyan')} ${s.archId} ${this.colorize(relation, 'dim')}${desc}`);
      lines.push(`        ${this.colorize(`-${s.constraintsRemoved} constraints`, 'green')}, ${this.colorize(`+${s.constraintsAdded} new`, 'yellow')}`);
      lines.push(`        ${this.colorize(`Preview: archcodex diff-arch ${archId} ${s.archId}`, 'dim')}`);
    }

    return lines.join('\n');
  }
}
