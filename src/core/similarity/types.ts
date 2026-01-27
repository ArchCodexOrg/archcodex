/**
 * @arch archcodex.core.types
 *
 * Types for code similarity/duplication detection.
 */

/**
 * Signature of a file for similarity comparison.
 * Extracts structural information without implementation details.
 */
export interface FileSignature {
  /** Relative path to file */
  file: string;
  /** Architecture ID (if tagged) */
  archId: string | null;
  /** Exported symbol names */
  exports: string[];
  /** Method/function names */
  methods: string[];
  /** Class names */
  classes: string[];
  /** Import module names (without path) */
  importModules: string[];
  /** Total line count */
  lineCount: number;
}

/**
 * Result of similarity comparison between two files.
 */
export interface SimilarityMatch {
  /** Path to the similar file */
  file: string;
  /** Architecture ID of the similar file */
  archId: string | null;
  /** Similarity score (0-1) */
  similarity: number;
  /** Which aspects matched */
  matchedAspects: MatchedAspect[];
}

/**
 * Details about what matched between files.
 */
export interface MatchedAspect {
  /** What matched (exports, methods, classes, imports) */
  type: 'exports' | 'methods' | 'classes' | 'imports';
  /** Overlapping items */
  items: string[];
}

/**
 * Options for similarity analysis.
 */
export interface SimilarityOptions {
  /** Minimum similarity score to report (0-1), default 0.5 */
  threshold?: number;
  /** Maximum number of similar files to report, default 5 */
  maxResults?: number;
  /** Only compare files with same architecture */
  sameArchOnly?: boolean;
}

/**
 * Cross-file inconsistency between similar files.
 */
export interface ConsistencyIssue {
  /** The file being analyzed */
  file: string;
  /** The reference file being compared against */
  referenceFile: string;
  /** Architecture ID (shared between similar files) */
  archId: string | null;
  /** Similarity score */
  similarity: number;
  /** What's present in reference but missing in this file */
  missing: {
    methods: string[];
    exports: string[];
  };
  /** What's present in this file but missing in reference */
  extra: {
    methods: string[];
    exports: string[];
  };
}

/**
 * Options for consistency analysis.
 */
export interface ConsistencyOptions {
  /** Minimum similarity to consider files comparable (0-1), default 0.6 */
  threshold?: number;
  /** Only compare files with same architecture */
  sameArchOnly?: boolean;
  /** Minimum methods/exports diff to report, default 1 */
  minDiff?: number;
}
