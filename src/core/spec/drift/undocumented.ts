/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Find implementation files without corresponding specs.
 * Implementation of spec.speccodex.drift.undocumented
 */
import * as path from 'node:path';
import type { SpecRegistry } from '../schema.js';
import { globFiles, readFile } from '../../../utils/file-system.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Options for finding undocumented implementations.
 */
export interface FindUndocumentedOptions {
  /** Glob patterns for implementation files */
  patterns?: string[];
  /** Glob patterns to exclude */
  exclude?: string[];
}

/**
 * Information about an implementation file without a spec.
 */
export interface UndocumentedFile {
  /** Relative file path from project root */
  path: string;
  /** Exported names found via regex scan */
  exports: string[];
  /** Suggested spec ID derived from file path */
  suggestedSpecId: string;
  /** Architecture type from @arch tag, if found */
  archType?: string;
}

/**
 * Summary statistics for undocumented scan.
 */
export interface UndocumentedSummary {
  /** Total files scanned */
  filesScanned: number;
  /** Files referenced by at least one spec */
  filesWithSpecs: number;
  /** Files not referenced by any spec */
  filesWithoutSpecs: number;
}

/**
 * Result of finding undocumented implementations.
 */
export interface FindUndocumentedResult {
  /** List of files without specs */
  undocumented: UndocumentedFile[];
  /** Scan statistics */
  summary: UndocumentedSummary;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_PATTERNS = ['src/**/*.ts'];
const DEFAULT_EXCLUDE = [
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/*.d.ts',
  '**/node_modules/**',
  '**/dist/**',
];

// ─── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Build a set of file paths that are referenced by spec implementation fields.
 */
function buildCoveredFilesSet(registry: SpecRegistry): Set<string> {
  const covered = new Set<string>();
  for (const node of Object.values(registry.nodes)) {
    if (node.implementation) {
      const filePath = node.implementation.split('#')[0];
      covered.add(path.normalize(filePath));
    }
  }
  return covered;
}

/**
 * Extract exported names from source code via regex.
 * No AST parsing (ts-morph is forbidden in core.domain).
 */
function extractExports(content: string): string[] {
  const exports: string[] = [];
  const patterns = [
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /export\s+const\s+(\w+)/g,
    /export\s+class\s+(\w+)/g,
    /export\s+interface\s+(\w+)/g,
    /export\s+type\s+(\w+)/g,
    /export\s+enum\s+(\w+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) exports.push(match[1]);
    }
  }
  return [...new Set(exports)];
}

/**
 * Extract @arch tag from source code.
 */
function extractArchTag(content: string): string | undefined {
  const match = content.match(/@arch\s+([a-zA-Z0-9_.]+)/);
  return match?.[1];
}

/**
 * Suggest a spec ID from a file path.
 * Reverse of suggestImplementationPath in unwired.ts.
 *
 * Examples:
 *   src/core/spec/drift/unwired.ts -> spec.core.spec.drift.unwired
 *   src/utils/helpers.ts -> spec.utils.helpers
 *   src/index.ts -> spec.index
 */
function suggestSpecId(filePath: string): string {
  const cleaned = filePath
    .replace(/^src\//, '')
    .replace(/^convex\//, '')
    .replace(/\.ts$/, '');
  const parts = cleaned.split('/');
  // Remove trailing 'index' for cleaner IDs
  if (parts.length > 1 && parts[parts.length - 1] === 'index') {
    parts.pop();
  }
  return 'spec.' + parts.join('.');
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Find implementation files that have no corresponding spec.
 *
 * Scans the project for TypeScript files and checks whether any spec's
 * `implementation` field references them. Files not referenced by any
 * spec are reported as undocumented.
 *
 * @param projectRoot - Absolute path to project root
 * @param registry - Loaded spec registry
 * @param options - Scan options (patterns, exclusions)
 * @returns List of undocumented files and summary statistics
 *
 * @example
 * ```typescript
 * const registry = await loadSpecRegistry(projectRoot);
 * const result = await findUndocumentedImplementations(projectRoot, registry);
 *
 * for (const file of result.undocumented) {
 *   logger.info(`${file.path} -> suggested: ${file.suggestedSpecId}`);
 * }
 * ```
 */
export async function findUndocumentedImplementations(
  projectRoot: string,
  registry: SpecRegistry,
  options: FindUndocumentedOptions = {}
): Promise<FindUndocumentedResult> {
  if (!projectRoot) {
    throw new Error('MISSING_PROJECTROOT: projectRoot is required');
  }

  const patterns = options.patterns || DEFAULT_PATTERNS;
  const exclude = options.exclude || DEFAULT_EXCLUDE;

  // Build set of files already covered by specs
  const coveredFiles = buildCoveredFilesSet(registry);

  // Scan project for implementation files
  const absolutePaths = await globFiles(patterns, {
    cwd: projectRoot,
    ignore: exclude,
  });

  const undocumented: UndocumentedFile[] = [];
  let filesWithSpecs = 0;

  for (const absPath of absolutePaths) {
    const relPath = path.relative(projectRoot, absPath);
    const normalizedRel = path.normalize(relPath);

    if (coveredFiles.has(normalizedRel)) {
      filesWithSpecs++;
      continue;
    }

    // File is not covered by any spec — analyze it
    let content: string;
    try {
      content = await readFile(absPath);
    } catch { /* file read error */
      // Skip unreadable files
      continue;
    }

    const exports = extractExports(content);
    const archType = extractArchTag(content);

    // Skip files with no exports (likely internal/private)
    if (exports.length === 0) {
      continue;
    }

    undocumented.push({
      path: relPath,
      exports,
      suggestedSpecId: suggestSpecId(relPath),
      ...(archType ? { archType } : {}),
    });
  }

  return {
    undocumented,
    summary: {
      filesScanned: absolutePaths.length,
      filesWithSpecs,
      filesWithoutSpecs: undocumented.length,
    },
  };
}

// ─── Formatter ───────────────────────────────────────────────────────────────

/**
 * Format undocumented implementations as a report string.
 */
export function formatUndocumentedReport(result: FindUndocumentedResult): string {
  const lines: string[] = [];
  const { summary } = result;

  const coverage = summary.filesScanned > 0
    ? Math.round((summary.filesWithSpecs / summary.filesScanned) * 1000) / 10
    : 100;

  lines.push(`Implementation Coverage: ${coverage}%`);
  lines.push(`  Scanned: ${summary.filesScanned} files`);
  lines.push(`  With specs: ${summary.filesWithSpecs}`);
  lines.push(`  Without specs: ${summary.filesWithoutSpecs}`);
  lines.push('');

  if (result.undocumented.length === 0) {
    lines.push('All implementation files have corresponding specs.');
    return lines.join('\n');
  }

  lines.push('Undocumented implementations:');
  lines.push('');

  // Sort by path
  const sorted = [...result.undocumented].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  for (const file of sorted) {
    const archTag = file.archType ? ` [${file.archType}]` : '';
    const exportCount = file.exports.length;
    lines.push(`  - ${file.path}${archTag} (${exportCount} export${exportCount !== 1 ? 's' : ''})`);
    lines.push(`    suggested spec: ${file.suggestedSpecId}`);
  }

  return lines.join('\n');
}
