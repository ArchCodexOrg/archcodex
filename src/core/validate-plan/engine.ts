/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Plan validation engine - checks a proposed change set against architectural
 * constraints BEFORE execution. Catches violations during the planning phase.
 */
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import { loadConfig } from '../config/loader.js';
import { loadRegistry } from '../registry/loader.js';
import { resolveArchitecture } from '../registry/resolver.js';
import { globFiles, readFile } from '../../utils/file-system.js';
import { extractArchId } from '../arch-tag/parser.js';
import type { Config, LayerConfig } from '../config/schema.js';
import type { Registry } from '../registry/schema.js';
import type { FlattenedArchitecture } from '../registry/types.js';
import type {
  ProposedChange,
  PlanValidationInput,
  PlanViolation,
  PlanValidationResult,
} from './types.js';

/**
 * Build a cached map of file path → content for impact analysis.
 *
 * NOTE: archIgnore is intentionally NOT applied here. This cache is used to find
 * importers (files that depend on a target file). Even arch-ignored files can
 * import a target and would be impacted by a delete/modify — so we include all
 * source files for completeness.
 */
async function buildFileCache(projectRoot: string): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  try {
    const allFiles = await globFiles(['src/**/*.ts', 'src/**/*.tsx'], {
      cwd: projectRoot,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts'],
    });
    for (const file of allFiles) {
      try {
        const content = await readFile(file);
        const relativePath = path.relative(projectRoot, file);
        cache.set(relativePath, content);
      } catch { /* file read error */
        // Skip unreadable files
      }
    }
  } catch { /* glob pattern failed */
    // Glob failed, return empty cache
  }
  return cache;
}

/**
 * Validate a proposed plan against architectural constraints.
 */
export async function validatePlan(
  projectRoot: string,
  input: PlanValidationInput
): Promise<PlanValidationResult> {
  const config = await loadConfig(projectRoot);
  const registry = await loadRegistry(projectRoot);

  const violations: PlanViolation[] = [];
  const warnings: PlanViolation[] = [];
  const impactedFiles: string[] = [];

  // Validate all paths are within projectRoot
  for (const change of input.changes) {
    const resolved = path.resolve(projectRoot, change.path);
    if (!resolved.startsWith(projectRoot)) {
      violations.push({
        file: change.path,
        rule: 'path_traversal',
        detail: `Path "${change.path}" resolves outside project root`,
        severity: 'error',
      });
    }
    if (change.newPath) {
      const resolvedNew = path.resolve(projectRoot, change.newPath);
      if (!resolvedNew.startsWith(projectRoot)) {
        violations.push({
          file: change.newPath,
          rule: 'path_traversal',
          detail: `Path "${change.newPath}" resolves outside project root`,
          severity: 'error',
        });
      }
    }
  }

  // If any path traversal violations, return early
  if (violations.length > 0) {
    return {
      valid: false,
      violations,
      warnings,
      impactedFiles: [],
      stats: {
        filesChecked: input.changes.length,
        errorsFound: violations.length,
        warningsFound: 0,
        impactedFileCount: 0,
      },
    };
  }

  // Build file cache once for impact analysis (avoids re-reading all files per change)
  const needsImpactAnalysis = input.changes.some(c => c.action === 'modify' || c.action === 'delete');
  const fileCache = needsImpactAnalysis ? await buildFileCache(projectRoot) : new Map<string, string>();

  for (const change of input.changes) {
    switch (change.action) {
      case 'create':
        validateCreate(change, registry, config, violations, warnings);
        break;
      case 'modify':
        await validateModify(change, projectRoot, registry, config, violations, warnings, impactedFiles, fileCache);
        break;
      case 'delete':
        findImportersFromCache(projectRoot, change.path, impactedFiles, fileCache);
        break;
      case 'rename':
        validateRename(change, config, violations, warnings);
        break;
    }
  }

  const errorsFound = violations.length;
  const warningsFound = warnings.length;

  return {
    valid: errorsFound === 0,
    violations,
    warnings,
    impactedFiles: [...new Set(impactedFiles)],
    stats: {
      filesChecked: input.changes.length,
      errorsFound,
      warningsFound,
      impactedFileCount: new Set(impactedFiles).size,
    },
  };
}

