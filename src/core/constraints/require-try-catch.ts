/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that specified function calls are wrapped in try/catch blocks.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';
import { findMatchingCallPattern } from './pattern-utils.js';

/**
 * Validates that certain calls are wrapped in try/catch.
 * Error code: E015
 *
 * Uses 'around' field for patterns, falls back to 'value' if not present.
 * Example:
 *   - rule: require_try_catch
 *     around: [fetch, api.*]
 *     why: "External calls should handle errors"
 */
export class RequireTryCatchValidator extends BaseConstraintValidator {
  readonly rule = 'require_try_catch' as const;
  readonly errorCode = ErrorCodes.REQUIRE_TRY_CATCH;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;

    // Get patterns from 'around' field or fall back to 'value'
    const aroundValue = (constraint as { around?: string | string[] }).around;
    const patterns = this.normalizeToArray(aroundValue ?? constraint.value);

    for (const call of parsedFile.functionCalls) {
      const matchedPattern = findMatchingCallPattern(call, patterns);

      if (matchedPattern && !call.controlFlow.inTryBlock) {
        violations.push(
          this.createViolation(
            constraint,
            `Call to '${call.callee}' should be wrapped in try/catch (matches pattern '${matchedPattern}')`,
            context,
            { line: call.location.line, column: call.location.column }
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  // Pattern matching delegated to shared findMatchingCallPattern from pattern-utils.ts

  protected getFixHint(): string {
    return 'Wrap the call in a try/catch block to handle potential errors';
  }
}
