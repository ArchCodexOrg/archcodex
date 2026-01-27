/**
 * @arch archcodex.core.engine
 *
 * NeighborhoodAnalyzer - analyzes import boundaries for a specific file.
 * Shows what a file can/cannot import, what imports it, and provides
 * actionable guidance for AI agents.
 */
import * as path from 'node:path';
import { ProjectAnalyzer } from '../imports/analyzer.js';
import { resolveArchitecture } from '../registry/resolver.js';
import { readFile } from '../../utils/file-system.js';
import { extractArchId } from '../arch-tag/parser.js';
import { findMatchingPatterns } from '../patterns/loader.js';
import type { Registry } from '../registry/schema.js';
import type { ResolvedConstraint } from '../registry/types.js';
import type { Config, LayerConfig } from '../config/schema.js';
import type { PatternRegistry } from '../patterns/types.js';
import type {
  Neighborhood,
  NeighborhoodOptions,
  ImportStatus,
  ImportedByInfo,
  LayerInfo,
  ForbiddenImportConstraint,
  MissingRequiredImport,
  PatternSuggestion,
  ConstraintsSummary,
} from './types.js';

const DEFAULT_OPTIONS: Required<NeighborhoodOptions> = {
  depth: 1,
  includeExternal: false,
  format: 'yaml',
  withPatterns: false,
  violationsOnly: false,
};

/**
 * Analyzes the import neighborhood of a file.
 */
export class NeighborhoodAnalyzer {
  private projectRoot: string;
  private registry: Registry;
  private config?: Config;
  private patternRegistry?: PatternRegistry;
  private projectAnalyzer: ProjectAnalyzer;

  constructor(
    projectRoot: string,
    registry: Registry,
    config?: Config,
    patternRegistry?: PatternRegistry
  ) {
    this.projectRoot = projectRoot;
    this.registry = registry;
    this.config = config;
    this.patternRegistry = patternRegistry;
    this.projectAnalyzer = new ProjectAnalyzer(projectRoot);
  }

  /**
   * Analyze the neighborhood of a file.
   */
  async analyze(
    filePath: string,
    options: NeighborhoodOptions = {}
  ): Promise<Neighborhood> {
    const opts: Required<NeighborhoodOptions> = { ...DEFAULT_OPTIONS, ...options };

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(this.projectRoot, filePath);

    // Get relative path for display
    const relativePath = path.relative(this.projectRoot, absolutePath);

    // Build import graph
    const { graph } = await this.projectAnalyzer.buildImportGraph();

    // Get the node for this file
    const node = graph.nodes.get(absolutePath);

    // Get architecture ID and file content
    const content = await readFile(absolutePath);
    const archId = extractArchId(content);

    // Get layer info from config
    const layerInfo = this.getLayerInfo(relativePath);

    // Resolve constraints if architecture exists
    let constraints: ConstraintsSummary = {
      forbidImport: [],
      requireImport: [],
    };
    let allowedImports: string[] = [];

    if (archId) {
      try {
        const resolved = resolveArchitecture(this.registry, archId);
        constraints = this.extractConstraintsSummary(resolved.architecture.constraints);
        allowedImports = this.extractAllowedImports(resolved.architecture.constraints);
      } catch {
        // Architecture not found in registry, skip constraint resolution
      }
    }

    // Get importers
    const importedBy: ImportedByInfo[] = [];
    if (node) {
      for (const importerPath of node.importedBy) {
        const importerNode = graph.nodes.get(importerPath);
        importedBy.push({
          file: path.relative(this.projectRoot, importerPath),
          architecture: importerNode?.archId ?? null,
        });
      }
    }

    // Get current imports with status
    const currentImports: ImportStatus[] = [];
    if (node) {
      for (const importPath of node.imports) {
        const relativeImport = path.relative(this.projectRoot, importPath);
        const status = this.checkImportStatus(
          relativeImport,
          allowedImports,
          constraints.forbidImport,
          layerInfo
        );
        currentImports.push(status);
      }
    }

    // Filter external imports if not requested
    const filteredImports = opts.includeExternal
      ? currentImports
      : currentImports.filter(i => !i.path.includes('node_modules'));

    // Check for missing required imports
    const missingRequired = this.checkMissingRequired(
      constraints.requireImport,
      filteredImports,
      content
    );

    // Same layer patterns
    const sameLayerPatterns = this.getSameLayerPatterns(layerInfo.name);

    // Get pattern suggestions if requested
    let suggestedPatterns: PatternSuggestion[] | undefined;
    if (opts.withPatterns && this.patternRegistry) {
      suggestedPatterns = this.getSuggestedPatterns(content, constraints);
    }

    // Build the neighborhood result
    const neighborhood: Neighborhood = {
      file: relativePath,
      architecture: archId,
      layer: layerInfo,
      importedBy,
      importableBy: constraints.importableBy,
      currentImports: filteredImports,
      missingRequired,
      allowedImports,
      forbiddenImports: constraints.forbidImport,
      constraints,
      sameLayerPatterns,
      suggestedPatterns,
    };

    // Generate AI summary
    neighborhood.aiSummary = this.generateAiSummary(neighborhood);

    return neighborhood;
  }

