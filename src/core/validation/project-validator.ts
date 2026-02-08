/**
 * @arch archcodex.core.engine
 *
 * ProjectValidator - orchestrates project-level validation with cross-file constraints.
 * Wraps ValidationEngine and adds import graph analysis for constraints like
 * importable_by and forbid_circular_deps.
 */
import * as path from 'node:path';
import type { Config } from '../config/schema.js';
import type { Registry } from '../registry/schema.js';
import { resolveArchitecture } from '../registry/resolver.js';
import type { ResolutionResult, ResolvedConstraint } from '../registry/types.js';
import { getValidator } from '../constraints/index.js';
import { ProjectAnalyzer } from '../imports/analyzer.js';
import { PackageBoundaryValidator } from '../packages/validator.js';
import type { PackageBoundaryViolation } from '../packages/types.js';
import { LayerBoundaryValidator } from '../layers/validator.js';
import type { LayerViolation } from '../layers/types.js';
import { CoverageValidator } from '../coverage/validator.js';
import type { CoverageGap, CoverageConstraintConfig } from '../coverage/types.js';
import { SimilarityAnalyzer } from '../similarity/analyzer.js';
import { basename } from '../../utils/file-system.js';
import type {
  ValidationResult,
  ValidationOptions,
  BatchValidationResult,
} from './types.js';
import type { Violation, ProjectConstraintContext } from '../constraints/types.js';
import type { ImportGraphResult, FilePatternOptions } from '../imports/types.js';
import type { PatternRegistry } from '../patterns/types.js';
import { ValidationEngine } from './engine.js';

/** Project-level constraint rules that require import graph analysis. */
const PROJECT_LEVEL_RULES = ['importable_by', 'forbid_circular_deps'];

/** Coverage constraint rule - handled separately from per-file validation. */
const COVERAGE_RULE = 'require_coverage';

/** Similarity constraint rule - handled separately from per-file validation. */
const SIMILARITY_RULE = 'max_similarity';

/** Options for project validation. */
export interface ProjectValidationOptions extends ValidationOptions, FilePatternOptions {
  /** Pre-built import graph to reuse (avoids rebuilding graph) */
  prebuiltGraph?: ImportGraphResult;
  /** Pre-populated content cache to share (avoids re-reading files) */
  prebuiltContentCache?: Map<string, string>;
}

/** Similarity violation - files that are too similar. */
export interface SimilarityViolation {
  /** The file that violates the similarity constraint */
  file: string;
  /** Architecture ID of the file */
  archId?: string;
  /** Similar file detected */
  similarTo: string;
  /** Similarity score (0-1) */
  similarity: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** Constraint severity */
  severity: 'error' | 'warning';
  /** Why message from constraint */
  why?: string;
}

/** Extended batch result with project-level stats. */
export interface ProjectBatchValidationResult extends BatchValidationResult {
  /** Project-level statistics */
  projectStats: {
    /** Time to build import graph in ms */
    graphBuildTimeMs: number;
    /** Total files in import graph */
    filesInGraph: number;
    /** Number of circular dependencies detected */
    cyclesDetected: number;
    /** Cycle details with file paths and architecture IDs */
    cycles: Array<{ files: string[]; archIds: (string | null)[] }>;
  };
  /** Package boundary violations (if packages are configured) */
  packageViolations?: PackageBoundaryViolation[];
  /** Layer boundary violations (if layers are configured) */
  layerViolations?: LayerViolation[];
  /** Coverage gaps from require_coverage constraints */
  coverageGaps?: CoverageGap[];
  /** Coverage statistics per constraint */
  coverageStats?: {
    totalConstraints: number;
    totalSources: number;
    coveredSources: number;
    coveragePercent: number;
  };
  /** Similarity violations from max_similarity constraints (DRY detection) */
  similarityViolations?: SimilarityViolation[];
  /** Cache statistics (if caching is enabled) */
  cacheStats?: {
    /** Files with valid cache (skipped validation) */
    hits: number;
    /** Files not in cache */
    misses: number;
    /** Files with stale cache (re-validated) */
    invalidated: number;
  };
}

/**
 * Project-level validator that extends single-file validation with cross-file constraints.
 *
 * Validation phases:
 * 1. Build import graph using ProjectAnalyzer
 * 2. Run single-file validation using ValidationEngine
 * 3. Run project-level constraints (importable_by, forbid_circular_deps)
 * 4. Validate package boundaries (if configured)
 * 5. Merge results
 */