/**
 * Format validation result as compact text.
 */
export function formatValidationResult(result: PlanValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('Plan validation: PASS');
  } else {
    lines.push('Plan validation: FAIL');
  }

  lines.push(`  ${result.stats.filesChecked} files checked, ${result.stats.errorsFound} errors, ${result.stats.warningsFound} warnings`);

  if (result.violations.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const v of result.violations) {
      lines.push(`  ${v.file}: ${v.rule} - ${v.detail}`);
      if (v.suggestion) {
        lines.push(`    fix: ${v.suggestion}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of result.warnings) {
      lines.push(`  ${w.file}: ${w.rule} - ${w.detail}`);
      if (w.suggestion) {
        lines.push(`    fix: ${w.suggestion}`);
      }
    }
  }

  if (result.impactedFiles.length > 0) {
    lines.push('');
    lines.push(`Impacted files (${result.impactedFiles.length}):`);
    for (const f of result.impactedFiles.slice(0, 10)) {
      lines.push(`  ${f}`);
    }
    if (result.impactedFiles.length > 10) {
      lines.push(`  ... and ${result.impactedFiles.length - 10} more`);
    }
  }

  return lines.join('\n');
}

// --- Internal validators ---

function validateCreate(
  change: ProposedChange,
  registry: Registry,
  config: Config,
  violations: PlanViolation[],
  warnings: PlanViolation[]
): void {
  // Check: archId is required for create
  if (!change.archId) {
    violations.push({
      file: change.path,
      rule: 'missing_arch_tag',
      detail: 'New files must specify an archId',
      severity: 'error',
      suggestion: 'Add archId to the proposed change. Run: archcodex discover "<description>"',
    });
    return;
  }

  // Check: archId exists in registry
  const result = resolveArchitecture(registry, change.archId);
  if (!result.architecture) {
    violations.push({
      file: change.path,
      rule: 'invalid_arch_id',
      detail: `Architecture "${change.archId}" not found in registry`,
      severity: 'error',
      suggestion: 'Run: archcodex resolve <archId> to check available architectures',
    });
    return;
  }

  // Validate imports and patterns against resolved constraints
  validateConstraints(change, result.architecture, config, violations, warnings);

  // Check: test file requirement
  checkTestRequirement(change, result.architecture, warnings);
}

async function validateModify(
  change: ProposedChange,
  projectRoot: string,
  registry: Registry,
  config: Config,
  violations: PlanViolation[],
  warnings: PlanViolation[],
  impactedFiles: string[],
  fileCache: Map<string, string>
): Promise<void> {
  // Try to read the existing file to get its archId
  let archId = change.archId;

  if (!archId) {
    // Check cache first, then fall back to reading the file
    const cachedContent = fileCache.get(change.path);
    if (cachedContent) {
      archId = extractArchId(cachedContent) ?? undefined;
    } else {
      try {
        const absolutePath = path.resolve(projectRoot, change.path);
        const content = await readFile(absolutePath);
        archId = extractArchId(content) ?? undefined;
      } catch { /* file does not exist yet */
        // File doesn't exist yet or can't be read
      }
    }
  }

  if (!archId) {
    warnings.push({
      file: change.path,
      rule: 'unknown_arch',
      detail: 'Cannot determine architecture for this file',
      severity: 'warning',
      suggestion: 'Specify archId in the change or ensure file has @arch tag',
    });
    return;
  }

  const result = resolveArchitecture(registry, archId);
  if (!result.architecture) return;

  validateConstraints(change, result.architecture, config, violations, warnings);

  // Find files that import this file using the cached file contents
  findImportersFromCache(projectRoot, change.path, impactedFiles, fileCache);
}

function validateRename(
  change: ProposedChange,
  config: Config,
  violations: PlanViolation[],
  warnings: PlanViolation[]
): void {
  if (!change.newPath) {
    violations.push({
      file: change.path,
      rule: 'missing_new_path',
      detail: 'Rename action requires newPath',
      severity: 'error',
    });
    return;
  }

  // Check: new path doesn't violate layer boundaries
  const layers = config.layers ?? [];
  const sourceLayer = findLayerForPath(change.path, layers);
  const targetLayer = findLayerForPath(change.newPath, layers);

  if (sourceLayer && targetLayer && sourceLayer.name !== targetLayer.name) {
    warnings.push({
      file: change.path,
      rule: 'layer_change',
      detail: `Rename moves file from layer "${sourceLayer.name}" to "${targetLayer.name}"`,
      severity: 'warning',
      suggestion: 'Verify the architecture tag is still appropriate for the new location',
    });
  }
}

function validateConstraints(
  change: ProposedChange,
  architecture: FlattenedArchitecture,
  config: Config,
  violations: PlanViolation[],
  warnings: PlanViolation[]
): void {
  // Check imports against forbid_import
  if (change.newImports && change.newImports.length > 0) {
    const forbiddenImports = getForbiddenImports(architecture);
    for (const imp of change.newImports) {
      for (const forbidden of forbiddenImports) {
        if (importMatchesForbidden(imp, forbidden.value)) {
          const severity = forbidden.severity === 'warning' ? 'warning' : 'error';
          const target = severity === 'warning' ? warnings : violations;
          target.push({
            file: change.path,
            rule: 'forbid_import',
            detail: `Import "${imp}" is forbidden`,
            severity,
            suggestion: forbidden.why,
            alternative: forbidden.alternative,
          });
        }
      }
    }

    // Check layer boundaries for imports
    const layers = config.layers ?? [];
    if (layers.length > 0) {
      checkLayerBoundaries(change.path, change.newImports, layers, violations);
    }
  }

  // Check code patterns against forbid_pattern
  if (change.codePatterns && change.codePatterns.length > 0) {
    const forbiddenPatterns = getForbiddenPatterns(architecture);
    for (const pattern of change.codePatterns) {
      for (const forbidden of forbiddenPatterns) {
        try {
          const regex = new RegExp(forbidden.value);
          if (regex.test(pattern)) {
            const severity = forbidden.severity === 'warning' ? 'warning' : 'error';
            const target = severity === 'warning' ? warnings : violations;
            target.push({
              file: change.path,
              rule: 'forbid_pattern',
              detail: `Code pattern matches forbidden pattern "${forbidden.value}"`,
              severity,
              suggestion: forbidden.why,
              alternative: forbidden.alternative,
            });
          }
        } catch { /* invalid regex in constraint */
          // Invalid regex in constraint, skip
        }
      }
    }
  }
}

/**
 * Check if an import matches a forbidden value using segment-aware matching.
 */
function importMatchesForbidden(imp: string, forbidden: string): boolean {
  // Exact match
  if (imp === forbidden) return true;
  // Package name match (e.g., "axios" matches "axios/retry" import)
  const segments = imp.split('/');
  if (segments[0] === forbidden) return true;
  // Scoped package match (e.g., "@foo/bar")
  if (segments.length >= 2 && `${segments[0]}/${segments[1]}` === forbidden) return true;
  return false;
}

interface ForbiddenEntry {
  value: string;
  severity?: string;
  why?: string;
  alternative?: string;
}

function getForbiddenImports(architecture: FlattenedArchitecture): ForbiddenEntry[] {
  const entries: ForbiddenEntry[] = [];
  for (const c of architecture.constraints) {
    if (c.rule === 'forbid_import' || c.rule === 'forbid_call') {
      const values = Array.isArray(c.value) ? c.value : [c.value];
      for (const v of values) {
        entries.push({
          value: String(v),
          severity: c.severity,
          why: c.why,
          alternative: c.alternative,
        });
      }
    }
  }
  return entries;
}

function getForbiddenPatterns(architecture: FlattenedArchitecture): ForbiddenEntry[] {
  const entries: ForbiddenEntry[] = [];
  for (const c of architecture.constraints) {
    if (c.rule === 'forbid_pattern') {
      const values = Array.isArray(c.value) ? c.value : [c.value];
      for (const v of values) {
        entries.push({
          value: String(v),
          severity: c.severity,
          why: c.why,
          alternative: c.alternative,
        });
      }
    }
  }
  return entries;
}

function checkTestRequirement(
  change: ProposedChange,
  architecture: FlattenedArchitecture,
  warnings: PlanViolation[]
): void {
  const requiresTest = architecture.constraints.some(
    c => c.rule === 'require_test_file'
  );
  const hasTestedMixin = architecture.appliedMixins.includes('tested');

  if (requiresTest || hasTestedMixin) {
    // Check if the file is itself a test file
    if (!change.path.includes('.test.') && !change.path.includes('.spec.')) {
      warnings.push({
        file: change.path,
        rule: 'require_test_file',
        detail: 'This architecture requires a companion test file',
        severity: 'warning',
        suggestion: `Add a test file: ${change.path.replace(/\.ts$/, '.test.ts')}`,
      });
    }
  }
}

function checkLayerBoundaries(
  filePath: string,
  imports: string[],
  layers: LayerConfig[],
  violations: PlanViolation[]
): void {
  const sourceLayer = findLayerForPath(filePath, layers);
  if (!sourceLayer) return;

  for (const imp of imports) {
    // Only check relative imports (not packages)
    if (!imp.startsWith('.') && !imp.startsWith('/') && !imp.startsWith('src/')) continue;

    // Resolve import path relative to file
    let resolvedImport: string;
    if (imp.startsWith('.')) {
      const dir = path.dirname(filePath);
      resolvedImport = path.normalize(path.join(dir, imp));
    } else {
      resolvedImport = imp;
    }

    const targetLayer = findLayerForPath(resolvedImport, layers);
    if (!targetLayer) continue;

    // Same layer is allowed
    if (sourceLayer.name === targetLayer.name) continue;

    // Check if import is permitted
    if (!sourceLayer.can_import.includes(targetLayer.name)) {
      violations.push({
        file: filePath,
        rule: 'layer_boundary',
        detail: `Layer "${sourceLayer.name}" cannot import from "${targetLayer.name}" (importing "${imp}")`,
        severity: 'error',
        suggestion: `Allowed layers: [${sourceLayer.can_import.join(', ')}]`,
      });
    }
  }
}

function findLayerForPath(filePath: string, layers: LayerConfig[]): LayerConfig | null {
  for (const layer of layers) {
    for (const pattern of layer.paths) {
      if (minimatch(filePath, pattern) || filePath.startsWith(pattern.replace('/**', '').replace('/*', ''))) {
        // Check exclusions
        const excluded = layer.exclude?.some(ex => minimatch(filePath, ex));
        if (!excluded) return layer;
      }
    }
  }
  return null;
}

/**
 * Find importers of a target file using the pre-built file cache.
 */
function findImportersFromCache(
  _projectRoot: string,
  targetFile: string,
  impactedFiles: string[],
  fileCache: Map<string, string>
): void {
  const targetBase = path.basename(targetFile, path.extname(targetFile));
  const targetWithoutExt = targetFile.replace(/\.(ts|tsx|js|jsx)$/, '');

  for (const [relativePath, content] of fileCache) {
    if (relativePath === targetFile) continue;

    // Check if file imports the target (by basename or relative path)
    if (content.includes(targetBase) &&
        (content.includes(`'${targetWithoutExt}`) ||
         content.includes(`"./${targetBase}`) ||
         content.includes(`'../${targetBase}`) ||
         content.includes(`from './${targetBase}`) ||
         content.includes(`/${targetBase}'`) ||
         content.includes(`/${targetBase}"`))) {
      impactedFiles.push(relativePath);
    }
  }
}
