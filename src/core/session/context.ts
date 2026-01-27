/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Session context engine - builds architecture summaries for AI agent context priming.
 * Shared logic used by both CLI command and MCP server.
 */
import * as path from 'node:path';
import { loadConfig } from '../config/loader.js';
import { loadRegistry } from '../registry/loader.js';
import { resolveArchitecture } from '../registry/resolver.js';
import { globFiles, readFile } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';
import { extractArchId } from '../arch-tag/parser.js';
import { loadPatternRegistry } from '../patterns/loader.js';
import type { Registry } from '../registry/schema.js';
import type { FlattenedArchitecture } from '../registry/types.js';
import type { PatternRegistry } from '../patterns/types.js';

export interface ArchitectureSummary {
  archId: string;
  description?: string;
  files: string[];
  fileCount: number;
  forbid: string[];
  patterns: string[];
  require: string[];
  hints: string[];
  mixins: string[];
}

export interface CanonicalPatternSummary {
  name: string;
  canonical: string;
  exports: string[];
  usage?: string;
}

export interface SharedConstraintGroup {
  /** Constraint values shared by all architectures */
  values: string[];
  /** The rule type (forbid, pattern, require, hint) */
  type: 'forbid' | 'pattern' | 'require' | 'hint';
}

export interface LayerBoundary {
  /** Layer name */
  name: string;
  /** Layers this layer can import from */
  canImport: string[];
}

export interface SessionContextResult {
  projectRoot: string;
  filesScanned: number;
  architecturesInScope: ArchitectureSummary[];
  untaggedFiles: string[];
  canonicalPatterns?: CanonicalPatternSummary[];
  /** Shared constraints (when deduplicate=true) */
  sharedConstraints?: SharedConstraintGroup[];
  /** Layer boundaries (when withLayers=true) */
  layers?: LayerBoundary[];
}

export interface SessionContextOptions {
  compact?: boolean;
  withPatterns?: boolean;
  /** Deduplicate shared constraints across architectures */
  deduplicate?: boolean;
  /** Include layer boundary map */
  withLayers?: boolean;
  /** Filter to specific directory paths */
  scope?: string[];
}

/**
 * Get session context programmatically (for MCP, CLI, and other integrations).
 */
export async function getSessionContext(
  projectRoot: string,
  patterns: string[],
  options: SessionContextOptions = {}
): Promise<SessionContextResult> {
  const config = await loadConfig(projectRoot);

  const filePatterns = patterns.length > 0
    ? patterns
    : config.files?.scan?.include ?? ['**/*.ts', '**/*.tsx'];
  const registry = await loadRegistry(projectRoot);
  const archIgnore = await loadArchIgnore(projectRoot);

  const excludePatterns = config.files?.scan?.exclude ?? [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/*.d.ts',
    '**/*.test.ts',
    '**/*.spec.ts',
  ];

  const allFiles: string[] = [];
  for (const pattern of filePatterns) {
    const matches = await globFiles(pattern, {
      cwd: projectRoot,
      absolute: true,
      ignore: excludePatterns,
    });
    allFiles.push(...matches);
  }

  const uniqueFiles = [...new Set(allFiles)];
  let files = uniqueFiles.filter(f => !archIgnore.ignores(path.relative(projectRoot, f)));

  // Apply scope filtering if provided
  if (options.scope && options.scope.length > 0) {
    files = files.filter(f => {
      const rel = path.relative(projectRoot, f);
      return options.scope!.some(s => rel.startsWith(s.replace(/\/$/, '')));
    });
  }

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
    } catch {
      // Skip files that can't be read
    }
  }

  const architecturesInScope: ArchitectureSummary[] = [];

  for (const [archId, archFiles] of archToFiles) {
    const summary = buildArchitectureSummary(archId, archFiles, registry);
    architecturesInScope.push(summary);
  }

  architecturesInScope.sort((a, b) => b.fileCount - a.fileCount);

  let canonicalPatterns: CanonicalPatternSummary[] | undefined;
  if (options.withPatterns) {
    const patternRegistry = await loadPatternRegistry(projectRoot);
    canonicalPatterns = buildPatternSummaries(patternRegistry);
  }

  // Deduplicate shared constraints if requested
  let sharedConstraints: SharedConstraintGroup[] | undefined;
  if (options.deduplicate && architecturesInScope.length > 1) {
    sharedConstraints = deduplicateSessionConstraints(architecturesInScope);
  }

  // Add layer boundaries if requested
  let layers: LayerBoundary[] | undefined;
  if (options.withLayers) {
    layers = (config.layers ?? []).map(l => ({
      name: l.name,
      canImport: l.can_import,
    }));
  }

  return {
    projectRoot,
    filesScanned: files.length,
    architecturesInScope,
    untaggedFiles,
    canonicalPatterns,
    sharedConstraints,
    layers,
  };
}

