/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that forbidden modules are not imported.
 * Uses SemanticModel for language-agnostic validation.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import { BaseForbidValidator } from './forbid-base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that forbidden modules are not imported.
 * Error code: E003
 */
export class ForbidImportValidator extends BaseForbidValidator {
  readonly rule = 'forbid_import' as const;
  readonly errorCode = ErrorCodes.FORBID_IMPORT;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;
    const forbiddenModules = this.normalizeToArray(constraint.value);

    for (const importInfo of parsedFile.imports) {
      const match = this.findForbiddenMatch(importInfo.moduleSpecifier, forbiddenModules);

      if (match) {
        const importType = importInfo.isDynamic ? 'Dynamic import' : 'Import';

        // Build structured suggestion if alternative is available
        const suggestion = this.buildSuggestion(constraint, importInfo.moduleSpecifier);
        const didYouMean = this.buildDidYouMean(constraint, context, match);

        // Build a more informative message
        const archSource = context.constraintSource ? ` (from ${context.constraintSource})` : '';
        const baseMessage = `${importType} '${match}' is forbidden${archSource}`;

        violations.push(
          this.createViolation(
            constraint,
            baseMessage,
            context,
            {
              line: importInfo.location.line,
              column: importInfo.location.column,
              suggestion,
              didYouMean,
            }
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Provide a helpful fix hint for forbidden imports.
   */
  protected override getFixHint(constraint: Constraint, _actual?: string): string {
    // If constraint has alternatives, point to those
    if (constraint.alternatives && constraint.alternatives.length > 0) {
      return `Use an approved alternative: ${constraint.alternatives.map(a => a.module).join(', ')}`;
    }
    if (constraint.alternative) {
      return `Use the approved alternative: ${constraint.alternative}`;
    }
    // For layer-related imports, suggest DI pattern
    const forbidden = this.normalizeToArray(constraint.value);
    const layerPatterns = ['platform', 'infra', 'infrastructure', 'adapter', 'impl'];
    const isLayerViolation = forbidden.some(f =>
      layerPatterns.some(p => f.toLowerCase().includes(p))
    );
    if (isLayerViolation) {
      return 'Consider using dependency injection: accept the dependency via constructor parameter instead of importing directly';
    }
    return 'Remove the import or use an approved alternative';
  }

  /**
   * Find if a module specifier matches any forbidden pattern.
   */
  private findForbiddenMatch(moduleSpec: string, forbidden: string[]): string | null {
    for (const fb of forbidden) {
      if (moduleSpec === fb || moduleSpec.startsWith(`${fb}/`)) {
        return fb;
      }
    }
    return null;
  }

}