export class ProjectValidator {
  private registry: Registry;
  private projectRoot: string;
  private engine: ValidationEngine;
  private analyzer: ProjectAnalyzer;
  private packageValidator: PackageBoundaryValidator | null = null;
  private layerValidator: LayerBoundaryValidator | null = null;
  private coverageValidator: CoverageValidator;
  private similarityAnalyzer: SimilarityAnalyzer;
  /** Memoization cache for architecture resolution (avoids repeated lookups for same archId) */
  private archResolutionCache = new Map<string, ResolutionResult>();
  /** Memoized constraint existence checks (null = not yet computed) */
  private hasCoverageConstraints: boolean | null = null;
  private hasSimilarityConstraints: boolean | null = null;

  constructor(projectRoot: string, config: Config, registry: Registry, patternRegistry?: PatternRegistry) {
    this.projectRoot = projectRoot;
    this.registry = registry;
    this.engine = new ValidationEngine(projectRoot, config, registry, patternRegistry);
    this.analyzer = new ProjectAnalyzer(projectRoot);
    this.coverageValidator = new CoverageValidator(projectRoot);
    this.similarityAnalyzer = new SimilarityAnalyzer(projectRoot);

    // Initialize package boundary validator if packages are configured
    if (config.packages && config.packages.length > 0) {
      this.packageValidator = new PackageBoundaryValidator(
        projectRoot,
        config.packages
      );
    }

    // Initialize layer boundary validator if layers are configured
    if (config.layers && config.layers.length > 0) {
      this.layerValidator = new LayerBoundaryValidator(
        projectRoot,
        config.layers
      );
    }
  }

  /**
   * Validate all files in the project with cross-file constraint checking.
   */
  async validateProject(
    options: ProjectValidationOptions = {}
  ): Promise<ProjectBatchValidationResult> {
    // Phase 1: Build import graph
    const graphResult = await this.analyzer.buildImportGraph({
      include: options.include,
      exclude: options.exclude,
      archIgnore: options.archIgnore,
    });

    // Share content cache with validation engine to avoid duplicate reads
    this.engine.setContentCache(this.analyzer.getContentCache());

    // Get all files from the graph
    const filePaths = Array.from(graphResult.graph.nodes.keys()).map(
      (absPath) => path.relative(this.projectRoot, absPath)
    );

    // Phase 2: Run single-file validation (excluding project-level rules)
    const singleFileOptions: ValidationOptions = {
      ...options,
      skipRules: [...(options.skipRules ?? []), ...PROJECT_LEVEL_RULES],
    };
    const singleFileResults = await this.engine.validateFiles(
      filePaths,
      singleFileOptions
    );

    // Phase 3: Run project-level constraints
    const projectResults = await this.validateProjectConstraints(
      singleFileResults.results,
      graphResult,
      options
    );

    // Run phases 4-7 in parallel (they are independent of each other)
    const [packageViolations, layerViolations, coverageResult, similarityResult] = await Promise.all([
      // Phase 4: Validate package boundaries
      Promise.resolve(this.packageValidator?.validate(graphResult.graph).violations),

      // Phase 5: Validate layer boundaries
      Promise.resolve(this.layerValidator?.validate(graphResult.graph).violations),

      // Phase 6: Validate coverage constraints
      this.validateCoverageConstraints(options),

      // Phase 7: Validate similarity constraints (DRY detection)
      this.validateSimilarityConstraints(graphResult.graph.nodes.keys(), options),
    ]);

    // Phase 8: Merge results
    return this.mergeResults(
      projectResults,
      graphResult,
      packageViolations,
      layerViolations,
      coverageResult,
      similarityResult
    );
  }

