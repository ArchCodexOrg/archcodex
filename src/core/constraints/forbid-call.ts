/**
 * @arch archcodex.core.domain.constraint
 * @intent:documentation-examples
 *
 * Validates that forbidden function/method calls are not present.
 * Supports exact matches and pattern matches (e.g., api.*).
 * Supports function-level intent exemptions.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseForbidValidator } from './forbid-base.js';
import { ErrorCodes } from '../../utils/errors.js';
import { findMatchingCallPattern } from './pattern-utils.js';
import { getAllFunctionsWithIntents, getEffectiveIntentsForCall } from './intent-resolver.js';

/**
 * Validates that specific functions are not called.
 * Error code: E014
 *
 * Patterns:
 * - Exact match: "setTimeout" matches setTimeout()
 * - Wildcard: "api.*" matches api.fetch(), api.post()
 * - Deep wildcard: "api.**" matches api.client.fetch()
 */
export class ForbidCallValidator extends BaseForbidValidator {
  readonly rule = 'forbid_call' as const;
  readonly errorCode = ErrorCodes.FORBID_CALL;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;
    const forbiddenCalls = this.normalizeToArray(constraint.value);

    // Extract intent exemptions from constraint.unless
    const exemptIntents = this.extractIntentExemptions(constraint.unless);

    // Get all functions with their intents for lookup
    const functionsWithIntents = exemptIntents.length > 0
      ? getAllFunctionsWithIntents(parsedFile)
      : [];

    for (const call of parsedFile.functionCalls) {
      const match = findMatchingCallPattern(call, forbiddenCalls);

      if (match) {
        // Check if call is exempted by function-level intent
        if (exemptIntents.length > 0) {
          const effectiveIntents = getEffectiveIntentsForCall(
            call.parentFunction,
            context.intents ?? [],
            functionsWithIntents
          );

          // Skip if any exempting intent is present
          const isExempted = exemptIntents.some(exemptIntent =>
            effectiveIntents.some(i => i.toLowerCase() === exemptIntent.toLowerCase())
          );

          if (isExempted) {
            continue; // Skip this violation - function has exempting intent
          }
        }

        // Build structured suggestions
        const suggestion = this.buildSuggestion(constraint, call.callee);
        const didYouMean = this.buildDidYouMean(constraint, context, call.callee);

        violations.push(
          this.createViolation(
            constraint,
            `Call to '${call.callee}' is forbidden (matches pattern '${match}')`,
            context,
            { line: call.location.line, column: call.location.column, suggestion, didYouMean }
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  // Pattern matching delegated to shared findMatchingCallPattern from pattern-utils.ts

  protected getFixHint(constraint: Constraint): string {
    if (constraint.alternative) {
      return `Replace with '${constraint.alternative}'`;
    }
    if (constraint.alternatives && constraint.alternatives.length > 0) {
      const alt = constraint.alternatives[0];
      return `Replace with '${alt.module}'${alt.export ? ` (use ${alt.export})` : ''}`;
    }
    const calls = this.normalizeToArray(constraint.value);
    return `Remove or replace the forbidden call(s): ${calls.join(', ')}`;
  }
}
