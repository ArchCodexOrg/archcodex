/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * CLI command for feature audit.
 * Verifies complete feature implementation across backend, frontend, and UI layers.
 *
 * @see spec.archcodex.featureAudit in .arch/specs/archcodex/feature-audit.spec.yaml
 */
import { Command } from 'commander';
import chalk from 'chalk';
import {
  featureAudit,
  type FeatureAuditResult,
  type BackendAuditResult,
  type FrontendAuditResult,
  type UIAuditResult,
} from '../../core/audit/index.js';
import { logger } from '../../utils/logger.js';

interface FeatureAuditOptions {
  mutation?: string;
  entity?: string;
  json?: boolean;
  verbose?: boolean;
}

/**
 * Create the feature-audit command.
 */
export function createFeatureAuditCommand(): Command {
  return new Command('feature-audit')
    .description('Audit feature implementation across all layers')
    .option('-m, --mutation <name>', 'Mutation name to audit (e.g., duplicateEntry)')
    .option('-e, --entity <name>', 'Entity name for component group matching')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show detailed information')
    .action(async (options: FeatureAuditOptions) => {
      try {
        await runFeatureAudit(options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

/**
 * Run the feature audit.
 */
async function runFeatureAudit(options: FeatureAuditOptions): Promise<void> {
  const projectRoot = process.cwd();

  if (!options.mutation && !options.entity) {
    console.log();
    console.log(chalk.bold('Feature Audit'));
    console.log();
    console.log('Verify feature implementation across backend, frontend, and UI layers.');
    console.log();
    console.log(chalk.dim('Usage:'));
    console.log('  archcodex feature-audit --mutation <name> [--entity <name>]');
    console.log();
    console.log(chalk.dim('Examples:'));
    console.log('  archcodex feature-audit --mutation duplicateEntry');
    console.log('  archcodex feature-audit --mutation duplicateProduct --entity products');
    console.log('  archcodex feature-audit --entity users');
    console.log();
    console.log(chalk.dim('Options:'));
    console.log('  -m, --mutation <name>  Mutation name to audit');
    console.log('  -e, --entity <name>    Entity name for UI component matching');
    console.log('  --json                 Output as JSON');
    console.log('  -v, --verbose          Show detailed information');
    return;
  }

  const result = await featureAudit({
    mutation: options.mutation,
    entity: options.entity,
    projectRoot,
    verbose: options.verbose,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printAuditReport(result, options.verbose);
}

/**
 * Print the audit report in human-readable format.
 */
function printAuditReport(result: FeatureAuditResult, verbose = false): void {
  console.log();

  // Status header
  const statusIcon = result.status === 'complete'
    ? chalk.green('✓')
    : result.status === 'incomplete'
      ? chalk.yellow('⚠')
      : chalk.red('✗');

  const statusColor = result.status === 'complete'
    ? chalk.green
    : result.status === 'incomplete'
      ? chalk.yellow
      : chalk.red;

  console.log(`${statusIcon} ${chalk.bold('Feature Audit:')} ${statusColor(result.status.toUpperCase())}`);
  console.log();

  // Backend layer
  printLayerResult('Backend', result.layers.backend, verbose);

  // Frontend layer
  printLayerResult('Frontend', result.layers.frontend, verbose);

  // UI layer
  printUILayerResult(result.layers.ui, verbose);

  // Remediation
  if (result.remediation.length > 0) {
    console.log(chalk.bold('Remediation:'));
    for (const item of result.remediation) {
      console.log(`  ${chalk.yellow('→')} ${item}`);
    }
    console.log();
  }

  // Summary
  console.log(chalk.dim(result.summary));
  console.log();
}

/**
 * Print backend/frontend layer result.
 */
function printLayerResult(
  layerName: string,
  result: BackendAuditResult | FrontendAuditResult,
  verbose: boolean
): void {
  if (result.status === 'skip') {
    if (verbose) {
      console.log(chalk.dim(`${layerName}: Skipped`));
    }
    return;
  }

  const icon = result.status === 'pass' ? chalk.green('✓') : chalk.red('✗');
  console.log(`${icon} ${chalk.bold(layerName)}`);

  for (const check of result.checks) {
    const checkIcon = check.status === 'found'
      ? chalk.green('  ✓')
      : check.status === 'missing'
        ? chalk.red('  ✗')
        : chalk.yellow('  ?');

    const implLabel = check.implementationStatus === 'stub'
      ? chalk.yellow(` [stub${check.stubReason ? `: ${check.stubReason}` : ''}]`)
      : check.implementationStatus === 'implemented'
        ? chalk.green(' [implemented]')
        : '';

    console.log(`${checkIcon} ${check.name}${implLabel}`);

    if (check.file) {
      console.log(chalk.dim(`      ${check.file}`));
    }

    if (check.status !== 'found' && check.expected && verbose) {
      console.log(chalk.yellow(`      → ${check.expected}`));
    }
  }
  console.log();
}

/**
 * Print UI layer result.
 */
function printUILayerResult(result: UIAuditResult, verbose: boolean): void {
  if (result.status === 'skip') {
    if (verbose) {
      console.log(chalk.dim('UI: Skipped (no component group matched)'));
    }
    return;
  }

  const icon = result.status === 'pass' ? chalk.green('✓') : chalk.red('✗');
  console.log(`${icon} ${chalk.bold('UI')} ${chalk.dim(`(${result.componentGroup})`)}`);

  for (const check of result.checks) {
    const checkIcon = check.status === 'wired'
      ? chalk.green('  ✓')
      : check.status === 'partial'
        ? chalk.yellow('  ~')
        : chalk.red('  ✗');

    const statusLabel = check.status === 'wired'
      ? 'wired'
      : check.status === 'partial'
        ? 'partial'
        : 'missing';

    const implLabel = check.implementationStatus === 'stub'
      ? chalk.yellow(` [stub${check.stubReason ? `: ${check.stubReason}` : ''}]`)
      : check.implementationStatus === 'implemented'
        ? chalk.green(' [implemented]')
        : '';

    console.log(`${checkIcon} ${check.component} ${chalk.dim(`(${statusLabel})`)}${implLabel}`);

    if (check.details && verbose) {
      console.log(chalk.dim(`      ${check.details}`));
    }
  }
  console.log();
}
