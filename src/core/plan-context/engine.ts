/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Plan context engine - builds optimized, scope-aware context for plan-mode agents.
 * Aggregates session context, layer boundaries, and canonical patterns into a single
 * deduplicated output optimized for token efficiency.
 */
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import { loadConfig } from '../config/loader.js';
import { loadRegistry } from '../registry/loader.js';
import { resolveArchitecture } from '../registry/resolver.js';
import { globFiles, readFile } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';
import { extractArchId } from '../arch-tag/parser.js';
import { loadPatternRegistry } from '../patterns/loader.js';
import type { Config } from '../config/schema.js';
import type { Registry } from '../registry/schema.js';
import type { FlattenedArchitecture, ResolvedConstraint } from '../registry/types.js';
import type {
  PlanContextScope,
  PlanContextResult,
  PlanArchitecture,
  SharedConstraints,
  CompactConstraint,
  LayerContext,
  ScopedPattern,
} from './types.js';

/**
 * Build plan context for a given scope.
 */
export async function getPlanContext(
  projectRoot: string,
  scope: PlanContextScope
): Promise<PlanContextResult> {
  const config = await loadConfig(projectRoot);
  const registry = await loadRegistry(projectRoot);
  const archIgnore = await loadArchIgnore(projectRoot);

  // Validate scope paths are within projectRoot
  for (const scopePath of scope.paths) {
    const resolved = path.resolve(projectRoot, scopePath);
    if (!resolved.startsWith(projectRoot)) {
      throw new Error(`Scope path "${scopePath}" resolves outside project root`);
    }
  }
  if (scope.targetFiles) {
    for (const file of scope.targetFiles) {
      const resolved = path.resolve(projectRoot, file);
      if (!resolved.startsWith(projectRoot)) {
        throw new Error(`File path "${file}" resolves outside project root`);
      }
    }
  }

  // Resolve scope to file list
  const files = await resolveScope(projectRoot, scope, config, archIgnore);

  // Extract architecture tags from files
  const { archToFiles, untaggedFiles } = await extractArchitectures(projectRoot, files);

  // Resolve each architecture and build compact representations
  const resolvedArchs = resolveArchitectures(archToFiles, registry);

  // Deduplicate constraints across architectures
  const { shared, uniquePerArch, totalConstraints, deduplicatedCount } =
    deduplicateConstraints(resolvedArchs);

  // Build PlanArchitecture entries
  const architectures = buildPlanArchitectures(resolvedArchs, uniquePerArch);

  // Detect layer context
  const layers = extractLayerContext(config, scope.paths);

  // Load relevant patterns
  const patterns = await loadScopedPatterns(projectRoot, resolvedArchs);

  return {
    scope,
    layers,
    shared,
    architectures,
    patterns,
    untaggedFiles,
    stats: {
      filesInScope: files.length,
      architecturesInScope: architectures.length,
      totalConstraints,
      deduplicatedConstraints: deduplicatedCount,
    },
  };
}

/**
 * Format plan context as compact markdown for agent consumption.
 */