  /**
   * Validate specific files with project context.
   * Builds import graph for the whole project but only validates specified files.
   */
  async validateFiles(
    filePaths: string[],
    options: ProjectValidationOptions = {}
  ): Promise<ProjectBatchValidationResult> {
    // Use prebuilt graph if provided, otherwise build it
    const graphResult = options.prebuiltGraph ?? await this.analyzer.buildImportGraph({
      include: options.include,
      exclude: options.exclude,
      archIgnore: options.archIgnore,
    });

    // Share content cache with validation engine to avoid duplicate reads
    // Use prebuilt cache if provided, otherwise use analyzer's cache
    const contentCache = options.prebuiltContentCache ?? this.analyzer.getContentCache();
    this.engine.setContentCache(contentCache);

    // Run single-file validation (excluding project-level rules)
    const singleFileOptions: ValidationOptions = {
      ...options,
      skipRules: [...(options.skipRules ?? []), ...PROJECT_LEVEL_RULES],
    };
    const singleFileResults = await this.engine.validateFiles(
      filePaths,
      singleFileOptions
    );

    // Run project-level constraints only for specified files
    const projectResults = await this.validateProjectConstraints(
      singleFileResults.results,
      graphResult,
      options
    );

    // Run phases 4-7 in parallel (they are independent of each other)
    const [packageViolations, layerViolations, coverageResult, similarityResult] = await Promise.all([
      // Phase 4: Validate package boundaries (for all files, not just specified)
      Promise.resolve(this.packageValidator?.validate(graphResult.graph).violations),

      // Phase 5: Validate layer boundaries
      Promise.resolve(this.layerValidator?.validate(graphResult.graph).violations),

      // Phase 6: Validate coverage constraints
      this.validateCoverageConstraints(options),

      // Phase 7: Validate similarity constraints (DRY detection)
      this.validateSimilarityConstraints(graphResult.graph.nodes.keys(), options),
    ]);

    return this.mergeResults(projectResults, graphResult, packageViolations, layerViolations, coverageResult, similarityResult);
  }

