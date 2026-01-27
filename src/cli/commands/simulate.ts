/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry } from '../../core/registry/loader.js';
import { loadRegistryFromRef } from '../../core/diff/git-loader.js';
import { SimulationAnalyzer, formatRegistryChanges } from '../../core/simulate/index.js';
import type { SimulationResult, FileImpact, RiskLevel } from '../../core/simulate/types.js';
import { logger } from '../../utils/logger.js';
import { loadYamlWithSchema } from '../../utils/yaml.js';
import { RegistrySchema } from '../../core/registry/schema.js';
import { fileExists } from '../../utils/file-system.js';
import * as path from 'node:path';

interface SimulateOptions {
  from?: string;
  json?: boolean;
  verbose?: boolean;
  maxFiles?: number;
  include?: string[];
}

/**
 * Create the simulate command.
 */
export function createSimulateCommand(): Command {
  return new Command('simulate')
    .description('Preview impact of registry changes before applying')
    .argument('[proposed-registry]', 'Path to proposed registry file')
    .option('--from <ref>', 'Git ref to compare from (e.g., main, HEAD~1)')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Show detailed file-by-file breakdown')
    .option('--max-files <n>', 'Maximum files to analyze', parseInt)
    .option('--include <patterns...>', 'File patterns to include')
    .action(async (proposedPath: string | undefined, options: SimulateOptions) => {
      try {
        await runSimulate(proposedPath, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runSimulate(
  proposedPath: string | undefined,
  options: SimulateOptions
): Promise<void> {
  const projectRoot = process.cwd();

  // Load current config
  const config = await loadConfig(projectRoot);

  // Load registries
  let currentRegistry;
  let proposedRegistry;
  let fromRef = 'current';
  let toRef = 'proposed';

  if (options.from) {
    // Compare from git ref
    currentRegistry = await loadRegistryFromRef(projectRoot, options.from);
    fromRef = options.from;
  } else {
    // Use current registry as base
    currentRegistry = await loadRegistry(projectRoot);
  }

  if (proposedPath) {
    // Load proposed registry from file
    const fullPath = path.resolve(projectRoot, proposedPath);
    const exists = await fileExists(fullPath);
    if (!exists) {
      throw new Error(`Proposed registry file not found: ${proposedPath}`);
    }
    proposedRegistry = await loadYamlWithSchema(fullPath, RegistrySchema);
    toRef = proposedPath;
  } else if (options.from) {
    // Compare git ref to current registry
    proposedRegistry = await loadRegistry(projectRoot);
    toRef = 'HEAD';
  } else {
    throw new Error(
      'Either provide a proposed registry file or use --from <git-ref> to compare'
    );
  }

  // Run simulation
  const analyzer = new SimulationAnalyzer(projectRoot, config);
  const result = await analyzer.simulate(currentRegistry, proposedRegistry, {
    filePatterns: options.include,
    verbose: options.verbose,
    maxFiles: options.maxFiles,
  });

  // Update refs for display
  result.fromRef = fromRef;
  result.toRef = toRef;

  // Output
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanOutput(result, options.verbose);
  }

  // Exit with code based on risk
  const exitCode = result.summary.riskLevel === 'critical' ? 1 : 0;
  process.exit(exitCode);
}

function printHumanOutput(result: SimulationResult, verbose?: boolean): void {
  const { summary, diff } = result;

  // Header
  console.log();
  console.log(chalk.bold('══════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('                    SIMULATION REPORT'));
  console.log(chalk.bold('══════════════════════════════════════════════════════════════════'));

  // Registry Changes
  console.log();
  console.log(chalk.bold('Registry Changes'));
  console.log(chalk.dim('────────────────────────────────────────'));

  const changes = formatRegistryChanges(diff);

  if (changes.added.length > 0) {
    console.log(`  ${chalk.green('ADDED:')}    ${changes.added.length} architecture(s)`);
    for (const arch of changes.added) {
      console.log(`    ${chalk.green('+')} ${arch.archId}`);
    }
  }

  if (changes.modified.length > 0) {
    console.log(`  ${chalk.yellow('MODIFIED:')} ${changes.modified.length} architecture(s)`);
    for (const arch of changes.modified) {
      console.log(`    ${chalk.yellow('~')} ${arch.archId} ${chalk.dim(`(${arch.description})`)}`);
    }
  }

  if (changes.removed.length > 0) {
    console.log(`  ${chalk.red('REMOVED:')}  ${changes.removed.length} architecture(s)`);
    for (const arch of changes.removed) {
      console.log(`    ${chalk.red('-')} ${arch.archId}`);
    }
  }

  if (changes.added.length === 0 && changes.modified.length === 0 && changes.removed.length === 0) {
    console.log(`  ${chalk.dim('No architecture changes')}`);
  }

  // Impact Analysis
  console.log();
  console.log(chalk.bold('Impact Analysis'));
  console.log(chalk.dim('────────────────────────────────────────'));
  console.log(`  Files scanned:        ${summary.filesScanned}`);
  console.log(`  Currently passing:    ${summary.currentlyPassing}`);
  console.log(`  Currently failing:    ${chalk.red(String(summary.currentlyFailing))}`);
  console.log();
  console.log('  After applying changes:');

  if (summary.wouldBreak > 0) {
    console.log(`    Would ${chalk.red.bold('BREAK')}:         ${chalk.red(String(summary.wouldBreak))} files  ${chalk.yellow('⚠')}`);
  } else {
    console.log(`    Would BREAK:         ${chalk.green('0')} files  ${chalk.green('✓')}`);
  }

  if (summary.wouldFix > 0) {
    console.log(`    Would ${chalk.green.bold('FIX')}:           ${chalk.green(String(summary.wouldFix))} files  ${chalk.green('✓')}`);
  } else {
    console.log(`    Would FIX:           0 files`);
  }

  console.log(`    Unchanged:          ${summary.unchanged} files`);

  if (summary.newCoverage > 0) {
    console.log(`    New coverage:       ${chalk.blue(String(summary.newCoverage))} files`);
  }

  console.log();
  console.log(`  Risk Level: ${formatRiskLevel(summary.riskLevel)}`);

  // Breaking Changes
  if (result.wouldBreak.length > 0) {
    console.log();
    console.log(chalk.red.bold(`Breaking Changes (${result.wouldBreak.length} files)`));
    console.log(chalk.dim('────────────────────────────────────────'));

    const filesToShow = verbose ? result.wouldBreak : result.wouldBreak.slice(0, 5);
    for (const impact of filesToShow) {
      printFileImpact(impact, 'break');
    }

    if (!verbose && result.wouldBreak.length > 5) {
      console.log(chalk.dim(`  ... and ${result.wouldBreak.length - 5} more (use --verbose for full list)`));
    }
  }

  // Fixed by Changes
  if (result.wouldFix.length > 0) {
    console.log();
    console.log(chalk.green.bold(`Fixed by Changes (${result.wouldFix.length} files)`));
    console.log(chalk.dim('────────────────────────────────────────'));

    const filesToShow = verbose ? result.wouldFix : result.wouldFix.slice(0, 5);
    for (const impact of filesToShow) {
      printFileImpact(impact, 'fix');
    }

    if (!verbose && result.wouldFix.length > 5) {
      console.log(chalk.dim(`  ... and ${result.wouldFix.length - 5} more (use --verbose for full list)`));
    }
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    console.log();
    console.log(chalk.bold('Recommendations'));
    console.log(chalk.dim('────────────────────────────────────────'));
    for (const rec of result.recommendations) {
      console.log(`  ${chalk.cyan('→')} ${rec}`);
    }
  }

  console.log();
}

function printFileImpact(impact: FileImpact, type: 'break' | 'fix'): void {
  const symbol = type === 'break' ? chalk.red('✗') : chalk.green('✓');
  console.log(`  ${symbol} ${impact.file}`);
  if (impact.reason) {
    console.log(`    ${chalk.dim(impact.reason)}`);
  }
}

function formatRiskLevel(level: RiskLevel): string {
  switch (level) {
    case 'low':
      return chalk.green.bold('LOW');
    case 'medium':
      return chalk.yellow.bold('MEDIUM');
    case 'high':
      return chalk.red.bold('HIGH');
    case 'critical':
      return chalk.bgRed.white.bold(' CRITICAL ');
    default:
      return level;
  }
}
