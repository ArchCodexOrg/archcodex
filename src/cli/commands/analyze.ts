/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * CLI command for schema-inferred analysis.
 * Runs all checkers against spec/arch/component-group registries.
 *
 * @see spec.archcodex.analyze in .arch/specs/archcodex/analyze-engine.spec.yaml
 */
import { Command } from 'commander';
import chalk from 'chalk';
import {
  runAllAnalyses,
  type AnalysisCategory,
  type AnalysisSeverity,
  type AnalysisResult,
} from '../../core/analysis/index.js';
import { logger } from '../../utils/logger.js';

interface AnalyzeOptions {
  category?: string;
  severity?: string;
  spec?: string;
  json?: boolean;
  deep?: boolean;
}

const VALID_CATEGORIES: AnalysisCategory[] = [
  'logic', 'security', 'data', 'consistency', 'completeness', 'other',
];

const VALID_SEVERITIES: AnalysisSeverity[] = ['error', 'warning', 'info'];

/**
 * Create the analyze command.
 */
export function createAnalyzeCommand(): Command {
  return new Command('analyze')
    .description('Run schema-inferred analysis on specs, architectures, and component groups')
    .option('-c, --category <categories>', 'Filter by category (comma-separated: logic,security,data,consistency,completeness,other)')
    .option('-s, --severity <level>', 'Minimum severity threshold (error, warning, info)', 'info')
    .option('--spec <specIds>', 'Filter to specific spec IDs (comma-separated)')
    .option('--json', 'Output as JSON')
    .option('--deep', 'Enable deep analysis (reads implementation files, uses analysis.deep_patterns from config)')
    .action(async (options: AnalyzeOptions) => {
      try {
        await runAnalyze(options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runAnalyze(options: AnalyzeOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Parse categories
  let categories: AnalysisCategory[] | undefined;
  if (options.category) {
    const requested = options.category.split(',').map((c) => c.trim());
    const invalid = requested.filter(
      (c) => !VALID_CATEGORIES.includes(c as AnalysisCategory),
    );
    if (invalid.length > 0) {
      console.log(
        chalk.red(`Invalid category: ${invalid.join(', ')}`),
      );
      console.log(
        chalk.dim(`Valid categories: ${VALID_CATEGORIES.join(', ')}`),
      );
      process.exit(1);
    }
    categories = requested as AnalysisCategory[];
  }

  // Parse severity
  let severity: AnalysisSeverity | undefined;
  if (options.severity) {
    if (!VALID_SEVERITIES.includes(options.severity as AnalysisSeverity)) {
      console.log(
        chalk.red(`Invalid severity: ${options.severity}`),
      );
      console.log(
        chalk.dim(`Valid severities: ${VALID_SEVERITIES.join(', ')}`),
      );
      process.exit(1);
    }
    severity = options.severity as AnalysisSeverity;
  }

  // Parse spec IDs
  const specIds = options.spec
    ? options.spec.split(',').map((s) => s.trim())
    : undefined;

  const result = await runAllAnalyses(projectRoot, {
    categories,
    severity,
    specIds,
    deep: options.deep,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printAnalysisReport(result);
}

function printAnalysisReport(result: AnalysisResult): void {
  console.log();

  if (result.issues.length === 0) {
    console.log(chalk.green('No issues found.'));
    console.log();
    console.log(chalk.dim(`Specs analyzed: ${result.summary.specsAnalyzed}`));
    console.log();
    return;
  }

  // Group by category
  const byCategory = new Map<string, typeof result.issues>();
  for (const issue of result.issues) {
    const existing = byCategory.get(issue.category);
    if (existing) {
      existing.push(issue);
    } else {
      byCategory.set(issue.category, [issue]);
    }
  }

  for (const [category, issues] of byCategory) {
    const title = category.charAt(0).toUpperCase() + category.slice(1);
    console.log(chalk.bold(`${title} (${issues.length})`));
    console.log();

    for (const issue of issues) {
      const severityLabel =
        issue.severity === 'error'
          ? chalk.red('ERR')
          : issue.severity === 'warning'
            ? chalk.yellow('WRN')
            : chalk.blue('INF');

      const specLabel = issue.specId
        ? chalk.dim(` [${issue.specId}]`)
        : '';
      const fieldLabel = issue.field
        ? chalk.dim(` (${issue.field})`)
        : '';

      console.log(
        `  ${severityLabel} ${chalk.bold(issue.id)}${specLabel}${fieldLabel}`,
      );
      console.log(`      ${issue.message}`);
      if (issue.suggestion) {
        console.log(chalk.dim(`      -> ${issue.suggestion}`));
      }
      console.log();
    }
  }

  // Summary
  const errorCount = result.summary.bySeverity['error'] ?? 0;
  const warnCount = result.summary.bySeverity['warning'] ?? 0;
  const infoCount = result.summary.bySeverity['info'] ?? 0;

  const parts: string[] = [];
  if (errorCount > 0) parts.push(chalk.red(`${errorCount} error(s)`));
  if (warnCount > 0) parts.push(chalk.yellow(`${warnCount} warning(s)`));
  if (infoCount > 0) parts.push(chalk.blue(`${infoCount} info`));

  console.log(chalk.dim('---'));
  console.log(
    `${result.summary.total} issue(s) across ${result.summary.specsAnalyzed} spec(s): ${parts.join(', ')}`,
  );
  console.log();
}
