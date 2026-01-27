/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * sync-index command - Synchronize discovery index with registry.
 */

import { Command } from 'commander';
import { resolve } from 'path';
import chalk from 'chalk';
import { loadRegistry, getRegistryContent } from '../../core/registry/loader.js';
import {
  checkIndexStaleness,
  getStalenessMessage,
} from '../../core/discovery/staleness.js';
import { reindexAll } from '../../llm/reindexer.js';
import { loadConcepts, validateConcepts } from '../../core/discovery/concepts.js';
import { logger } from '../../utils/logger.js';

/**
 * Create the sync-index command.
 */
export function createSyncIndexCommand(): Command {
  return new Command('sync-index')
    .description('Synchronize discovery index with registry')
    .option('--check', 'Only check if index is stale (exit 1 if stale)')
    .option('--force', 'Regenerate all keywords even if checksum matches')
    .option('--quiet', 'Suppress non-essential output')
    .option('--json', 'Output result as JSON')
    .action(async (options) => {
      try {
        const projectRoot = process.cwd();

        // Check staleness
        const staleness = await checkIndexStaleness(projectRoot);

        // JSON output mode
        if (options.json) {
          console.log(JSON.stringify({
            isStale: staleness.isStale,
            reason: staleness.reason,
            missingArchIds: staleness.missingArchIds,
            currentChecksum: staleness.currentChecksum,
            storedChecksum: staleness.storedChecksum,
          }, null, 2));

          if (options.check) {
            process.exit(staleness.isStale ? 1 : 0);
          }
          return;
        }

        // Check-only mode
        if (options.check) {
          if (staleness.isStale) {
            if (!options.quiet) {
              console.log(chalk.yellow('✗ ') + getStalenessMessage(staleness));
              if (staleness.missingArchIds?.length) {
                console.log(chalk.gray(`  Missing: ${staleness.missingArchIds.join(', ')}`));
              }
            }
            process.exit(1);
          } else {
            if (!options.quiet) {
              console.log(chalk.green('✓ ') + 'Index is up to date.');
            }
            process.exit(0);
          }
        }

        // Sync mode: update the index if stale or forced
        if (!staleness.isStale && !options.force) {
          if (!options.quiet) {
            console.log(chalk.green('✓ ') + 'Index is already up to date.');
          }
          process.exit(0);
        }

        if (!options.quiet) {
          if (options.force) {
            console.log(chalk.cyan('Regenerating index (forced)...'));
          } else {
            console.log(chalk.cyan('Synchronizing index...'));
            console.log(chalk.gray(`  Reason: ${staleness.reason}`));
          }
        }

        // Load registry and its content for checksum
        const registryContent = await getRegistryContent(projectRoot);
        const registry = await loadRegistry(projectRoot);

        // Reindex using auto mode (deterministic, no LLM)
        const indexPath = resolve(projectRoot, '.arch/index.yaml');
        const summary = await reindexAll(registry, indexPath, {
          auto: true,
          registryContent,
        });

        if (!options.quiet) {
          const count = summary.results.filter(r => r.keywords.length > 0).length;
          console.log(chalk.green('✓ ') + `Index synchronized (${count} architectures)`);
          if (staleness.missingArchIds?.length) {
            console.log(chalk.gray(`  Added: ${staleness.missingArchIds.join(', ')}`));
          }
        }

        // Validate concepts.yaml references after sync
        const concepts = await loadConcepts(projectRoot);
        if (concepts) {
          const validArchIds = new Set(Object.keys(registry.nodes));
          const validation = validateConcepts(concepts, validArchIds);

          if (!validation.valid && !options.quiet) {
            console.log();
            console.log(chalk.yellow('⚠ ') + 'Concepts validation warnings:');
            for (const ref of validation.invalidReferences) {
              console.log(chalk.gray(`  • "${ref.conceptName}" references unknown architecture: ${ref.archId}`));
            }
            if (validation.orphanedConcepts.length > 0) {
              console.log(chalk.gray(`  • Orphaned concepts (no valid architectures): ${validation.orphanedConcepts.join(', ')}`));
            }
            console.log(chalk.dim('  Run `archcodex garden --concepts` to regenerate concepts'));
          }
        }

        process.exit(0);
      } catch (error) {
        if (!options.quiet) {
          logger.error(
            'Failed to sync index',
            error instanceof Error ? error : undefined
          );
        }
        process.exit(1);
      }
    });
}
