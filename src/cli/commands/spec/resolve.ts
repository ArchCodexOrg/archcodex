/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Resolve subcommand - expand spec with inheritance and mixins.
 */
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  loadSpecRegistry,
  resolveSpec,
  formatSpecForLLM,
} from '../../../core/spec/index.js';
import { logger } from '../../../utils/logger.js';

/**
 * Register the resolve subcommand on the spec command.
 */
export function registerResolveCommand(spec: Command): void {
  spec
    .command('resolve')
    .description('Resolve a spec ID to its fully flattened form')
    .argument('<specId>', 'Spec ID to resolve (e.g., spec.product.create)')
    .option('--json', 'Output in JSON format')
    .option('--no-mixins', 'Do not expand mixins')
    .option('--no-inherits', 'Do not resolve inheritance')
    .action(async (specId: string, options) => {
      const projectRoot = process.cwd();

      try {
        const registry = await loadSpecRegistry(projectRoot);

        if (Object.keys(registry.nodes).length === 0) {
          logger.error('No specs found in .arch/specs/ directory');
          process.exit(1);
        }

        const result = resolveSpec(registry, specId, {
          expandMixins: options.mixins !== false,
          resolveInherits: options.inherits !== false,
        });

        if (!result.valid) {
          if (options.json) {
            console.log(JSON.stringify({ valid: false, errors: result.errors }));
          } else {
            logger.error(`Failed to resolve spec '${specId}':`);
            for (const err of result.errors) {
              console.log(chalk.red(`  [${err.code}] ${err.message}`));
            }
          }
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(result.spec, null, 2));
        } else {
          // Output LLM-friendly format
          console.log(formatSpecForLLM(result.spec!));
        }
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(error) }));
        } else {
          logger.error(`Spec resolve failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
