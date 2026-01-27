/**
 * @arch archcodex.core.engine
 * @intent:ast-analysis
 *
 * ProjectAnalyzer - builds import graphs and detects circular dependencies.
 * Uses ts-morph for module resolution with actual tsconfig.json.
 */
import { Project } from 'ts-morph';
import * as path from 'node:path';
import * as fs from 'node:fs';
import os from 'node:os';
import { globFiles, readFile, fileExists } from '../../utils/file-system.js';
import { extractArchId } from '../arch-tag/parser.js';
import type {
  ImportGraph,
  ImportGraphResult,
  CyclePath,
  ImporterInfo,
  FilePatternOptions,
} from './types.js';

const DEFAULT_OPTIONS = {
  include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
};

/** Default concurrency for parallel file operations */
const DEFAULT_CONCURRENCY = Math.min(Math.max(Math.floor(os.cpus().length * 0.75), 4), 32);

/**
 * Analyzes import relationships across a TypeScript/JavaScript project.
 */
export class ProjectAnalyzer {
  private projectRoot: string;
  private project: Project | null = null;
  private archIdCache = new Map<string, string | null>();
  private cachedGraph: ImportGraph | null = null;
  /** Module resolution cache: "fromFile:specifier" -> resolved path or null */
  private moduleResolutionCache = new Map<string, string | null>();
  /** File existence cache for fast lookups */
  private fileExistsCache = new Map<string, boolean>();
  /** Shared file content cache - can be accessed by other components */
  private contentCache = new Map<string, string>();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Get cached file content or read from disk.
   * This cache is shared to avoid reading files multiple times.
   */
  async getFileContent(filePath: string): Promise<string> {
    if (this.contentCache.has(filePath)) {
      return this.contentCache.get(filePath)!;
    }
    const content = await readFile(filePath);
    this.contentCache.set(filePath, content);
    return content;
  }

  /**
   * Get content cache for sharing with other components.
   */
  getContentCache(): Map<string, string> {
    return this.contentCache;
  }

  /**
   * Build the import graph for the project.
   * Uses parallel processing for improved performance on large codebases.
   */
  async buildImportGraph(options: FilePatternOptions = {}): Promise<ImportGraphResult> {
    const startTime = performance.now();
    // Only override defaults for defined options
    const opts = {
      include: options.include ?? DEFAULT_OPTIONS.include,
      exclude: options.exclude ?? DEFAULT_OPTIONS.exclude,
      archIgnore: options.archIgnore,
    };

    // Initialize ts-morph project with tsconfig for module resolution
    this.initProject();

    // Find all source files
    let files = await globFiles(opts.include, {
      cwd: this.projectRoot,
      ignore: opts.exclude,
      absolute: true,
    });

    // Apply archIgnore filter if provided (gitignore-style patterns)
    if (opts.archIgnore) {
      const relativePaths = files.map(f => path.relative(this.projectRoot, f));
      const filtered = opts.archIgnore.filter(relativePaths);
      files = filtered.map(f => path.resolve(this.projectRoot, f));
    }

    // Build the graph
    const graph: ImportGraph = { nodes: new Map() };

    // First pass: create nodes and extract arch IDs (parallelized)
    await this.processInBatches(files, DEFAULT_CONCURRENCY, async (filePath) => {
      const archId = await this.getArchId(filePath);
      graph.nodes.set(filePath, {
        filePath,
        archId,
        imports: [],
        importedBy: new Set(),
      });
    });

    // Second pass: resolve imports (parallelized)
    // Collect results first, then update graph edges (to avoid race conditions)
    const importResults = new Map<string, string[]>();
    await this.processInBatches(files, DEFAULT_CONCURRENCY, async (filePath) => {
      const resolvedImports = await this.resolveFileImports(filePath, graph);
      importResults.set(filePath, resolvedImports);
    });

    // Update graph edges (sequential to avoid race conditions on Sets)
    for (const [filePath, resolvedImports] of importResults) {
      const node = graph.nodes.get(filePath)!;
      node.imports = resolvedImports;

      // Update importedBy for each resolved import (O(1) with Set)
      for (const importedPath of resolvedImports) {
        const importedNode = graph.nodes.get(importedPath);
        if (importedNode) {
          importedNode.importedBy.add(filePath);
        }
      }
    }

    // Detect cycles
    const cycles = this.detectCycles(graph);

    this.cachedGraph = graph;
    const buildTimeMs = performance.now() - startTime;

    return { graph, cycles, buildTimeMs };
  }

