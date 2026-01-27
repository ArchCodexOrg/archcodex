/**
 * @arch extension.client
 *
 * Type definitions for Import Graph Panel.
 */

/**
 * D3 graph node format.
 */
export interface D3Node {
  id: string;
  label: string;
  archId: string | null;
  layer: string | null;
  importCount: number;
  importedByCount: number;
  inCycle: boolean;
}

/**
 * D3 graph link format.
 */
export interface D3Link {
  source: string;
  target: string;
  inCycle: boolean;
}

/**
 * D3 graph data.
 */
export interface D3GraphData {
  nodes: D3Node[];
  links: D3Link[];
  layers: { name: string; color: string }[];
}

/**
 * Import graph node from analyzer.
 */
export interface ImportGraphNode {
  filePath: string;
  archId: string | null;
  imports: string[];
  importedBy: Set<string> | string[];
}

/**
 * Cycle path from analyzer.
 */
export interface CyclePath {
  files: string[];
  archIds: (string | null)[];
}

/**
 * Layer configuration from config.yaml.
 */
export interface LayerConfig {
  name: string;
  paths: string[];
  can_import?: string[];
  exclude?: string[];
}
