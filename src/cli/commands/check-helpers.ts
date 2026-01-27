/**
 * @arch archcodex.core.domain
 *
 * Helper functions for the check command.
 * Extracted to keep check.ts under line limit.
 */
import * as path from 'node:path';
import { CacheManager, ChangeDetector, type CachedFileResult, type CachedViolation, type CacheStats } from '../../core/cache/index.js';
import { ProjectValidator, type ProjectBatchValidationResult } from '../../core/validation/project-validator.js';
import type { ValidationResult, ActiveOverride } from '../../core/validation/types.js';
import type { Violation } from '../../core/constraints/types.js';
import type { ConstraintRule, Severity, ArchitectureNode } from '../../core/registry/schema.js';
import type { SimilarityMatch } from '../../core/similarity/types.js';
import type { Config } from '../../core/config/schema.js';
import type { Registry } from '../../core/registry/schema.js';
import type { PatternRegistry } from '../../core/patterns/types.js';
import type { ArchIgnore } from '../../utils/archignore.js';
import type { ImportGraphResult } from '../../core/imports/types.js';
import { readFile } from '../../utils/file-system.js';
import { computeChecksum } from '../../utils/checksum.js';
import { resolveArchitecture } from '../../core/registry/resolver.js';
import { formatConstraintValue } from '../../utils/format.js';

/**
 * Convert a cached result back to a full ValidationResult.
 * Used when restoring results from persistent cache.
 */
export function hydrateCachedResult(file: string, cached: CachedFileResult): ValidationResult {
  const hydrateViolation = (cv: CachedViolation): Violation => ({
    code: cv.code,
    rule: cv.rule as ConstraintRule,
    value: cv.value,
    severity: cv.severity,
    line: cv.line,
    column: cv.column,
    message: cv.message,
    source: cv.source,
  });

  return {
    file,
    archId: cached.archId,
    status: cached.status,
    violations: cached.violations.map(hydrateViolation),
    warnings: cached.warnings.map(hydrateViolation),
    overridesActive: Array(cached.overridesCount).fill(null).map(() => ({
      rule: 'unknown',
      value: 'unknown',
      reason: 'restored from cache',
    } as ActiveOverride)),
    passed: cached.status !== 'fail',
    errorCount: cached.violations.length,
    warningCount: cached.warnings.length,
    inheritanceChain: [],
    mixinsApplied: [],
  };
}

/**
 * Create a cache entry from a validation result.
 * Stores minimal data needed to reconstruct the result.
 */
export function createCacheEntry(result: ValidationResult, checksum: string): CachedFileResult {
  const toCachedViolation = (v: Violation): CachedViolation => ({
    code: v.code,
    rule: v.rule,
    value: v.value,
    severity: v.severity,
    line: v.line,
    column: v.column,
    message: v.message,
    source: v.source,
  });

  return {
    checksum,
    cachedAt: new Date().toISOString(),
    archId: result.archId,
    status: result.status,
    violations: result.violations.map(toCachedViolation),
    warnings: result.warnings.map(toCachedViolation),
    imports: [],
    overridesCount: result.overridesActive.length,
  };
}

/**
 * Print duplicate warnings in the appropriate format.
 * @intent:cli-output
 */
export function printDuplicateWarnings(
  warnings: Array<{ file: string; matches: SimilarityMatch[] }>,
  format: 'human' | 'json' | 'compact'
): void {
  if (format === 'human') {
    console.log('\n\x1b[33m\x1b[1mPotential Duplicates Detected:\x1b[0m');
    for (const w of warnings) {
      for (const m of w.matches) {
        console.log(`  \x1b[33m⚠\x1b[0m ${w.file} is ${Math.round(m.similarity * 100)}% similar to ${m.file}`);
        if (m.matchedAspects.length > 0) {
          console.log(`    Matched: ${m.matchedAspects.map(a => a.type).join(', ')}`);
        }
      }
    }
  } else if (format === 'compact') {
    for (const w of warnings) {
      for (const m of w.matches) {
        console.log(`\x1b[33m⚠ DUP\x1b[0m ${w.file}: ${Math.round(m.similarity * 100)}% similar to ${m.file}`);
      }
    }
  }
}

