/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that at least ONE of the specified patterns exists in file content.
 * Supports regex patterns, annotation opt-outs, and intent checks.
 * Supports function-level intents for @intent: patterns.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation, Suggestion } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';
import { getAllFunctionsWithIntents } from './intent-resolver.js';

/**
 * Validates that at least one of multiple patterns exists in the file.
 * Error code: E022
 *
 * Use cases:
 * - Soft delete checks: require either `isDeleted` check OR `@no-soft-delete` opt-out
 * - Auth patterns: require either `verifyAuth` OR `@public-endpoint`
 * - Error handling: require either try/catch OR `@no-error-handling`
 *
 * Example constraint:
 * ```yaml
 * - rule: require_one_of
 *   value: ["isDeleted", "deletedAt", "@no-soft-delete"]
 *   severity: error
 *   why: "Soft-delete check required for data integrity"
 * ```
 */
export class RequireOneOfValidator extends BaseConstraintValidator {
  readonly rule = 'require_one_of' as const;
  readonly errorCode = ErrorCodes.REQUIRE_ONE_OF;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;

    // Get patterns from constraint.value (must be an array)
    const patterns = this.normalizeToArray(constraint.value);
    if (patterns.length === 0) {
      violations.push(
        this.createViolation(
          constraint,
          `require_one_of constraint requires an array of patterns`,
          context
        )
      );
      return { passed: false, violations };
    }

    // Get function-level intents for @intent: pattern matching
    const functionsWithIntents = getAllFunctionsWithIntents(parsedFile);

    // Check if ANY of the patterns match
    const matchResults = patterns.map(pattern => ({
      pattern,
      matched: this.patternMatches(pattern, parsedFile.content, context, functionsWithIntents),
    }));

    const hasMatch = matchResults.some(r => r.matched);

    if (!hasMatch) {
      // Build helpful message showing what was checked
      const patternList = patterns.map(p => `'${p}'`).join(', ');
      const suggestion = this.buildSuggestion(patterns);

      violations.push({
        code: this.errorCode,
        rule: this.rule,
        value: constraint.value,
        severity: constraint.severity,
        line: null,
        column: null,
        message: `None of the required patterns found. Expected one of: ${patternList}`,
        why: constraint.why,
        fixHint: this.getFixHint(constraint),
        source: context.constraintSource,
        suggestion,
      });
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Check if a pattern matches the file content.
   * Supports:
   * - Intent patterns: @intent:name (checks file and function-level intents)
   * - Annotation patterns: @something (matches in comments)
   * - Literal strings: searches for exact text
   * - Regex patterns: /pattern/ syntax
   */
  private patternMatches(
    pattern: string,
    content: string,
    context: ConstraintContext,
    functionsWithIntents: Array<{ name: string; intents?: string[] }>
  ): boolean {
    // Intent pattern (e.g., @intent:cli-output)
    // Checks both file-level and function-level intents
    if (pattern.startsWith('@intent:')) {
      const intentName = pattern.slice(8).toLowerCase();

      // Check file-level intents
      if (context.intents?.some(i => i.name.toLowerCase() === intentName)) {
        return true;
      }

      // Check function-level intents (any function in the file)
      for (const func of functionsWithIntents) {
        if (func.intents?.some(i => i.toLowerCase() === intentName)) {
          return true;
        }
      }

      return false;
    }

    // Annotation pattern (e.g., @no-soft-delete)
    if (pattern.startsWith('@')) {
      // Match in JSDoc comments or single-line comments
      const annotationRegex = new RegExp(
        `(\\/\\*[\\s\\S]*?${this.escapeRegex(pattern)}[\\s\\S]*?\\*\\/)|(\\/\\/.*${this.escapeRegex(pattern)})`,
        'i'
      );
      return annotationRegex.test(content);
    }

    // Regex pattern (e.g., /isDeleted\s*[=!]==?\s*false/)
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      try {
        const regex = new RegExp(pattern.slice(1, -1), 'ms');
        return regex.test(content);
      } catch { /* invalid regex pattern */
        return false;
      }
    }

    // Literal string match (case-insensitive for identifiers)
    return content.includes(pattern);
  }

  /**
   * Escape special regex characters.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Build a structured suggestion.
   */
  private buildSuggestion(patterns: string[]): Suggestion {
    // Prefer annotation opt-out if available
    const annotationPattern = patterns.find(p => p.startsWith('@'));
    if (annotationPattern) {
      return {
        action: 'add',
        target: 'file header',
        replacement: `/** ${annotationPattern} */`,
        insertAt: 'start',
      };
    }

    // Otherwise suggest adding the first pattern
    return {
      action: 'add',
      target: 'code',
      replacement: patterns[0],
    };
  }

  protected getFixHint(constraint: Constraint): string {
    const patterns = this.normalizeToArray(constraint.value);
    const annotationPattern = patterns.find(p => p.startsWith('@'));

    if (annotationPattern) {
      return `Add one of the required patterns, or use '${annotationPattern}' to opt-out`;
    }

    return `Add one of: ${patterns.join(', ')}`;
  }
}
