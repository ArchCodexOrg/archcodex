/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that classes have a required decorator.
 * Uses SemanticModel for language-agnostic validation.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that classes have a required decorator.
 * Error code: E005
 */
export class RequireDecoratorValidator extends BaseConstraintValidator {
  readonly rule = 'require_decorator' as const;
  readonly errorCode = ErrorCodes.REQUIRE_DECORATOR;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;

    // Normalize decorator name (remove @ if present)
    const decoratorName = String(constraint.value).replace(/^@/, '');

    // Check each exported class
    for (const classInfo of parsedFile.classes) {
      if (!classInfo.isExported) continue;

      const hasDecorator = classInfo.decorators.some(
        (d) => d.name === decoratorName
      );

      if (!hasDecorator) {
        violations.push(
          this.createViolation(
            constraint,
            `Class '${classInfo.name}' must have decorator '@${decoratorName}'`,
            context,
            { line: classInfo.location.line, column: classInfo.location.column, actual: classInfo.decorators.map((d) => `@${d.name}`).join(', ') || 'none' }
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    const decorator = String(constraint.value).replace(/^@/, '');
    return `Add '@${decorator}()' decorator above the class declaration`;
  }
}
