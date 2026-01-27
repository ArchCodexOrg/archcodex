/**
 * @arch archcodex.core.domain.constraint
 *
 * Shared base class for forbid-* constraint validators.
 * Extracts common suggestion, didYouMean, intent exemption, and pattern matching logic.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, Suggestion, DidYouMean } from './types.js';
import type { PatternRegistry, Pattern } from '../patterns/types.js';
import { BaseConstraintValidator } from './base.js';

/**
 * Base class for forbid-call, forbid-import, and forbid-pattern validators.
 * Provides shared methods for building suggestions, didYouMean hints,
 * intent exemption extraction, and pattern registry lookups.
 */
export abstract class BaseForbidValidator extends BaseConstraintValidator {

  /**
   * Extract intent names from unless conditions.
   * Returns intent names (without @intent: prefix) for intent-based exemptions.
   */
  protected extractIntentExemptions(unless?: string[]): string[] {
    if (!unless) return [];
    return unless
      .filter(u => u.startsWith('@intent:'))
      .map(u => u.slice(8)); // Remove "@intent:" prefix
  }

  /**
   * Build a structured suggestion for replacing or removing the forbidden item.
   */
  protected buildSuggestion(constraint: Constraint, target?: string): Suggestion | undefined {
    if (constraint.alternative) {
      return {
        action: 'replace',
        target,
        replacement: constraint.alternative,
      };
    }

    if (constraint.alternatives && constraint.alternatives.length > 0) {
      const alt = constraint.alternatives[0];
      return {
        action: 'replace',
        target,
        replacement: alt.export || alt.module,
        importStatement: alt.export
          ? `import { ${alt.export} } from '${alt.module}';`
          : undefined,
      };
    }

    return {
      action: 'remove',
      target,
    };
  }

  /**
   * Build a "did you mean" suggestion from alternatives or pattern registry.
   * If searchTerm is not provided, falls back to constraint.value.
   */
  protected buildDidYouMean(constraint: Constraint, context: ConstraintContext, searchTerm?: string): DidYouMean | undefined {
    if (constraint.alternative) {
      return {
        file: constraint.alternative,
        description: constraint.why || 'Use the approved alternative instead',
      };
    }

    if (constraint.alternatives && constraint.alternatives.length > 0) {
      const alt = constraint.alternatives[0];
      return {
        file: alt.module,
        export: alt.export,
        description: alt.description || 'Use the canonical implementation',
        exampleUsage: alt.example,
      };
    }

    if (context.patternRegistry) {
      const term = searchTerm ?? (typeof constraint.value === 'string' ? constraint.value : '');
      const matchingPattern = this.findMatchingPattern(context.patternRegistry, term);
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
   * Find a pattern in the registry that matches the search term by keyword.
   */
  protected findMatchingPattern(registry: PatternRegistry, searchTerm: string): Pattern | undefined {
    if (!registry.patterns) return undefined;

    const termLower = searchTerm.toLowerCase();

    for (const [, pattern] of Object.entries(registry.patterns)) {
      if (pattern.keywords?.some(k => termLower.includes(k.toLowerCase()) || k.toLowerCase().includes(termLower))) {
        return pattern;
      }
    }

    return undefined;
  }
}
