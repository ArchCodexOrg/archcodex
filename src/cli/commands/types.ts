/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * CLI command for type consistency analysis.
 * Detects duplicate and similar type definitions across the codebase.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../core/config/loader.js';
import { DuplicateDetector } from '../../core/types/duplicate-detector.js';
import { globFiles } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';
import { logger } from '../../utils/logger.js';
import type { DuplicateReport, DuplicateGroup } from '../../core/types/types.js';

interface TypesCommandOptions {
  threshold?: string;
  minProperties?: string;
  includePrivate?: boolean;
  json?: boolean;
}

/**
 * Create the types command.
 */
export function createTypesCommand(): Command {
  const cmd = new Command('types')
    .description('Analyze type definitions for duplicates and inconsistencies')
    .argument('[files...]', 'Files or glob patterns to analyze')
    .option('--threshold <n>', 'Minimum similarity for "similar" types (0-100)', '80')
    .option('--min-properties <n>', 'Minimum properties to consider a type', '2')
    .option('--include-private', 'Include non-exported types')
    .option('--json', 'Output as JSON')
    .action(async (files: string[], options: TypesCommandOptions) => {
      try {
        await runTypes(files, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Subcommand: duplicates - find duplicate types
  const duplicatesCmd = new Command('duplicates')
    .description('Find duplicate type definitions across the codebase')
    .option('--threshold <n>', 'Minimum similarity for "similar" types (0-100)', '80')
    .option('--min-properties <n>', 'Minimum properties to consider a type', '2')
    .option('--include-private', 'Include non-exported types')
    .option('--json', 'Output as JSON')
    .argument('[files...]', 'Files or glob patterns to analyze')
    .action(async (files: string[], options: TypesCommandOptions) => {
        try {
          await runDuplicates(files, options);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      });

  cmd.addCommand(duplicatesCmd);

  return cmd;
}

/**
 * Default types command - show help.
 */
async function runTypes(files: string[], options: TypesCommandOptions): Promise<void> {
  // If files provided, run duplicates
  if (files.length > 0) {
    await runDuplicates(files, options);
    return;
  }

  // Show help
  console.log();
  console.log(chalk.bold('Type Consistency Analysis'));
  console.log();
  console.log('Commands:');
  console.log(chalk.dim('  archcodex types duplicates [files...]  Find duplicate types'));
  console.log();
  console.log('Examples:');
  console.log(chalk.dim('  archcodex types duplicates                    # Scan all source files'));
  console.log(chalk.dim('  archcodex types duplicates src/models         # Scan specific directory'));
  console.log(chalk.dim('  archcodex types duplicates --threshold 90     # Higher similarity threshold'));
}

/**
 * Run duplicate detection.
 */
async function runDuplicates(files: string[], options: TypesCommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  const archIgnore = await loadArchIgnore(projectRoot);

  // Resolve files
  let filePaths: string[];
  if (files.length > 0) {
    filePaths = [];
    for (const pattern of files) {
      const matches = await globFiles(pattern, {
        cwd: projectRoot,
        absolute: false,
      });
      filePaths.push(...matches);
    }
  } else {
    // Use config scan patterns
    const patterns = config.files?.scan?.include || ['**/*.ts', '**/*.tsx'];
    const exclude = config.files?.scan?.exclude || ['**/node_modules/**', '**/dist/**'];

    filePaths = [];
    for (const pattern of patterns) {
      const matches = await globFiles(pattern, {
        cwd: projectRoot,
        absolute: false,
        ignore: exclude,
      });
      filePaths.push(...matches);
    }
  }

  // Filter by archignore
  filePaths = archIgnore.filter(filePaths);

  // Filter to TypeScript files only
  filePaths = filePaths.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

  if (filePaths.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'No files to analyze' }));
    } else {
      logger.warn('No TypeScript files found to analyze.');
    }
    return;
  }

  // Parse options
  const threshold = parseInt(options.threshold || '80', 10) / 100;
  const minProperties = parseInt(options.minProperties || '2', 10);

  // Run detector
  const detector = new DuplicateDetector(projectRoot, {
    similarityThreshold: threshold,
    minProperties,
    exportedOnly: !options.includePrivate,
    skipImplementations: true,
  });

  try {
    const report = await detector.scanFiles(filePaths);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }

    // Exit with error if duplicates found
    if (report.exactDuplicates > 0 || report.renamedDuplicates > 0) {
      process.exit(1);
    }
  } finally {
    detector.dispose();
  }
}

