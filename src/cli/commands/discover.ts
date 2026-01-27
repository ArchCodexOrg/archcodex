/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'path';
import {
  loadIndex,
  matchQuery,
  getAllEntries,
  checkIndexStaleness,
  decisionTreeExists,
} from '../../core/discovery/index.js';
import { loadConcepts } from '../../core/discovery/concepts.js';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry, getRegistryContent } from '../../core/registry/loader.js';
import { reindexAll } from '../../llm/reindexer.js';
import { logger as log } from '../../utils/logger.js';

/**
 * Create the discover command.
 */
export function createDiscoverCommand(): Command {
  return new Command('discover')
    .description('Find architecture patterns matching a description or intent')
    .argument('[query]', 'Natural language description (e.g., "payment processor")')
    .option('-l, --list', 'List all available architectures')
    .option('--limit <n>', 'Maximum results to show', '5')
    .option('--json', 'Output as JSON')
    .option('--auto-sync', 'Automatically sync index if stale (or set discovery.auto_sync in config)')
    .action(async (query: string | undefined, options: DiscoverOptions) => {
      try {
        await runDiscover(query, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface DiscoverOptions {
  list?: boolean;
  limit: string;
  json?: boolean;
  autoSync?: boolean;
}

async function runDiscover(
  query: string | undefined,
  options: DiscoverOptions
): Promise<void> {
  const projectRoot = process.cwd();

  // Load config for auto_sync setting
  const config = await loadConfig(projectRoot);
  const shouldAutoSync = options.autoSync || config.discovery?.auto_sync;

  // Load index
  let index = await loadIndex(projectRoot);

  if (index.entries.length === 0) {
    log.warn('No entries in index.yaml. Run `archcodex init` to create one.');
    return;
  }

  // Check for stale index
  const staleness = await checkIndexStaleness(projectRoot);
  if (staleness.isStale) {
    if (shouldAutoSync) {
      // Auto-sync the index
      if (!options.json) {
        log.info('Index is stale, syncing...');
      }
      const registry = await loadRegistry(projectRoot);
      const registryContent = await getRegistryContent(projectRoot);
      const indexPath = resolve(projectRoot, '.arch/index.yaml');
      await reindexAll(registry, indexPath, { auto: true, registryContent });

      // Reload index after sync
      index = await loadIndex(projectRoot);
      if (!options.json) {
        log.success('Index synced successfully');
        console.log();
      }
    } else if (!options.json) {
      // Show improved warning message
      const reasonText = formatStalenessReason(staleness.reason);
      log.warn(`Discovery index is stale (${reasonText})`);
      if (staleness.missingArchIds?.length) {
        console.log(chalk.dim(`  ${staleness.missingArchIds.length} architecture(s) not in index`));
      }
      console.log(chalk.dim('  Run: archcodex sync-index'));
      console.log(chalk.dim('  Or use: archcodex discover --auto-sync'));
      console.log();
    }
  }

  // For JSON output with stale index, include staleness info
  if (options.json && staleness.isStale && !shouldAutoSync) {
    // Will be included in results
  }

  // List mode
  if (options.list) {
    if (options.json) {
      console.log(JSON.stringify(getAllEntries(index), null, 2));
      return;
    }

    console.log();
    console.log(chalk.bold('Available Architectures:'));
    console.log();

    for (const entry of index.entries) {
      console.log(`  ${chalk.cyan(entry.arch_id)}`);
      if (entry.description) {
        console.log(`    ${chalk.dim(entry.description)}`);
      }
      console.log(`    Keywords: ${entry.keywords.join(', ')}`);
      console.log();
    }
    return;
  }

  // Query mode
  if (!query) {
    log.error('Please provide a query or use --list to see all architectures');
    process.exit(1);
  }

  const parsedLimit = parseInt(options.limit, 10);
  const limit = isNaN(parsedLimit) || parsedLimit < 1 ? 5 : parsedLimit;

  // Load concepts for semantic matching (optional - falls back to keyword if not present)
  const concepts = await loadConcepts(projectRoot);
  const results = matchQuery(index, query, { limit, concepts: concepts ?? undefined });

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log();
    console.log(chalk.yellow('No matching architectures found.'));
    console.log(chalk.dim('Try different keywords or use --list to see available options.'));
    return;
  }

  console.log();
  console.log(chalk.bold(`Matching Architectures for: "${query}"`));
  console.log();

  for (let i = 0; i < results.length; i++) {
    const { entry, score, matchedKeywords, matchedConcept } = results[i];
    const rank = i + 1;
    const scorePercent = Math.round(score * 100);

    console.log(`  ${chalk.bold(`${rank}.`)} ${chalk.cyan(entry.arch_id)} ${chalk.dim(`(${scorePercent}% match)`)}`);
    if (entry.description) {
      console.log(`     ${entry.description}`);
    }
    if (matchedConcept) {
      console.log(`     ${chalk.green('✓ Concept:')} ${matchedConcept} ${chalk.dim(`(${matchedKeywords.join(', ')})`)}`);
    } else {
      console.log(`     ${chalk.dim('Matched:')} ${matchedKeywords.join(', ')}`);
    }
    if (entry.suggested_path) {
      console.log(`     ${chalk.dim('Path:')} ${entry.suggested_path}`);
    }
    console.log();
  }

  // Only show scaffold command if we have results (bounds check)
  if (results.length > 0) {
    console.log(chalk.dim(`Use: archcodex scaffold ${results[0].entry.arch_id} --name <ClassName>`));
  }

  // Suggest decision tree if available
  const hasTree = await decisionTreeExists(projectRoot);
  if (hasTree) {
    console.log();
    console.log(chalk.dim(`Tip: Use "archcodex decide" for guided architecture selection`));
  }
}

/**
 * Format staleness reason for human-readable output.
 */
function formatStalenessReason(reason: string | undefined): string {
  switch (reason) {
    case 'checksum_mismatch':
      return 'registry modified';
    case 'missing_architectures':
      return 'new architectures added';
    case 'no_checksum':
      return 'legacy index format';
    case 'no_index':
      return 'no index file';
    default:
      return 'out of sync';
  }
}