  /**
   * Run project-level constraint validation.
   * Parallelized for better performance on large codebases.
   */
  private async validateProjectConstraints(
    singleFileResults: ValidationResult[],
    graphResult: ImportGraphResult,
    options: ValidationOptions
  ): Promise<ValidationResult[]> {
    // Process results in parallel batches
    const BATCH_SIZE = 50;
    const results: ValidationResult[] = [];

    for (let i = 0; i < singleFileResults.length; i += BATCH_SIZE) {
      const batch = singleFileResults.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(result => this.validateProjectConstraintsForFile(result, graphResult, options))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Validate project-level constraints for a single file.
   */
  private validateProjectConstraintsForFile(
    result: ValidationResult,
    graphResult: ImportGraphResult,
    options: ValidationOptions
  ): ValidationResult {
    // Skip files without archId (untagged or errored)
    if (!result.archId) {
      return result;
    }

    // Get project-level constraints for this architecture (memoized)
    let resolution;
    try {
      resolution = this.getResolvedArchitecture(result.archId);
    } catch { /* architecture not found in registry */
      return result;
    }

    const projectConstraints = resolution.architecture.constraints.filter(
      (c: ResolvedConstraint) => PROJECT_LEVEL_RULES.includes(c.rule)
    );

    if (projectConstraints.length === 0) {
      return result;
    }

    // Build project context for this file
    const absolutePath = path.resolve(this.projectRoot, result.file);
    const projectContext = this.buildProjectContext(
      absolutePath,
      result.archId,
      graphResult
    );

    // Validate project-level constraints
    const projectViolations: Violation[] = [];

    for (const constraint of projectConstraints) {
      if (options.skipRules?.includes(constraint.rule)) {
        continue;
      }

      if (options.severities && !options.severities.includes(constraint.severity)) {
        continue;
      }

      const validator = getValidator(constraint.rule);
      if (!validator) {
        continue;
      }

      const validationResult = validator.validate(constraint, projectContext);
      projectViolations.push(...validationResult.violations);
    }

    // Merge violations into result
    if (projectViolations.length > 0) {
      const newViolations = [
        ...result.violations,
        ...projectViolations.filter((v) => v.severity === 'error'),
      ];
      const newWarnings = [
        ...result.warnings,
        ...projectViolations.filter((v) => v.severity === 'warning'),
      ];

      return {
        ...result,
        status: newViolations.length > 0 ? 'fail' : (newWarnings.length > 0 ? 'warn' : 'pass'),
        violations: newViolations,
        warnings: newWarnings,
        passed: newViolations.length === 0,
        errorCount: newViolations.length,
        warningCount: newWarnings.length,
      };
    }

    return result;
  }

  /**
   * Build project-level context for constraint validation.
   */
  private buildProjectContext(
    filePath: string,
    archId: string,
    graphResult: ImportGraphResult
  ): ProjectConstraintContext {
    // Get importers for importable_by constraint
    const importers = this.analyzer.getImporters(filePath);

    // Get cycles that include this file for forbid_circular_deps constraint
    const cycles = graphResult.cycles.filter((cycle) =>
      cycle.files.includes(filePath)
    );

    // Create a minimal SemanticModel - project-level validators don't use parsedFile
    const fileName = basename(filePath);
    const extension = path.extname(filePath);

    return {
      filePath,
      fileName,
      parsedFile: {
        filePath,
        fileName,
        extension,
        content: '',
        lineCount: 0,
        locCount: 0,
        language: 'typescript' as const,
        imports: [],
        classes: [],
        interfaces: [],
        functions: [],
        functionCalls: [],
        mutations: [],
        exports: [],
      },
      archId,
      constraintSource: archId,
      importers,
      cycles,
    };
  }

  /**
   * Get resolved architecture with memoization.
   * Avoids repeated resolution for files with the same archId.
   */
  private getResolvedArchitecture(archId: string): ResolutionResult {
    if (!this.archResolutionCache.has(archId)) {
      this.archResolutionCache.set(archId, resolveArchitecture(this.registry, archId));
    }
    return this.archResolutionCache.get(archId)!;
  }

  /**
   * Quick check if any coverage constraints exist in the registry.
   * Uses memoization to avoid repeated scans.
   */
  private checkHasCoverageConstraints(): boolean {
    if (this.hasCoverageConstraints === null) {
      // Quick scan: check if any node or mixin has coverage constraints
      const hasInNodes = Object.values(this.registry.nodes).some(node =>
        node.constraints?.some(c => c.rule === COVERAGE_RULE)
      );
      const hasInMixins = Object.values(this.registry.mixins).some(mixin =>
        mixin.constraints?.some(c => c.rule === COVERAGE_RULE)
      );
      this.hasCoverageConstraints = hasInNodes || hasInMixins;
    }
    return this.hasCoverageConstraints;
  }

  /**
   * Quick check if any similarity constraints exist in the registry.
   * Uses memoization to avoid repeated scans.
   */
  private checkHasSimilarityConstraints(): boolean {
    if (this.hasSimilarityConstraints === null) {
      // Quick scan: check if any node or mixin has similarity constraints
      const hasInNodes = Object.values(this.registry.nodes).some(node =>
        node.constraints?.some(c => c.rule === SIMILARITY_RULE)
      );
      const hasInMixins = Object.values(this.registry.mixins).some(mixin =>
        mixin.constraints?.some(c => c.rule === SIMILARITY_RULE)
      );
      this.hasSimilarityConstraints = hasInNodes || hasInMixins;
    }
    return this.hasSimilarityConstraints;
  }

  /**
   * Validate coverage constraints from all architectures.
   * Collects require_coverage constraints and validates cross-file coverage.
   */
  private async validateCoverageConstraints(
    options: ValidationOptions
  ): Promise<{ gaps: CoverageGap[]; stats: { totalConstraints: number; totalSources: number; coveredSources: number; coveragePercent: number } } | null> {
    // Skip if require_coverage is in skipRules
    if (options.skipRules?.includes(COVERAGE_RULE)) {
      return null;
    }

    // Quick check: skip if no coverage constraints exist anywhere
    if (!this.checkHasCoverageConstraints()) {
      return null;
    }

    // Collect all require_coverage constraints from all architectures
    const coverageConfigs = this.collectCoverageConstraints(options);

    if (coverageConfigs.length === 0) {
      return null;
    }

    // Share content cache with coverage validator
    this.coverageValidator.setContentCache(this.analyzer.getContentCache());

    // Validate all coverage constraints
    const results = await this.coverageValidator.validateAll(coverageConfigs);

    // Aggregate results
    const allGaps: CoverageGap[] = [];
    let totalSources = 0;
    let coveredSources = 0;

    for (const result of results.values()) {
      allGaps.push(...result.gaps);
      totalSources += result.totalSources;
      coveredSources += result.coveredSources;
    }

    return {
      gaps: allGaps,
      stats: {
        totalConstraints: coverageConfigs.length,
        totalSources,
        coveredSources,
        coveragePercent: totalSources > 0 ? (coveredSources / totalSources) * 100 : 100,
      },
    };
  }

  /**
   * Validate similarity constraints from all architectures.
   * Detects files that are too similar (DRY violations).
   */
  private async validateSimilarityConstraints(
    filePaths: Iterable<string>,
    options: ValidationOptions
  ): Promise<SimilarityViolation[]> {
    // Skip if max_similarity is in skipRules
    if (options.skipRules?.includes(SIMILARITY_RULE)) {
      return [];
    }

    // Quick check: skip if no similarity constraints exist anywhere
    if (!this.checkHasSimilarityConstraints()) {
      return [];
    }

    // Collect all max_similarity constraints from all architectures
    const similarityConfigs = this.collectSimilarityConstraints(options);

    if (similarityConfigs.length === 0) {
      return [];
    }

    const violations: SimilarityViolation[] = [];
    const files = Array.from(filePaths);
    const alreadyCompared = new Set<string>();

    // Group files by architecture
    const filesByArch = new Map<string | undefined, string[]>();
    for (const file of files) {
      try {
        const sig = await this.similarityAnalyzer.extractSignature(file);
        // Convert null to undefined for Map key compatibility
        const archId = sig.archId ?? undefined;
        if (!filesByArch.has(archId)) {
          filesByArch.set(archId, []);
        }
        filesByArch.get(archId)!.push(file);
      } catch {
        // Skip files that can't be parsed
        continue;
      }
    }

    // For each architecture with a max_similarity constraint
    for (const config of similarityConfigs) {
      const archFiles = filesByArch.get(config.archId) ?? [];

      // Skip if less than 2 files have this architecture
      if (archFiles.length < 2) {
        continue;
      }

      // Check each file against other files with same architecture
      for (const file of archFiles) {
        const candidates = archFiles.filter(f => {
          if (f === file) return false;
          // Skip if already compared in opposite direction
          const key = [file, f].sort().join(':');
          if (alreadyCompared.has(key)) return false;
          return true;
        });

        if (candidates.length === 0) continue;

        try {
          const matches = await this.similarityAnalyzer.findSimilar(
            file,
            candidates,
            { threshold: config.threshold, sameArchOnly: true }
          );

          for (const match of matches) {
            // Mark as compared
            const key = [file, match.file].sort().join(':');
            alreadyCompared.add(key);

            // Add violation
            violations.push({
              file: path.relative(this.projectRoot, file),
              archId: config.archId,
              similarTo: match.file,
              similarity: match.similarity,
              threshold: config.threshold,
              severity: config.severity,
              why: config.why,
            });
          }
        } catch { /* file analysis or similarity computation failed */
          // Skip files that fail analysis
          continue;
        }
      }
    }

    return violations;
  }

  /**
   * Collect all max_similarity constraints from the registry.
   */
  private collectSimilarityConstraints(options: ValidationOptions): Array<{
    archId: string;
    threshold: number;
    severity: 'error' | 'warning';
    why?: string;
  }> {
    const configs: Array<{
      archId: string;
      threshold: number;
      severity: 'error' | 'warning';
      why?: string;
    }> = [];

    // Iterate through all architecture nodes in the registry
    for (const archId of Object.keys(this.registry.nodes)) {
      // Resolve to get inherited constraints
      let resolution: ResolutionResult;
      try {
        resolution = this.getResolvedArchitecture(archId);
      } catch { /* architecture not found in registry */
        continue;
      }

      // Find similarity constraints
      for (const constraint of resolution.architecture.constraints) {
        if (constraint.rule !== SIMILARITY_RULE) {
          continue;
        }

        // Skip if severity doesn't match filter
        if (options.severities && !options.severities.includes(constraint.severity)) {
          continue;
        }

        // Extract threshold from constraint value (should be a number 0-1)
        const threshold = typeof constraint.value === 'number'
          ? constraint.value
          : 0.8; // Default threshold

        configs.push({
          archId,
          threshold,
          severity: constraint.severity,
          why: constraint.why,
        });
      }
    }

    return configs;
  }

  /**
   * Collect all require_coverage constraints from the registry.
   */
  private collectCoverageConstraints(options: ValidationOptions): CoverageConstraintConfig[] {
    const configs: CoverageConstraintConfig[] = [];

    // Iterate through all architecture nodes in the registry
    for (const archId of Object.keys(this.registry.nodes)) {
      // Resolve to get inherited constraints
      let resolution: ResolutionResult;
      try {
        resolution = this.getResolvedArchitecture(archId);
      } catch { /* architecture not found in registry */
        continue;
      }

      // Find coverage constraints
      for (const constraint of resolution.architecture.constraints) {
        if (constraint.rule !== COVERAGE_RULE) {
          continue;
        }

        // Skip if severity doesn't match filter
        if (options.severities && !options.severities.includes(constraint.severity)) {
          continue;
        }

        // Extract coverage config from constraint
        // The constraint value should be an object with coverage-specific fields
        const value = constraint.value as unknown;

        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          continue;
        }

        const valueObj = value as Record<string, unknown>;

        // Build coverage config
        const config: CoverageConstraintConfig = {
          source_type: (valueObj.source_type as CoverageConstraintConfig['source_type']) ?? 'export_names',
          source_pattern: (valueObj.source_pattern as string) ?? '*',
          extract_values: valueObj.extract_values as string | undefined,
          in_files: (valueObj.in_files as string) ?? 'src/**/*.ts',
          target_pattern: (valueObj.target_pattern as string) ?? '${value}',
          in_target_files: (valueObj.in_target_files as string) ?? 'src/**/*.ts',
          severity: constraint.severity,
          why: constraint.why,
          archId,
        };

        configs.push(config);
      }
    }

    return configs;
  }

  /**
   * Merge validation results and build final batch result.
   */
  private mergeResults(
    results: ValidationResult[],
    graphResult: ImportGraphResult,
    packageViolations?: PackageBoundaryViolation[],
    layerViolations?: LayerViolation[],
    coverageResult?: { gaps: CoverageGap[]; stats: { totalConstraints: number; totalSources: number; coveredSources: number; coveragePercent: number } } | null,
    similarityResult?: SimilarityViolation[]
  ): ProjectBatchValidationResult {
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === 'pass').length,
      failed: results.filter((r) => r.status === 'fail').length,
      warned: results.filter((r) => r.status === 'warn').length,
      totalErrors: results.reduce((sum, r) => sum + r.errorCount, 0),
      totalWarnings: results.reduce((sum, r) => sum + r.warningCount, 0),
      activeOverrides: results.reduce(
        (sum, r) => sum + r.overridesActive.length,
        0
      ),
    };

