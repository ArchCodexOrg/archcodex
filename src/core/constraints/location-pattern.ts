/**
 * @arch archcodex.core.domain.constraint
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that the file is in a specific location.
 * Error code: E008
 */
export class LocationPatternValidator extends BaseConstraintValidator {
  readonly rule = 'location_pattern' as const;
  readonly errorCode = ErrorCodes.LOCATION_PATTERN;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const requiredPath = String(constraint.value);
    const violations: Violation[] = [];

    // Normalize paths for comparison
    const normalizedFilePath = context.filePath.replace(/\\/g, '/');
    let normalizedRequired = requiredPath.replace(/\\/g, '/');

    // Ensure required path ends with / for proper directory matching
    // This prevents "src/component" from matching "src/mycomponents"
    if (!normalizedRequired.endsWith('/')) {
      normalizedRequired = normalizedRequired + '/';
    }

    // Check if file path contains the required directory path
    // Using directory boundary check to avoid substring false positives
    const containsPath = normalizedFilePath.includes(normalizedRequired) ||
      normalizedFilePath.startsWith(normalizedRequired) ||
      normalizedFilePath.endsWith(normalizedRequired.slice(0, -1)); // Allow exact match without trailing /

    if (!containsPath) {
      violations.push(
        this.createViolation(
          constraint,
          `File must be located in '${requiredPath}'`,
          context,
          { line: 1, column: 1, actual: context.filePath }
        )
      );
    }

    return { passed: violations.length === 0, violations };
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    return `Move the file to: ${constraint.value}`;
  }
}
