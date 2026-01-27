/**
 * @arch archcodex.core.engine
 * @intent:ast-analysis
 *
 * SkeletonExtractor - extracts a condensed project skeleton for LLM analysis.
 */
import * as path from 'node:path';
import { Project } from 'ts-morph';
import { globFiles, readFile } from '../../utils/file-system.js';
import { extractArchId } from '../arch-tag/parser.js';
import type {
  ProjectSkeleton,
  SkeletonOptions,
  SkeletonResult,
  ModuleSummary,
  ClassSummary,
  DirectorySummary,
  ImportCluster,
  ExistingTag,
} from './types.js';
import { detectPatterns, suggestClusterName } from './pattern-detector.js';

const DEFAULT_OPTIONS: Required<SkeletonOptions> = {
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts', '**/node_modules/**', '**/dist/**'],
  maxFiles: 500,
  skipDetails: false,
};

/**
 * Extracts a project skeleton for LLM-driven architecture analysis.
 */
export class SkeletonExtractor {
  private projectRoot: string;
  private project: Project | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Extract the project skeleton.
   */
  async extract(options: SkeletonOptions = {}): Promise<SkeletonResult> {
    const startTime = performance.now();
    const warnings: string[] = [];

    const opts: Required<SkeletonOptions> = {
      include: options.include ?? DEFAULT_OPTIONS.include,
      exclude: options.exclude ?? DEFAULT_OPTIONS.exclude,
      maxFiles: options.maxFiles ?? DEFAULT_OPTIONS.maxFiles,
      skipDetails: options.skipDetails ?? DEFAULT_OPTIONS.skipDetails,
    };

    // Find all source files
    const allFiles = await globFiles(opts.include, {
      cwd: this.projectRoot,
      ignore: opts.exclude,
      absolute: false,
    });

    // Apply max files limit
    const files = allFiles.slice(0, opts.maxFiles);
    if (allFiles.length > opts.maxFiles) {
      warnings.push(`Truncated to ${opts.maxFiles} files (total: ${allFiles.length})`);
    }

    // Initialize ts-morph project
    this.initProject();

    // Extract modules
    const modules: ModuleSummary[] = [];
    const existingTags: ExistingTag[] = [];

    for (const file of files) {
      const module = await this.extractModule(file, opts.skipDetails);
      modules.push(module);

      if (module.existingArch) {
        existingTags.push({ file, archId: module.existingArch });
      }
    }

    // Build directory summaries
    const directories = this.buildDirectorySummaries(files);

    // Detect import clusters
    const importClusters = this.detectImportClusters(modules);

    // Detect patterns
    const detectedPatterns = detectPatterns(files, modules);

    const skeleton: ProjectSkeleton = {
      rootPath: this.projectRoot,
      totalFiles: files.length,
      directories,
      modules,
      importClusters,
      existingTags,
      detectedPatterns,
    };

    const extractionTimeMs = performance.now() - startTime;

    return {
      skeleton,
      extractionTimeMs,
      warnings,
    };
  }

  /**
   * Extract module summary from a single file.
   */
  private async extractModule(
    relativePath: string,
    skipDetails: boolean
  ): Promise<ModuleSummary> {
    const absolutePath = path.resolve(this.projectRoot, relativePath);
    const content = await readFile(absolutePath);

    // Extract @arch tag
    const existingArch = extractArchId(content) ?? undefined;

    // Extract imports (internal only)
    const imports = this.extractInternalImports(content);

    // Basic module info
    const module: ModuleSummary = {
      path: relativePath,
      exports: [],
      imports,
      existingArch,
    };

    if (!skipDetails && this.project) {
      try {
        const sourceFile = this.project.createSourceFile(
          absolutePath,
          content,
          { overwrite: true }
        );

        // Extract exports
        module.exports = this.extractExports(sourceFile);

        // Extract classes
        module.classes = this.extractClasses(sourceFile);

        // Extract standalone functions
        module.functions = this.extractFunctions(sourceFile);

        // Extract interfaces
        module.interfaces = this.extractInterfaces(sourceFile);

        // Clean up
        this.project.removeSourceFile(sourceFile);
      } catch {
        // Fall back to basic extraction on parse error
      }
    }

    return module;
  }

  /**
   * Extract internal imports (relative paths only).
   */
  private extractInternalImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const moduleSpec = match[1];
      // Only include internal/relative imports
      if (moduleSpec.startsWith('.') || moduleSpec.startsWith('/')) {
        // Normalize to remove .js extension
        const normalized = moduleSpec.replace(/\.js$/, '');
        imports.push(normalized);
      }
    }

    return imports;
  }

  /**
   * Extract exported symbols from source file.
   */
  private extractExports(sourceFile: ReturnType<Project['createSourceFile']>): string[] {
    const exports: string[] = [];

    // Export declarations
    for (const exp of sourceFile.getExportDeclarations()) {
      for (const namedExport of exp.getNamedExports()) {
        exports.push(namedExport.getName());
      }
    }

    // Exported classes
    for (const cls of sourceFile.getClasses()) {
      if (cls.isExported()) {
        exports.push(cls.getName() || 'default');
      }
    }

    // Exported functions
    for (const func of sourceFile.getFunctions()) {
      if (func.isExported()) {
        exports.push(func.getName() || 'default');
      }
    }

    // Exported interfaces
    for (const iface of sourceFile.getInterfaces()) {
      if (iface.isExported()) {
        exports.push(iface.getName());
      }
    }

    // Exported type aliases
    for (const type of sourceFile.getTypeAliases()) {
      if (type.isExported()) {
        exports.push(type.getName());
      }
    }

    // Exported variables/constants
    for (const varStmt of sourceFile.getVariableStatements()) {
      if (varStmt.isExported()) {
        for (const decl of varStmt.getDeclarations()) {
          exports.push(decl.getName());
        }
      }
    }

    return [...new Set(exports)];
  }

  /**
   * Extract class summaries.
   */
  private extractClasses(sourceFile: ReturnType<Project['createSourceFile']>): ClassSummary[] {
    const classes: ClassSummary[] = [];

    for (const cls of sourceFile.getClasses()) {
      const name = cls.getName();
      if (!name) continue;

      const methods = cls.getMethods()
        .filter(m => m.getScope() === undefined || m.getScope() === 'public')
        .map(m => m.getName());

      const extendsClause = cls.getExtends();
      const implementsClauses = cls.getImplements();

      const decorators = cls.getDecorators().map(d => d.getName());

      classes.push({
        name,
        methods,
        extends: extendsClause?.getText(),
        implements: implementsClauses.map(i => i.getText()),
        decorators,
      });
    }

    return classes;
  }

  /**
   * Extract standalone function names.
   */
  private extractFunctions(sourceFile: ReturnType<Project['createSourceFile']>): string[] {
    return sourceFile.getFunctions()
      .filter(f => f.isExported())
      .map(f => f.getName())
      .filter((name): name is string => !!name);
  }

  /**
   * Extract interface names.
   */
  private extractInterfaces(sourceFile: ReturnType<Project['createSourceFile']>): string[] {
    return sourceFile.getInterfaces()
      .filter(i => i.isExported())
      .map(i => i.getName());
  }

  /**
   * Build directory summaries from file list.
   */
  private buildDirectorySummaries(files: string[]): DirectorySummary[] {
    const dirCounts = new Map<string, number>();
    const dirPatterns = new Map<string, Set<string>>();

    for (const file of files) {
      const dir = path.dirname(file);
      const filename = path.basename(file);

      dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);

      // Detect naming patterns (e.g., *.controller.ts)
      const patternMatch = filename.match(/\.([a-z]+)\.ts$/);
      if (patternMatch) {
        if (!dirPatterns.has(dir)) {
          dirPatterns.set(dir, new Set());
        }
        dirPatterns.get(dir)!.add(`*.${patternMatch[1]}.ts`);
      }
    }

    return Array.from(dirCounts.entries())
      .map(([dirPath, count]) => ({
        path: dirPath,
        fileCount: count,
        patterns: dirPatterns.has(dirPath)
          ? Array.from(dirPatterns.get(dirPath)!)
          : undefined,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Detect import clusters based on import patterns.
   */
  private detectImportClusters(modules: ModuleSummary[]): ImportCluster[] {
    // Build import graph
    const importsByDir = new Map<string, Set<string>>();
    const importedByDir = new Map<string, Set<string>>();

    for (const module of modules) {
      const moduleDir = this.getDirPattern(module.path);

      for (const imp of module.imports) {
        const importedDir = this.getDirPattern(this.resolveImportPath(module.path, imp));

        if (moduleDir !== importedDir) {
          // Track imports
          if (!importsByDir.has(moduleDir)) {
            importsByDir.set(moduleDir, new Set());
          }
          importsByDir.get(moduleDir)!.add(importedDir);

          // Track importedBy
          if (!importedByDir.has(importedDir)) {
            importedByDir.set(importedDir, new Set());
          }
          importedByDir.get(importedDir)!.add(moduleDir);
        }
      }
    }

    // Group modules by top-level directory
    const clusterDirs = new Set<string>();
    for (const module of modules) {
      clusterDirs.add(this.getDirPattern(module.path));
    }

    // Build clusters
    const clusters: ImportCluster[] = [];
    for (const pattern of clusterDirs) {
      const files = modules
        .filter(m => this.getDirPattern(m.path) === pattern)
        .map(m => m.path);

      if (files.length === 0) continue;

      const importsFrom = importsByDir.has(pattern)
        ? Array.from(importsByDir.get(pattern)!)
        : [];

      const importedBy = importedByDir.has(pattern)
        ? Array.from(importedByDir.get(pattern)!)
        : [];

      // Calculate layer level (more dependencies = higher level)
      const layerLevel = importsFrom.length;

      clusters.push({
        name: suggestClusterName(pattern),
        pattern,
        files,
        importsFrom,
        importedBy,
        layerLevel,
      });
    }

    // Sort by layer level (lowest first)
    return clusters.sort((a, b) => a.layerLevel - b.layerLevel);
  }

  /**
   * Get the top-level directory pattern for a file.
   */
  private getDirPattern(filePath: string): string {
    const parts = filePath.split('/');
    // Return first two levels (e.g., "src/core" or "src/cli")
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return parts[0];
  }

  /**
   * Resolve a relative import path.
   */
  private resolveImportPath(fromPath: string, importPath: string): string {
    if (!importPath.startsWith('.')) {
      return importPath;
    }
    const fromDir = path.dirname(fromPath);
    return path.normalize(path.join(fromDir, importPath));
  }

  /**
   * Initialize ts-morph project.
   */
  private initProject(): void {
    if (this.project) return;

    this.project = new Project({
      compilerOptions: {
        allowJs: true,
        moduleResolution: 2, // NodeJs
        target: 99, // ESNext
        module: 99, // ESNext
      },
      skipAddingFilesFromTsConfig: true,
    });
  }

  /**
   * Dispose resources.
   */
  dispose(): void {
    this.project = null;
  }
}

// Re-export formatting functions for convenience
export { skeletonToYaml, formatSkeletonForPrompt } from './skeleton-formatter.js';
