/**
 * @arch archcodex.core.domain
 * @intent:spec-infrastructure
 *
 * Find specs that are not wired to implementations.
 * Implementation of spec.speccodex.drift.unwired
 */
import type { SpecRegistry, SpecNode } from '../schema.js';

/**
 * Options for finding unwired specs.
 */
export interface FindUnwiredOptions {
  /** Include base/abstract specs (default: false) */
  includeBase?: boolean;
  /** Filter to specs matching pattern */
  pattern?: string;
}

/**
 * Information about an unwired spec.
 */
export interface UnwiredSpec {
  /** Spec ID */
  specId: string;
  /** Whether this is a base/abstract spec */
  isBase: boolean;
  /** Suggested implementation path */
  suggestedPath?: string;
  /** Whether spec has examples (more valuable to wire) */
  hasExamples: boolean;
}

/**
 * Coverage statistics.
 */
export interface WiringCoverage {
  /** Total number of specs */
  total: number;
  /** Number of wired specs */
  wired: number;
  /** Number of unwired specs */
  unwired: number;
  /** Coverage percentage (0-100) */
  percentage: number;
}

/**
 * Result of finding unwired specs.
 */
export interface FindUnwiredResult {
  /** List of unwired specs */
  unwired: UnwiredSpec[];
  /** Coverage statistics */
  coverage: WiringCoverage;
}

/**
 * Check if a spec is a base/abstract spec.
 * Base specs define structure for other specs to inherit.
 *
 * Priority:
 * 1. Explicit type: base field (Improvement #10)
 * 2. Explicit type: test field (test fixtures don't need implementations)
 * 3. Inherits from spec.type or spec.test (schema/test definitions)
 * 4. Heuristic: has required_fields (defines structure)
 * 5. Heuristic: no intent and no examples (abstract template)
 */
function isBaseSpec(node: SpecNode): boolean {
  // Explicit type field takes precedence (Improvement #10)
  if (node.type === 'base' || node.type === 'test') {
    return true;
  }
  if (node.type === 'leaf') {
    return false;
  }

  // Specs inheriting from spec.type or spec.test are definitions, not implementations
  if (node.inherits === 'spec.type' || node.inherits === 'spec.test') {
    return true;
  }

  // Fall back to heuristics for specs without explicit type
  // Base specs typically have required_fields or no intent
  if (node.required_fields && node.required_fields.length > 0) {
    return true;
  }
  // Specs without intent that have inherits are abstract
  if (!node.intent && !node.examples) {
    return true;
  }
  return false;
}

/**
 * Generate a suggested implementation path from spec ID.
 * e.g., spec.product.create -> src/product/create.ts
 */
function suggestImplementationPath(specId: string): string {
  // Remove 'spec.' prefix
  const parts = specId.replace(/^spec\./, '').split('.');

  // Handle common patterns
  if (parts.length === 1) {
    return `src/${parts[0]}.ts`;
  }

  if (parts.length === 2) {
    return `src/${parts[0]}/${parts[1]}.ts`;
  }

  // For longer paths, use folder structure
  const filename = parts.pop();
  return `src/${parts.join('/')}/${filename}.ts`;
}

/**
 * Check if spec ID matches a pattern.
 * Supports simple glob-like patterns with *.
 */
function matchesPattern(specId: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(specId);
}

/**
 * Find specs that are not wired to implementations.
 *
 * Scans the spec registry for specs missing the `implementation` field.
 * By default, excludes base/abstract specs that don't need implementations.
 *
 * @param registry - Loaded spec registry
 * @param options - Filter options
 * @returns List of unwired specs and coverage statistics
 *
 * @example
 * ```typescript
 * const registry = await loadSpecRegistry(projectRoot);
 * const { unwired, coverage } = findUnwiredSpecs(registry);
 *
 * logger.info(`Coverage: ${coverage.percentage}%`);
 * for (const spec of unwired) {
 *   logger.info(`- ${spec.specId} (suggested: ${spec.suggestedPath})`);
 * }
 * ```
 */
export function findUnwiredSpecs(
  registry: SpecRegistry,
  options: FindUnwiredOptions = {}
): FindUnwiredResult {
  const { includeBase = false, pattern } = options;

  const unwired: UnwiredSpec[] = [];
  let totalCount = 0;
  let wiredCount = 0;

  for (const [specId, node] of Object.entries(registry.nodes)) {
    // Apply pattern filter if provided
    if (pattern && !matchesPattern(specId, pattern)) {
      continue;
    }

    const isBase = isBaseSpec(node);

    // Skip base specs unless explicitly included
    if (isBase && !includeBase) {
      continue;
    }

    totalCount++;

    // Check if spec has implementation
    if (node.implementation) {
      wiredCount++;
      continue;
    }

    // Spec is unwired
    unwired.push({
      specId,
      isBase,
      suggestedPath: suggestImplementationPath(specId),
      hasExamples: Boolean(
        node.examples?.success?.length ||
        node.examples?.errors?.length ||
        node.examples?.boundaries?.length
      ),
    });
  }

  const unwiredCount = totalCount - wiredCount;
  const percentage = totalCount > 0
    ? Math.round((wiredCount / totalCount) * 1000) / 10
    : 100;

  return {
    unwired,
    coverage: {
      total: totalCount,
      wired: wiredCount,
      unwired: unwiredCount,
      percentage,
    },
  };
}

/**
 * Format unwired specs as a report string.
 */
export function formatUnwiredReport(result: FindUnwiredResult): string {
  const lines: string[] = [];

  lines.push(`Spec Wiring Coverage: ${result.coverage.percentage}%`);
  lines.push(`  Wired: ${result.coverage.wired}/${result.coverage.total}`);
  lines.push(`  Unwired: ${result.coverage.unwired}`);
  lines.push('');

  if (result.unwired.length === 0) {
    lines.push('All specs are wired to implementations.');
    return lines.join('\n');
  }

  lines.push('Unwired specs:');
  lines.push('');

  // Sort by whether they have examples (more valuable first)
  const sorted = [...result.unwired].sort((a, b) => {
    if (a.hasExamples !== b.hasExamples) {
      return a.hasExamples ? -1 : 1;
    }
    return a.specId.localeCompare(b.specId);
  });

  for (const spec of sorted) {
    const marker = spec.hasExamples ? '[has examples]' : '';
    const base = spec.isBase ? '[base]' : '';
    lines.push(`  - ${spec.specId} ${marker}${base}`);
    if (spec.suggestedPath) {
      lines.push(`    suggested: ${spec.suggestedPath}`);
    }
  }

  return lines.join('\n');
}
