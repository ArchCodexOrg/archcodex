/**
 * @arch archcodex.core.types
 *
 * Type definitions for the plan-context engine.
 */

/**
 * Scope for plan context - what area of the codebase the agent is working in.
 */
export interface PlanContextScope {
  /** Directory or glob patterns to scope to */
  paths: string[];
  /** Specific files the agent intends to touch */
  targetFiles?: string[];
}

/**
 * Compact constraint representation (token-efficient).
 */
export interface CompactConstraint {
  /** Rule type (forbid_import, forbid_pattern, require_import, etc.) */
  rule: string;
  /** Values as compact list */
  values: string[];
  /** Why this constraint exists */
  why?: string;
  /** Alternative module/function to use */
  alt?: string;
}

/**
 * Deduplicated constraint set - shared constraints extracted to avoid repetition.
 */
export interface SharedConstraints {
  /** Constraints shared by ALL architectures in scope */
  global: CompactConstraint[];
}

/**
 * Layer boundary information inline with context.
 */
export interface LayerContext {
  /** Current layer the scope is in */
  currentLayer: string;
  /** What this layer can import from */
  canImport: string[];
  /** Layers that can import from this layer */
  importedBy: string[];
  /** All layers with their import rules (compact map) */
  layerMap: Record<string, string[]>;
}

/**
 * Architecture entry in plan context (compact, deduplicated).
 */
export interface PlanArchitecture {
  /** Architecture ID */
  id: string;
  /** Short description */
  description?: string;
  /** File count in scope */
  fileCount: number;
  /** File paths (relative) */
  filePaths: string[];
  /** Constraints unique to this arch (not in shared set) */
  uniqueConstraints: CompactConstraint[];
  /** Key hints (deduplicated, max 2) */
  hints: string[];
  /** Applied mixins */
  mixins: string[];
  /** Reference implementation file */
  reference?: string;
  /** File pattern for new files */
  filePattern?: string;
  /** Default path for new files */
  defaultPath?: string;
}

/**
 * Relevant canonical patterns scoped to architectures in use.
 */
export interface ScopedPattern {
  /** Pattern name */
  name: string;
  /** Canonical file path */
  path: string;
  /** Key exports */
  exports: string[];
  /** When to use this */
  usage: string;
}

/**
 * Complete plan context result.
 */
export interface PlanContextResult {
  /** Scope that was analyzed */
  scope: PlanContextScope;
  /** Layer boundary context */
  layers: LayerContext;
  /** Shared/global constraints (deduplicated) */
  shared: SharedConstraints;
  /** Architectures in scope with unique constraints only */
  architectures: PlanArchitecture[];
  /** Relevant canonical patterns for this scope */
  patterns: ScopedPattern[];
  /** Untagged files in scope */
  untaggedFiles: string[];
  /** Quick stats */
  stats: {
    filesInScope: number;
    architecturesInScope: number;
    totalConstraints: number;
    deduplicatedConstraints: number;
  };
}
