/**
 * @arch archcodex.core.domain.constraint
 * @intent:documentation-examples
 *
 * Validates that forbidden patterns do NOT exist in file content.
 * Regex-based content matching for anti-patterns.
 * Supports function-level intent exemptions via the `unless` field.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseForbidValidator } from './forbid-base.js';
import { ErrorCodes } from '../../utils/errors.js';
import { getPatternFromConstraint } from './pattern-utils.js';
import { getAllFunctionsWithIntents, findContainingFunction } from './intent-resolver.js';

/**
 * Validates that specific patterns do NOT exist in the file content.
 * Error code: E021
 *
 * Use cases:
 * - Block console.log statements
 * - Prevent hardcoded secrets (password = "...")
 * - Block dangerous patterns (eval, innerHTML =)
 * - Enforce coding standards (no 'any' type)
 *
 * The `pattern` field specifies the regex to match.
 * The `value` field provides a human-readable description.
 */
export class ForbidPatternValidator extends BaseForbidValidator {
  readonly rule = 'forbid_pattern' as const;
  readonly errorCode = ErrorCodes.FORBID_PATTERN;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;

    // Get pattern from constraint.pattern field, fallback to value
    const pattern = getPatternFromConstraint(constraint);
    if (!pattern) {
      violations.push(
        this.createViolation(
          constraint,
          `forbid_pattern constraint missing 'pattern' field`,
          context
        )
      );
      return { passed: false, violations };
    }

    // Extract intent exemptions from constraint.unless
    const exemptIntents = this.extractIntentExemptions(constraint.unless);

    // Check for file-level intent exemptions
    if (exemptIntents.length > 0 && context.intents) {
      const fileIntentNames = context.intents.map(i => i.name.toLowerCase());
      for (const exemptIntent of exemptIntents) {
        if (fileIntentNames.includes(exemptIntent.toLowerCase())) {
          // File has exempting intent, skip this constraint entirely
          return { passed: true, violations: [] };
        }
      }
    }

    // Get all functions with their intents for function-level exemption checking
    const functionsWithIntents = exemptIntents.length > 0
      ? getAllFunctionsWithIntents(parsedFile)
      : [];

    try {
      // Use 'gms' flags: global, multiline, dotAll
      const regex = new RegExp(pattern, 'gms');
      const matches = [...parsedFile.content.matchAll(regex)];

      if (matches.length > 0) {
        const description = typeof constraint.value === 'string' ? constraint.value : pattern;

        // Build structured suggestions
        const suggestion = this.buildSuggestion(constraint, matches[0]?.[0]);
        const didYouMean = this.buildDidYouMean(constraint, context);

        // Find line numbers for each match
        for (const match of matches) {
          const line = this.getLineNumber(parsedFile.content, match.index ?? 0);

          // Check for function-level intent exemption
          if (exemptIntents.length > 0) {
            const containingFunc = findContainingFunction(line, functionsWithIntents);
            if (containingFunc?.intents?.length) {
              const isExempted = exemptIntents.some(exemptIntent =>
                containingFunc.intents!.some(fi => fi.toLowerCase() === exemptIntent.toLowerCase())
              );
              if (isExempted) {
                // This match is inside a function with an exempting intent, skip
                continue;
              }
            }
          }

          violations.push({
            code: this.errorCode,
            rule: this.rule,
            value: constraint.value,
            severity: constraint.severity,
            line,
            column: null,
            message: `Forbidden pattern found: ${description}`,
            why: constraint.why,
            fixHint: this.getFixHint(constraint),
            source: context.constraintSource,
            suggestion,
            didYouMean,
          });
        }
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

  /**
   * Get line number from character index.
   */
  private getLineNumber(content: string, index: number): number {
    const lines = content.substring(0, index).split('\n');
    return lines.length;
  }

  protected getFixHint(constraint: Constraint): string {
    if (constraint.alternative) {
      return `Replace with '${constraint.alternative}'`;
    }
    if (constraint.alternatives && constraint.alternatives.length > 0) {
      const alt = constraint.alternatives[0];
      return `Replace with '${alt.module}'${alt.export ? ` (use ${alt.export})` : ''}`;
    }
    const description = typeof constraint.value === 'string' ? constraint.value : 'the pattern';
    return `Remove or refactor code matching: ${description}`;
  }
}
