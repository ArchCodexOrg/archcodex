/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../../core/config/loader.js';
import { AuditScanner, clusterOverrides, type AuditReport, type AuditedOverride, type OverrideCluster } from '../../core/audit/index.js';
import { logger as log } from '../../utils/logger.js';

/**
 * Create the audit command.
 */
export function createAuditCommand(): Command {
  return new Command('audit')
    .description('List and analyze all @override tags in the codebase')
    .option('--expired', 'Show only expired overrides')
    .option('--expiring <days>', 'Show overrides expiring within N days', '30')
    .option('--suggest-intents', 'Show override clusters that could be promoted to intents')
    .option('--json', 'Output as JSON')
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .action(async (options: AuditOptions) => {
      try {
        await runAudit(options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface AuditOptions {
  expired?: boolean;
  expiring: string;
  suggestIntents?: boolean;
  json?: boolean;
  config: string;
}

async function runAudit(options: AuditOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Load configuration
  const configPath = path.resolve(projectRoot, options.config);
  const config = await loadConfig(configPath);

  // Create scanner
  const scanner = new AuditScanner(projectRoot, config);

  // Run audit
  const expiringDays = parseInt(options.expiring, 10);
  const report = await scanner.scan({
    expiringDays,
    expiredOnly: options.expired,
    // Don't filter by expiring unless explicitly requested via --expired
    expiringOnly: false,
  });

  if (options.suggestIntents) {
    const clusters = clusterOverrides(report);
    if (options.json) {
      console.log(JSON.stringify(clusters, null, 2));
    } else {
      printClusters(clusters);
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human-readable output
  printReport(report, options.expired, expiringDays);
}

function printReport(
  report: AuditReport,
  expiredOnly: boolean | undefined,
  expiringDays: number
): void {
  console.log();
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold('OVERRIDE AUDIT REPORT'));
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));
  console.log();

  if (report.files.length === 0) {
    if (expiredOnly) {
      console.log(chalk.green('No expired overrides found.'));
    } else {
      console.log(chalk.dim('No overrides found in the codebase.'));
    }
    return;
  }

  // Print files with overrides
  for (const file of report.files) {
    console.log(chalk.cyan(file.filePath));
    if (file.archId) {
      console.log(chalk.dim(`  Architecture: ${file.archId}`));
    }

    for (const override of file.overrides) {
      printOverride(override);
    }
    console.log();
  }

  // Print summary
  console.log(chalk.bold('─'.repeat(60)));
  printSummary(report, expiringDays);
}

function printOverride(override: AuditedOverride): void {
  const statusIcon = getStatusIcon(override.status);
  const statusColor = getStatusColor(override.status);

  console.log(
    `  ${statusIcon} ${statusColor(override.rule)}:${override.value}`
  );

  if (override.reason) {
    console.log(chalk.dim(`      Reason: ${override.reason}`));
  }

  if (override.expires) {
    const expiryText =
      override.daysUntilExpiry !== null && override.daysUntilExpiry < 0
        ? `${Math.abs(override.daysUntilExpiry)} days ago`
        : override.daysUntilExpiry !== null
        ? `in ${override.daysUntilExpiry} days`
        : '';
    console.log(chalk.dim(`      Expires: ${override.expires} (${expiryText})`));
  }

  if (override.ticket) {
    console.log(chalk.dim(`      Ticket: ${override.ticket}`));
  }

  if (override.approvedBy) {
    console.log(chalk.dim(`      Approved by: ${override.approvedBy}`));
  }

  for (const error of override.errors) {
    console.log(chalk.red(`      ✗ ${error}`));
  }

  for (const warning of override.warnings) {
    console.log(chalk.yellow(`      ⚠ ${warning}`));
  }
}

function printSummary(report: AuditReport, expiringDays: number): void {
  const { summary } = report;

  console.log();
  console.log(chalk.bold('SUMMARY'));
  console.log();
  console.log(`  Files with overrides: ${summary.filesWithOverrides}`);
  console.log(`  Total overrides: ${summary.totalOverrides}`);
  console.log();

  console.log(`  ${chalk.green('●')} Active: ${summary.activeOverrides}`);
  console.log(
    `  ${chalk.yellow('●')} Expiring (within ${expiringDays} days): ${summary.expiringOverrides}`
  );
  console.log(`  ${chalk.red('●')} Expired: ${summary.expiredOverrides}`);
  if (summary.invalidOverrides > 0) {
    console.log(`  ${chalk.magenta('●')} Invalid: ${summary.invalidOverrides}`);
  }

  console.log();
  console.log(chalk.dim(`Generated at: ${report.generatedAt}`));
}

function printClusters(clusters: OverrideCluster[]): void {
  console.log();

  if (clusters.length === 0) {
    console.log(chalk.dim('No override clusters found (need 2+ files with the same override).'));
    console.log();
    return;
  }

  console.log(chalk.bold('Override Clusters (potential intents):'));
  console.log();

  for (const cluster of clusters) {
    console.log(
      `  ${chalk.yellow(cluster.constraintKey)}  ${chalk.dim(`(${cluster.fileCount} files)`)}`
    );
    for (const file of cluster.files) {
      console.log(`    ${chalk.dim('→')} ${file}`);
    }
    if (cluster.commonReasons.length > 0) {
      const truncatedReasons = cluster.commonReasons
        .map(r => r.length > 50 ? r.slice(0, 50) + '...' : r)
        .slice(0, 3);
      console.log(
        `    ${chalk.dim('Reasons:')} ${truncatedReasons.map(r => `"${r}"`).join(', ')}`
      );
    }
    console.log(
      `    ${chalk.dim('Suggested:')} ${chalk.cyan(cluster.promoteCommand)}`
    );
    console.log();
  }

  console.log(chalk.dim('Tip: Run the suggested commands to promote overrides to intents.'));
  console.log(chalk.dim('     Promote defaults to dry-run (preview). Add --apply to execute.'));
  console.log();
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'active':
      return chalk.green('●');
    case 'expiring':
      return chalk.yellow('●');
    case 'expired':
      return chalk.red('●');
    case 'invalid':
      return chalk.magenta('●');
    default:
      return '○';
  }
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case 'active':
      return chalk.green;
    case 'expiring':
      return chalk.yellow;
    case 'expired':
      return chalk.red;
    case 'invalid':
      return chalk.magenta;
    default:
      return (t: string) => t;
  }
}
