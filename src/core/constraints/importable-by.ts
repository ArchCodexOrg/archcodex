/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that only allowed architectures can import this file.
 * This is a project-level constraint that requires --project flag.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintResult, ProjectConstraintContext, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';

/**
 * Validates importable_by constraint.
 *
 * Example usage in registry:
 * ```yaml
 * domain.payment:
 *   constraints:
 *     - rule: importable_by
 *       value: [domain.payment.*, api.payment.*, test.**]
 *       severity: error
 *       why: "Payment domain should not leak to other domains"
 * ```
 */
export class ImportableByValidator extends BaseConstraintValidator {
  readonly rule = 'importable_by' as const;
  readonly errorCode = 'E012';

  validate(
    constraint: Constraint,
    context: ProjectConstraintContext
  ): ConstraintResult {
    const violations: Violation[] = [];
    const allowedPatterns = this.normalizeToArray(constraint.value);

    // Skip if no project context (single-file validation)
    if (!context.importers || context.importers.length === 0) {
      return { passed: true, violations: [] };
    }

    for (const importer of context.importers) {
      // Skip untagged files - they don't have an architecture to check
      if (!importer.archId) {
        continue;
      }

      const isAllowed = allowedPatterns.some((pattern) =>
        this.matchesPattern(importer.archId!, pattern)
      );

      if (!isAllowed) {
        violations.push({
          code: this.errorCode,
          rule: this.rule,
          value: constraint.value,
          severity: constraint.severity,
          line: importer.line ?? null,
          column: null,
          message: `Architecture '${importer.archId}' is not allowed to import '${context.archId}' (allowed: ${allowedPatterns.join(', ')})`,
          why: constraint.why,
          fixHint: `Move the import to a file with an allowed architecture, or add '${importer.archId}' to the importable_by list`,
          source: context.constraintSource,
        });
      }
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Match arch ID against a glob-like pattern.
   *
   * Patterns:
   * - `*` matches any single segment (e.g., `domain.*` matches `domain.payment`)
   * - `**` matches any number of segments (e.g., `test.**` matches `test.unit.payment`)
   * - Literal matches work too (e.g., `domain.payment.service`)
   */
  private matchesPattern(archId: string, pattern: string): boolean {
    // Convert pattern to regex
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<DOUBLE>>>')
      .replace(/\*/g, '[^.]+')
      .replace(/<<<DOUBLE>>>/g, '.*');

    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(archId);
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    const allowed = this.normalizeToArray(constraint.value);
    return `Move import to a file with architecture matching: ${allowed.join(', ')}`;
  }
}
