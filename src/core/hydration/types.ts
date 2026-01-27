/**
 * @arch archcodex.core.types
 *
 * Hydration type definitions.
 */

/**
 * Hydration output formats.
 * - verbose: Full details including inheritance, mixins, sources
 * - terse: Minimal format, just the essential constraints
 * - ai: Flattened, action-focused format optimized for AI agents
 */
export type HydrationFormat = 'verbose' | 'terse' | 'ai';

/**
 * Layer boundary info for AI format.
 */
export interface LayerBoundaryInfo {
  /** Layer name this file belongs to */
  layer: string;
  /** Layers this file can import from */
  canImport: string[];
  /** Layers this file cannot import from (derived from config) */
  cannotImport?: string[];
  /** Number of files that import this file (optional, expensive) */
  importedByCount?: number;
}

/**
 * Pattern suggestion from pattern registry.
 */
export interface PatternSuggestion {
  /** Canonical file path */
  file: string;
  /** Export name to use */
  export: string;
  /** Usage description */
  description?: string;
}

/**
 * Options for hydration.
 */
export interface HydrationOptions {
  /** Output format */
  format: HydrationFormat;
  /** Maximum tokens for the hydrated header */
  tokenLimit: number;
  /** Whether to include pointer content */
  includePointers: boolean;
  /** Whether to include the original file content */
  includeContent: boolean;
  /** Layer boundary info for AI format (optional) */
  boundaries?: LayerBoundaryInfo;
  /** Pattern registry for "Use: X" suggestions in AI format */
  patternRegistry?: import('../patterns/types.js').PatternRegistry;
}

/**
 * Result of hydration.
 */
export interface HydrationResult {
  /** The hydrated header */
  header: string;
  /** The original file content (if includeContent is true) */
  content?: string;
  /** The full output (header + content) */
  output: string;
  /** Estimated token count */
  tokenCount: number;
  /** Whether truncation occurred */
  truncated: boolean;
  /** Details about what was truncated */
  truncationDetails?: TruncationDetails;
}

/**
 * Details about what was truncated during hydration.
 */
export interface TruncationDetails {
  /** Whether hints were truncated */
  hintsTruncated: boolean;
  /** Whether pointers were truncated */
  pointersTruncated: boolean;
  /** Whether constraints were truncated (should never happen) */
  constraintsTruncated: boolean;
  /** Original estimated tokens */
  originalTokens: number;
  /** Final token count */
  finalTokens: number;
}

/**
 * Priority levels for content during truncation.
 */
export enum ContentPriority {
  /** Security-critical - never truncated */
  CRITICAL = 1,
  /** High priority - truncated last */
  HIGH = 2,
  /** Medium priority - truncated as needed */
  MEDIUM = 3,
  /** Low priority - truncated first */
  LOW = 4,
}
