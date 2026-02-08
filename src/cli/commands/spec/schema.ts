/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Schema subcommand - show spec schema documentation.
 */
import type { Command } from 'commander';
import {
  getSpecSchema,
  formatSchemaDoc,
  type SchemaFilter,
} from '../../../core/spec/index.js';
import { logger } from '../../../utils/logger.js';

/**
 * Register the schema subcommand on the spec command.
 */
export function registerSchemaCommand(spec: Command): void {
  spec
    .command('schema')
    .description('Show spec schema documentation for writing specs')
    .option('--filter <type>', 'Filter: all, fields, inputs, examples, placeholders, effects, base-specs', 'all')
    .option('--examples', 'Include YAML examples')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      try {
        const result = getSpecSchema({
          filter: options.filter as SchemaFilter,
          examples: options.examples,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatSchemaDoc(result));
        }
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(error) }));
        } else {
          logger.error(`Schema lookup failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
