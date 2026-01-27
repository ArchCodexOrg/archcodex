/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that classes don't exceed a maximum number of public methods.
 * Uses SemanticModel for language-agnostic validation.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that classes don't exceed a maximum number of public methods.
 * Error code: E009
 */
export class MaxPublicMethodsValidator extends BaseConstraintValidator {
  readonly rule = 'max_public_methods' as const;
  readonly errorCode = ErrorCodes.MAX_PUBLIC_METHODS;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;
    const maxMethods = Number(constraint.value);

    // Count public methods across all classes in the file
    let publicMethodCount = 0;

    for (const classInfo of parsedFile.classes) {
      for (const method of classInfo.methods) {
        if (method.visibility === 'public') {
          publicMethodCount++;
        }
      }
    }

    if (publicMethodCount > maxMethods) {
      violations.push(
        this.createViolation(
          constraint,
          `File has ${publicMethodCount} public methods, maximum is ${maxMethods}`,
          context,
          { line: null, column: null, actual: String(publicMethodCount) }
        )
      );
    }

    return { passed: violations.length === 0, violations };
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    return `Reduce the number of public methods to ${constraint.value} or fewer. Consider extracting methods to helper classes.`;
  }
}
