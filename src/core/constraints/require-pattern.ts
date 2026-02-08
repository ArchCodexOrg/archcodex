/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that required patterns exist in file content.
 * Regex-based content matching for patterns that aren't function calls.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';
import { getPatternFromConstraint } from './pattern-utils.js';

/**
 * Validates that specific patterns exist in the file content.
 * Error code: E018
 *
 * Use cases:
 * - Soft delete filtering (isDeleted.*false in queries)
 * - Ensure certain comments exist (@security-reviewed)
 * - Detect required code patterns
 * - Require error handling structures
 *
 * The `pattern` field in the constraint specifies the regex to match.
 * The `value` field provides a human-readable description.
 */
export class RequirePatternValidator extends BaseConstraintValidator {
  readonly rule = 'require_pattern' as const;
  readonly errorCode = ErrorCodes.REQUIRE_PATTERN;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;

    // Get pattern from constraint.pattern field, fallback to value if it looks like a regex
    const pattern = getPatternFromConstraint(constraint);
    if (!pattern) {
      violations.push(
        this.createViolation(
          constraint,
          `require_pattern constraint missing 'pattern' field`,
          context
        )
      );
      return { passed: false, violations };
    }

    try {
      // Use 'ms' flags: multiline (^ and $ match line boundaries) + dotAll (. matches newlines)
      const regex = new RegExp(pattern, 'ms');
      const matches = regex.test(parsedFile.content);

      if (!matches) {
        const description = typeof constraint.value === 'string' ? constraint.value : pattern;
        violations.push(
          this.createViolation(
            constraint,
            `Required pattern not found: ${description}`,
            context
          )
        );
      }
    } catch { /* invalid regex pattern */
      violations.push(
        this.createViolation(
          constraint,
          `Invalid regex pattern: ${pattern}`,
          context
        )
      );
    }

    return { passed: violations.length === 0, violations };
  }


  protected getFixHint(constraint: Constraint): string {
    const pattern = getPatternFromConstraint(constraint) || String(constraint.value);
    return `Add code matching the pattern: ${pattern}`;
  }
}
