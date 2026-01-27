/**
 * @arch archcodex.core.domain.constraint
 * @intent:documentation-examples
 *
 * Validates that forbidden patterns do NOT exist in file content.
 * Regex-based content matching for anti-patterns.
 * Supports function-level intent exemptions via the `unless` field.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation, Suggestion, DidYouMean } from './types.js';
import { BaseConstraintValidator } from './base.js';
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
export class ForbidPatternValidator extends BaseConstraintValidator {
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
    } catch {
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
   * Extract intent exemptions from the unless clause.
   * Returns intent names without the @intent: prefix.
   */
  private extractIntentExemptions(unless?: string[]): string[] {
    if (!unless) return [];

    return unless
      .filter(u => u.startsWith('@intent:'))
      .map(u => u.slice(8)); // Remove '@intent:' prefix
  }


  /**
   * Get line number from character index.
   */
  private getLineNumber(content: string, index: number): number {
    const lines = content.substring(0, index).split('\n');
    return lines.length;
  }

  /**
   * Build a structured suggestion for fixing the forbidden pattern.
   */
  private buildSuggestion(constraint: Constraint, matchedText?: string): Suggestion | undefined {
    // If alternative is provided, suggest replacement
    if (constraint.alternative) {
      return {
        action: 'replace',
        target: matchedText,
        replacement: constraint.alternative,
      };
    }

    // If detailed alternatives are provided
    if (constraint.alternatives && constraint.alternatives.length > 0) {
      const alt = constraint.alternatives[0];
      return {
        action: 'replace',
        target: matchedText,
        replacement: alt.module,
        importStatement: alt.export
          ? `import { ${alt.export} } from '${alt.module}';`
          : undefined,
      };
    }

    // Default: suggest removal
    return {
      action: 'remove',
      target: matchedText,
    };
  }

  /**
   * Build a "did you mean" suggestion from alternatives or pattern registry.
   */
  private buildDidYouMean(constraint: Constraint, context: ConstraintContext): DidYouMean | undefined {
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

    // Try pattern registry lookup based on constraint description
    if (context.patternRegistry) {
      const description = typeof constraint.value === 'string' ? constraint.value.toLowerCase() : '';
      const matchingPattern = this.findMatchingPattern(context.patternRegistry, description);
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
   * Find a pattern in the registry that matches the description.
   */
  private findMatchingPattern(registry: import('../patterns/types.js').PatternRegistry, description: string): import('../patterns/types.js').Pattern | undefined {
    if (!registry.patterns) return undefined;

    for (const [, pattern] of Object.entries(registry.patterns)) {
      if (pattern.keywords?.some(k => description.includes(k.toLowerCase()) || k.toLowerCase().includes(description))) {
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
    const description = typeof constraint.value === 'string' ? constraint.value : 'the pattern';
    return `Remove or refactor code matching: ${description}`;
  }
}
