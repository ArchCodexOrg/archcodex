/**
 * @arch archcodex.core.domain.constraint
 * @intent:documentation-examples
 *
 * Validates that forbidden function/method calls are not present.
 * Supports exact matches and pattern matches (e.g., api.*).
 * Supports function-level intent exemptions.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation, Suggestion, DidYouMean } from './types.js';
import { BaseConstraintValidator } from './base.js';
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
export class ForbidCallValidator extends BaseConstraintValidator {
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

  /**
   * Extract intent names from unless conditions.
   * Returns intent names (without @intent: prefix) for intent-based exemptions.
   */
  private extractIntentExemptions(unless?: string[]): string[] {
    if (!unless) return [];
    return unless
      .filter(u => u.startsWith('@intent:'))
      .map(u => u.slice(8)); // Remove "@intent:" prefix
  }

  // Pattern matching delegated to shared findMatchingCallPattern from pattern-utils.ts

  /**
   * Build a structured suggestion for replacing the forbidden call.
   */
  private buildSuggestion(constraint: Constraint, callee: string): Suggestion | undefined {
    // If alternative is provided
    if (constraint.alternative) {
      return {
        action: 'replace',
        target: callee,
        replacement: constraint.alternative,
      };
    }

    // If detailed alternatives are provided
    if (constraint.alternatives && constraint.alternatives.length > 0) {
      const alt = constraint.alternatives[0];
      return {
        action: 'replace',
        target: callee,
        replacement: alt.export || alt.module,
        importStatement: alt.export
          ? `import { ${alt.export} } from '${alt.module}';`
          : `import * from '${alt.module}';`,
      };
    }

    // Default: suggest removal
    return {
      action: 'remove',
      target: callee,
    };
  }

  /**
   * Build a "did you mean" suggestion from alternatives or pattern registry.
   */
  private buildDidYouMean(constraint: Constraint, context: ConstraintContext, callee: string): DidYouMean | undefined {
    // If simple alternative
    if (constraint.alternative) {
      return {
        file: constraint.alternative,
        description: constraint.why || 'Use the approved alternative instead',
      };
    }

    // If detailed alternatives
    if (constraint.alternatives && constraint.alternatives.length > 0) {
      const alt = constraint.alternatives[0];
      return {
        file: alt.module,
        export: alt.export,
        description: alt.description || 'Use the canonical implementation',
        exampleUsage: alt.example,
      };
    }

    // Try pattern registry lookup
    if (context.patternRegistry) {
      const matchingPattern = this.findMatchingPattern(context.patternRegistry, callee);
      if (matchingPattern) {
        return {
          file: matchingPattern.canonical,
          export: matchingPattern.exports?.[0],
          description: matchingPattern.usage || 'Use the canonical implementation',
          exampleUsage: matchingPattern.example,
        };
      }
    }

    return undefined;
  }

  /**
   * Find a pattern in the registry that matches the forbidden call.
   */
  private findMatchingPattern(registry: import('../patterns/types.js').PatternRegistry, callee: string): import('../patterns/types.js').Pattern | undefined {
    if (!registry.patterns) return undefined;

    const calleeLower = callee.toLowerCase();

    for (const [, pattern] of Object.entries(registry.patterns)) {
      if (pattern.keywords?.some(k => calleeLower.includes(k.toLowerCase()) || k.toLowerCase().includes(calleeLower))) {
        return pattern;
      }
    }

    return undefined;
  }

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
