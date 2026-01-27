/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that classes do not have a forbidden decorator.
 * Uses SemanticModel for language-agnostic validation.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that classes do not have a forbidden decorator.
 * Error code: E006
 */
export class ForbidDecoratorValidator extends BaseConstraintValidator {
  readonly rule = 'forbid_decorator' as const;
  readonly errorCode = ErrorCodes.FORBID_DECORATOR;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;

    // Normalize decorator name (remove @ if present)
    const decoratorName = String(constraint.value).replace(/^@/, '');

    // Check each exported class
    for (const classInfo of parsedFile.classes) {
      if (!classInfo.isExported) continue;

      for (const decorator of classInfo.decorators) {
        if (decorator.name === decoratorName) {
          violations.push(
            this.createViolation(
              constraint,
              `Class '${classInfo.name}' has forbidden decorator '@${decoratorName}'`,
              context,
              { line: decorator.location.line, column: decorator.location.column }
            )
          );
        }
      }
    }

    return { passed: violations.length === 0, violations };
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    const decorator = String(constraint.value).replace(/^@/, '');
    return `Remove the '@${decorator}' decorator`;
  }
}
