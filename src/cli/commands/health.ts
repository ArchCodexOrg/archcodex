/**
 * @arch archcodex.cli.command.complex
 * @intent:cli-output
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../core/config/loader.js';
import { HealthAnalyzer } from '../../core/health/index.js';
import type { HealthReport, IndexStatus } from '../../core/health/types.js';
import { checkIndexStaleness } from '../../core/discovery/staleness.js';
import { printLayerCoverage, printRecommendation } from './health-output.js';
import { logger as log } from '../../utils/logger.js';

interface HealthOptions {
  config: string;
  json?: boolean;
  verbose?: boolean;
  expiringDays?: number;
  byArch?: boolean;
  cache?: boolean; // Caching enabled by default
  layers?: boolean; // Layer analysis enabled by default
}

/**
 * Create the health command.
 */
export function createHealthCommand(): Command {
  return new Command('health')
    .description('Show architectural health dashboard')
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Show all untagged files')
    .option('--expiring-days <n>', 'Days threshold for expiring overrides', '30')
    .option('--by-arch', 'Show file counts per architecture')
    .option('--no-cache', 'Bypass health cache (slower but ensures accuracy)')
    .option('--no-layers', 'Skip layer coverage analysis (faster)')
    .action(async (options: HealthOptions) => {
      try {
        await runHealth(options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runHealth(options: HealthOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Load configuration
  const config = await loadConfig(projectRoot, options.config);

  // Run health analysis
  const analyzer = new HealthAnalyzer(projectRoot, config);
  const startTime = Date.now();
  const skipLayers = options.layers === false;
  const report = await analyzer.analyze({
    expiringDays: options.expiringDays ? parseInt(options.expiringDays.toString(), 10) : 30,
    // When verbose, get all untagged files (large sample size)
    untaggedSampleSize: options.verbose ? 10000 : 10,
    // Include file counts per architecture when requested
    includeArchUsage: options.byArch,
    // Use cache unless explicitly disabled with --no-cache
    useCache: options.cache !== false,
    // Skip layer analysis when --no-layers is set
    skipLayers,
  });
  const elapsed = Date.now() - startTime;

  // Check index staleness
  const staleness = await checkIndexStaleness(projectRoot);
  const indexStatus: IndexStatus = {
    isStale: staleness.isStale,
    reason: staleness.reason,
    missingArchIds: staleness.missingArchIds,
  };
  report.indexStatus = indexStatus;

  // Add recommendation if index is stale
  if (staleness.isStale) {
    report.recommendations.unshift({
      type: 'warning',
      title: 'Discovery index is out of date',
      message: `The discovery index needs to be synchronized with the registry (${staleness.reason}).`,
      command: 'archcodex sync-index',
    });
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human-readable output
  printHealthReport(report, options.verbose, options.byArch);

  // Show performance tip if analysis was slow and layers were included
  if (elapsed > 3000 && !skipLayers) {
    console.log(chalk.dim(`  Tip: Use --no-layers to skip layer coverage analysis for faster results.`));
    console.log();
  }
}

function printHealthReport(report: HealthReport, verbose: boolean = false, byArch: boolean = false): void {
  console.log();
  console.log(chalk.bold('══════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('                    ARCHCODEX HEALTH REPORT'));
  console.log(chalk.bold('══════════════════════════════════════════════════════════════'));

  // Override Debt
  console.log();
  console.log(chalk.bold('Override Debt'));
  console.log(chalk.dim('─'.repeat(40)));

  const { overrideDebt } = report;
  if (overrideDebt.active === 0) {
    console.log(chalk.green('  ✓ No active overrides'));
  } else {
    console.log(`  Active:       ${chalk.yellow(overrideDebt.active)} overrides across ${overrideDebt.filesWithOverrides} files`);

    if (overrideDebt.expiringSoon > 0) {
      console.log(`  Expiring:     ${chalk.yellow(overrideDebt.expiringSoon)} (within 30 days)`);
    }

    if (overrideDebt.expired > 0) {
      console.log(`  ${chalk.red('Expired:')}      ${chalk.red(overrideDebt.expired)} ${chalk.red('⚠')}`);
    }

    if (overrideDebt.noExpiry > 0) {
      console.log(`  No expiry:    ${chalk.dim(overrideDebt.noExpiry)}`);
    }
  }

  // Coverage
  console.log();
  console.log(chalk.bold('Architecture Coverage'));
  console.log(chalk.dim('─'.repeat(40)));

  const { coverage } = report;
  const coverageColor = coverage.coveragePercent >= 80 ? chalk.green :
    coverage.coveragePercent >= 50 ? chalk.yellow : chalk.red;

  console.log(`  Tagged files: ${coverage.taggedFiles}/${coverage.totalFiles} (${coverageColor(coverage.coveragePercent + '%')})`);

  if (coverage.untaggedFiles > 0) {
    console.log(`  Untagged:     ${chalk.dim(coverage.untaggedFiles)} files`);

    if (coverage.untaggedSample.length > 0) {
      console.log();
      if (verbose) {
        console.log(chalk.dim('  All untagged files:'));
        for (const file of coverage.untaggedSample) {
          console.log(chalk.dim(`    - ${file}`));
        }
      } else {
        console.log(chalk.dim('  Sample untagged files:'));
        for (const file of coverage.untaggedSample.slice(0, 5)) {
          console.log(chalk.dim(`    - ${file}`));
        }
        if (coverage.untaggedFiles > 5) {
          console.log(chalk.dim(`    ... and ${coverage.untaggedFiles - 5} more (use --verbose to see all)`));
        }
      }
    }
  }

  // Architecture Usage (when --by-arch is set)
  if (byArch && coverage.archUsage && coverage.archUsage.length > 0) {
    console.log();
    console.log(chalk.bold('Architecture Usage'));
    console.log(chalk.dim('─'.repeat(40)));

    // Calculate max width for alignment
    const maxArchLen = Math.max(...coverage.archUsage.map(a => a.archId.length));

    for (const usage of coverage.archUsage) {
      const padding = ' '.repeat(maxArchLen - usage.archId.length);
      const countStr = usage.fileCount.toString().padStart(3, ' ');
      console.log(`  ${usage.archId}${padding}  ${chalk.cyan(countStr)} files`);
    }
  }

  // Registry Health (unused architectures)
  console.log();
  console.log(chalk.bold('Registry Health'));
  console.log(chalk.dim('─'.repeat(40)));

  const { registryHealth } = report;
  const usageColor = registryHealth.usagePercent >= 80 ? chalk.green :
    registryHealth.usagePercent >= 50 ? chalk.yellow : chalk.dim;

  console.log(`  Architectures: ${registryHealth.usedArchitectures}/${registryHealth.totalArchitectures} in use (${usageColor(registryHealth.usagePercent + '%')})`);

  if (registryHealth.unusedArchitectures > 0) {
    console.log(`  Unused:        ${chalk.dim(registryHealth.unusedArchitectures)} architecture(s)`);

    if (verbose && registryHealth.unusedArchIds.length > 0) {
      console.log();
      console.log(chalk.dim('  Unused architectures:'));
      for (const archId of registryHealth.unusedArchIds) {
        console.log(chalk.dim(`    - ${archId}`));
      }
    } else if (registryHealth.unusedArchIds.length > 0) {
      console.log();
      console.log(chalk.dim('  Sample unused:'));
      for (const archId of registryHealth.unusedArchIds.slice(0, 5)) {
        console.log(chalk.dim(`    - ${archId}`));
      }
      if (registryHealth.unusedArchitectures > 5) {
        console.log(chalk.dim(`    ... and ${registryHealth.unusedArchitectures - 5} more (use --verbose to see all)`));
      }
    }
  } else {
    console.log(chalk.green('  ✓ All architectures are in use'));
  }

  // Bloat Detection (verbose mode shows all, otherwise just counts)
  const hasBloat = registryHealth.similarArchitectures?.length ||
    registryHealth.redundantArchitectures?.length ||
    registryHealth.deepInheritance?.length ||
    registryHealth.lowUsageArchitectures?.length ||
    registryHealth.singletonViolations?.length;

  if (hasBloat) {
    console.log();
    console.log(chalk.bold('Bloat Detection'));
    console.log(chalk.dim('─'.repeat(40)));

    // Similar architectures
    if (registryHealth.similarArchitectures?.length) {
      console.log(`  Similar:       ${chalk.yellow(registryHealth.similarArchitectures.length)} pair(s) with ≥80% overlap`);
      if (verbose) {
        for (const pair of registryHealth.similarArchitectures) {
          console.log(chalk.dim(`    - ${pair.archId1} ↔ ${pair.archId2} (${Math.round(pair.similarity * 100)}%)`));
        }
      }
    }

    // Redundant architectures
    if (registryHealth.redundantArchitectures?.length) {
      console.log(`  Redundant:     ${chalk.dim(registryHealth.redundantArchitectures.length)} architecture(s) add no unique value`);
      if (verbose) {
        for (const arch of registryHealth.redundantArchitectures) {
          console.log(chalk.dim(`    - ${arch.archId} → use ${arch.parentArchId}`));
        }
      }
    }

    // Deep inheritance
    if (registryHealth.deepInheritance?.length) {
      console.log(`  Deep chains:   ${chalk.dim(registryHealth.deepInheritance.length)} architecture(s) with >3 levels`);
      if (verbose) {
        for (const arch of registryHealth.deepInheritance) {
          console.log(chalk.dim(`    - ${arch.archId} (${arch.depth} levels: ${arch.chain.join(' → ')})`));
        }
      }
    }

    // Low usage architectures
    if (registryHealth.lowUsageArchitectures?.length) {
      const singleFile = registryHealth.lowUsageArchitectures.filter(a => a.fileCount === 1);
      const twoFiles = registryHealth.lowUsageArchitectures.filter(a => a.fileCount === 2);

      if (singleFile.length > 0) {
        console.log(`  Single-file:   ${chalk.yellow(singleFile.length)} architecture(s) used by only 1 file`);
        if (verbose) {
          for (const arch of singleFile) {
            console.log(chalk.dim(`    - ${arch.archId}`));
          }
        }
      }

      if (twoFiles.length > 0) {
        console.log(`  Low-usage:     ${chalk.dim(twoFiles.length)} architecture(s) used by only 2 files`);
        if (verbose) {
          for (const arch of twoFiles) {
            console.log(chalk.dim(`    - ${arch.archId}`));
          }
        }
      }
    }

    // Singleton violations (architectures marked singleton but used by multiple files)
    if (registryHealth.singletonViolations?.length) {
      console.log(`  Singleton:     ${chalk.red(registryHealth.singletonViolations.length)} violation(s) - singleton archs with multiple files`);
      if (verbose) {
        for (const violation of registryHealth.singletonViolations) {
          console.log(chalk.dim(`    - ${violation.archId} (${violation.fileCount} files)`));
          for (const file of violation.files) {
            console.log(chalk.dim(`        ${file}`));
          }
        }
      }
    }

    if (!verbose) {
      console.log(chalk.dim('  (use --verbose to see details)'));
    }
  }

  // Layer Coverage
  if (report.layerHealth) {
    printLayerCoverage(report.layerHealth, verbose);
  }

  // Discovery Index Status
  if (report.indexStatus) {
    console.log();
    console.log(chalk.bold('Discovery Index'));
    console.log(chalk.dim('─'.repeat(40)));

    if (report.indexStatus.isStale) {
      console.log(`  Status: ${chalk.yellow('STALE')} ${chalk.yellow('⚠')}`);
      console.log(`  Reason: ${chalk.dim(report.indexStatus.reason ?? 'unknown')}`);
      if (report.indexStatus.missingArchIds?.length) {
        console.log(`  Missing: ${chalk.dim(report.indexStatus.missingArchIds.length)} architecture(s)`);
      }
    } else {
      console.log(chalk.green('  ✓ Index is up to date'));
    }
  }

  // Intent Health
  if (report.intentHealth) {
    const { intentHealth } = report;
    console.log();
    console.log(chalk.bold('Intent Health'));
    console.log(chalk.dim('─'.repeat(40)));

    // Show registry error if present
    if (intentHealth.registryError) {
      console.log(`  ${chalk.red('Registry Error:')} ${chalk.dim(intentHealth.registryError)}`);
    }

    const coverageColor = intentHealth.intentCoveragePercent >= 20 ? chalk.green :
      intentHealth.intentCoveragePercent >= 5 ? chalk.yellow : chalk.dim;

    console.log(`  Files with intents: ${intentHealth.filesWithIntents}/${intentHealth.totalFiles} (${coverageColor(intentHealth.intentCoveragePercent + '%')})`);

    // Show breakdown of file-level vs function-level intents
    const fileLevelCount = intentHealth.fileLevelIntents ?? 0;
    const funcLevelCount = intentHealth.functionLevelIntents ?? 0;
    console.log(`  Total intents:      ${chalk.cyan(intentHealth.totalIntents)} (${intentHealth.uniqueIntents} unique)`);
    if (intentHealth.totalIntents > 0) {
      console.log(`    File-level:     ${chalk.dim(fileLevelCount)}`);
      console.log(`    Function-level: ${chalk.cyan(funcLevelCount)}`);
    }

    if (intentHealth.undefinedIntents.length > 0) {
      console.log(`  ${chalk.yellow('Undefined:')}       ${chalk.yellow(intentHealth.undefinedIntents.length)} intent(s)`);
      if (verbose) {
        for (const intent of intentHealth.undefinedIntents) {
          console.log(chalk.dim(`    - ${intent}`));
        }
      }
    }

    if (intentHealth.unusedIntents.length > 0) {
      console.log(`  Unused:           ${chalk.dim(intentHealth.unusedIntents.length)} defined intent(s)`);
      if (verbose) {
        for (const intent of intentHealth.unusedIntents) {
          console.log(chalk.dim(`    - ${intent}`));
        }
      }
    }

    if (intentHealth.validationIssues > 0) {
      console.log(`  ${chalk.yellow('Issues:')}          ${chalk.yellow(intentHealth.validationIssues)} validation issue(s)`);
    }

    if (intentHealth.undefinedIntents.length === 0 && intentHealth.validationIssues === 0) {
      console.log(chalk.green('  ✓ All intents are valid'));
    }
  }

  // Top Violated Constraints
  if (report.topViolatedConstraints.length > 0) {
    console.log();
    console.log(chalk.bold('Top Overridden Constraints'));
    console.log(chalk.dim('─'.repeat(40)));

    for (const stat of report.topViolatedConstraints) {
      console.log(`  ${chalk.yellow(stat.overrideCount)} overrides: ${stat.constraint}`);
    }
  }

  // Top Overridden Architectures
  if (report.topOverriddenArchs && report.topOverriddenArchs.length > 0) {
    console.log();
    console.log(chalk.bold('Top Overridden Architectures'));
    console.log(chalk.dim('─'.repeat(40)));

    for (const stat of report.topOverriddenArchs) {
      console.log(`  ${chalk.yellow(stat.overrideCount)} overrides: ${stat.archId} (${stat.filesWithOverrides} files)`);
    }
  }

  // Files with Multiple Overrides
  if (report.filesWithMultipleOverrides && report.filesWithMultipleOverrides.length > 0) {
    console.log();
    console.log(chalk.bold('Files with Multiple Overrides'));
    console.log(chalk.dim('─'.repeat(40)));

    for (const stat of report.filesWithMultipleOverrides) {
      const archInfo = stat.archId ? chalk.dim(` (${stat.archId})`) : '';
      const countColor = stat.overrideCount >= 3 ? chalk.red : chalk.yellow;
      console.log(`  ${countColor(stat.overrideCount)} overrides: ${stat.filePath}${archInfo}`);
    }
  }

  // Recommendations
  console.log();
  console.log(chalk.bold('Recommendations'));
  console.log(chalk.dim('─'.repeat(40)));

  for (const rec of report.recommendations) {
    printRecommendation(rec);
  }

  console.log();
}

