/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that classes implement a specific interface.
 * Uses SemanticModel for language-agnostic validation.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that classes implement a specific interface.
 * Error code: E002
 */
export class ImplementsValidator extends BaseConstraintValidator {
  readonly rule = 'implements' as const;
  readonly errorCode = ErrorCodes.IMPLEMENTS;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;

    // Handle generic interfaces (e.g., IHandler<T>)
    const requiredInterface = String(constraint.value).replace(/<.*>$/, '');

    // Check each exported class
    for (const classInfo of parsedFile.classes) {
      if (!classInfo.isExported) continue;

      // Check if implements the required interface
      const implementsInterface = classInfo.implements.some(
        (impl) => impl.split('<')[0] === requiredInterface
      );

      if (!implementsInterface) {
        violations.push(
          this.createViolation(
            constraint,
            `Class '${classInfo.name}' must implement '${constraint.value}'`,
            context,
            { line: classInfo.location.line, column: classInfo.location.column, actual: classInfo.implements.join(', ') || 'none' }
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    return `Add 'implements ${constraint.value}' to the class declaration`;
  }
}
