/**
 * @arch archcodex.cli.formatter
 */
import type { ValidationResult, BatchValidationResult } from '../../core/validation/types.js';
import type { IFormatter, FormatOptions } from './types.js';

/**
 * JSON output formatter for machine consumption.
 */
export class JsonFormatter implements IFormatter {
  private errorsOnly: boolean;

  constructor(options: Partial<FormatOptions> = {}) {
    this.errorsOnly = options.errorsOnly ?? false;
  }

  private transformViolation(v: ValidationResult['violations'][0], archId?: string | null): Record<string, unknown> {
    const result: Record<string, unknown> = {
      code: v.code,
      rule: v.rule,
      value: v.value,
      severity: v.severity,
      line: v.line,
      column: v.column,
      message: v.message,
      why: v.why,
      fix_hint: v.fixHint,
      source: v.source,
    };

    // Include structured suggestion if present
    if (v.suggestion) {
      result.suggestion = v.suggestion;
    }

    // Include "did you mean" suggestion if present
    if (v.didYouMean) {
      result.did_you_mean = {
        file: v.didYouMean.file,
        export: v.didYouMean.export,
        description: v.didYouMean.description,
        example_usage: v.didYouMean.exampleUsage,
      };
    }

    // Include alternatives if present
    if (v.alternatives && v.alternatives.length > 0) {
      result.alternatives = v.alternatives;
    }

    // Add structured actions for AI agents
    const actions: Array<{ priority: number; action: string; command?: string; details?: string }> = [];

    if (v.alternatives && v.alternatives.length > 0) {
      actions.push({
        priority: 1,
        action: 'use_alternative',
        details: `Replace with import from: ${v.alternatives.map(a => a.module).join(' or ')}`,
      });
    } else if (v.didYouMean) {
      actions.push({
        priority: 1,
        action: 'use_alternative',
        details: `Replace with import from: ${v.didYouMean.file}`,
      });
    } else if (v.rule === 'forbid_import') {
      actions.push({
        priority: 1,
        action: 'refactor',
        details: 'Remove the forbidden import and refactor code',
      });
    } else {
      actions.push({
        priority: 1,
        action: 'refactor',
        details: 'Modify code to satisfy the constraint',
      });
    }

    actions.push({
      priority: 2,
      action: 'change_architecture',
      command: archId ? `archcodex diff-arch ${archId} <new-arch>` : 'archcodex diff-arch <current> <new>',
      details: 'Compare architectures before changing @arch tag',
    });

    actions.push({
      priority: 3,
      action: 'add_override',
      details: 'Last resort: add @override with @reason and @expires (within 90 days)',
    });

    result.actions = actions;

    return result;
  }

  formatResult(result: ValidationResult): string {
    return JSON.stringify(this.transformResult(result), null, 2);
  }

  formatBatch(batch: BatchValidationResult): string {
    const output: Record<string, unknown> = {
      summary: batch.summary,
      results: batch.results.map((r) => this.transformResult(r)),
    };

    // Include project-level fields if present (from ProjectBatchValidationResult)
    const projectBatch = batch as unknown as Record<string, unknown>;
    if (projectBatch.packageViolations) {
      output.package_violations = projectBatch.packageViolations;
    }
    if (projectBatch.layerViolations) {
      output.layer_violations = projectBatch.layerViolations;
    }
    if (projectBatch.coverageGaps) {
      output.coverage_gaps = projectBatch.coverageGaps;
    }
    if (projectBatch.coverageStats) {
      output.coverage_stats = projectBatch.coverageStats;
    }
    if (projectBatch.projectStats) {
      output.project_stats = projectBatch.projectStats;
    }

    return JSON.stringify(output, null, 2);
  }

  private transformResult(result: ValidationResult): Record<string, unknown> {
    return {
      status: result.status,
      file: result.file,
      arch_id: result.archId,
      inheritance_chain: result.inheritanceChain,
      mixins_applied: result.mixinsApplied,
      violations: result.violations.map((v) => this.transformViolation(v, result.archId)),
      // Omit warnings if errorsOnly is true
      warnings: this.errorsOnly ? [] : result.warnings.map((v) => this.transformViolation(v, result.archId)),
      overrides_active: result.overridesActive.map((o) => ({
        rule: o.rule,
        value: o.value,
        reason: o.reason,
        expires: o.expires,
        ticket: o.ticket,
        approved_by: o.approvedBy,
        warning: o.warning,
      })),
      passed: result.passed,
      error_count: result.errorCount,
      warning_count: this.errorsOnly ? 0 : result.warningCount,
    };
  }
}
