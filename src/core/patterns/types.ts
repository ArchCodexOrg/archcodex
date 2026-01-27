/**
 * @arch archcodex.core.types
 *
 * Pattern registry types for canonical implementation discovery.
 */

/**
 * A canonical pattern definition.
 * Patterns define the "right way" to do something in the codebase.
 */
export interface Pattern {
  /** Path to the canonical implementation file */
  canonical: string;
  /** Exported symbols from this module */
  exports?: string[];
  /** Usage guidance */
  usage?: string;
  /** Keywords for discovery (used to match against code/imports) */
  keywords?: string[];
  /** Optional description */
  description?: string;
  /** Example usage code */
  example?: string;
}

/**
 * Pattern registry - a collection of canonical patterns.
 */
export interface PatternRegistry {
  /** Map of pattern name to pattern definition */
  patterns: Record<string, Pattern>;
}

/**
 * Result of pattern matching - when we find code that might duplicate a pattern.
 */
export interface PatternMatch {
  /** Name of the matched pattern */
  name: string;
  /** The pattern definition */
  pattern: Pattern;
  /** How confident we are in this match (0-1) */
  confidence: number;
  /** Which keywords matched */
  matchedKeywords: string[];
}
