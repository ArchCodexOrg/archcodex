/**
 * @arch archcodex.core.domain.constraint
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that files don't exceed a maximum number of lines.
 * Supports `exclude_comments: true` to use LOC (lines of code) instead of total lines.
 * Error code: E010
 */
export class MaxFileLinesValidator extends BaseConstraintValidator {
  readonly rule = 'max_file_lines' as const;
  readonly errorCode = ErrorCodes.MAX_FILE_LINES;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const maxLines = Number(constraint.value);
    const violations: Violation[] = [];

    // Use LOC (excluding comments/blank lines) if exclude_comments is true
    const excludeComments = constraint.exclude_comments === true;
    const actualLines = excludeComments
      ? context.parsedFile.locCount
      : context.parsedFile.lineCount;

    const lineType = excludeComments ? 'lines of code' : 'lines';

    if (actualLines > maxLines) {
      violations.push(
        this.createViolation(
          constraint,
          `File has ${actualLines} ${lineType}, maximum is ${maxLines}`,
          context,
          { line: null, column: null, actual: String(actualLines) }
        )
      );
    }

    return { passed: violations.length === 0, violations };
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    const lineType = constraint.exclude_comments ? 'lines of code' : 'lines';
    return `Split the file into smaller modules. Maximum allowed is ${constraint.value} ${lineType}.`;
  }
}
