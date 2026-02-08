/**
 * @arch archcodex.cli.command.complex
 * @intent:cli-output
 *
 * CLI command for generating documentation from ArchCodex architectures and specs.
 * Handlers extracted to doc-handlers.ts to keep this file under 450 lines.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import {
  runDocAdr,
  runDocTemplates,
  runDocWatch,
  runDocVerify,
  type DocAdrOptions,
  type DocType,
} from './doc-handlers.js';

export function createDocCommand(): Command {
  const doc = new Command('doc')
    .description('Generate documentation from architectures');

  // ADR subcommand
  doc
    .command('adr [archId]')
    .description('Generate Architecture Decision Records (ADRs)')
    .option('--all', 'Generate ADRs for all architectures')
    .option('--index', 'Generate index only (with --all)')
    .option('-o, --output <path>', 'Output file or directory')
    .option('--dry-run', 'Preview without writing files')
    .option('--format <format>', 'Output format: standard, compact, detailed', 'standard')
    .option('--json', 'Output as JSON')
    .option('--group-by <grouping>', 'Group by: layer, flat (with --all)', 'layer')
    .option('--no-skip-abstract', 'Include abstract/base architectures')
    .option('--no-inheritance', 'Exclude inheritance chain')
    .option('--no-hints', 'Exclude hints/guidelines')
    .option('--no-references', 'Exclude reference implementations')
    .option('--template-dir <dir>', 'Custom template directory', '.arch/templates/docs')
    .action(async (archId: string | undefined, opts: DocAdrOptions) => {
      try {
        await runDocAdr(archId, opts);
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Templates subcommand
  doc
    .command('templates')
    .description('List and manage documentation templates')
    .option('--init', 'Create default templates in .arch/templates/docs/')
    .option('--list', 'List available templates')
    .option('--json', 'Output as JSON')
    .action(async (opts: { init?: boolean; list?: boolean; json?: boolean }) => {
      try {
        await runDocTemplates(opts);
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Watch subcommand
  doc
    .command('watch')
    .description('Watch for changes and regenerate documentation')
    .option('-t, --type <type>', 'Doc type: adr, spec, all', 'adr')
    .option('-o, --output <path>', 'Output directory', 'docs')
    .option('--debounce <ms>', 'Debounce delay in milliseconds', '500')
    .option('--clear', 'Clear terminal between runs')
    .action(async (opts: { type: string; output: string; debounce: string; clear?: boolean }) => {
      try {
        await runDocWatch(opts.type as DocType, opts);
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Verify subcommand (CI integration)
  doc
    .command('verify')
    .description('Verify documentation is up-to-date (for CI)')
    .option('-t, --type <type>', 'Doc type: adr, spec, all', 'adr')
    .requiredOption('-o, --output <path>', 'Directory containing docs to verify')
    .option('--fix', 'Auto-fix by regenerating stale docs')
    .option('--json', 'Output as JSON')
    .action(async (opts: { type: string; output: string; fix?: boolean; json?: boolean }) => {
      try {
        const exitCode = await runDocVerify(opts.type as DocType, opts);
        process.exit(exitCode);
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return doc;
}
