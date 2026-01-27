/**
 * @arch archcodex.core.domain.constraint
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';
import {
  compileNamingPattern,
  validateNamingPattern,
  describeNamingPattern,
} from './pattern-compiler.js';

/**
 * Validates that the file name matches a pattern.
 * Supports both regex patterns and structured naming patterns.
 * Error code: E007
 */
export class NamingPatternValidator extends BaseConstraintValidator {
  readonly rule = 'naming_pattern' as const;
  readonly errorCode = ErrorCodes.NAMING_PATTERN;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const fileName = context.fileName;

    // Determine pattern source: structured naming or regex value
    let pattern: string;
    let patternDescription: string;

    if (constraint.naming) {
      // Use structured naming pattern (LLM-friendly)
      const validationError = validateNamingPattern(constraint.naming);
      if (validationError) {
        violations.push(
          this.createViolation(
            constraint,
            `Invalid structured naming pattern: ${validationError}`,
            context,
            { line: 1, column: 1 }
          )
        );
        return { passed: false, violations };
      }

      pattern = compileNamingPattern(constraint.naming);
      patternDescription = describeNamingPattern(constraint.naming);
    } else {
      // Use regex pattern from value
      pattern = String(constraint.value);
      patternDescription = pattern;
    }

    try {
      const regex = new RegExp(pattern);
      if (!regex.test(fileName)) {
        // Include examples in error message if available
        let message = `File name '${fileName}' does not match naming pattern`;
        if (constraint.naming) {
          message += ` (${patternDescription})`;
        } else {
          message += ` '${pattern}'`;
        }

        if (constraint.examples && constraint.examples.length > 0) {
          message += `. Valid examples: ${constraint.examples.join(', ')}`;
        }

        violations.push(
          this.createViolation(constraint, message, context, {
            line: 1,
            column: 1,
            actual: fileName,
          })
        );
      }
    } catch {
      violations.push(
        this.createViolation(
          constraint,
          `Invalid naming pattern regex: '${pattern}'`,
          context,
          { line: 1, column: 1 }
        )
      );
    }

    return { passed: violations.length === 0, violations };
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    if (constraint.naming) {
      const desc = describeNamingPattern(constraint.naming);
      if (constraint.examples && constraint.examples.length > 0) {
        return `Rename the file to match: ${desc}. Examples: ${constraint.examples.join(', ')}`;
      }
      return `Rename the file to match: ${desc}`;
    }
    return `Rename the file to match the pattern: ${constraint.value}`;
  }
}
