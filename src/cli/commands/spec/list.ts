/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * List subcommand - list all specs in the registry.
 */
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  loadSpecRegistry,
  listSpecIds,
  listSpecMixinIds,
} from '../../../core/spec/index.js';
import { logger } from '../../../utils/logger.js';

/**
 * Register the list subcommand on the spec command.
 */
export function registerListCommand(spec: Command): void {
  spec
    .command('list')
    .description('List all specs in the registry')
    .option('--json', 'Output in JSON format')
    .option('--mixins', 'Also list mixins')
    .action(async (options) => {
      const projectRoot = process.cwd();

      try {
        const registry = await loadSpecRegistry(projectRoot);

        const specIds = listSpecIds(registry);
        const mixinIds = options.mixins ? listSpecMixinIds(registry) : [];

        if (options.json) {
          console.log(JSON.stringify({ specs: specIds, mixins: mixinIds }));
        } else {
          if (specIds.length === 0) {
            console.log(chalk.yellow('No specs found'));
          } else {
            console.log(chalk.bold('Specs:'));
            for (const id of specIds.sort()) {
              const node = registry.nodes[id];
              const inherits = node.inherits ? chalk.dim(` (inherits: ${node.inherits})`) : '';
              console.log(`  ${id}${inherits}`);
            }
          }

          if (options.mixins && mixinIds.length > 0) {
            console.log('');
            console.log(chalk.bold('Mixins:'));
            for (const id of mixinIds.sort()) {
              console.log(`  ${id}`);
            }
          }

          console.log('');
          console.log(chalk.dim(`Total: ${specIds.length} specs, ${mixinIds.length} mixins`));
        }
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(error) }));
        } else {
          logger.error(`Spec list failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
