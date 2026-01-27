/**
 * @arch archcodex.core.types
 *
 * Types for the coverage validation system.
 */

/**
 * Source type determines how to extract source values from files.
 */
export type CoverageSourceType =
  | 'export_names'     // Exported identifiers (export const Foo)
  | 'string_literals'  // String literals matching a pattern
  | 'file_names'       // File basenames
  | 'union_members'    // TypeScript union type string literals (requires TS AST)
  | 'object_keys';     // Object literal keys (requires TS AST)

/**
 * A discovered source that needs a handler.
 */
export interface CoverageSource {
  /** The source value (e.g., "bookmark.archived") */
  value: string;
  /** File where the source was found */
  file: string;
  /** Line number where found */
  line: number;
}

/**
 * Result of checking coverage for one source.
 */
export interface CoverageMatch {
  /** The source being checked */
  source: CoverageSource;
  /** Whether a handler was found */
  found: boolean;
  /** File where handler was found (if any) */
  handlerFile?: string;
  /** Line number of handler (if any) */
  handlerLine?: number;
}

/**
 * A coverage gap - source without handler.
 */
export interface CoverageGap {
  /** The source value */
  value: string;
  /** File containing the source */
  sourceFile: string;
  /** Line number of source */
  sourceLine: number;
  /** Where handlers were expected */
  expectedIn: string;
  /** Pattern that should have matched */
  targetPattern: string;
}

/**
 * Configuration for a require_coverage constraint.
 */
export interface CoverageConstraintConfig {
  /** How to extract sources */
  source_type: CoverageSourceType;
  /** Pattern to extract source values (regex with capture group, or type/object name for AST modes) */
  source_pattern: string;
  /** Optional second pattern to extract individual values from matched text */
  extract_values?: string;
  /** Glob pattern for source files */
  in_files: string;
  /** Pattern to check for handler (${value} is replaced with transformed value) */
  target_pattern: string;
  /** Glob pattern for handler files */
  in_target_files: string;
  /**
   * Transform applied to source value before checking.
   * Supports:
   * - ${value} - raw value (default)
   * - ${PascalCase} - bookmark.archived → BookmarkArchived
   * - ${camelCase} - bookmark.archived → bookmarkArchived
   * - ${snake_case} - bookmarkArchived → bookmark_archived
   * - ${UPPER_CASE} - bookmark.archived → BOOKMARK_ARCHIVED
   * - ${kebab-case} - bookmarkArchived → bookmark-archived
   * - Custom template: "handle${PascalCase}" → handleBookmarkArchived
   */
  transform?: string;
  /** Severity */
  severity: 'error' | 'warning';
  /** Explanation */
  why?: string;
  /** Source architecture */
  archId: string;
}

/**
 * Result of coverage validation.
 */
export interface CoverageValidationResult {
  /** All coverage gaps found */
  gaps: CoverageGap[];
  /** Total sources discovered */
  totalSources: number;
  /** Sources with handlers */
  coveredSources: number;
  /** Coverage percentage */
  coveragePercent: number;
}
