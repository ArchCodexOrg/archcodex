/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that classes extend a specific base class.
 * Uses SemanticModel for language-agnostic validation.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that classes extend a specific base class.
 * Error code: E001
 */
export class MustExtendValidator extends BaseConstraintValidator {
  readonly rule = 'must_extend' as const;
  readonly errorCode = ErrorCodes.MUST_EXTEND;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;

    // Parse the required base (handle generics like BaseFilter<T>)
    const requiredBase = String(constraint.value).replace(/<.*>$/, '');

    // Check each exported class
    for (const classInfo of parsedFile.classes) {
      if (!classInfo.isExported) continue;

      if (!classInfo.extends) {
        violations.push(
          this.createViolation(
            constraint,
            `Class '${classInfo.name}' must extend '${constraint.value}' but has no base class`,
            context,
            { line: classInfo.location.line, column: classInfo.location.column }
          )
        );
        continue;
      }

      // Check if the class extends the required base (either directly or via inheritance chain)
      const extendsBase =
        classInfo.extends.split('<')[0] === requiredBase ||
        (classInfo.inheritanceChain?.includes(requiredBase) ?? false);

      if (!extendsBase) {
        violations.push(
          this.createViolation(
            constraint,
            `Class '${classInfo.name}' must extend '${constraint.value}', found '${classInfo.extends}'`,
            context,
            { line: classInfo.location.line, column: classInfo.location.column, actual: classInfo.extends }
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    return `Add 'extends ${constraint.value}' to the class declaration`;
  }
}
