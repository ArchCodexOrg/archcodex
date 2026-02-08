/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Doc subcommand - generate documentation from specs.
 */
import type { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import {
  loadSpecRegistry,
  listSpecIds,
  resolveSpec,
  generateApiDocs,
  generateExampleDocs,
  generateErrorDocs,
  generateAllDocs,
} from '../../../core/spec/index.js';
import { logger } from '../../../utils/logger.js';
import { resolveOutputPath } from './types.js';

/**
 * Register the doc subcommand on the spec command.
 */
export function registerDocCommand(spec: Command): void {
  spec
    .command('doc')
    .description('Generate documentation from a spec')
    .argument('[specId]', 'Spec ID to generate docs for')
    .option('--type <type>', 'Doc type: api, examples, errors, all', 'all')
    .option('-o, --output <path>', 'Output file path')
    .option('--all', 'Generate docs for all specs')
    .option('--dry-run', 'Preview without writing files')
    .option('--no-toc', 'Exclude table of contents')
    .option('--no-examples', 'Exclude code examples in API docs')
    .option('--json', 'Output in JSON format')
    .action(async (specId: string | undefined, options: {
      type?: 'api' | 'examples' | 'errors' | 'all';
      output?: string;
      all?: boolean;
      dryRun?: boolean;
      toc?: boolean;
      examples?: boolean;
      json?: boolean;
    }) => {
      const projectRoot = process.cwd();

      try {
        const registry = await loadSpecRegistry(projectRoot);

        if (Object.keys(registry.nodes).length === 0) {
          if (options.json) {
            console.log(JSON.stringify({ error: 'No specs found' }));
          } else {
            logger.error('No specs found in .arch/specs/ directory');
          }
          process.exit(1);
        }

        // Handle --all flag
        if (options.all) {
          const specIds = listSpecIds(registry);
          const results: Array<{ specId: string; file?: string; error?: string }> = [];

          for (const id of specIds) {
            const resolved = resolveSpec(registry, id);
            if (!resolved.valid || !resolved.spec) {
              results.push({ specId: id, error: resolved.errors[0]?.message || 'Failed to resolve' });
              continue;
            }

            // Skip base specs without examples
            if (resolved.spec.node.type === 'base') continue;

            const docResult = generateAllDocs(resolved.spec, {
              includeToc: options.toc !== false,
              includeExamples: options.examples !== false,
            });

            if (docResult.valid && options.output) {
              const fileName = id.replace(/\./g, '-') + '.md';
              const outputPath = path.join(options.output, fileName);

              if (!options.dryRun) {
                const fs = await import('node:fs/promises');
                await fs.mkdir(path.dirname(outputPath), { recursive: true });
                await fs.writeFile(outputPath, docResult.markdown);
              }
              results.push({ specId: id, file: outputPath });
            } else if (docResult.valid) {
              results.push({ specId: id });
            }
          }

          if (options.json) {
            console.log(JSON.stringify({ specs: results }, null, 2));
          } else {
            console.log(chalk.bold(`Generated documentation for ${results.filter(r => !r.error).length} specs`));
            if (options.output) {
              console.log(chalk.dim(`Output directory: ${options.output}`));
            }
          }
          return;
        }

        // Single spec
        if (!specId) {
          if (options.json) {
            console.log(JSON.stringify({ error: 'Spec ID required (or use --all)' }));
          } else {
            logger.error('Spec ID required. Use: spec doc <specId> or spec doc --all');
          }
          process.exit(1);
        }

        // Resolve the spec
        const resolved = resolveSpec(registry, specId);
        if (!resolved.valid || !resolved.spec) {
          if (options.json) {
            console.log(JSON.stringify({ valid: false, errors: resolved.errors }));
          } else {
            logger.error(`Failed to resolve spec '${specId}':`);
            for (const err of resolved.errors) {
              console.log(chalk.red(`  [${err.code}] ${err.message}`));
            }
          }
          process.exit(1);
        }

        // Generate docs based on type
        const docOptions = {
          includeToc: options.toc !== false,
          includeExamples: options.examples !== false,
        };

        let result;
        switch (options.type) {
          case 'api':
            result = generateApiDocs(resolved.spec, docOptions);
            break;
          case 'examples':
            result = generateExampleDocs(resolved.spec, docOptions);
            break;
          case 'errors':
            result = generateErrorDocs(resolved.spec, docOptions);
            break;
          case 'all':
          default:
            result = generateAllDocs(resolved.spec, docOptions);
        }

        if (!result.valid) {
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            logger.error('Failed to generate documentation:');
            for (const err of result.errors) {
              console.log(chalk.red(`  [${err.code}] ${err.message}`));
            }
          }
          process.exit(1);
        }

        // Output
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (options.dryRun) {
          console.log(chalk.bold('Would generate:'));
          console.log('');
          console.log(result.markdown);
        } else if (options.output) {
          const fs = await import('node:fs/promises');
          const outputFile = await resolveOutputPath(options.output, specId, 'docs');
          await fs.writeFile(outputFile, result.markdown);
          console.log(chalk.green(`Written to: ${outputFile}`));
        } else {
          console.log(result.markdown);
        }
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(error) }));
        } else {
          logger.error(`Documentation generation failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