export function formatPlanContextCompact(result: PlanContextResult): string {
  const lines: string[] = [];
  const { scope, layers, shared, architectures, patterns, untaggedFiles, stats } = result;

  // Header
  const scopeLabel = scope.paths.join(', ');
  lines.push(`# Plan Context: ${scopeLabel} (${stats.filesInScope} files, ${stats.architecturesInScope} archs)`);
  lines.push('');

  // Layer boundaries
  lines.push(`## Layer: ${layers.currentLayer}`);
  if (layers.canImport.length > 0) {
    lines.push(`can_import: [${layers.canImport.join(', ')}]`);
  }
  if (layers.importedBy.length > 0) {
    lines.push(`imported_by: [${layers.importedBy.join(', ')}]`);
  }
  lines.push('');

  // Shared constraints
  if (shared.global.length > 0) {
    lines.push('## Shared Constraints (all archs in scope)');
    for (const c of shared.global) {
      lines.push(formatCompactConstraint(c));
    }
    lines.push('');
  }

  // Per-architecture sections
  if (architectures.length > 0) {
    lines.push('## Architectures');
    lines.push('');
    for (const arch of architectures) {
      lines.push(`### ${arch.id} (${arch.fileCount} files)`);
      if (arch.filePaths.length > 0) {
        const fileNames = arch.filePaths.map(f => path.basename(f));
        lines.push(`files: ${fileNames.join(', ')}`);
      }
      if (arch.uniqueConstraints.length > 0) {
        for (const c of arch.uniqueConstraints) {
          lines.push(`unique: ${formatCompactConstraintInline(c)}`);
        }
      }
      if (arch.hints.length > 0) {
        lines.push(`hints: ${arch.hints.join('; ')}`);
      }
      if (arch.reference) {
        lines.push(`ref: ${arch.reference}`);
      }
      if (arch.filePattern || arch.defaultPath) {
        const parts: string[] = [];
        if (arch.filePattern) parts.push(arch.filePattern);
        if (arch.defaultPath) parts.push(`in ${arch.defaultPath}`);
        lines.push(`new_file: ${parts.join(' ')}`);
      }
      lines.push('');
    }
  }

  // Canonical patterns
  if (patterns.length > 0) {
    lines.push('## Patterns (use these, don\'t recreate)');
    for (const p of patterns) {
      lines.push(`- ${p.name}: ${p.path} [${p.exports.join(', ')}]`);
    }
    lines.push('');
  }

  // Untagged files
  if (untaggedFiles.length > 0) {
    lines.push(`## Untagged: ${untaggedFiles.length} files`);
    for (const f of untaggedFiles.slice(0, 5)) {
      lines.push(`  ${f}`);
    }
    if (untaggedFiles.length > 5) {
      lines.push(`  ... and ${untaggedFiles.length - 5} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// --- Internal helpers ---

interface ResolvedArchEntry {
  archId: string;
  files: string[];
  resolved: FlattenedArchitecture;
  constraints: ResolvedConstraint[];
}

// File extensions we recognize as source files (not directories)
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

function looksLikeFile(scopePath: string): boolean {
  return SOURCE_EXTENSIONS.some(ext => scopePath.endsWith(ext));
}

async function resolveScope(
  projectRoot: string,
  scope: PlanContextScope,
  config: Config,
  archIgnore: { ignores: (path: string) => boolean }
): Promise<string[]> {
  const excludePatterns = config.files?.scan?.exclude ?? [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.d.ts',
    '**/*.test.ts',
    '**/*.spec.ts',
  ];

  // Build glob patterns from scope
  const globPatterns: string[] = [];
  // Track which patterns are explicit files (for edge case fallback)
  const explicitFiles = new Set<string>();

  if (scope.targetFiles && scope.targetFiles.length > 0) {
    // Specific files provided via 'files' param - use them directly
    for (const file of scope.targetFiles) {
      globPatterns.push(file);
      explicitFiles.add(file);
    }
  }

  if (scope.paths.length > 0) {
    // Smart auto-detection: files vs directories vs globs
    for (const scopePath of scope.paths) {
      if (scopePath.includes('*')) {
        // Already a glob - use as-is
        globPatterns.push(scopePath);
      } else if (looksLikeFile(scopePath)) {
        // Looks like a file path - use directly (no expansion)
        globPatterns.push(scopePath);
        explicitFiles.add(scopePath);
      } else {
        // Looks like a directory - expand to find all source files
        const normalized = scopePath.replace(/\/$/, '');
        globPatterns.push(`${normalized}/**/*.ts`);
        globPatterns.push(`${normalized}/**/*.tsx`);
      }
    }
  }

  if (globPatterns.length === 0) {
    // Fallback to scan config
    const defaults = config.files?.scan?.include ?? ['**/*.ts', '**/*.tsx'];
    globPatterns.push(...defaults);
  }

  const allFiles: string[] = [];
  for (const pattern of globPatterns) {
    try {
      const matches = await globFiles(pattern, {
        cwd: projectRoot,
        absolute: true,
        ignore: excludePatterns,
      });
      allFiles.push(...matches);
    } catch (error: unknown) {
      // Edge case: we thought it was a file but it's actually a directory named "foo.ts/"
      // Retry with directory expansion
      const isDirectory = error && typeof error === 'object' && 'code' in error && error.code === 'EISDIR';
      const isExplicitFile = explicitFiles.has(pattern);
      if (isDirectory && isExplicitFile) {
        const dirMatches = await globFiles(`${pattern}/**/*.ts`, {
          cwd: projectRoot,
          absolute: true,
          ignore: excludePatterns,
        });
        allFiles.push(...dirMatches);
      } else {
        throw error;
      }
    }
  }

  const uniqueFiles = [...new Set(allFiles)];
  return uniqueFiles.filter(f => !archIgnore.ignores(path.relative(projectRoot, f)));
}

async function extractArchitectures(
  projectRoot: string,
  files: string[]
): Promise<{ archToFiles: Map<string, string[]>; untaggedFiles: string[] }> {
  const archToFiles = new Map<string, string[]>();
  const untaggedFiles: string[] = [];

  for (const file of files) {
    try {
      const content = await readFile(file);
      const archId = extractArchId(content);
      const relativePath = path.relative(projectRoot, file);

      if (archId) {
        const existing = archToFiles.get(archId) || [];
        existing.push(relativePath);
        archToFiles.set(archId, existing);
      } else {
        untaggedFiles.push(relativePath);
      }
    } catch { /* file read error */
      // Skip unreadable files
    }
  }

  return { archToFiles, untaggedFiles };
}

function resolveArchitectures(
  archToFiles: Map<string, string[]>,
  registry: Registry
): ResolvedArchEntry[] {
  const entries: ResolvedArchEntry[] = [];

  for (const [archId, files] of archToFiles) {
    const result = resolveArchitecture(registry, archId);
    if (result.architecture) {
      entries.push({
        archId,
        files,
        resolved: result.architecture,
        constraints: result.architecture.constraints,
      });
    }
  }

  // Sort by file count descending
  entries.sort((a, b) => b.files.length - a.files.length);
  return entries;
}

/**
 * Fingerprint a constraint for deduplication.
 */
function constraintFingerprint(c: ResolvedConstraint): string {
  const values = Array.isArray(c.value) ? [...c.value].sort() : [String(c.value)];
  return `${c.rule}:${values.join(',')}`;
}

function deduplicateConstraints(entries: ResolvedArchEntry[]): {
  shared: SharedConstraints;
  uniquePerArch: Map<string, CompactConstraint[]>;
  totalConstraints: number;
  deduplicatedCount: number;
} {
  if (entries.length === 0) {
    return {
      shared: { global: [] },
      uniquePerArch: new Map(),
      totalConstraints: 0,
      deduplicatedCount: 0,
    };
  }

  // Build fingerprint → set of archIds that have this constraint
  const fingerprintToArchs = new Map<string, Set<string>>();
  const fingerprintToConstraint = new Map<string, ResolvedConstraint>();

  let totalConstraints = 0;

  for (const entry of entries) {
    for (const constraint of entry.constraints) {
      totalConstraints++;
      const fp = constraintFingerprint(constraint);
      if (!fingerprintToArchs.has(fp)) {
        fingerprintToArchs.set(fp, new Set());
        fingerprintToConstraint.set(fp, constraint);
      }
      fingerprintToArchs.get(fp)!.add(entry.archId);
    }
  }

  const allArchCount = entries.length;
  const globalConstraints: CompactConstraint[] = [];
  const uniquePerArch = new Map<string, CompactConstraint[]>();

  // Initialize unique per arch
  for (const entry of entries) {
    uniquePerArch.set(entry.archId, []);
  }

  // Partition constraints
  for (const [fp, archIds] of fingerprintToArchs) {
    const constraint = fingerprintToConstraint.get(fp)!;
    const compact = toCompactConstraint(constraint);

    if (archIds.size === allArchCount) {
      // Global: shared by ALL architectures
      globalConstraints.push(compact);
    } else if (archIds.size === 1) {
      // Unique to one architecture
      const archId = [...archIds][0];
      uniquePerArch.get(archId)!.push(compact);
    }
    // Shared by 2+ (but not all) — skip to keep output compact
    // These aren't common enough to deduplicate in most scopes
  }

  const deduplicatedCount = globalConstraints.length * allArchCount;

  return {
    shared: { global: globalConstraints },
    uniquePerArch,
    totalConstraints,
    deduplicatedCount,
  };
}

function toCompactConstraint(c: ResolvedConstraint): CompactConstraint {
  const values = Array.isArray(c.value)
    ? c.value.map((v: unknown) => String(v))
    : [String(c.value)];

  return {
    rule: c.rule,
    values,
    why: c.why,
    alt: c.alternative,
  };
}

function buildPlanArchitectures(
  entries: ResolvedArchEntry[],
  uniquePerArch: Map<string, CompactConstraint[]>
): PlanArchitecture[] {
  return entries.map(entry => {
    const { resolved } = entry;

    // Extract hints (max 2, deduplicated)
    const hints: string[] = [];
    for (const hint of resolved.hints) {
      const text = typeof hint === 'string' ? hint : hint.text;
      if (text && !hints.includes(text)) {
        hints.push(text);
        if (hints.length >= 2) break;
      }
    }

    return {
      id: entry.archId,
      description: resolved.description,
      fileCount: entry.files.length,
      filePaths: entry.files,
      uniqueConstraints: uniquePerArch.get(entry.archId) ?? [],
      hints,
      mixins: resolved.appliedMixins,
      reference: resolved.reference_implementations?.[0],
      filePattern: resolved.file_pattern,
      defaultPath: resolved.default_path,
    };
  });
}

function extractLayerContext(config: Config, scopePaths: string[]): LayerContext {
  const layers = config.layers ?? [];

  if (layers.length === 0) {
    return { currentLayer: 'unknown', canImport: [], importedBy: [], layerMap: {} };
  }

  // Find which layer the scope paths belong to
  let currentLayer = 'unknown';
  for (const layer of layers) {
    for (const scopePath of scopePaths) {
      const normalizedScope = scopePath.replace(/\/$/, '').replace(/\/\*\*.*$/, '');
      for (const layerPath of layer.paths) {
        const normalizedLayer = layerPath.replace(/\/\*\*$/, '').replace(/\/$/, '');
        if (normalizedScope.startsWith(normalizedLayer) ||
            minimatch(normalizedScope, layerPath) ||
            minimatch(normalizedScope + '/file.ts', layerPath)) {
          currentLayer = layer.name;
          break;
        }
      }
      if (currentLayer !== 'unknown') break;
    }
    if (currentLayer !== 'unknown') break;
  }

  const currentLayerDef = layers.find(l => l.name === currentLayer);
  const canImport = currentLayerDef?.can_import ?? [];

  // Find layers that can import from the current layer
  const importedBy = layers
    .filter(l => l.can_import.includes(currentLayer))
    .map(l => l.name);

  // Build compact layer map
  const layerMap: Record<string, string[]> = {};
  for (const layer of layers) {
    layerMap[layer.name] = layer.can_import;
  }

  return { currentLayer, canImport, importedBy, layerMap };
}

async function loadScopedPatterns(
  projectRoot: string,
  entries: ResolvedArchEntry[]
): Promise<ScopedPattern[]> {
  const patternRegistry = await loadPatternRegistry(projectRoot);
  const scopedPatterns: ScopedPattern[] = [];

  // Collect all forbidden imports and required imports from architectures in scope
  const forbiddenImports = new Set<string>();
  const allConstraintValues = new Set<string>();

  for (const entry of entries) {
    for (const c of entry.constraints) {
      if (c.rule === 'forbid_import' || c.rule === 'forbid_call') {
        const values = Array.isArray(c.value) ? c.value : [c.value];
        values.forEach((v: unknown) => forbiddenImports.add(String(v)));
      }
      const values = Array.isArray(c.value) ? c.value : [c.value];
      values.forEach((v: unknown) => allConstraintValues.add(String(v).toLowerCase()));
    }
  }

  // Include patterns whose keywords overlap with constraint values or forbidden imports
  for (const [name, pattern] of Object.entries(patternRegistry.patterns)) {
    const keywords = pattern.keywords ?? [];
    const hasRelevantKeyword = keywords.some(k =>
      allConstraintValues.has(k.toLowerCase()) ||
      forbiddenImports.has(k.toLowerCase())
    );

    if (hasRelevantKeyword) {
      scopedPatterns.push({
        name,
        path: pattern.canonical,
        exports: pattern.exports ?? [],
        usage: pattern.usage ?? '',
      });
    }
  }

  return scopedPatterns;
}

function formatCompactConstraint(c: CompactConstraint): string {
  const ruleLabel = c.rule.replace('forbid_', 'forbid: ').replace('require_', 'require: ').replace('_import', '').replace('_pattern', '_pat');
  let line = `- ${ruleLabel}: ${c.values.join(', ')}`;
  if (c.alt) {
    line += ` | alt: ${c.alt}`;
  }
  return line;
}

function formatCompactConstraintInline(c: CompactConstraint): string {
  const ruleShort = c.rule.replace('forbid_', '').replace('require_', 'req:');
  let line = `${ruleShort}: ${c.values.join(', ')}`;
  if (c.alt) {
    line += ` | alt: ${c.alt}`;
  }
  return line;
}