  /**
   * Process items in batches with concurrency limit.
   */
  private async processInBatches<T>(
    items: T[],
    concurrency: number,
    processor: (item: T) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      await Promise.all(batch.map(processor));
    }
  }

  /**
   * Get files that import a specific file.
   */
  getImporters(filePath: string): ImporterInfo[] {
    if (!this.cachedGraph) return [];

    const node = this.cachedGraph.nodes.get(filePath);
    if (!node) return [];

    return Array.from(node.importedBy).map(importerPath => {
      const importerNode = this.cachedGraph!.nodes.get(importerPath);
      return {
        filePath: importerPath,
        archId: importerNode?.archId ?? null,
      };
    });
  }

  /**
   * Get all files with a specific architecture ID pattern.
   */
  getFilesByArchPattern(pattern: string): string[] {
    if (!this.cachedGraph) return [];

    const regex = this.patternToRegex(pattern);
    const result: string[] = [];

    for (const [filePath, node] of this.cachedGraph.nodes) {
      if (node.archId && regex.test(node.archId)) {
        result.push(filePath);
      }
    }

    return result;
  }

  /**
   * Initialize ts-morph project with tsconfig for module resolution.
   */
  private initProject(): void {
    if (this.project) return;

    const tsconfigPath = path.join(this.projectRoot, 'tsconfig.json');
    const hasTsconfig = fs.existsSync(tsconfigPath);

    this.project = new Project({
      tsConfigFilePath: hasTsconfig ? tsconfigPath : undefined,
      compilerOptions: hasTsconfig ? undefined : {
        allowJs: true,
        moduleResolution: 2, // NodeJs
        target: 99, // ESNext
        module: 99, // ESNext
      },
      skipAddingFilesFromTsConfig: true,
    });
  }

  /**
   * Get or cache the arch ID for a file.
   */
  private async getArchId(filePath: string): Promise<string | null> {
    if (this.archIdCache.has(filePath)) {
      return this.archIdCache.get(filePath)!;
    }

    try {
      const content = await this.getFileContent(filePath);
      const archId = extractArchId(content);
      this.archIdCache.set(filePath, archId);
      return archId;
    } catch {
      this.archIdCache.set(filePath, null);
      return null;
    }
  }

  /**
   * Resolve imports for a single file.
   * Uses lightweight regex extraction instead of full ts-morph parsing for performance.
   */
  private async resolveFileImports(filePath: string, graph: ImportGraph): Promise<string[]> {
    try {
      const content = await this.getFileContent(filePath);
      const resolvedImports: string[] = [];

      // Extract import specifiers using regex (much faster than ts-morph parsing)
      const importSpecifiers = this.extractImportSpecifiers(content);

      for (const moduleSpecifier of importSpecifiers) {
        // Skip external modules (node_modules)
        if (!moduleSpecifier.startsWith('.') && !moduleSpecifier.startsWith('/')) {
          continue;
        }

        // Try to resolve the import (async with caching)
        const resolvedPath = await this.resolveModulePath(filePath, moduleSpecifier);
        if (resolvedPath && graph.nodes.has(resolvedPath)) {
          resolvedImports.push(resolvedPath);
        }
      }

      return resolvedImports;
    } catch {
      return [];
    }
  }

  /**
   * Extract import specifiers from source code using regex.
   * Much faster than full ts-morph parsing for simple import extraction.
   */
  private extractImportSpecifiers(content: string): string[] {
    const specifiers: string[] = [];

    // Static imports: import ... from 'module' or import ... from "module"
    const staticImportRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
    for (const match of content.matchAll(staticImportRegex)) {
      if (match[1]) specifiers.push(match[1]);
    }

    // Dynamic imports: import('module') or import("module")
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const match of content.matchAll(dynamicImportRegex)) {
      specifiers.push(match[1]);
    }

    // require() calls: require('module') or require("module")
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const match of content.matchAll(requireRegex)) {
      specifiers.push(match[1]);
    }

    // Export from: export ... from 'module'
    const exportFromRegex = /export\s+(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g;
    for (const match of content.matchAll(exportFromRegex)) {
      specifiers.push(match[1]);
    }

    return specifiers;
  }

  /**
   * Resolve a module specifier to an absolute file path (async with caching).
   */
  private async resolveModulePath(fromFile: string, moduleSpecifier: string): Promise<string | null> {
    // Check cache first
    const cacheKey = `${fromFile}:${moduleSpecifier}`;
    if (this.moduleResolutionCache.has(cacheKey)) {
      return this.moduleResolutionCache.get(cacheKey)!;
    }

    const fromDir = path.dirname(fromFile);
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

    // Handle .js extension in imports (common in ESM)
    let basePath = moduleSpecifier;
    if (basePath.endsWith('.js')) {
      basePath = basePath.slice(0, -3);
    }

    const resolvedBase = path.resolve(fromDir, basePath);

    // Build list of candidates
    const candidates = extensions.map(ext => resolvedBase + ext);
    candidates.push(path.resolve(fromDir, moduleSpecifier)); // Direct path

    // Check all candidates in parallel using async fileExists
    const results = await Promise.all(
      candidates.map(async (candidate) => {
        // Check local cache first
        if (this.fileExistsCache.has(candidate)) {
          return { path: candidate, exists: this.fileExistsCache.get(candidate)! };
        }
        // Async check and cache result
        const exists = await fileExists(candidate);
        this.fileExistsCache.set(candidate, exists);
        return { path: candidate, exists };
      })
    );

    // Return first match
    const resolved = results.find(r => r.exists)?.path ?? null;
    this.moduleResolutionCache.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * Detect circular dependencies using DFS.
   * Returns all cycles that include project files.
   */
  private detectCycles(graph: ImportGraph): CyclePath[] {
    const cycles: CyclePath[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const pathStack: string[] = [];

    const dfs = (filePath: string): void => {
      visited.add(filePath);
      recursionStack.add(filePath);
      pathStack.push(filePath);

      const node = graph.nodes.get(filePath);
      if (node) {
        for (const importedPath of node.imports) {
          if (!visited.has(importedPath)) {
            dfs(importedPath);
          } else if (recursionStack.has(importedPath)) {
            // Found a cycle - extract it
            const cycleStart = pathStack.indexOf(importedPath);
            const cycleFiles = [...pathStack.slice(cycleStart), importedPath];
            const cycleArchIds = cycleFiles.map(f =>
              graph.nodes.get(f)?.archId ?? null
            );

            // Avoid duplicate cycles (same cycle starting at different points)
            const cycleKey = [...cycleFiles].sort().join('|');
            const isDuplicate = cycles.some(c =>
              [...c.files].sort().join('|') === cycleKey
            );

            if (!isDuplicate) {
              cycles.push({ files: cycleFiles, archIds: cycleArchIds });
            }
          }
        }
      }

      pathStack.pop();
      recursionStack.delete(filePath);
    };

    for (const filePath of graph.nodes.keys()) {
      if (!visited.has(filePath)) {
        dfs(filePath);
      }
    }

    return cycles;
  }

  /**
   * Get all files that depend on (import) the given changed files.
   * Uses BFS to traverse the import graph in reverse direction.
   * @param changedFiles Set of absolute file paths that have changed
   * @param maxDepth Maximum depth to traverse (default: 2, -1 for unlimited)
   * @returns Set of absolute file paths that depend on the changed files
   */
  getDependents(changedFiles: Set<string>, maxDepth = 2): Set<string> {
    if (!this.cachedGraph) return new Set();

    const dependents = new Set<string>();
    const visited = new Set<string>();
    const queue: Array<{ file: string; depth: number }> = [];

    // Initialize queue with all changed files
    for (const file of changedFiles) {
      if (this.cachedGraph.nodes.has(file)) {
        queue.push({ file, depth: 0 });
        visited.add(file);
      }
    }

    // BFS traversal
    while (queue.length > 0) {
      const { file, depth } = queue.shift()!;
      const node = this.cachedGraph.nodes.get(file);

      if (!node) continue;

      // Find files that import this file
      for (const importerPath of node.importedBy) {
        if (visited.has(importerPath)) continue;

        visited.add(importerPath);
        dependents.add(importerPath);

        // Continue traversing if within depth limit
        if (maxDepth === -1 || depth + 1 < maxDepth) {
          queue.push({ file: importerPath, depth: depth + 1 });
        }
      }
    }

    return dependents;
  }

  /**
   * Convert a glob-like pattern to a regex.
   * Supports: * (single segment), ** (multiple segments)
   */
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^.]*');
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Dispose resources and clear caches.
   */
  dispose(): void {
    this.project = null;
    this.archIdCache.clear();
    this.cachedGraph = null;
    this.moduleResolutionCache.clear();
    this.fileExistsCache.clear();
    this.contentCache.clear();
  }
}
