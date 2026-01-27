/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Package boundary validator - enforces import boundaries between packages in monorepos.
 */
import * as path from 'node:path';
import type { PackageConfig } from '../config/schema.js';
import type { ImportGraph } from '../imports/types.js';
import type {
  PackageBoundaryViolation,
  PackageBoundaryResult,
  ResolvedPackage,
} from './types.js';

/**
 * Validates package boundary rules in a monorepo.
 *
 * Example config:
 * ```yaml
 * packages:
 *   - path: packages/core
 *     can_import: []  # no dependencies
 *   - path: packages/payments
 *     can_import: [packages/core]
 *   - path: packages/api
 *     can_import: [packages/core, packages/payments]
 * ```
 */
export class PackageBoundaryValidator {
  private packages: ResolvedPackage[];
  private projectRoot: string;

  constructor(projectRoot: string, packageConfigs: PackageConfig[]) {
    this.projectRoot = projectRoot;
    this.packages = this.resolvePackages(packageConfigs);
  }

  /**
   * Validate package boundaries using an import graph.
   */
  validate(graph: ImportGraph): PackageBoundaryResult {
    const violations: PackageBoundaryViolation[] = [];
    let filesChecked = 0;
    let importsAnalyzed = 0;

    for (const [filePath, node] of graph.nodes) {
      const sourcePackage = this.findPackage(filePath);
      if (!sourcePackage) {
        // File is not in a defined package, skip
        continue;
      }

      filesChecked++;

      for (const importedPath of node.imports) {
        importsAnalyzed++;

        const targetPackage = this.findPackage(importedPath);
        if (!targetPackage) {
          // Imported file is not in a defined package, skip
          continue;
        }

        // Same package is always allowed
        if (sourcePackage.name === targetPackage.name) {
          continue;
        }

        // Check if import is allowed
        if (!this.isImportAllowed(sourcePackage, targetPackage)) {
          violations.push({
            sourceFile: path.relative(this.projectRoot, filePath),
            sourcePackage: sourcePackage.name,
            importedFile: path.relative(this.projectRoot, importedPath),
            targetPackage: targetPackage.name,
            allowedImports: sourcePackage.canImport,
            message: `Package '${sourcePackage.name}' cannot import from '${targetPackage.name}' (allowed: ${sourcePackage.canImport.length > 0 ? sourcePackage.canImport.join(', ') : 'none'})`,
          });
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      summary: {
        filesChecked,
        importsAnalyzed,
        violationCount: violations.length,
      },
    };
  }

  /**
   * Get list of resolved packages.
   */
  getPackages(): ResolvedPackage[] {
    return [...this.packages];
  }

  /**
   * Resolve package configurations to normalized form.
   */
  private resolvePackages(configs: PackageConfig[]): ResolvedPackage[] {
    return configs.map((config) => {
      // Normalize path to always have trailing /
      let normalizedPath = config.path;
      if (!normalizedPath.endsWith('/')) {
        normalizedPath += '/';
      }
      // Remove leading ./ if present
      if (normalizedPath.startsWith('./')) {
        normalizedPath = normalizedPath.slice(2);
      }

      return {
        name: config.name ?? config.path,
        path: normalizedPath,
        canImport: config.can_import,
      };
    });
  }

  /**
   * Find which package a file belongs to.
   */
  private findPackage(absolutePath: string): ResolvedPackage | null {
    const relativePath = path.relative(this.projectRoot, absolutePath);
    // Normalize to forward slashes for matching
    const normalizedRelative = relativePath.replace(/\\/g, '/');

    // Find the most specific matching package (longest path prefix)
    let bestMatch: ResolvedPackage | null = null;
    let bestMatchLength = 0;

    for (const pkg of this.packages) {
      if (
        normalizedRelative.startsWith(pkg.path) &&
        pkg.path.length > bestMatchLength
      ) {
        bestMatch = pkg;
        bestMatchLength = pkg.path.length;
      }
    }

    return bestMatch;
  }

  /**
   * Check if import from source to target is allowed.
   */
  private isImportAllowed(
    source: ResolvedPackage,
    target: ResolvedPackage
  ): boolean {
    // Check if target package name or path is in allowed imports
    return (
      source.canImport.includes(target.name) ||
      source.canImport.includes(target.path.replace(/\/$/, ''))
    );
  }
}
