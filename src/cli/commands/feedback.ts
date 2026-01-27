/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Feedback command - analyze violation patterns and generate recommendations.
 */
import { Command } from 'commander';
import { FeedbackStore, FeedbackAnalyzer } from '../../core/feedback/index.js';
import type { FeedbackReport, ViolationStats, Recommendation } from '../../core/feedback/types.js';
import { logger } from '../../utils/logger.js';

/**
 * Create the feedback command.
 */
export function createFeedbackCommand(): Command {
  const cmd = new Command('feedback')
    .description('Analyze violation patterns and generate recommendations');

  cmd
    .command('report')
    .description('Generate a feedback report from recorded violations')
    .option('--days <n>', 'Number of days to analyze', '30')
    .option('--top <n>', 'Number of top violations to show', '10')
    .option('--json', 'Output as JSON')
    .option('--no-recommendations', 'Skip generating recommendations')
    .action(async (options) => {
      try {
        const projectRoot = process.cwd();
        const store = new FeedbackStore(projectRoot);

        if (!(await store.exists())) {
          logger.warn('No feedback data found. Run "archcodex check --record-violations" first.');
          process.exit(0);
        }

        const analyzer = new FeedbackAnalyzer(store);
        const report = await analyzer.generateReport({
          days: parseInt(options.days, 10),
          topN: parseInt(options.top, 10),
        });

        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          formatHumanReport(report, options.recommendations !== false);
        }
      } catch (error) {
        logger.error('Failed to generate feedback report', error instanceof Error ? error : undefined);
        process.exit(1);
      }
    });

  cmd
    .command('stats')
    .description('Show violation statistics')
    .option('--days <n>', 'Number of days to analyze', '30')
    .option('--rule <rule>', 'Filter by specific rule')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const projectRoot = process.cwd();
        const store = new FeedbackStore(projectRoot);

        if (!(await store.exists())) {
          logger.warn('No feedback data found. Run "archcodex check --record-violations" first.');
          process.exit(0);
        }

        const analyzer = new FeedbackAnalyzer(store);
        const stats = await analyzer.getViolationStats({
          days: parseInt(options.days, 10),
        });

        // Filter by rule if specified
        const filtered = options.rule
          ? stats.filter((s) => s.rule === options.rule)
          : stats;

        if (options.json) {
          console.log(JSON.stringify(filtered, null, 2));
        } else {
          formatStatsTable(filtered);
        }
      } catch (error) {
        logger.error('Failed to get violation stats', error instanceof Error ? error : undefined);
        process.exit(1);
      }
    });

  cmd
    .command('clear')
    .description('Clear all recorded feedback data')
    .option('--confirm', 'Confirm deletion without prompt')
    .action(async (options) => {
      try {
        const projectRoot = process.cwd();
        const store = new FeedbackStore(projectRoot);

        if (!(await store.exists())) {
          logger.info('No feedback data to clear.');
          process.exit(0);
        }

        if (!options.confirm) {
          logger.warn('This will delete all recorded feedback data.');
          logger.info('Use --confirm to proceed.');
          process.exit(0);
        }

        await store.clear();
        logger.info('Feedback data cleared.');
      } catch (error) {
        logger.error('Failed to clear feedback data', error instanceof Error ? error : undefined);
        process.exit(1);
      }
    });

  cmd
    .command('prune')
    .description('Remove old entries from feedback data')
    .option('--days <n>', 'Keep entries from the last N days', '90')
    .action(async (options) => {
      try {
        const projectRoot = process.cwd();
        const store = new FeedbackStore(projectRoot);

        if (!(await store.exists())) {
          logger.info('No feedback data to prune.');
          process.exit(0);
        }

        const daysToKeep = parseInt(options.days, 10);
        const prunedCount = await store.pruneOldEntries(daysToKeep);

        if (prunedCount > 0) {
          logger.info(`Pruned ${prunedCount} entries older than ${daysToKeep} days.`);
        } else {
          logger.info('No old entries to prune.');
        }
      } catch (error) {
        logger.error('Failed to prune feedback data', error instanceof Error ? error : undefined);
        process.exit(1);
      }
    });

  return cmd;
}

