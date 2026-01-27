/**
 * @arch archcodex.core.types
 */

/**
 * Node in the architecture graph.
 */
export interface GraphNode {
  /** Architecture ID */
  id: string;
  /** Display label */
  label: string;
  /** Node type */
  type: 'architecture' | 'mixin';
  /** Number of files using this architecture */
  fileCount?: number;
  /** Files using this architecture (when --show-files) */
  files?: string[];
}

/**
 * Edge in the architecture graph.
 */
export interface GraphEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Edge type */
  type: 'inherits' | 'mixin';
}

/**
 * Complete architecture graph.
 */
export interface ArchitectureGraph {
  /** All nodes in the graph */
  nodes: GraphNode[];
  /** All edges in the graph */
  edges: GraphEdge[];
}

/**
 * Graph output format.
 */
export type GraphFormat = 'mermaid' | 'graphviz' | 'json';

/**
 * Graph generation options.
 */
export interface GraphOptions {
  /** Output format */
  format?: GraphFormat;
  /** Show files that use each architecture */
  showFiles?: boolean;
  /** Show mixin relationships */
  showMixins?: boolean;
  /** Filter to specific architecture subtree */
  root?: string;
  /** Maximum depth to traverse */
  maxDepth?: number;
}
