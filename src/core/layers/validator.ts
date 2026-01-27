/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Layer boundary validator - enforces import boundaries between architectural layers.
 */
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import type { LayerConfig } from '../config/schema.js';
import type { ImportGraph } from '../imports/types.js';
import type {
  LayerViolation,
  LayerValidationResult,
  ResolvedLayer,
} from './types.js';

/**
 * Validates layer boundary rules using glob patterns.
 *
 * Example config:
 * ```yaml
 * layers:
 *   - name: utils
 *     paths: ["src/utils/**"]
 *     can_import: []  # leaf layer
 *   - name: core
 *     paths: ["src/core/**"]
 *     can_import: [utils]
 *   - name: cli
 *     paths: ["src/cli/**"]
 *     can_import: [core, utils]
 * ```
 */
export class LayerBoundaryValidator {
  private layers: ResolvedLayer[];
  private projectRoot: string;

  constructor(projectRoot: string, layerConfigs: LayerConfig[]) {
    this.projectRoot = projectRoot;
    this.layers = this.resolveLayers(layerConfigs);
  }

  /**
   * Validate layer boundaries using an import graph.
   */
  validate(graph: ImportGraph): LayerValidationResult {
    const violations: LayerViolation[] = [];

    for (const [filePath, node] of graph.nodes) {
      const sourceLayer = this.findLayer(filePath);
      if (!sourceLayer) {
        // File is not in any defined layer, skip
        continue;
      }

      for (const importedPath of node.imports) {
        const targetLayer = this.findLayer(importedPath);
        if (!targetLayer) {
          // Imported file is not in any defined layer (external), skip
          continue;
        }

        // Same layer is always allowed
        if (sourceLayer.name === targetLayer.name) {
          continue;
        }

        // Check if import is allowed
        if (!sourceLayer.canImport.has(targetLayer.name)) {
          const allowedLayers = Array.from(sourceLayer.canImport);
          violations.push({
            sourceFile: path.relative(this.projectRoot, filePath),
            sourceLayer: sourceLayer.name,
            importedFile: path.relative(this.projectRoot, importedPath),
            importedLayer: targetLayer.name,
            allowedLayers,
            message: `Layer '${sourceLayer.name}' cannot import from '${targetLayer.name}' (allowed: ${allowedLayers.length > 0 ? allowedLayers.join(', ') : 'none'})`,
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * Get list of resolved layers.
   */
  getLayers(): ResolvedLayer[] {
    return [...this.layers];
  }

  /**
   * Resolve layer configurations to normalized form.
   */
  private resolveLayers(configs: LayerConfig[]): ResolvedLayer[] {
    return configs.map((config) => ({
      name: config.name,
      patterns: config.paths,
      canImport: new Set(config.can_import),
      excludePatterns: config.exclude || [],
    }));
  }

  /**
   * Find which layer a file belongs to.
   * Returns the first matching layer (order matters in config).
   */
  private findLayer(absolutePath: string): ResolvedLayer | null {
    const relativePath = path.relative(this.projectRoot, absolutePath);
    // Normalize to forward slashes for matching
    const normalizedPath = relativePath.replace(/\\/g, '/');

    for (const layer of this.layers) {
      // Check if file matches any include pattern
      let matched = false;
      for (const pattern of layer.patterns) {
        if (minimatch(normalizedPath, pattern)) {
          matched = true;
          break;
        }
      }

      if (!matched) {
        continue;
      }

      // Check if file matches any exclude pattern
      let excluded = false;
      for (const excludePattern of layer.excludePatterns) {
        if (minimatch(normalizedPath, excludePattern)) {
          excluded = true;
          break;
        }
      }

      if (!excluded) {
        return layer;
      }
    }

    return null;
  }
}
