/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Generate subcommand - generate tests from specs.
 */
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  loadSpecRegistry,
  loadFixtures,
  resolveSpec,
  generateUnitTests,
  generatePropertyTests,
  generateIntegrationTests,
  generateUITests,
  type UITestFramework,
} from '../../../core/spec/index.js';
import { logger } from '../../../utils/logger.js';
import { resolveOutputPath } from './types.js';

/**
 * Register the generate subcommand on the spec command.
 */
export function registerGenerateCommand(spec: Command): void {
  spec
    .command('generate')
    .description('Generate tests from a spec')
    .argument('<specId>', 'Spec ID to generate tests from')
    .option('--type <type>', 'Test type: unit, property, integration, ui', 'unit')
    .option('--framework <framework>', 'Test framework: vitest, jest, playwright, cypress, testing-library', 'vitest')
    .option('--output <path>', 'Output file path')
    .option('--no-markers', 'Do not add regeneration markers')
    .option('--num-runs <n>', 'Number of property test runs (default: 100)')
    .option('--seed <n>', 'Seed for reproducible property tests')
    .option('--setup-helpers <path>', 'Path to test setup helpers (for integration tests)')
    .option('--accessibility <plugin>', 'Accessibility plugin for UI tests: axe, none', 'none')
    .option('--base-selector <selector>', 'Base CSS selector for UI tests')
    .option('--component-name <name>', 'Component name for UI test describe block')
    .option('--dry-run', 'Preview generated tests without writing to file')
    .option('--json', 'Output in JSON format')
    .action(async (specId: string, options) => {
      const projectRoot = process.cwd();

      try {
        const registry = await loadSpecRegistry(projectRoot);

        // Load fixtures for placeholder resolution in generated tests
        const fixtureRegistry = await loadFixtures(projectRoot);

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

        // Generate tests based on type
        if (options.type === 'unit') {
          const resolvedOutputPath = options.output
            ? await resolveOutputPath(options.output, specId, 'unit')
            : undefined;

          const result = generateUnitTests(resolved.spec, {
            framework: options.framework,
            markers: options.markers !== false,
            fixtureRegistry,
            outputPath: resolvedOutputPath,
          });

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (!result.valid) {
              logger.error('Failed to generate tests:');
              for (const err of result.errors) {
                console.log(chalk.red(`  [${err.code}] ${err.message}`));
              }
              process.exit(1);
            }

            console.log(chalk.bold(`Generated ${result.testCount} test(s) from ${specId}`));
            console.log('');
            console.log(result.code);

            if (resolvedOutputPath && !options.dryRun) {
              const fs = await import('node:fs/promises');
              await fs.writeFile(resolvedOutputPath, result.code);
              console.log('');
              console.log(chalk.green(`Written to: ${resolvedOutputPath}`));
            } else if (options.dryRun && options.output) {
              console.log('');
              console.log(chalk.yellow(`[dry-run] Would write to: ${options.output}`));
            }
          }
        } else if (options.type === 'property') {
          const resolvedOutputPath = options.output
            ? await resolveOutputPath(options.output, specId, 'property')
            : undefined;

          const result = generatePropertyTests(resolved.spec, {
            numRuns: options.numRuns ? parseInt(options.numRuns, 10) : 100,
            seed: options.seed ? parseInt(options.seed, 10) : undefined,
            markers: options.markers !== false,
            outputPath: resolvedOutputPath,
          });

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (!result.valid) {
              logger.error('Failed to generate property tests:');
              for (const err of result.errors) {
                console.log(chalk.red(`  [${err.code}] ${err.message}`));
              }
              process.exit(1);
            }

            console.log(chalk.bold(`Generated ${result.propertyCount} property test(s) from ${specId}`));
            console.log('');
            console.log(result.code);

            if (resolvedOutputPath && !options.dryRun) {
              const fs = await import('node:fs/promises');
              await fs.writeFile(resolvedOutputPath, result.code);
              console.log('');
              console.log(chalk.green(`Written to: ${resolvedOutputPath}`));
            } else if (options.dryRun && options.output) {
              console.log('');
              console.log(chalk.yellow(`[dry-run] Would write to: ${options.output}`));
            }
          }
        } else if (options.type === 'integration') {
          const resolvedOutputPath = options.output
            ? await resolveOutputPath(options.output, specId, 'integration')
            : undefined;

          const result = generateIntegrationTests(resolved.spec, {
            framework: options.framework,
            setupHelpers: options.setupHelpers,
            markers: options.markers !== false,
            outputPath: resolvedOutputPath,
          });

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (!result.valid) {
              logger.error('Failed to generate integration tests:');
              for (const err of result.errors) {
                console.log(chalk.red(`  [${err.code}] ${err.message}`));
              }
              process.exit(1);
            }

            console.log(chalk.bold(`Generated ${result.effectTests} integration test(s) from ${specId}`));
            console.log('');
            console.log(result.code);

            if (resolvedOutputPath && !options.dryRun) {
              const fs = await import('node:fs/promises');
              await fs.writeFile(resolvedOutputPath, result.code);
              console.log('');
              console.log(chalk.green(`Written to: ${resolvedOutputPath}`));
            }
          }
        } else if (options.type === 'ui') {
          // Determine UI framework
          let uiFramework: UITestFramework = 'playwright';
          if (options.framework === 'cypress') {
            uiFramework = 'cypress';
          } else if (options.framework === 'testing-library') {
            uiFramework = 'testing-library';
          }

          const resolvedOutputPath = options.output
            ? await resolveOutputPath(options.output, specId, 'ui')
            : undefined;

          const result = generateUITests(resolved.spec, {
            framework: uiFramework,
            accessibilityPlugin: options.accessibility === 'axe' ? 'axe' : undefined,
            baseSelector: options.baseSelector,
            componentName: options.componentName,
            markers: options.markers !== false,
            outputPath: resolvedOutputPath,
          });

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (!result.valid) {
              logger.error('Failed to generate UI tests:');
              for (const err of result.errors) {
                console.log(chalk.red(`  [${err.code}] ${err.message}`));
              }
              process.exit(1);
            }

            const categoryCount = Object.entries(result.categories)
              .filter(([, count]) => count > 0)
              .map(([cat, count]) => `${cat}: ${count}`)
              .join(', ');

            console.log(chalk.bold(`Generated ${result.testCount} UI test(s) from ${specId}`));
            console.log(chalk.dim(`  Categories: ${categoryCount}`));
            console.log(chalk.dim(`  Framework: ${uiFramework}`));
            console.log('');
            console.log(result.code);

            if (resolvedOutputPath && !options.dryRun) {
              const fs = await import('node:fs/promises');
              await fs.writeFile(resolvedOutputPath, result.code);
              console.log('');
              console.log(chalk.green(`Written to: ${resolvedOutputPath}`));
            } else if (options.dryRun && options.output) {
              console.log('');
              console.log(chalk.yellow(`[dry-run] Would write to: ${options.output}`));
            }
          }
        } else {
          logger.error(`Unknown test type: ${options.type}`);
          logger.error('Valid types: unit, property, integration, ui');
          process.exit(1);
        }
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(error) }));
        } else {
          logger.error(`Test generation failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
