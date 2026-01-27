/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Auto-indexing engine for generating discovery keywords.
 */

import { readFile, writeFile } from 'fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { LLMProvider, ReindexRequest } from './types.js';
import { createProviderFromSettings, getAvailableProvider } from './providers/index.js';
import { PromptProvider } from './providers/prompt.js';
import type { Registry } from '../core/registry/schema.js';
import type { LLMSettings } from '../core/config/schema.js';
import type { ArchConfig } from '../utils/archconfig.js';
import { extractKeywords } from '../core/discovery/keyword-extractor.js';
import { computeChecksum } from '../utils/checksum.js';

export interface ReindexOptions {
  provider?: LLMProvider;
  outputPrompt?: boolean;
  dryRun?: boolean;
  llmSettings?: LLMSettings;
  archConfig?: ArchConfig;
  /** Use deterministic keyword extraction (no LLM required) */
  auto?: boolean;
  /** Content of registry.yaml for checksum computation */
  registryContent?: string;
}

export interface ReindexResult {
  archId: string;
  keywords: string[];
  promptOutput?: string;
  error?: string;
}

export interface ReindexSummary {
  results: ReindexResult[];
  indexPath?: string;
  updated: boolean;
}

/**
 * Generate keywords for an architecture.
 */
export async function reindexArchitecture(
  archId: string,
  registry: Registry,
  options: ReindexOptions = {}
): Promise<ReindexResult> {
  const node = registry.nodes[archId];

  if (!node) {
    return {
      archId,
      keywords: [],
      error: `Architecture '${archId}' not found in registry`,
    };
  }

  // Auto mode: use deterministic keyword extraction (no LLM)
  if (options.auto) {
    const keywords = extractKeywords(archId, node);
    return {
      archId,
      keywords,
    };
  }

  // Convert hints to strings for the reindex request
  const hintStrings = node.hints?.map(h => typeof h === 'string' ? h : h.text);

  const request: ReindexRequest = {
    archId,
    description: node.description || archId,
    hints: hintStrings,
    constraints: node.constraints?.map(c => `${c.rule}: ${c.value}`),
  };

  // Handle prompt mode
  if (options.outputPrompt || options.provider === 'prompt') {
    const promptProvider = new PromptProvider();
    const promptOutput = promptProvider.formatReindexPrompt(request);

    return {
      archId,
      keywords: [],
      promptOutput,
    };
  }

  // Get LLM provider
  const provider = options.provider
    ? createProviderFromSettings(options.provider, options.llmSettings, options.archConfig)
    : getAvailableProvider(undefined, options.llmSettings, options.archConfig);

  if (!provider.isAvailable()) {
    const promptProvider = new PromptProvider();
    const promptOutput = promptProvider.formatReindexPrompt(request);

    return {
      archId,
      keywords: [],
      promptOutput,
    };
  }

  const response = await provider.generateKeywords(request);

  return {
    archId,
    keywords: response.keywords,
  };
}

/**
 * Reindex all architectures and update index.yaml.
 */
export async function reindexAll(
  registry: Registry,
  indexPath: string,
  options: ReindexOptions = {}
): Promise<ReindexSummary> {
  const results: ReindexResult[] = [];

  // Process each architecture
  for (const archId of Object.keys(registry.nodes)) {
    const result = await reindexArchitecture(archId, registry, options);
    results.push(result);
  }

  if (options.dryRun || options.outputPrompt) {
    return {
      results,
      indexPath,
      updated: false,
    };
  }

  // Update index.yaml
  const hasKeywords = results.some(r => r.keywords.length > 0);
  if (hasKeywords) {
    // Compute checksum from registry content if provided
    const checksum = options.registryContent
      ? computeChecksum(options.registryContent)
      : undefined;
    await updateIndexFile(indexPath, results, registry, checksum);
  }

  return {
    results,
    indexPath,
    updated: hasKeywords,
  };
}

/**
 * Update the index.yaml file with new keywords.
 */
