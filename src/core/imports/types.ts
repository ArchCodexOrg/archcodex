/**
 * @arch archcodex.core.types
 *
 * Types for import graph analysis and cross-file validation.
 */
import type { ArchIgnore } from '../../utils/archignore.js';

/**
 * A node in the import graph representing a file and its relationships.
 */
export interface ImportGraphNode {
  /** Absolute file path */
  filePath: string;
  /** Architecture ID from @arch tag (null if untagged) */
  archId: string | null;
  /** Absolute paths of files this file imports */
  imports: string[];
  /** Absolute paths of files that import this file (Set for O(1) lookup) */
  importedBy: Set<string>;
}

/**
 * The complete import graph for a project.
 */
export interface ImportGraph {
  /** Map of file path to graph node */
  nodes: Map<string, ImportGraphNode>;
}

/**
 * A cycle path in the import graph.
 */
export interface CyclePath {
  /** Ordered list of file paths forming the cycle (first = last) */
  files: string[];
  /** Architecture IDs corresponding to each file */
  archIds: (string | null)[];
}

/**
 * Common options for file pattern filtering.
 * Used by both import graph building and project validation.
 */
export interface FilePatternOptions {
  /** File patterns to include */
  include?: string[];
  /** File patterns to exclude */
  exclude?: string[];
  /** ArchIgnore instance for gitignore-style filtering (applied after glob) */
  archIgnore?: ArchIgnore;
}

/**
 * Options for building the import graph.
 */
export type ImportGraphOptions = FilePatternOptions;

/**
 * Result of import graph analysis.
 */
export interface ImportGraphResult {
  /** The built import graph */
  graph: ImportGraph;
  /** Detected circular dependency cycles */
  cycles: CyclePath[];
  /** Time spent building the graph in ms */
  buildTimeMs: number;
}

/**
 * Information about a file importing another file.
 */
export interface ImporterInfo {
  /** Path of the importing file */
  filePath: string;
  /** Architecture ID of the importing file */
  archId: string | null;
  /** Line number of the import statement */
  line?: number;
}
