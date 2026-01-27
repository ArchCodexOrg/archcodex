/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that a file is not part of a circular dependency.
 * This is a project-level constraint that requires --project flag.
 */
import * as path from 'node:path';
import type { Constraint } from '../registry/schema.js';
import type { ConstraintResult, ProjectConstraintContext, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';

/**
 * Validates forbid_circular_deps constraint.
 *
 * Example usage in registry:
 * ```yaml
 * archcodex.core:
 *   constraints:
 *     - rule: forbid_circular_deps
 *       severity: error
 *       why: "Circular dependencies make code hard to maintain"
 * ```
 */
export class ForbidCircularDepsValidator extends BaseConstraintValidator {
  readonly rule = 'forbid_circular_deps' as const;
  readonly errorCode = 'E013';

  validate(
    constraint: Constraint,
    context: ProjectConstraintContext
  ): ConstraintResult {
    const violations: Violation[] = [];

    // Skip if no project context (single-file validation)
    if (!context.cycles || context.cycles.length === 0) {
      return { passed: true, violations: [] };
    }

    for (const cycle of context.cycles) {
      // Format the cycle path for the message
      const cyclePath = cycle.files
        .map((filePath, i) => {
          const archId = cycle.archIds[i];
          const fileName = path.basename(filePath);
          return archId ? `${archId} (${fileName})` : fileName;
        })
        .join(' → ');

      violations.push({
        code: this.errorCode,
        rule: this.rule,
        value: constraint.value ?? true,
        severity: constraint.severity,
        line: null,
        column: null,
        message: `Circular dependency detected: ${cyclePath}`,
        why: constraint.why,
        fixHint: this.generateFixHint(cycle.files),
        source: context.constraintSource,
      });
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Generate a fix hint based on the cycle.
   */
  private generateFixHint(cycleFiles: string[]): string {
    if (cycleFiles.length === 2) {
      return 'Remove one of the bidirectional imports between these files';
    }
    return 'Break the cycle by extracting shared code to a common module or using dependency injection';
  }

  protected getFixHint(_constraint: Constraint, _actual?: string): string {
    return 'Break the circular dependency by restructuring imports';
  }
}