  /**
   * Get layer information from config.
   */
  private getLayerInfo(filePath: string): LayerInfo {
    if (!this.config?.layers) {
      // No layers configured, infer from path
      const parts = filePath.split(path.sep);
      const inferredLayer = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0] || 'root';
      return {
        name: inferredLayer,
        canImport: [],
        cannotImport: [],
      };
    }

    // Find matching layer from config
    const allLayers = this.config.layers.map(l => l.name);
    let matchedLayer: LayerConfig | undefined;

    for (const layer of this.config.layers) {
      for (const pattern of layer.paths) {
        if (this.matchesGlobPattern(filePath, pattern)) {
          matchedLayer = layer;
          break;
        }
      }
      if (matchedLayer) break;
    }

    if (!matchedLayer) {
      // No layer matched, infer from path
      const parts = filePath.split(path.sep);
      return {
        name: parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0] || 'unknown',
        canImport: [],
        cannotImport: [],
      };
    }

    // Calculate cannotImport (all layers not in canImport, excluding self)
    const canImport = matchedLayer.can_import || [];
    const cannotImport = allLayers.filter(
      l => l !== matchedLayer!.name && !canImport.includes(l)
    );

    return {
      name: matchedLayer.name,
      canImport,
      cannotImport,
    };
  }

  /**
   * Extract full constraints summary from resolved constraints.
   */
  private extractConstraintsSummary(constraints: ResolvedConstraint[]): ConstraintsSummary {
    const forbidImport: ForbiddenImportConstraint[] = [];
    const requireImport: Array<{ value: string[]; match?: 'all' | 'any'; why?: string }> = [];
    let importableBy: { patterns: string[]; why?: string } | undefined;

    for (const constraint of constraints) {
      if (constraint.rule === 'forbid_import') {
        const value = Array.isArray(constraint.value)
          ? constraint.value as string[]
          : [constraint.value as string];

        forbidImport.push({
          value,
          why: constraint.why,
          alternative: constraint.alternative,
          alternatives: constraint.alternatives?.map(a => ({
            module: a.module,
            export: a.export,
            description: a.description,
          })),
        });
      }

      if (constraint.rule === 'require_import') {
        const value = Array.isArray(constraint.value)
          ? constraint.value as string[]
          : [constraint.value as string];

        requireImport.push({
          value,
          match: constraint.match,
          why: constraint.why,
        });
      }

      if (constraint.rule === 'importable_by') {
        const patterns = Array.isArray(constraint.value)
          ? constraint.value as string[]
          : [constraint.value as string];

        importableBy = {
          patterns,
          why: constraint.why,
        };
      }
    }

    return { forbidImport, requireImport, importableBy };
  }

  /**
   * Extract allowed import patterns from constraints.
   */
  private extractAllowedImports(constraints: ResolvedConstraint[]): string[] {
    const allowed: string[] = [];

    for (const constraint of constraints) {
      if (constraint.rule === 'allow_import') {
        const value = constraint.value;
        if (Array.isArray(value)) {
          allowed.push(...(value as string[]));
        } else if (typeof value === 'string') {
          allowed.push(value);
        }
      }
    }

    return [...new Set(allowed)];
  }

  /**
   * Check if an import is allowed or forbidden.
   */
  private checkImportStatus(
    importPath: string,
    allowed: string[],
    forbidden: ForbiddenImportConstraint[],
    layerInfo: LayerInfo
  ): ImportStatus {
    // Check layer boundaries first
    const importLayer = this.inferLayerFromPath(importPath);
    if (importLayer && layerInfo.cannotImport.includes(importLayer)) {
      return {
        path: importPath,
        allowed: false,
        layer: importLayer,
        layerViolation: `Layer '${layerInfo.name}' cannot import from '${importLayer}'`,
        forbiddenBy: 'layer_boundary',
      };
    }

    // Check forbidden imports
    for (const forbidConstraint of forbidden) {
      for (const pattern of forbidConstraint.value) {
        if (this.matchesPattern(importPath, pattern)) {
          return {
            path: importPath,
            allowed: false,
            forbiddenBy: `forbid_import: ${pattern}`,
            why: forbidConstraint.why,
            layer: importLayer,
          };
        }
      }
    }

    // Check if explicitly allowed
    for (const pattern of allowed) {
      if (this.matchesPattern(importPath, pattern)) {
        return { path: importPath, allowed: true, layer: importLayer };
      }
    }

    // Check if same layer (implicitly allowed)
    if (importLayer === layerInfo.name || importPath.startsWith(layerInfo.name)) {
      return { path: importPath, allowed: true, layer: importLayer };
    }

    // Check if in allowed layers
    if (importLayer && layerInfo.canImport.includes(importLayer)) {
      return { path: importPath, allowed: true, layer: importLayer };
    }

    // Default: allowed (no constraint)
    return { path: importPath, allowed: true, layer: importLayer };
  }

  /**
   * Infer layer name from a file path.
   */
  private inferLayerFromPath(filePath: string): string | undefined {
    if (!this.config?.layers) return undefined;

    for (const layer of this.config.layers) {
      for (const pattern of layer.paths) {
        if (this.matchesGlobPattern(filePath, pattern)) {
          return layer.name;
        }
      }
    }

    return undefined;
  }

  /**
   * Check for missing required imports.
   */
  private checkMissingRequired(
    requireConstraints: Array<{ value: string[]; match?: 'all' | 'any'; why?: string }>,
    currentImports: ImportStatus[],
    fileContent: string
  ): MissingRequiredImport[] {
    const missing: MissingRequiredImport[] = [];
    const importedModules = new Set(currentImports.map(i => i.path));

    // Also check named imports in file content
    const importStatements = fileContent.match(/import\s+{[^}]+}\s+from\s+['"][^'"]+['"]/g) || [];
    const namedImports = new Set<string>();
    for (const stmt of importStatements) {
      const match = stmt.match(/import\s+{([^}]+)}/);
      if (match) {
        match[1].split(',').forEach(name => {
          namedImports.add(name.trim().split(/\s+as\s+/)[0]);
        });
      }
    }

    for (const req of requireConstraints) {
      const matchMode = req.match ?? 'all';

      if (matchMode === 'any') {
        // At least one must be present
        const hasAny = req.value.some(v =>
          this.isImportPresent(v, importedModules, namedImports)
        );
        if (!hasAny) {
          missing.push({
            import: req.value.join(' OR '),
            why: req.why,
            match: 'any',
            suggestion: {
              statement: `import { ${req.value[0]} } from '...';`,
              insertAt: 'top',
            },
          });
        }
      } else {
        // All must be present
        for (const required of req.value) {
          if (!this.isImportPresent(required, importedModules, namedImports)) {
            missing.push({
              import: required,
              why: req.why,
              match: 'all',
              suggestion: {
                statement: `import { ${required} } from '...';`,
                insertAt: 'top',
              },
            });
          }
        }
      }
    }

    return missing;
  }

  /**
   * Check if an import is present.
   */
  private isImportPresent(
    required: string,
    importedModules: Set<string>,
    namedImports: Set<string>
  ): boolean {
    // Check if it's a named import
    if (namedImports.has(required)) return true;

    // Check if it's a module import
    for (const mod of importedModules) {
      if (mod === required || mod.includes(required) || mod.endsWith(`/${required}`)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get suggested patterns from pattern registry.
   */
  private getSuggestedPatterns(
    fileContent: string,
    constraints: ConstraintsSummary
  ): PatternSuggestion[] {
    if (!this.patternRegistry) return [];

    const suggestions: PatternSuggestion[] = [];

    // Find patterns matching file content
    const matches = findMatchingPatterns(this.patternRegistry, fileContent, { minConfidence: 0.3 });

    for (const match of matches.slice(0, 5)) {
      // Determine relevance based on:
      // 1. If it's mentioned in a constraint alternative
      // 2. Match confidence
      let relevance: 'high' | 'medium' | 'low' = 'low';

      // Check if this pattern is an alternative for a forbidden import
      for (const forbid of constraints.forbidImport) {
        if (forbid.alternative?.includes(match.pattern.canonical)) {
          relevance = 'high';
          break;
        }
        if (forbid.alternatives?.some(a => a.module.includes(match.pattern.canonical))) {
          relevance = 'high';
          break;
        }
      }

      if (relevance === 'low' && match.matchedKeywords.length >= 2) {
        relevance = 'medium';
      }

      suggestions.push({
        name: match.name,
        relevance,
        canonical: match.pattern.canonical,
        exports: match.pattern.exports,
        usage: match.pattern.usage,
        example: match.pattern.example,
      });
    }

    // Sort by relevance
    const order = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => order[a.relevance] - order[b.relevance]);

    return suggestions;
  }

  /**
   * Generate AI-friendly summary.
   */
  private generateAiSummary(neighborhood: Neighborhood): string {
    const lines: string[] = [];

    // Layer info
    lines.push(`This file is in the ${neighborhood.layer.name.toUpperCase()} layer.`);
    lines.push('');

    if (neighborhood.layer.canImport.length > 0) {
      lines.push(`CAN import from: ${neighborhood.layer.canImport.join(', ')}`);
    }
    if (neighborhood.layer.cannotImport.length > 0) {
      lines.push(`CANNOT import from: ${neighborhood.layer.cannotImport.join(', ')}`);
    }
    lines.push('');

    // Forbidden imports
    if (neighborhood.forbiddenImports.length > 0) {
      const allForbidden = neighborhood.forbiddenImports.flatMap(f => f.value);
      lines.push(`FORBIDDEN: ${allForbidden.join(', ')}`);

      // Add alternatives if available
      for (const forbid of neighborhood.forbiddenImports) {
        if (forbid.alternative) {
          lines.push(`  → Use instead: ${forbid.alternative}`);
        }
        if (forbid.why) {
          lines.push(`  → Why: ${forbid.why}`);
        }
      }
    }

    // Required imports
    if (neighborhood.missingRequired.length > 0) {
      lines.push('');
      lines.push('MISSING REQUIRED:');
      for (const req of neighborhood.missingRequired) {
        lines.push(`  - ${req.import}`);
        if (req.suggestion) {
          lines.push(`    ${req.suggestion.statement}`);
        }
      }
    }

    // Violations in current imports
    const violations = neighborhood.currentImports.filter(i => !i.allowed);
    if (violations.length > 0) {
      lines.push('');
      lines.push('CURRENT VIOLATIONS:');
      for (const v of violations) {
        lines.push(`  - ${v.path}: ${v.layerViolation || v.forbiddenBy}`);
      }
    }

    // Dependents count
    lines.push('');
    lines.push(`Imported by: ${neighborhood.importedBy.length} files`);

    return lines.join('\n');
  }

  /**
   * Check if a path matches a pattern (supports * wildcard).
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Handle simple module names (e.g., "axios", "fs")
    if (!pattern.includes('/') && !pattern.includes('*')) {
      return filePath.includes(pattern) ||
             filePath.includes(`/${pattern}/`) ||
             filePath.endsWith(`/${pattern}`);
    }

    // Handle glob patterns
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
      return new RegExp(`^${regexPattern}`).test(filePath);
    }

    // Exact match or prefix match
    return filePath === pattern || filePath.startsWith(pattern + '/');
  }

  /**
   * Check if a path matches a glob pattern.
   */
  private matchesGlobPattern(filePath: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(filePath);
  }

  /**
   * Get patterns for same-layer imports.
   */
  private getSameLayerPatterns(layer: string): string[] {
    return [`${layer}/*`];
  }

  /**
   * Dispose resources.
   */
  dispose(): void {
    this.projectAnalyzer.dispose();
  }
}
