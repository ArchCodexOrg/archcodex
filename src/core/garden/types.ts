/**
 * @arch archcodex.core.types
 *
 * Garden module type definitions for pattern detection and consistency checking.
 */

/**
 * Semantic category inferred from AST analysis and file patterns.
 * More granular than simple naming-based detection.
 */
export type SemanticCategory =
  | 'react-component'
  | 'react-hook'
  | 'service'
  | 'repository'
  | 'validator'
  | 'utility'
  | 'test'
  | 'types'
  | 'config'
  | 'unknown';

/**
 * Legacy semantic category (for backward compatibility with naming-based detection).
 * @deprecated Use SemanticCategory instead
 */
export type LegacySemanticCategory = 'hook' | 'component' | 'utility' | 'unknown';

/**
 * A file with its extracted metadata for clustering.
 */
export interface ClusteredFile {
  /** Absolute path to the file */
  path: string;
  /** Relative path from project root */
  relativePath: string;
  /** File name without path */
  fileName: string;
  /** Extracted @arch tag, if present */
  archId: string | null;
  /** Directory containing the file */
  directory: string;
  /** Inferred semantic category from AST analysis */
  semanticCategory?: SemanticCategory;
  /** Confidence of the semantic category detection */
  semanticConfidence?: 'high' | 'medium' | 'low';
  /** Signals that led to the semantic category */
  semanticSignals?: string[];
}

/**
 * A cluster of files sharing a naming pattern.
 */
export interface FileCluster {
  /** The detected pattern (e.g., "*Card.tsx", "*Service.ts") */
  pattern: string;
  /** Files in this cluster */
  files: ClusteredFile[];
  /** Count of each @arch tag in the cluster */
  archTagCounts: Record<string, number>;
  /** Whether all files use the same @arch tag */
  isConsistent: boolean;
  /** The most common @arch tag in the cluster */
  dominantArch: string | null;
}

/**
 * Report of a detected naming pattern.
 */
export interface PatternReport {
  /** The detected pattern */
  pattern: string;
  /** Files matching this pattern */
  files: string[];
  /** The @arch tag used (if consistent) */
  archId: string | null;
  /** Whether this pattern has keywords in the index */
  inIndex: boolean;
  /** Suggested keywords to add */
  suggestedKeywords: string[];
}

/**
 * Report of inconsistent @arch usage.
 */
export interface InconsistencyReport {
  /** Directory or pattern where inconsistency was found */
  location: string;
  /** Files and their @arch tags */
  files: Array<{ path: string; archId: string | null }>;
  /** The most common @arch tag */
  dominantArch: string | null;
  /** Files that don't match the dominant tag */
  outliers: string[];
}

/**
 * Suggested keywords for an architecture.
 */
export interface KeywordSuggestion {
  /** Architecture ID */
  archId: string;
  /** Current keywords in index */
  currentKeywords: string[];
  /** Suggested new keywords */
  suggestedKeywords: string[];
  /** Files this suggestion is based on */
  basedOnFiles: string[];
}

/**
 * Reason why a keyword should be cleaned up.
 */
export type KeywordCleanupReason =
  | 'stopword'        // Common word with no semantic value
  | 'too_common'      // Appears in too many architectures
  | 'too_short'       // Less than 4 characters
  | 'duplicate'       // Duplicate or near-duplicate of another keyword
  | 'non_descriptive'; // Generic file name fragment

/**
 * Suggested keyword cleanup for an architecture.
 */
export interface KeywordCleanupSuggestion {
  /** Architecture ID */
  archId: string;
  /** Keywords to remove */
  keywordsToRemove: Array<{
    keyword: string;
    reason: KeywordCleanupReason;
    /** How many other architectures have this keyword */
    usedByCount?: number;
  }>;
  /** Current keyword count */
  currentCount: number;
  /** Count after cleanup */
  afterCleanupCount: number;
}

/**
 * Type duplicate found during garden analysis.
 */
export interface TypeDuplicateReport {
  /** Canonical type name */
  name: string;
  /** Type of match */
  matchType: 'exact' | 'renamed' | 'similar';
  /** Similarity percentage (for similar types) */
  similarity?: number;
  /** Locations where this type is defined */
  locations: Array<{ file: string; line: number; name: string }>;
  /** Suggestion for resolution */
  suggestion: string;
}

/**
 * Complete garden analysis report.
 */
export interface GardenReport {
  /** Detected naming patterns */
  patterns: PatternReport[];
  /** Inconsistencies found */
  inconsistencies: InconsistencyReport[];
  /** Keyword suggestions */
  keywordSuggestions: KeywordSuggestion[];
  /** Keyword cleanup suggestions */
  keywordCleanups: KeywordCleanupSuggestion[];
  /** Type duplicate analysis */
  typeDuplicates: TypeDuplicateReport[];
  /** Summary statistics */
  summary: GardenSummary;
}

/**
 * Summary statistics for garden report.
 */
export interface GardenSummary {
  /** Total files scanned */
  filesScanned: number;
  /** Number of patterns detected */
  patternsDetected: number;
  /** Number of inconsistencies found */
  inconsistenciesFound: number;
  /** Number of keyword suggestions */
  keywordSuggestionCount: number;
  /** Number of keyword cleanup suggestions */
  keywordCleanupCount: number;
  /** Number of type duplicates found */
  typeDuplicateCount: number;
  /** Whether any issues require attention */
  hasIssues: boolean;
}

/**
 * Options for the garden command.
 */
export interface GardenOptions {
  /** Detect file naming patterns */
  detectPatterns: boolean;
  /** Check for @arch consistency */
  checkConsistency: boolean;
  /** Suggest keywords based on file usage */
  suggestKeywords: boolean;
  /** Analyze existing keywords and suggest cleanups */
  cleanupKeywords: boolean;
  /** Detect duplicate type definitions across files */
  detectTypeDuplicates: boolean;
  /** Apply suggestions automatically */
  fix: boolean;
  /** Minimum cluster size to report */
  minClusterSize: number;
  /** Use AST-based semantic analysis (more accurate but slower) */
  useSemanticAnalysis?: boolean;
  /** Maximum architectures a keyword can appear in before being "too common" */
  maxKeywordUsage?: number;
}