export function buildArchitectureSummary(
  archId: string,
  files: string[],
  registry: Registry
): ArchitectureSummary {
  const result = resolveArchitecture(registry, archId);
  const resolved: FlattenedArchitecture | null = result.architecture;

  const forbid: string[] = [];
  const patterns: string[] = [];
  const require: string[] = [];
  const hints: string[] = [];

  if (resolved) {
    for (const constraint of resolved.constraints) {
      if (constraint.rule === 'forbid_import' || constraint.rule === 'forbid_call') {
        const values = Array.isArray(constraint.value) ? constraint.value : [constraint.value];
        forbid.push(...values.map((v: unknown) => String(v)));
      } else if (constraint.rule === 'forbid_pattern') {
        const values = Array.isArray(constraint.value) ? constraint.value : [constraint.value];
        patterns.push(...values.map((v: unknown) => String(v)));
      } else if (constraint.rule === 'require_import' || constraint.rule === 'require_decorator') {
        const values = Array.isArray(constraint.value) ? constraint.value : [constraint.value];
        require.push(...values.map((v: unknown) => String(v)));
      }
    }

    for (const hint of resolved.hints) {
      if (typeof hint === 'string') {
        hints.push(hint);
      } else if (hint.text) {
        hints.push(hint.text);
      }
    }
  }

  return {
    archId,
    description: resolved?.description,
    files,
    fileCount: files.length,
    forbid: [...new Set(forbid)],
    patterns: [...new Set(patterns)],
    require: [...new Set(require)],
    hints,
    mixins: resolved?.appliedMixins ?? [],
  };
}

export function buildPatternSummaries(registry: PatternRegistry): CanonicalPatternSummary[] {
  const summaries: CanonicalPatternSummary[] = [];

  for (const [name, pattern] of Object.entries(registry.patterns)) {
    summaries.push({
      name,
      canonical: pattern.canonical,
      exports: pattern.exports ?? [],
      usage: pattern.usage,
    });
  }

  return summaries;
}

/**
 * Extract shared constraints and remove them from individual architecture summaries.
 *
 * NOTE: This function intentionally mutates the `architectures` entries — it removes
 * shared values from each architecture's forbid/patterns/require/hints arrays so that
 * the caller can display per-architecture entries without duplicating shared constraints.
 * The caller (`getSessionContext`) uses the mutated entries directly in its result.
 */
function deduplicateSessionConstraints(
  architectures: ArchitectureSummary[]
): SharedConstraintGroup[] {
  const shared: SharedConstraintGroup[] = [];

  // Find forbid values shared by ALL architectures
  const sharedForbid = findSharedValues(architectures.map(a => a.forbid));
  if (sharedForbid.length > 0) {
    shared.push({ type: 'forbid', values: sharedForbid });
    for (const arch of architectures) {
      arch.forbid = arch.forbid.filter(v => !sharedForbid.includes(v));
    }
  }

  // Find pattern values shared by ALL architectures
  const sharedPatterns = findSharedValues(architectures.map(a => a.patterns));
  if (sharedPatterns.length > 0) {
    shared.push({ type: 'pattern', values: sharedPatterns });
    for (const arch of architectures) {
      arch.patterns = arch.patterns.filter(v => !sharedPatterns.includes(v));
    }
  }

  // Find require values shared by ALL architectures
  const sharedRequire = findSharedValues(architectures.map(a => a.require));
  if (sharedRequire.length > 0) {
    shared.push({ type: 'require', values: sharedRequire });
    for (const arch of architectures) {
      arch.require = arch.require.filter(v => !sharedRequire.includes(v));
    }
  }

  // Deduplicate hints: extract hints present in ALL architectures into shared,
  // keep unique hints per-architecture
  const sharedHints = findSharedValues(architectures.map(a => a.hints));
  if (sharedHints.length > 0) {
    shared.push({ type: 'hint', values: sharedHints });
    for (const arch of architectures) {
      arch.hints = arch.hints.filter(h => !sharedHints.includes(h));
    }
  }

  return shared;
}

/**
 * Find values present in ALL arrays.
 */
function findSharedValues(arrays: string[][]): string[] {
  if (arrays.length === 0) return [];
  const first = new Set(arrays[0]);
  return [...first].filter(v =>
    arrays.every(arr => arr.includes(v))
  );
}