async function updateIndexFile(
  indexPath: string,
  results: ReindexResult[],
  registry: Registry,
  registryChecksum?: string
): Promise<void> {
  let existingIndex: {
    version: string;
    registry_checksum?: string;
    entries: Array<{
      arch_id: string;
      keywords: string[];
      description?: string;
      suggested_path?: string;
      suggested_name?: string;
    }>;
  };

  try {
    const content = await readFile(indexPath, 'utf-8');
    existingIndex = parseYaml(content);
  } catch {
    existingIndex = { version: '1.0', entries: [] };
  }

  // Create a map of existing entries
  const entryMap = new Map(
    existingIndex.entries.map(e => [e.arch_id, e])
  );

  // Update/add entries with new keywords
  for (const result of results) {
    if (result.keywords.length === 0) continue;

    const existing = entryMap.get(result.archId);
    const node = registry.nodes[result.archId];

    if (existing) {
      // Replace keywords with freshly generated ones
      existing.keywords = result.keywords;
    } else {
      // Add new entry
      entryMap.set(result.archId, {
        arch_id: result.archId,
        keywords: result.keywords,
        description: node?.description || result.archId,
      });
    }
  }

  // Remove stale entries not in the current registry
  const registryArchIds = new Set(Object.keys(registry.nodes));
  for (const archId of entryMap.keys()) {
    if (!registryArchIds.has(archId)) {
      entryMap.delete(archId);
    }
  }

  // Write updated index with checksum
  const updatedIndex: {
    version: string;
    registry_checksum?: string;
    entries: Array<{
      arch_id: string;
      keywords: string[];
      description?: string;
      suggested_path?: string;
      suggested_name?: string;
    }>;
  } = {
    version: existingIndex.version,
    entries: Array.from(entryMap.values()),
  };

  // Add checksum if provided
  if (registryChecksum) {
    updatedIndex.registry_checksum = registryChecksum;
  }

  const yamlContent = stringifyYaml(updatedIndex, {
    lineWidth: 100,
    defaultStringType: 'QUOTE_DOUBLE',
  });

  const header = `# ArchCodex Discovery Index
#
# WARNING: Do not edit this file manually!
# Run \`archcodex sync-index\` to regenerate this file from the registry.
# Run \`archcodex reindex <arch-id>\` to update keywords for a specific architecture.

`;
  await writeFile(indexPath, header + yamlContent);
}

/**
 * Format reindex results for display.
 */
export function formatReindexResult(result: ReindexResult): string {
  const lines: string[] = [];

  lines.push(`Architecture: ${result.archId}`);

  if (result.error) {
    lines.push(`Error: ${result.error}`);
    return lines.join('\n');
  }

  if (result.promptOutput) {
    lines.push(result.promptOutput);
    return lines.join('\n');
  }

  if (result.keywords.length > 0) {
    lines.push(`Keywords: ${result.keywords.join(', ')}`);
  } else {
    lines.push('No keywords generated');
  }

  return lines.join('\n');
}

/**
 * Format reindex summary for display.
 */
export function formatReindexSummary(summary: ReindexSummary): string {
  const lines: string[] = [];

  lines.push('═'.repeat(60));
  lines.push('REINDEX SUMMARY');
  lines.push('═'.repeat(60));
  lines.push('');

  const withKeywords = summary.results.filter(r => r.keywords.length > 0);
  const withPrompts = summary.results.filter(r => r.promptOutput);
  const withErrors = summary.results.filter(r => r.error);

  lines.push(`Total architectures: ${summary.results.length}`);
  lines.push(`Keywords generated: ${withKeywords.length}`);
  if (withPrompts.length > 0) {
    lines.push(`Prompts output: ${withPrompts.length}`);
  }
  if (withErrors.length > 0) {
    lines.push(`Errors: ${withErrors.length}`);
  }
  lines.push('');

  if (summary.updated) {
    lines.push(`Updated: ${summary.indexPath}`);
  }

  // Show prompts if any
  for (const result of withPrompts) {
    lines.push('');
    lines.push('─'.repeat(60));
    lines.push(result.promptOutput!);
  }

  return lines.join('\n');
}
