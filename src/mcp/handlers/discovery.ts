/**
 * @arch archcodex.cli.mcp.handler
 *
 * MCP tool handlers for discovery operations (discover, resolve, neighborhood, diff-arch).
 */
import { resolve } from 'path';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry, getRegistryContent } from '../../core/registry/loader.js';
import { resolveArchitecture } from '../../core/registry/resolver.js';
import { loadPatternRegistry } from '../../core/patterns/loader.js';
import { NeighborhoodAnalyzer } from '../../core/neighborhood/analyzer.js';
import { loadIndex, matchQuery, checkIndexStaleness } from '../../core/discovery/index.js';
import { loadConcepts } from '../../core/discovery/concepts.js';
import { reindexAll } from '../../llm/reindexer.js';

// ============================================================================
// DISCOVER HANDLER
// ============================================================================

export interface DiscoverOptions {
  limit?: number;
  autoSync?: boolean;
}

export async function handleDiscover(projectRoot: string, query: string, options: DiscoverOptions = {}) {
  const config = await loadConfig(projectRoot);
  const shouldAutoSync = options.autoSync ?? config.discovery?.auto_sync ?? false;

  // Check staleness and optionally auto-sync
  const staleness = await checkIndexStaleness(projectRoot);
  let synced = false;

  if (staleness.isStale && shouldAutoSync) {
    const registry = await loadRegistry(projectRoot);
    const registryContent = await getRegistryContent(projectRoot);
    const indexPath = resolve(projectRoot, '.arch/index.yaml');
    await reindexAll(registry, indexPath, { auto: true, registryContent });
    synced = true;
  }

  const index = await loadIndex(projectRoot);

  // Load concepts for semantic matching (optional)
  const concepts = await loadConcepts(projectRoot);
  const results = matchQuery(index, query, {
    limit: options.limit ?? 5,
    concepts: concepts ?? undefined,
  });

  const response: Record<string, unknown> = {
    query,
    matches: results.map(r => ({
      archId: r.entry.arch_id,
      score: r.score,
      matchedKeywords: r.matchedKeywords,
      matchedConcept: r.matchedConcept, // Include concept match if present
      description: r.entry.description,
      suggestedPath: r.entry.suggested_path,
    })),
  };

  // Include staleness info if not auto-synced
  if (staleness.isStale && !synced) {
    response.warning = {
      message: 'Index is stale',
      reason: staleness.reason,
      missingArchIds: staleness.missingArchIds,
      hint: 'Use autoSync: true or run archcodex sync-index',
    };
  } else if (synced) {
    response.synced = true;
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response, null, 2),
    }],
  };
}

// ============================================================================
// RESOLVE HANDLER
// ============================================================================

export async function handleResolve(projectRoot: string, archId: string) {
  const registry = await loadRegistry(projectRoot);
  const result = resolveArchitecture(registry, archId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        archId: result.architecture.archId,
        inheritanceChain: result.architecture.inheritanceChain,
        appliedMixins: result.architecture.appliedMixins,
        constraints: result.architecture.constraints,
        hints: result.architecture.hints,
        pointers: result.architecture.pointers,
        conflicts: result.conflicts,
      }, null, 2),
    }],
  };
}

// ============================================================================
// NEIGHBORHOOD HANDLER
// ============================================================================

export async function handleNeighborhood(projectRoot: string, file: string) {
  const config = await loadConfig(projectRoot);
  const registry = await loadRegistry(projectRoot, config.registry);
  const patternRegistry = await loadPatternRegistry(projectRoot);

  const analyzer = new NeighborhoodAnalyzer(projectRoot, registry, config, patternRegistry);
  try {
    const neighborhood = await analyzer.analyze(file, { withPatterns: true });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(neighborhood, null, 2),
      }],
    };
  } finally {
    analyzer.dispose();
  }
}

// ============================================================================
// DIFF-ARCH HANDLER
// ============================================================================

export async function handleDiffArch(projectRoot: string, from: string, to: string) {
  const registry = await loadRegistry(projectRoot);

  const fromResult = resolveArchitecture(registry, from);
  const toResult = resolveArchitecture(registry, to);

  const fromConstraints = new Map(fromResult.architecture.constraints.map(c => [`${c.rule}:${c.value}`, c]));
  const toConstraints = new Map(toResult.architecture.constraints.map(c => [`${c.rule}:${c.value}`, c]));

  const added = toResult.architecture.constraints.filter(c => !fromConstraints.has(`${c.rule}:${c.value}`));
  const removed = fromResult.architecture.constraints.filter(c => !toConstraints.has(`${c.rule}:${c.value}`));

  const fromMixins = new Set(fromResult.architecture.appliedMixins);
  const toMixins = new Set(toResult.architecture.appliedMixins);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        from,
        to,
        constraints: {
          added: added.map(c => ({ rule: c.rule, value: c.value, severity: c.severity, why: c.why })),
          removed: removed.map(c => ({ rule: c.rule, value: c.value, severity: c.severity })),
        },
        mixins: {
          added: toResult.architecture.appliedMixins.filter(m => !fromMixins.has(m)),
          removed: fromResult.architecture.appliedMixins.filter(m => !toMixins.has(m)),
        },
      }, null, 2),
    }],
  };
}