/**
 * Parse threshold value from CLI (handles 'null' string).
 */
export function parseThreshold(value: string): number | null {
  if (value === 'null' || value === '') return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

/**
 * Effective settings after merging config and CLI.
 */
export interface EffectiveSettings {
  maxErrors: number | null;
  maxWarnings: number | null;
  outputFormat: 'human' | 'json' | 'compact';
  onlyStagedFiles: boolean;
  include: string[];
  exclude: string[];
}

/**
 * Pre-commit settings from config.
 */
export interface PrecommitConfig {
  max_errors?: number | null;
  max_warnings?: number | null;
  output_format?: 'human' | 'json' | 'compact';
  only_staged_files?: boolean;
  include?: string[];
  exclude?: string[];
}

/**
 * Merge precommit settings from config with CLI options.
 * CLI options override config.
 */
export function mergePrecommitSettings(
  cfg: PrecommitConfig | undefined,
  cli: Record<string, unknown>
): EffectiveSettings {
  const s: EffectiveSettings = {
    maxErrors: cfg?.max_errors ?? null,
    maxWarnings: cfg?.max_warnings ?? null,
    outputFormat: cfg?.output_format ?? 'human',
    onlyStagedFiles: cfg?.only_staged_files ?? false,
    include: cfg?.include ?? [],
    exclude: cfg?.exclude ?? [],
  };

  if (cli.maxErrors !== undefined) s.maxErrors = cli.maxErrors as number | null;
  if (cli.maxWarnings !== undefined) s.maxWarnings = cli.maxWarnings as number | null;
  if (cli.json) s.outputFormat = 'json';
  else if (cli.format && cli.format !== 'human') s.outputFormat = cli.format as 'json' | 'compact';
  if (cli.staged) s.onlyStagedFiles = true;
  if (cli.include) s.include = cli.include as string[];
  if (cli.exclude) s.exclude = cli.exclude as string[];

  return s;
}

/**
 * Determine exit code based on results and thresholds.
 */
export function getExitCodeWithThresholds(
  summary: { failed: number; warned: number },
  exitCodes: { success: number; error: number; warning_only: number },
  maxErrors: number | null,
  maxWarnings: number | null
): number {
  // Check error threshold
  if (maxErrors !== null) {
    if (summary.failed > maxErrors) {
      return exitCodes.error;
    }
  } else if (summary.failed > 0) {
    return exitCodes.error;
  }

  // Check warning threshold
  if (maxWarnings !== null) {
    if (summary.warned > maxWarnings) {
      return exitCodes.error;
    }
  }

  // Warnings without exceeding threshold
  if (summary.warned > 0) {
    return exitCodes.warning_only;
  }

  return exitCodes.success;
}

/** Options for project validation. */
export interface ProjectValidationOptions {
  projectRoot: string;
  config: Config;
  registry: Registry;
  patternRegistry?: PatternRegistry;
  files: string[];
  effectiveSettings: EffectiveSettings;
  cacheManager?: CacheManager;
  incremental: boolean;
  strict?: boolean;
  severities?: Severity[];
  /** ArchIgnore instance for filtering files */
  archIgnore?: ArchIgnore;
}

/** Result of project validation including stats. */
export interface ProjectValidationFlowResult {
  result: ProjectBatchValidationResult;
  projectStats: ProjectBatchValidationResult['projectStats'];
  incrementalStats?: { changed: number; dependents: number };
  cacheStats?: CacheStats;
}

/**
 * Run project-level validation with caching and incremental support.
 */
export async function runProjectValidation(opts: ProjectValidationOptions): Promise<ProjectValidationFlowResult> {
  const { projectRoot, config, registry, patternRegistry, files, effectiveSettings, cacheManager, incremental, strict, severities, archIgnore } = opts;
  const projectValidator = new ProjectValidator(projectRoot, config, registry, patternRegistry);

  let filesToValidate: string[] = [];
  const cachedResults: ValidationResult[] = [];
  let incrementalStats: { changed: number; dependents: number } | undefined;
  let prebuiltGraph: ImportGraphResult | undefined;
  let prebuiltContentCache: Map<string, string> | undefined;

  if (incremental && cacheManager) {
    // Incremental mode: only validate changed files and their dependents
    const changeDetector = new ChangeDetector(projectRoot, cacheManager);
    const changeResult = await changeDetector.detectChanges(files);

    // Build import graph to find dependents (reuse for validation)
    const { ProjectAnalyzer } = await import('../../core/imports/analyzer.js');
    const analyzer = new ProjectAnalyzer(projectRoot);
    prebuiltGraph = await analyzer.buildImportGraph({
      include: effectiveSettings.include.length > 0 ? effectiveSettings.include : undefined,
      exclude: effectiveSettings.exclude.length > 0 ? effectiveSettings.exclude : undefined,
      archIgnore,
    });
    // Keep content cache for reuse during validation
    prebuiltContentCache = analyzer.getContentCache();

    // Convert changed files to absolute paths for getDependents
    const changedAbsolute = new Set(
      [...changeResult.changed, ...changeResult.newFiles].map(f => path.resolve(projectRoot, f))
    );

    // Find files that depend on changed files (2 levels deep)
    const dependentAbsolute = analyzer.getDependents(changedAbsolute, 2);
    const dependentRelative = Array.from(dependentAbsolute).map(f => path.relative(projectRoot, f));

    // Files to validate = changed + new + dependents
    const toValidateSet = new Set([...changeResult.changed, ...changeResult.newFiles, ...dependentRelative]);
    filesToValidate = Array.from(toValidateSet);

    // Use cached results for unchanged files that are not dependents
    for (const file of changeResult.unchanged) {
      if (!toValidateSet.has(file)) {
        const cached = cacheManager.get(file);
        if (cached) cachedResults.push(hydrateCachedResult(file, cached));
      }
    }

    incrementalStats = { changed: changeResult.changed.length + changeResult.newFiles.length, dependents: dependentRelative.length };
    // Note: Don't dispose analyzer here - content cache is still needed
  } else if (cacheManager) {
    // Standard caching with parallel file loading
    // Build graph first (parallel reads, populates content cache)
    const { ProjectAnalyzer } = await import('../../core/imports/analyzer.js');
    const analyzer = new ProjectAnalyzer(projectRoot);
    prebuiltGraph = await analyzer.buildImportGraph({
      include: effectiveSettings.include.length > 0 ? effectiveSettings.include : undefined,
      exclude: effectiveSettings.exclude.length > 0 ? effectiveSettings.exclude : undefined,
      archIgnore,
    });
    prebuiltContentCache = analyzer.getContentCache();

    // Use cached content to compute checksums (no re-reads)
    for (const file of files) {
      try {
        const absPath = path.resolve(projectRoot, file);
        const content = prebuiltContentCache.get(absPath) ?? await readFile(absPath);
        const checksum = computeChecksum(content);
        if (cacheManager.isValid(file, checksum)) {
          cachedResults.push(hydrateCachedResult(file, cacheManager.get(file)!));
        } else {
          filesToValidate.push(file);
        }
      } catch {
        filesToValidate.push(file);
      }
    }
  } else {
    filesToValidate.push(...files);
  }

  // Validate files that need it
  let projectResult: ProjectBatchValidationResult;
  if (filesToValidate.length > 0) {
    projectResult = await projectValidator.validateFiles(filesToValidate, {
      strict,
      severities,
      include: effectiveSettings.include.length > 0 ? effectiveSettings.include : undefined,
      exclude: effectiveSettings.exclude.length > 0 ? effectiveSettings.exclude : undefined,
      archIgnore,
      prebuiltGraph,
      prebuiltContentCache,
    });

    // Cache new results
    if (cacheManager) {
      for (const vr of projectResult.results) {
        try {
          const content = await readFile(`${projectRoot}/${vr.file}`);
          cacheManager.set(vr.file, createCacheEntry(vr, computeChecksum(content)));
        } catch { /* skip */ }
      }
    }
  } else {
    projectResult = {
      results: [],
      summary: { total: 0, passed: 0, failed: 0, warned: 0, totalErrors: 0, totalWarnings: 0, activeOverrides: 0 },
      projectStats: { graphBuildTimeMs: 0, filesInGraph: files.length, cyclesDetected: 0, cycles: [] },
    };
  }

  // Merge cached results with new results
  const allResults = [...cachedResults, ...projectResult.results];
  const mergedSummary = {
    total: allResults.length,
    passed: allResults.filter(r => r.status === 'pass').length,
    failed: allResults.filter(r => r.status === 'fail').length,
    warned: allResults.filter(r => r.status === 'warn').length,
    totalErrors: allResults.reduce((sum, r) => sum + r.errorCount, 0),
    totalWarnings: allResults.reduce((sum, r) => sum + r.warningCount, 0),
    activeOverrides: allResults.reduce((sum, r) => sum + r.overridesActive.length, 0),
  };

  const result: ProjectBatchValidationResult = { ...projectResult, results: allResults, summary: mergedSummary };
  let cacheStats: CacheStats | undefined;
  if (cacheManager) {
    cacheStats = cacheManager.getStats();
    await cacheManager.save();
  }

  projectValidator.dispose();
  return { result, projectStats: projectResult.projectStats, incrementalStats, cacheStats };
}

/** Alternative architecture suggestion. */
export interface ArchitectureSuggestion {
  archId: string;
  description?: string;
  constraintsRemoved: number;
  constraintsAdded: number;
  relationship: 'sibling' | 'parent' | 'child';
}

/**
 * Find alternative architectures that might resolve constraint violations.
 * Looks for any architecture that would remove the violated constraints.
 */
export function findAlternativeArchitectures(
  registry: Registry,
  currentArchId: string,
  violatedRules: string[]
): ArchitectureSuggestion[] {
  const suggestions: ArchitectureSuggestion[] = [];
  const nodes = registry.nodes as Record<string, ArchitectureNode>;

  // Get current architecture
  const current = nodes[currentArchId];
  if (!current) return [];

  const parentId = current.inherits;

  // Resolve current architecture constraints
  let currentConstraints: Set<string>;
  let currentViolatingConstraints: Set<string>;
  try {
    const currentRes = resolveArchitecture(registry, currentArchId);
    currentConstraints = new Set(currentRes.architecture.constraints.map(c => `${c.rule}:${formatConstraintValue(c.value)}`));
    // Track which constraints are being violated
    currentViolatingConstraints = new Set(
      currentRes.architecture.constraints
        .filter(c => violatedRules.includes(c.rule))
        .map(c => `${c.rule}:${formatConstraintValue(c.value)}`)
    );
  } catch {
    return [];
  }

  // Search all architectures for ones that would fix the violation
  for (const [archId, arch] of Object.entries(nodes)) {
    if (archId === currentArchId) continue;
    if (archId === 'base') continue;

    try {
      const altRes = resolveArchitecture(registry, archId);
      const altConstraints = new Set(altRes.architecture.constraints.map(c => `${c.rule}:${formatConstraintValue(c.value)}`));

      // Check if this architecture would remove the violating constraints
      const wouldRemoveViolations = [...currentViolatingConstraints].filter(c => !altConstraints.has(c));
      if (wouldRemoveViolations.length === 0) continue;

      // Count total constraints changes
      const removed = [...currentConstraints].filter(c => !altConstraints.has(c)).length;
      const added = [...altConstraints].filter(c => !currentConstraints.has(c)).length;

      // Determine relationship
      let relationship: 'sibling' | 'parent' | 'child' = 'sibling';
      if (arch.inherits === parentId) {
        relationship = 'sibling';
      } else if (archId === parentId) {
        relationship = 'parent';
      } else if (arch.inherits === currentArchId) {
        relationship = 'child';
      }

      suggestions.push({
        archId,
        description: arch.description,
        constraintsRemoved: removed,
        constraintsAdded: added,
        relationship,
      });
    } catch { /* skip */ }
  }

  // Sort by: fewest added constraints, then most removed
  return suggestions
    .sort((a, b) => {
      const netA = a.constraintsAdded - a.constraintsRemoved;
      const netB = b.constraintsAdded - b.constraintsRemoved;
      return netA - netB;
    })
    .slice(0, 3);
}

// formatConstraintValue imported from ../../utils/format.js
