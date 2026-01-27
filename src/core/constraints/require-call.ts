/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that required function calls are present in the file.
 * Ensures certain functions are called somewhere (e.g., validation, logging).
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that specific functions are called somewhere in the file.
 * Error code: E017
 *
 * Use cases:
 * - Ensure AI output validation happens
 * - Require audit logging in mutations
 * - Ensure cleanup functions are called
 *
 * Patterns:
 * - Exact match: "validateInput" matches validateInput()
 * - Wildcard: "validate*" matches validateInput(), validateOutput()
 * - Method: "logger.*" matches logger.info(), logger.error()
 */
export class RequireCallValidator extends BaseConstraintValidator {
  readonly rule = 'require_call' as const;
  readonly errorCode = ErrorCodes.REQUIRE_CALL;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;
    const requiredCalls = this.normalizeToArray(constraint.value);

    for (const required of requiredCalls) {
      const found = this.findMatchingCall(required, parsedFile.functionCalls);

      if (!found) {
        violations.push(
          this.createViolation(
            constraint,
            `Required call '${required}' not found in file`,
            context
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Check if any call in the file matches the required pattern.
   */
  private findMatchingCall(
    pattern: string,
    calls: Array<{ callee: string; methodName: string; receiver?: string }>
  ): boolean {
    for (const call of calls) {
      if (this.matchesPattern(call, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a call matches a pattern.
   * Supports:
   * - Exact match: "validateInput" matches validateInput()
   * - Wildcard prefix: "validate*" matches validateInput()
   * - Method wildcard: "logger.*" matches logger.info()
   */
  private matchesPattern(
    call: { callee: string; methodName: string; receiver?: string },
    pattern: string
  ): boolean {
    // Exact match on callee or methodName
    if (call.callee === pattern || call.methodName === pattern) {
      return true;
    }

    // Method wildcard: logger.* matches logger.info
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      if (call.receiver === prefix) {
        return true;
      }
    }

    // Prefix wildcard: validate* matches validateInput
    if (pattern.endsWith('*') && !pattern.includes('.')) {
      const prefix = pattern.slice(0, -1);
      if (call.methodName.startsWith(prefix) || call.callee.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }

  protected getFixHint(constraint: Constraint): string {
    const calls = this.normalizeToArray(constraint.value);
    return `Add the required call(s): ${calls.join(', ')}`;
  }
}
