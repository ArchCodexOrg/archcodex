/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that required modules are imported.
 * Uses SemanticModel for language-agnostic validation.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation, Suggestion, DidYouMean } from './types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that required modules are imported.
 * Error code: E004
 */
export class RequireImportValidator extends BaseConstraintValidator {
  readonly rule = 'require_import' as const;
  readonly errorCode = ErrorCodes.REQUIRE_IMPORT;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;
    const requiredImports = this.normalizeToArray(constraint.value);
    const matchMode = constraint.match ?? 'all'; // Default: all must be present

    // Collect all import information for matching
    const moduleSpecifiers = new Set<string>();
    const namedImports = new Set<string>();
    const defaultImports = new Set<string>();

    for (const imp of parsedFile.imports) {
      moduleSpecifiers.add(imp.moduleSpecifier);
      if (imp.namedImports) {
        imp.namedImports.forEach(name => namedImports.add(name));
      }
      if (imp.defaultImport) {
        defaultImports.add(imp.defaultImport);
      }
    }

    // Check which imports are present
    const checkImportPresent = (required: string): boolean => {
      const hasModuleImport = Array.from(moduleSpecifiers).some(
        mod => mod === required || mod.startsWith(`${required}/`)
      );
      const hasNamedImport = namedImports.has(required);
      const hasDefaultImport = defaultImports.has(required);
      return hasModuleImport || hasNamedImport || hasDefaultImport;
    };

    // For 'any' mode: pass if at least one is present
    if (matchMode === 'any') {
      const hasAny = requiredImports.some(checkImportPresent);
      if (!hasAny) {
        violations.push(
          this.createViolation(
            constraint,
            `None of the required imports are present: ${requiredImports.join(', ')}`,
            context,
            { line: null, column: null }
          )
        );
      }
      return { passed: violations.length === 0, violations };
    }

    // For 'all' mode (default): all must be present
    for (const required of requiredImports) {
      if (!checkImportPresent(required)) {
        // Build structured suggestions
        const suggestion = this.buildSuggestion(constraint, required, context);
        const didYouMean = this.buildDidYouMean(constraint, context, required);

        violations.push(
          this.createViolation(
            constraint,
            `Required import '${required}' is missing`,
            context,
            { line: null, column: null, suggestion, didYouMean }
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Build a structured suggestion for adding the required import.
   */
  private buildSuggestion(_constraint: Constraint, required: string, context: ConstraintContext): Suggestion {
    // Try to find the module path from pattern registry
    let modulePath = required;
    let exportName: string | undefined;

    if (context.patternRegistry) {
      const matchingPattern = this.findMatchingPattern(context.patternRegistry, required);
      if (matchingPattern) {
        modulePath = matchingPattern.canonical;
        exportName = matchingPattern.exports?.find(e => e.toLowerCase() === required.toLowerCase()) || matchingPattern.exports?.[0];
      }
    }

    // Build import statement
    const importStatement = exportName
      ? `import { ${exportName} } from '${modulePath}';`
      : `import ${required} from '${modulePath}';`;

    return {
      action: 'add',
      target: required,
      replacement: modulePath,
      insertAt: 'start',
      importStatement,
    };
  }

  /**
   * Build a "did you mean" suggestion from pattern registry.
   */
  private buildDidYouMean(_constraint: Constraint, context: ConstraintContext, required: string): DidYouMean | undefined {
    if (context.patternRegistry) {
      const matchingPattern = this.findMatchingPattern(context.patternRegistry, required);
      if (matchingPattern) {
        return {
          file: matchingPattern.canonical,
          export: matchingPattern.exports?.find(e => e.toLowerCase() === required.toLowerCase()) || matchingPattern.exports?.[0],
          description: matchingPattern.usage || `Import ${required} from the canonical location`,
          exampleUsage: matchingPattern.example,
        };
      }
    }

    return undefined;
  }

  /**
   * Find a pattern in the registry that matches the required import.
   */
  private findMatchingPattern(registry: import('../patterns/types.js').PatternRegistry, required: string): import('../patterns/types.js').Pattern | undefined {
    if (!registry.patterns) return undefined;

    const requiredLower = required.toLowerCase();

    for (const [, pattern] of Object.entries(registry.patterns)) {
      // Check if any export matches the required import
      if (pattern.exports?.some(e => e.toLowerCase() === requiredLower)) {
        return pattern;
      }
      // Check if any keyword matches
      if (pattern.keywords?.some(k => requiredLower.includes(k.toLowerCase()) || k.toLowerCase().includes(requiredLower))) {
        return pattern;
      }
    }

    return undefined;
  }

  protected getFixHint(constraint: Constraint, _actual?: string): string {
    const modules = this.normalizeToArray(constraint.value);
    const matchMode = constraint.match ?? 'all';
    if (matchMode === 'any') {
      return `Add import for one of: ${modules.join(' OR ')}`;
    }
    return `Add import for: ${modules.join(', ')}`;
  }
}
