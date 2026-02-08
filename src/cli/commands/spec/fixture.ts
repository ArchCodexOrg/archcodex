/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Fixture subcommand - list and inspect test fixtures.
 */
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  loadFixtures,
  listFixtures,
  getFixturesTemplate,
} from '../../../core/spec/index.js';
import { logger } from '../../../utils/logger.js';

/**
 * Register the fixture subcommand on the spec command.
 */
export function registerFixtureCommand(spec: Command): void {
  spec
    .command('fixture')
    .description('List and inspect fixtures for test data')
    .argument('[name]', 'Fixture name to show details for')
    .option('--list', 'List all available fixtures')
    .option('--template', 'Show fixtures file template')
    .option('--json', 'Output in JSON format')
    .action(async (name: string | undefined, options) => {
      const projectRoot = process.cwd();

      try {
        // Load fixtures (built-in + project)
        const registry = await loadFixtures(projectRoot);
        const fixtures = listFixtures(registry);

        if (options.template) {
          // Show template for creating fixtures file
          const template = getFixturesTemplate();
          if (options.json) {
            console.log(JSON.stringify({ template }, null, 2));
          } else {
            console.log(chalk.bold('Fixtures File Template'));
            console.log(chalk.dim('Place at: .arch/specs/_fixtures.yaml'));
            console.log('');
            console.log(template);
          }
          return;
        }

        if (options.list || !name) {
          // List all fixtures
          if (options.json) {
            console.log(JSON.stringify({ fixtures }, null, 2));
          } else {
            console.log(chalk.bold('Available Fixtures:'));
            console.log('');

            // Group by built-in vs custom
            const builtIn = fixtures.filter(f => ['authenticated', 'no_access', 'admin_user'].includes(f.name));
            const custom = fixtures.filter(f => !['authenticated', 'no_access', 'admin_user'].includes(f.name));

            if (builtIn.length > 0) {
              console.log(chalk.dim('Built-in:'));
              for (const f of builtIn) {
                const modeTag = f.mode === 'documentation' ? chalk.yellow(' [doc]') : '';
                console.log(`  ${chalk.cyan('@' + f.name)}${modeTag}`);
                console.log(`    ${chalk.dim(f.description)}`);
              }
              console.log('');
            }

            if (custom.length > 0) {
              console.log(chalk.dim('Project fixtures:'));
              for (const f of custom) {
                const modeTag = f.mode === 'documentation' ? chalk.yellow(' [doc]') : '';
                console.log(`  ${chalk.cyan('@' + f.name)}${modeTag}`);
                console.log(`    ${chalk.dim(f.description)}`);
              }
              console.log('');
            }

            console.log(chalk.dim(`Total: ${fixtures.length} fixture(s)`));
            console.log('');
            console.log(chalk.dim('Usage in specs:'));
            console.log(`  given: { user: ${chalk.cyan('@authenticated')}, entry: ${chalk.cyan('@validEntry')} }`);
          }
          return;
        }

        // Show specific fixture
        const fixture = registry.fixtures[name];
        if (!fixture) {
          if (options.json) {
            console.log(JSON.stringify({ error: `Fixture not found: ${name}` }));
          } else {
            logger.error(`Fixture not found: ${name}`);
            console.log(chalk.dim('Use --list to see available fixtures'));
          }
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify({ name, ...fixture }, null, 2));
        } else {
          console.log(chalk.bold(`Fixture: @${name}`));
          console.log('');
          console.log(`  ${chalk.dim('Description:')} ${fixture.description}`);
          console.log(`  ${chalk.dim('Mode:')} ${fixture.mode}`);
          if (fixture.mode === 'generate' && fixture.value !== undefined) {
            console.log(`  ${chalk.dim('Value:')}`);
            console.log('    ' + JSON.stringify(fixture.value, null, 2).split('\n').join('\n    '));
          }
          if (fixture.mode === 'documentation' && fixture.setup) {
            console.log(`  ${chalk.dim('Setup:')} ${fixture.setup}`);
          }
        }
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(error) }));
        } else {
          logger.error(`Fixture lookup failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
