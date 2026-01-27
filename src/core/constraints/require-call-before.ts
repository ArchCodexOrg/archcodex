/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that required function calls happen before other calls.
 * Uses source order comparison (pragmatic simplification).
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import type { FunctionCallInfo } from '../../validators/semantic.types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/** Validates that certain calls must happen before other calls. E020 */
export class RequireCallBeforeValidator extends BaseConstraintValidator {
  readonly rule = 'require_call_before' as const;
  readonly errorCode = ErrorCodes.REQUIRE_CALL_BEFORE;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;

    // Get required prerequisite calls from `value`
    const prerequisiteCalls = this.normalizeToArray(constraint.value);

    // Get guarded calls from `before` field
    const guardedCallPatterns = this.getBeforePatterns(constraint);
    if (guardedCallPatterns.length === 0) {
      // No `before` patterns specified, nothing to check
      return { passed: true, violations: [] };
    }

    // Find all calls matching the `before` patterns (calls that need prerequisites)
    const guardedCalls = this.findMatchingCalls(parsedFile.functionCalls, guardedCallPatterns);

    // For each guarded call, check if at least one prerequisite appears before it
    for (const guardedCall of guardedCalls) {
      const hasPrerequisite = this.hasPrerequisiteBefore(
        guardedCall,
        prerequisiteCalls,
        parsedFile.functionCalls
      );

      if (!hasPrerequisite) {
        violations.push(
          this.createViolation(
            constraint,
            `Call '${guardedCall.callee}' requires one of [${prerequisiteCalls.join(', ')}] to be called first`,
            context,
            { line: guardedCall.location.line, column: guardedCall.location.column }
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  private getBeforePatterns(constraint: Constraint): string[] {
    if ('before' in constraint && constraint.before) {
      return Array.isArray(constraint.before) ? constraint.before : [constraint.before];
    }
    return [];
  }

  private findMatchingCalls(calls: FunctionCallInfo[], patterns: string[]): FunctionCallInfo[] {
    return calls.filter(call => patterns.some(p => this.matchesPattern(call, p)));
  }

  private hasPrerequisiteBefore(
    guardedCall: FunctionCallInfo, prerequisitePatterns: string[], allCalls: FunctionCallInfo[]
  ): boolean {
    for (const call of allCalls) {
      if (!this.isBefore(call, guardedCall)) continue;
      if (prerequisitePatterns.some(p => this.matchesPattern(call, p))) return true;
    }
    return false;
  }

  private isBefore(a: FunctionCallInfo, b: FunctionCallInfo): boolean {
    return a.location.line < b.location.line ||
      (a.location.line === b.location.line && a.location.column < b.location.column);
  }

  private matchesPattern(call: FunctionCallInfo, pattern: string): boolean {
    if (call.callee === pattern || call.methodName === pattern) return true;
    // Deep wildcard: ctx.db.** matches ctx.db.patch, ctx.db.query.get
    if (pattern.endsWith('.**')) {
      const prefix = pattern.slice(0, -3);
      return call.callee.startsWith(prefix + '.') || call.callee === prefix;
    }
    // Single wildcard: api.* matches api.fetch but not api.foo.bar
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      if (call.receiver === prefix) return true;
      if (call.callee.startsWith(prefix + '.') && !call.callee.slice(prefix.length + 1).includes('.')) return true;
    }
    // Prefix wildcard: validate* matches validateInput
    if (pattern.endsWith('*') && !pattern.includes('.')) {
      const prefix = pattern.slice(0, -1);
      if (call.methodName.startsWith(prefix) || call.callee.startsWith(prefix)) return true;
    }
    return false;
  }

  protected getFixHint(constraint: Constraint): string {
    const prereqs = this.normalizeToArray(constraint.value);
    const guarded = this.getBeforePatterns(constraint);
    return `Call one of [${prereqs.join(', ')}] before calling [${guarded.join(', ')}]`;
  }
}
