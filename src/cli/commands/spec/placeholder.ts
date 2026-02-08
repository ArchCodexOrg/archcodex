/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Placeholder subcommand - test and list @ placeholder expansion.
 */
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  expandPlaceholder,
  listPlaceholders,
  isPlaceholderError,
} from '../../../core/spec/index.js';

/**
 * Register the placeholder subcommand on the spec command.
 */
export function registerPlaceholderCommand(spec: Command): void {
  spec
    .command('placeholder')
    .description('Expand or list @ placeholders')
    .argument('[value]', 'Placeholder to expand (e.g., @string(100))')
    .option('--list', 'List all supported placeholders')
    .option('--json', 'Output in JSON format')
    .action(async (value: string | undefined, options) => {
      if (options.list) {
        const placeholders = listPlaceholders();
        if (options.json) {
          console.log(JSON.stringify(placeholders, null, 2));
        } else {
          console.log(chalk.bold('Supported Placeholders:'));
          console.log('');
          for (const p of placeholders) {
            console.log(`  ${chalk.cyan(p.placeholder)}`);
            console.log(`    ${chalk.dim(p.description)}`);
            console.log(`    Example: ${p.example}`);
            console.log('');
          }
        }
        return;
      }

      if (!value) {
        console.log(chalk.yellow('Usage: archcodex spec placeholder <value>'));
        console.log(chalk.dim('Example: archcodex spec placeholder "@string(100)"'));
        console.log(chalk.dim('Use --list to see all supported placeholders'));
        return;
      }

      const result = expandPlaceholder(value);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (isPlaceholderError(result)) {
          console.log(chalk.red(`Error: ${result.message}`));
          process.exit(1);
        } else {
          console.log(chalk.bold('Expanded:'));
          console.log(`  Type: ${result.type}`);
          if (result.value !== undefined) {
            const valueStr = typeof result.value === 'string' && result.value.length > 50
              ? result.value.slice(0, 50) + '...'
              : String(result.value);
            console.log(`  Value: ${valueStr}`);
          }
          if (result.asserts) {
            console.log(`  Asserts: ${result.asserts}`);
          }
          if (result.pattern) {
            console.log(`  Pattern: ${result.pattern}`);
          }
        }
      }
    });
}
