/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that specified global objects are not mutated.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import type { MutationInfo } from '../../validators/semantic.types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that certain objects are not mutated.
 * Error code: E016
 *
 * Example:
 *   - rule: forbid_mutation
 *     value: [process.env, window, globalThis]
 *     why: "Global state mutation is forbidden"
 */
export class ForbidMutationValidator extends BaseConstraintValidator {
  readonly rule = 'forbid_mutation' as const;
  readonly errorCode = ErrorCodes.FORBID_MUTATION;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;
    const forbiddenTargets = this.normalizeToArray(constraint.value);

    for (const mutation of parsedFile.mutations) {
      const match = this.findForbiddenMatch(mutation, forbiddenTargets);

      if (match) {
        const action = mutation.isDelete ? 'Delete of' : 'Mutation of';
        violations.push(
          this.createViolation(
            constraint,
            `${action} '${mutation.target}' is forbidden (matches pattern '${match}')`,
            context,
            { line: mutation.location.line, column: mutation.location.column }
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Find if a mutation matches any forbidden pattern.
   */
  private findForbiddenMatch(mutation: MutationInfo, forbidden: string[]): string | null {
    for (const pattern of forbidden) {
      if (this.matchesMutationPattern(mutation, pattern)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Check if a mutation matches a pattern.
   * Patterns:
   * - Exact target: "process.env" matches process.env = x
   * - Root object: "process" matches process.env, process.exit, etc.
   * - Prefix: "process.env" matches process.env.NODE_ENV
   * - Wildcard: "window.*" matches window.foo but not window.foo.bar
   * - Deep wildcard: "window.**" matches window.foo.bar
   */
  private matchesMutationPattern(mutation: MutationInfo, pattern: string): boolean {
    // Exact target match: "process.env" matches process.env = x
    if (mutation.target === pattern) {
      return true;
    }

    // Root object match: "process" matches process.env, process.exit, etc.
    if (mutation.rootObject === pattern) {
      return true;
    }

    // Prefix match: "process.env" matches process.env.NODE_ENV
    if (mutation.target.startsWith(pattern + '.')) {
      return true;
    }

    // Single wildcard: "window.*" matches window.foo but not window.foo.bar
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return mutation.rootObject === prefix && mutation.propertyPath.length === 1;
    }

    // Deep wildcard: "window.**" matches window.foo.bar
    if (pattern.endsWith('.**')) {
      const prefix = pattern.slice(0, -3);
      return mutation.rootObject === prefix;
    }

    return false;
  }

  protected getFixHint(constraint: Constraint): string {
    const targets = this.normalizeToArray(constraint.value);
    return `Avoid mutating ${targets.join(', ')}. Use immutable patterns or local copies instead.`;
  }
}