    // Include package violations in error count
    if (packageViolations && packageViolations.length > 0) {
      summary.totalErrors += packageViolations.length;
      summary.failed += packageViolations.length;
    }

    // Include layer violations in error count
    if (layerViolations && layerViolations.length > 0) {
      summary.totalErrors += layerViolations.length;
      summary.failed += layerViolations.length;
    }

    // Include coverage gaps in error count
    if (coverageResult && coverageResult.gaps.length > 0) {
      summary.totalErrors += coverageResult.gaps.length;
      // Don't increment failed count since coverage gaps aren't per-file
    }

    // Include similarity violations in error/warning count
    if (similarityResult && similarityResult.length > 0) {
      const errors = similarityResult.filter(v => v.severity === 'error').length;
      const warnings = similarityResult.filter(v => v.severity === 'warning').length;
      summary.totalErrors += errors;
      summary.totalWarnings += warnings;
    }

    return {
      results,
      summary,
      projectStats: {
        graphBuildTimeMs: graphResult.buildTimeMs,
        filesInGraph: graphResult.graph.nodes.size,
        cyclesDetected: graphResult.cycles.length,
        cycles: graphResult.cycles,
      },
      packageViolations:
        packageViolations && packageViolations.length > 0
          ? packageViolations
          : undefined,
      layerViolations:
        layerViolations && layerViolations.length > 0
          ? layerViolations
          : undefined,
      coverageGaps:
        coverageResult && coverageResult.gaps.length > 0
          ? coverageResult.gaps
          : undefined,
      coverageStats: coverageResult?.stats,
      similarityViolations:
        similarityResult && similarityResult.length > 0
          ? similarityResult
          : undefined,
    };
  }

  /**
   * Dispose resources.
   */
  dispose(): void {
    this.engine.dispose();
    this.analyzer.dispose();
  }
}