/**
 * Format report for human-readable output.
 */
function formatHumanReport(report: FeedbackReport, showRecommendations: boolean): void {
  console.log('');
  console.log('\x1b[1m══════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1mARCHCODEX FEEDBACK REPORT\x1b[0m');
  console.log('\x1b[1m══════════════════════════════════════════════════\x1b[0m');
  console.log('');

  // Period
  const fromDate = new Date(report.period.from).toLocaleDateString();
  const toDate = new Date(report.period.to).toLocaleDateString();
  console.log(`\x1b[2mPeriod: ${fromDate} - ${toDate} (${report.period.days} days)\x1b[0m`);
  console.log('');

  // Summary
  console.log('\x1b[1mSummary\x1b[0m');
  console.log(`  Total violations: ${report.summary.totalViolations}`);
  console.log(`  Total overrides: ${report.summary.totalOverrides}`);
  console.log(`  Unique rules violated: ${report.summary.uniqueRules}`);
  console.log(`  Files affected: ${report.summary.uniqueFiles}`);
  console.log('');

  // Top violations
  if (report.topViolations.length > 0) {
    console.log('\x1b[1mTop Violated Constraints\x1b[0m');
    report.topViolations.forEach((stat, i) => {
      const value = stat.value ? `:${stat.value}` : '';
      const overrideInfo = stat.overrideCount > 0 ? ` (${stat.overrideCount} overrides)` : '';
      console.log(`  ${i + 1}. ${stat.rule}${value} - ${stat.count} violations${overrideInfo}`);
    });
    console.log('');
  }

  // Recommendations
  if (showRecommendations && report.recommendations.length > 0) {
    console.log('\x1b[1mRecommendations\x1b[0m');
    report.recommendations.forEach((rec, i) => {
      const icon = getRecommendationIcon(rec.type);
      console.log(`  ${icon} ${rec.title}`);
      console.log(`     ${rec.description}`);
      console.log(`     \x1b[2mAction: ${rec.suggestedAction.split('\n')[0]}\x1b[0m`);
      if (i < report.recommendations.length - 1) {
        console.log('');
      }
    });
    console.log('');
  } else if (showRecommendations) {
    console.log('\x1b[1mRecommendations\x1b[0m');
    console.log('  \x1b[32m✓\x1b[0m No recommendations at this time.');
    console.log('');
  }
}

/**
 * Format stats as a table.
 */
function formatStatsTable(stats: ViolationStats[]): void {
  if (stats.length === 0) {
    console.log('No violations found in the specified period.');
    return;
  }

  console.log('');
  console.log('\x1b[1mViolation Statistics\x1b[0m');
  console.log('');

  // Header
  console.log(
    '  ' +
    'Rule'.padEnd(25) +
    'Value'.padEnd(20) +
    'Count'.padEnd(8) +
    'Overrides'.padEnd(10) +
    'Files'
  );
  console.log('  ' + '-'.repeat(73));

  // Rows
  for (const stat of stats.sort((a, b) => b.count - a.count)) {
    const rule = stat.rule.substring(0, 24).padEnd(25);
    const value = (stat.value || '-').substring(0, 19).padEnd(20);
    const count = String(stat.count).padEnd(8);
    const overrides = String(stat.overrideCount).padEnd(10);
    const files = String(stat.affectedFiles.length);
    console.log(`  ${rule}${value}${count}${overrides}${files}`);
  }

  console.log('');
}

/**
 * Get icon for recommendation type.
 */
function getRecommendationIcon(type: Recommendation['type']): string {
  switch (type) {
    case 'relax_constraint':
      return '\x1b[33m⚡\x1b[0m';
    case 'update_architecture':
      return '\x1b[36m🏗\x1b[0m';
    case 'review_pattern':
      return '\x1b[35m🔍\x1b[0m';
    case 'add_override':
      return '\x1b[32m✎\x1b[0m';
    default:
      return '•';
  }
}
