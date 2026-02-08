/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Check subcommand - validate spec files against schema.
 */
import type { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import {
  loadSpecRegistry,
  loadSpecFile,
  validateSpecRegistry,
  formatValidationSummary,
} from '../../../core/spec/index.js';
import { globFiles } from '../../../utils/file-system.js';
import { logger } from '../../../utils/logger.js';

/**
 * Register the check subcommand on the spec command.
 */
export function registerCheckCommand(spec: Command): void {
  spec
    .command('check')
    .description('Validate spec files against schema and check references')
    .argument('[files...]', 'Spec files or patterns to validate (default: .arch/specs/**/*.yaml)')
    .option('--strict', 'Treat warnings as errors')
    .option('--json', 'Output in JSON format')
    .option('--quiet', 'Suppress non-essential output')
    .action(async (filePatterns: string[], options) => {
      const projectRoot = process.cwd();

      try {
        // Load the full registry first (for reference checking)
        const registry = await loadSpecRegistry(projectRoot);

        if (Object.keys(registry.nodes).length === 0) {
          if (!options.quiet) {
            logger.warn('No specs found in .arch/specs/ directory');
            console.log(chalk.yellow('\nTo get started with SpecCodex:'));
            console.log('  1. Create .arch/specs/_base.yaml with base spec definitions');
            console.log('  2. Create .arch/specs/_mixins.yaml with reusable mixins');
            console.log('  3. Add spec files for your functions');
          }
          process.exit(0);
        }

        // If specific files provided, validate them
        if (filePatterns.length > 0) {
          let hasErrors = false;

          for (const pattern of filePatterns) {
            const files = await globFiles([pattern], { cwd: projectRoot });

            for (const file of files) {
              const relPath = path.relative(projectRoot, file);
              const baseName = path.basename(file);

              // Skip fixture files - they have a different schema
              if (baseName === '_fixtures.yaml' || baseName === '_fixtures.yml') {
                if (!options.quiet) {
                  console.log(chalk.cyan(`○ ${relPath} (fixture file - use 'spec fixture --list' to validate)`));
                }
                continue;
              }

              const result = await loadSpecFile(file);

              if (options.json) {
                console.log(JSON.stringify(result, null, 2));
              } else {
                if (result.valid) {
                  console.log(chalk.green(`✓ ${relPath}`));
                  if (result.specs.length > 0 && !options.quiet) {
                    console.log(`  ${result.specs.length} spec(s): ${result.specs.map(s => s.specId).join(', ')}`);
                  }
                } else {
                  console.log(chalk.red(`✗ ${relPath}`));
                  hasErrors = true;
                  for (const err of result.errors) {
                    console.log(chalk.red(`  [${err.code}] ${err.message}`));
                  }
                }

                if (result.warnings.length > 0 && !options.quiet) {
                  for (const warn of result.warnings) {
                    console.log(chalk.yellow(`  [${warn.code}] ${warn.message}`));
                  }
                }
              }
            }
          }

          process.exit(hasErrors ? 1 : 0);
        }

        // Validate full registry
        const result = validateSpecRegistry(registry, {
          strict: options.strict,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatValidationSummary(result));
        }

        process.exit(result.valid ? 0 : 1);
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(error) }));
        } else {
          logger.error(`Spec check failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