/**
 * Print duplicate report.
 */
function printReport(report: DuplicateReport): void {
  console.log();
  console.log(chalk.bold('🔍 Type Consistency Report'));
  console.log();
  console.log(`  Types scanned: ${report.totalTypes}`);
  console.log();

  // Exact duplicates
  const exactGroups = report.groups.filter(g => g.duplicates.some(d => d.matchType === 'exact'));
  if (exactGroups.length > 0) {
    console.log(chalk.bold.red(`EXACT DUPLICATES (${report.exactDuplicates})`));
    for (const group of exactGroups) {
      printDuplicateGroup(group, 'exact');
    }
    console.log();
  }

  // Renamed duplicates
  const renamedGroups = report.groups.filter(g => g.duplicates.some(d => d.matchType === 'renamed'));
  if (renamedGroups.length > 0) {
    console.log(chalk.bold.yellow(`RENAMED DUPLICATES (${report.renamedDuplicates})`));
    for (const group of renamedGroups) {
      printDuplicateGroup(group, 'renamed');
    }
    console.log();
  }

  // Similar types
  const similarGroups = report.groups.filter(g => g.duplicates.some(d => d.matchType === 'similar'));
  if (similarGroups.length > 0) {
    console.log(chalk.bold.cyan(`SIMILAR TYPES (${report.similarTypes})`));
    for (const group of similarGroups) {
      printDuplicateGroup(group, 'similar');
    }
    console.log();
  }

  // Summary
  console.log(chalk.bold('─'.repeat(50)));
  console.log();
  if (report.exactDuplicates > 0 || report.renamedDuplicates > 0) {
    console.log(chalk.red('⚠ Duplicate types found. Consider consolidating.'));
  } else if (report.similarTypes > 0) {
    console.log(chalk.yellow('Similar types detected. Review for potential consolidation.'));
  } else {
    console.log(chalk.green('✓ No duplicate types found.'));
  }
}

/**
 * Print a single duplicate group.
 */
function printDuplicateGroup(group: DuplicateGroup, type: 'exact' | 'renamed' | 'similar'): void {
  const icon = type === 'exact' ? '≡' : type === 'renamed' ? '~' : '≈';
  const canonical = group.canonical;

  console.log(`  ${icon} ${chalk.cyan(canonical.name)}`);
  console.log(`    ${chalk.dim('→')} ${canonical.file}:${canonical.line}`);

  for (const dup of group.duplicates) {
    const similarity = type === 'similar' ? ` (${Math.round(dup.similarity * 100)}%)` : '';
    const dupName = dup.type.name !== canonical.name ? ` (as ${dup.type.name})` : '';
    console.log(`    ${chalk.dim('→')} ${dup.type.file}:${dup.type.line}${dupName}${chalk.dim(similarity)}`);

    if (type === 'similar') {
      if (dup.missingProperties.length > 0) {
        console.log(`      ${chalk.dim('Missing:')} ${dup.missingProperties.join(', ')}`);
      }
      if (dup.extraProperties.length > 0) {
        console.log(`      ${chalk.dim('Extra:')} ${dup.extraProperties.join(', ')}`);
      }
      if (dup.typeDifferences.length > 0) {
        for (const diff of dup.typeDifferences.slice(0, 3)) {
          console.log(`      ${chalk.dim('Type mismatch:')} ${diff.name}: ${diff.actual} vs ${diff.expected}`);
        }
      }
    }
  }

  console.log(`    ${chalk.dim('Suggestion:')} ${group.suggestion}`);
}
