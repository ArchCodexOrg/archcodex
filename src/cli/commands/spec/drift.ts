/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Drift subcommand - find gaps between specs and implementations.
 */
import type { Command } from 'commander';
import chalk from 'chalk';
import {
  loadSpecRegistry,
  findUnwiredSpecs,
  formatUnwiredReport,
  generateDriftReport,
} from '../../../core/spec/index.js';
import { logger } from '../../../utils/logger.js';

/**
 * Register the drift subcommand on the spec command.
 */
export function registerDriftCommand(spec: Command): void {
  spec
    .command('drift')
    .description('Find gaps between specs and implementations')
    .option('--fix', 'Suggest fixes for drift')
    .option('-f, --format <format>', 'Output format: terminal, json, markdown', 'terminal')
    .option('-s, --strict', 'Treat warnings as errors')
    .option('-p, --pattern <pattern>', 'Filter to specs matching pattern')
    .option('--include-base', 'Include base/abstract specs')
    .option('--full', 'Full drift report (unwired + undocumented + signatures)')
    .option('--undocumented', 'Show undocumented implementations only')
    .option('--no-signatures', 'Skip signature checking in full report')
    .option('--scan-patterns <patterns>', 'Comma-separated glob patterns for file scanning')
    .action(async (options: {
      fix?: boolean;
      format?: 'terminal' | 'json' | 'markdown';
      strict?: boolean;
      pattern?: string;
      includeBase?: boolean;
      full?: boolean;
      undocumented?: boolean;
      signatures?: boolean;
      scanPatterns?: string;
    }) => {
      const projectRoot = process.cwd();

      try {
        const registry = await loadSpecRegistry(projectRoot);

        // Full drift report or undocumented-only mode
        if (options.full || options.undocumented) {
          const scanPatterns = options.scanPatterns?.split(',');
          const report = await generateDriftReport(projectRoot, registry, {
            includeSignatureCheck: options.signatures !== false && !options.undocumented,
            format: options.format || 'terminal',
            patterns: scanPatterns,
            pattern: options.pattern,
            includeBase: options.includeBase || false,
          });

          if (options.format === 'json') {
            console.log(report.formattedOutput);
          } else if (options.format === 'markdown') {
            console.log(report.formattedOutput);
          } else {
            // Terminal: add chalk coloring to plain-text output
            const colored = report.formattedOutput
              .replace(/^(\s*ERROR\b)/gm, (m) => chalk.red(m))
              .replace(/^(\s*WARNING\b)/gm, (m) => chalk.yellow(m))
              .replace(/^(\s*INFO\b)/gm, (m) => chalk.blue(m));
            console.log();
            console.log(colored);
          }

          if (options.fix && report.issues.length > 0) {
            console.log();
            console.log(chalk.yellow('Suggestions:'));
            console.log();
            for (const issue of report.issues.filter(i => i.suggestion).slice(0, 10)) {
              console.log(`  ${chalk.cyan(issue.specId || issue.path || '')}`);
              console.log(`    ${chalk.dim(issue.suggestion!)}`);
              console.log();
            }
            if (report.issues.filter(i => i.suggestion).length > 10) {
              console.log(chalk.dim(`  ... and more`));
            }
          }

          process.exit(report.valid && !options.strict ? 0 : (report.issues.length > 0 ? 1 : 0));
          return;
        }

        // Default: unwired-only mode (backward compatible)
        const result = findUnwiredSpecs(registry, {
          includeBase: options.includeBase || false,
          pattern: options.pattern,
        });

        // Output based on format
        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          if (result.unwired.length > 0 || options.strict) {
            process.exit(1);
          }
          return;
        }

        if (options.format === 'markdown') {
          const lines: string[] = [
            '# Spec Drift Report',
            '',
            `**Coverage:** ${result.coverage.percentage}% (${result.coverage.wired}/${result.coverage.total})`,
            '',
          ];

          if (result.unwired.length === 0) {
            lines.push('All specs are wired to implementations.');
          } else {
            lines.push('## Unwired Specs');
            lines.push('');
            lines.push('| Spec ID | Has Examples | Suggested Path |');
            lines.push('|---------|--------------|----------------|');
            for (const spec of result.unwired) {
              const examples = spec.hasExamples ? '✓' : '';
              lines.push(`| ${spec.specId} | ${examples} | ${spec.suggestedPath || '-'} |`);
            }
          }

          console.log(lines.join('\n'));
          if (result.unwired.length > 0 || options.strict) {
            process.exit(1);
          }
          return;
        }

        // Terminal format
        console.log();
        console.log(formatUnwiredReport(result));

        // Fix suggestions
        if (options.fix && result.unwired.length > 0) {
          console.log();
          console.log(chalk.yellow('Suggestions to fix drift:'));
          console.log();

          for (const spec of result.unwired.slice(0, 10)) {
            const parts = spec.specId.split('.');
            const exportName = parts[parts.length - 1] || 'default';
            console.log(`  ${chalk.cyan(spec.specId)}`);
            console.log(`    Add: ${chalk.dim(`implementation: ${spec.suggestedPath}#${exportName}`)}`);
            console.log();
          }

          if (result.unwired.length > 10) {
            console.log(chalk.dim(`  ... and ${result.unwired.length - 10} more`));
          }
        }

        // Exit code
        if (result.unwired.length > 0) {
          process.exit(1);
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}
