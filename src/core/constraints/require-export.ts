/**
 * @arch archcodex.core.domain.constraint
 *
 * Validates that required exports are present in the file.
 * Ensures files export certain symbols for API completeness.
 */
import type { Constraint } from '../registry/schema.js';
import type { ConstraintContext, ConstraintResult, Violation } from './types.js';
import type { ExportInfo } from '../../validators/semantic.types.js';
import { BaseConstraintValidator } from './base.js';
import { ErrorCodes } from '../../utils/errors.js';

/**
 * Validates that specific exports are present in the file.
 * Error code: E019
 *
 * Use cases:
 * - Context files must export Provider + hook
 * - Module index files must re-export key symbols
 * - Public API completeness checks
 *
 * Patterns in `value`:
 * - Exact match: "UserProvider" matches export UserProvider
 * - Wildcard suffix: "*Provider" matches AuthProvider, UserProvider
 * - Wildcard prefix: "use*" matches useAuth, useState
 *
 * Optional `pattern` field for regex matching.
 */
export class RequireExportValidator extends BaseConstraintValidator {
  readonly rule = 'require_export' as const;
  readonly errorCode = ErrorCodes.REQUIRE_EXPORT;

  validate(constraint: Constraint, context: ConstraintContext): ConstraintResult {
    const violations: Violation[] = [];
    const { parsedFile } = context;
    const requiredExports = this.normalizeToArray(constraint.value);

    // Get regex pattern if specified
    const regexPattern = 'pattern' in constraint && typeof constraint.pattern === 'string'
      ? constraint.pattern
      : null;

    for (const required of requiredExports) {
      const found = this.findMatchingExport(required, parsedFile.exports, regexPattern);

      if (!found) {
        violations.push(
          this.createViolation(
            constraint,
            `Required export '${required}' not found in file`,
            context
          )
        );
      }
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Check if any export in the file matches the required pattern.
   */
  private findMatchingExport(
    pattern: string,
    exports: ExportInfo[],
    regexPattern: string | null
  ): boolean {
    for (const exp of exports) {
      if (this.matchesPattern(exp.name, pattern, regexPattern)) {
        return true;
      }
      // Special case: 'default' pattern also matches exports with isDefault: true
      // This handles `export default function foo()` where name is 'foo' but isDefault is true
      if (pattern === 'default' && exp.isDefault) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if an export name matches a pattern.
   * Supports:
   * - Exact match: "UserProvider" matches UserProvider
   * - Wildcard suffix: "*Provider" matches AuthProvider
   * - Wildcard prefix: "use*" matches useAuth
   * - Regex: pattern field for advanced matching
   */
  private matchesPattern(
    exportName: string,
    pattern: string,
    regexPattern: string | null
  ): boolean {
    // Exact match
    if (exportName === pattern) {
      return true;
    }

    // Wildcard suffix: *Provider matches AuthProvider
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1);
      if (exportName.endsWith(suffix)) {
        return true;
      }
    }

    // Wildcard prefix: use* matches useAuth
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (exportName.startsWith(prefix)) {
        return true;
      }
    }

    // Regex pattern (from constraint.pattern field)
    if (regexPattern) {
      try {
        const regex = new RegExp(regexPattern);
        if (regex.test(exportName)) {
          return true;
        }
      } catch { /* invalid regex pattern, skip */
        // Invalid regex, skip
      }
    }

    return false;
  }

  protected getFixHint(constraint: Constraint): string {
    const exports = this.normalizeToArray(constraint.value);
    return `Add the required export(s): ${exports.join(', ')}`;
  }
}
