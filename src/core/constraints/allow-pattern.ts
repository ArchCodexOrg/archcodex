/**
 * @arch archcodex.core.domain.constraint
 * @intent:documentation-examples
 *
 * Allows patterns that would otherwise be forbidden by parent forbid_pattern.
 * This constraint doesn't validate anything directly - it removes matching
 * forbid_pattern constraints during resolution.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult } from './types.js';
import { BaseConstraintValidator } from './base.js';

/**
 * Allows patterns that would otherwise be forbidden.
 * No error code - this constraint only affects resolution.
 *
 * Use cases:
 * - Override parent's forbid_pattern for specific architectures
 * - Allow console.log in CLI commands while forbidding in core
 * - Allow certain patterns in test files
 *
 * The `pattern` field must match the forbid_pattern's pattern exactly.
 * The `value` field provides a human-readable description.
 */
export class AllowPatternValidator extends BaseConstraintValidator {
  readonly rule = 'allow_pattern' as const;
  readonly errorCode = ''; // No error code - not a validation constraint

  /**
   * This validator always passes - it only affects resolution.
   * The actual work is done in the resolver when processing allow_pattern.
   */
  validate(_constraint: Constraint, _context: ConstraintContext): ConstraintResult {
    return { passed: true, violations: [] };
  }

  protected getFixHint(_constraint: Constraint): string {
    return '';
  }
}
