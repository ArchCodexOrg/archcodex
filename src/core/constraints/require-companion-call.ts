/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that specific companion calls are made when certain methods are invoked.
 * Supports multiple targets and configurable detection modes.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import type { FunctionCallInfo } from '../../validators/semantic.types.js';
import type { TableDetectionSettings } from '../config/schema.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';
import { matchesOptionalCallPattern } from './pattern-utils.js';

/**
 * Single companion rule.
 */
interface CompanionRule {
  target: string;
  operations: string[];
  call: string;
}

/**
 * Value schema for require_companion_call.
 */
interface RequireCompanionCallValue {
  // Single rule (shorthand)
  target?: string;
  operations?: string[];
  call?: string;
  // Multiple rules
  rules?: CompanionRule[];
  // Location setting
  location?: 'same_function' | 'same_file' | 'after';
}

/**
 * Validates that companion calls are made when operating on specific targets.
 * Error code: E026
 *
 * Example:
 *   - rule: require_companion_call
 *     value:
 *       target: cacheManager
 *       operations: [set]
 *       call: save
 *     pattern: "cacheManager.*"
 */
export class RequireCompanionCallValidator extends BaseConstraintValidator {
  readonly rule = 'require_companion_call' as const;
  readonly errorCode = ErrorCodes.REQUIRE_COMPANION_CALL;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile, config } = context;
    const value = constraint.value as RequireCompanionCallValue;
    const pattern = constraint.pattern;
    const targetDetection = config?.table_detection;

    // Normalize rules (support both single rule and array)
    const rules = this.normalizeRules(value);
    if (rules.length === 0) {
      return { passed: true, violations: [] };
    }

    // Find all calls matching base pattern
    const matchingCalls = parsedFile.functionCalls.filter(call =>
      matchesOptionalCallPattern(call, pattern)
    );

    for (const call of matchingCalls) {
      // Extract target name based on detection mode
      const targetName = this.extractTargetName(call, targetDetection);
      if (!targetName) continue;

      // Find matching rule for this target + operation
      const matchingRule = rules.find(
        r => r.target === targetName && r.operations.includes(call.methodName)
      );
      if (!matchingRule) continue;

      // Check if companion call exists
      const location = value.location || 'same_file';
      const hasCompanionCall = this.hasCompanionCall(
        call,
        matchingRule.call,
        location,
        parsedFile.functionCalls
      );

      if (!hasCompanionCall) {
        violations.push(
          this.createViolation(
            constraint,
            `${call.methodName}(${targetName}) requires call to ${matchingRule.call}`,
            context,
            {
              line: call.location.line,
              column: call.location.column,
              suggestion: {
                action: 'add',
                target: matchingRule.call,
              },
            }
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Normalize value to array of rules.
   */
  private normalizeRules(value: RequireCompanionCallValue): CompanionRule[] {
    if (value.rules && value.rules.length > 0) {
      return value.rules;
    }

    if (value.target && value.operations && value.call) {
      return [{
        target: value.target,
        operations: value.operations,
        call: value.call,
      }];
    }

    return [];
  }

  // Pattern matching delegated to shared matchesOptionalCallPattern from pattern-utils.ts

  /**
   * Extract target name from a call.
   */
  private extractTargetName(
    call: FunctionCallInfo,
    config?: TableDetectionSettings
  ): string | null {
    const mode = config?.mode || 'first_argument';

    if (mode === 'method_chain') {
      // Method chain style: obj.target.method() → extract 'target'
      // For cacheManager.set(), receiver is 'cacheManager', so target is 'cacheManager'
      const receiver = call.receiver || '';
      const baseReceiver = config?.receiver;

      if (baseReceiver) {
        // If a base receiver is specified, extract the part after it
        if (receiver.startsWith(baseReceiver + '.')) {
          const afterBase = receiver.slice(baseReceiver.length + 1);
          return afterBase.split('.')[0] || null;
        }
        // If receiver equals base, the target is the receiver itself
        if (receiver === baseReceiver) {
          return receiver;
        }
        return null;
      }

      // No base receiver specified - target is the full receiver
      return receiver || null;
    }

    // Default: first_argument mode
    // someCall(target, data) → extract 'target'
    if (call.arguments.length > 0) {
      const firstArg = call.arguments[0].trim();
      // Handle identifier or string literal
      return firstArg.replace(/^["'`]|["'`]$/g, '');
    }

    return null;
  }

  /**
   * Check if the required companion call exists.
   */
  private hasCompanionCall(
    triggerCall: FunctionCallInfo,
    requiredCall: string,
    location: 'same_function' | 'same_file' | 'after',
    allCalls: FunctionCallInfo[]
  ): boolean {
    // Find calls that match the required call pattern
    const matchingCalls = allCalls.filter(c =>
      c.callee === requiredCall ||
      c.methodName === requiredCall ||
      c.callee.endsWith('.' + requiredCall)
    );

    if (matchingCalls.length === 0) {
      return false;
    }

    // For 'same_file', just check if it exists anywhere
    if (location === 'same_file') {
      return true;
    }

    // For 'after', check if any matching call comes after the trigger call
    if (location === 'after') {
      return matchingCalls.some(c => c.location.line > triggerCall.location.line);
    }

    // For 'same_function', check if both calls are in the same function
    if (location === 'same_function') {
      return matchingCalls.some(c => c.parentFunction === triggerCall.parentFunction);
    }

    return true;
  }

  protected getFixHint(constraint: Constraint): string {
    const value = constraint.value as RequireCompanionCallValue;
    const rules = this.normalizeRules(value);

    if (rules.length === 1) {
      return `Add call to '${rules[0].call}' when ${rules[0].operations.join('/')}ing ${rules[0].target}`;
    }

    return 'Add required companion calls';
  }
}
