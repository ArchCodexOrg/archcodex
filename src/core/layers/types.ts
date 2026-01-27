/**
 * @arch archcodex.core.types
 *
 * Types for layer boundary validation.
 */

/**
 * Resolved layer with normalized patterns and import rules.
 */
export interface ResolvedLayer {
  /** Layer name (e.g., 'core', 'cli', 'utils') */
  name: string;
  /** Glob patterns for files in this layer */
  patterns: string[];
  /** Set of layer names this layer can import from */
  canImport: Set<string>;
  /** Glob patterns to exclude from this layer */
  excludePatterns: string[];
}

/**
 * A violation of layer import boundaries.
 */
export interface LayerViolation {
  /** Path to the source file with the violation */
  sourceFile: string;
  /** Layer the source file belongs to */
  sourceLayer: string;
  /** Path to the imported file */
  importedFile: string;
  /** Layer the imported file belongs to */
  importedLayer: string;
  /** Layers the source is allowed to import from */
  allowedLayers: string[];
  /** Line number of the import (if available) */
  line?: number;
  /** Human-readable message */
  message: string;
}

/**
 * Result of layer boundary validation.
 */
export interface LayerValidationResult {
  /** Whether all layer boundaries are respected */
  passed: boolean;
  /** List of violations found */
  violations: LayerViolation[];
}
