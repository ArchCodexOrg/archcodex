/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * CLI command for code similarity analysis.
 * - scan: Find similar files across codebase
 * - check: Check consistency against similar peers
 * - blocks: Find similar code blocks (functions/methods)
 */
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../../core/config/loader.js';
import { SimilarityAnalyzer, detectDuplicates } from '../../core/similarity/index.js';
import { globFiles } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';
import { logger } from '../../utils/logger.js';
import { findSimilarBlocks } from '../../core/similarity/block-analyzer.js';

interface ScanOptions {
  threshold?: string;
  sameArch?: boolean;
  json?: boolean;
}

interface CheckOptions {
  threshold?: string;
  sameArch?: boolean;
  json?: boolean;
}

interface BlocksOptions {
  threshold?: string;
  minLines?: string;
  maxBlocks?: string;
  maxMatches?: string;
  json?: boolean;
}

export function createSimilarityCommand(): Command {
  const cmd = new Command('similarity')
    .description('Analyze code similarity - find duplicates, check consistency, detect code blocks');

  // Subcommand: scan - find similar files
  cmd.addCommand(
    new Command('scan')
      .description('Find similar files across the codebase')
      .argument('[files...]', 'Files or glob patterns to analyze')
      .option('--threshold <n>', 'Minimum similarity percentage (default: 50)', '50')
      .option('--same-arch', 'Only compare files with same @arch tag')
      .option('--json', 'Output as JSON')
      .action(async (files: string[], options: ScanOptions) => {
        try {
          await runScan(files, options);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  );

  // Subcommand: check - consistency check against peers
  cmd.addCommand(
    new Command('check')
      .description('Check file consistency against similar peers')
      .argument('<file>', 'File to check')
      .option('--threshold <n>', 'Minimum similarity to consider peers (default: 60)', '60')
      .option('--same-arch', 'Only compare with same @arch (default: true)')
      .option('--json', 'Output as JSON')
      .action(async (file: string, options: CheckOptions) => {
        try {
          await runCheck(file, options);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  );

  // Subcommand: blocks - find similar code blocks
  cmd.addCommand(
    new Command('blocks')
      .description('Find similar code blocks (functions/methods) across files')
      .argument('[files...]', 'Files or glob patterns to analyze')
      .option('--threshold <n>', 'Minimum similarity percentage (default: 80)', '80')
      .option('--min-lines <n>', 'Minimum lines for a block to consider (default: 5)', '5')
      .option('--max-blocks <n>', 'Maximum blocks to analyze (default: 5000)', '5000')
      .option('--max-matches <n>', 'Maximum matches to return (default: 200)', '200')
      .option('--json', 'Output as JSON')
      .action(async (files: string[], options: BlocksOptions) => {
        try {
          await runBlocks(files, options);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  );

  // Default: show help
  cmd.action(() => {
    console.log();
    console.log(chalk.bold('Code Similarity Analysis'));
    console.log();
    console.log('Commands:');
    console.log(chalk.dim('  similarity scan [files...]     Find similar files'));
    console.log(chalk.dim('  similarity check <file>        Check against similar peers'));
    console.log(chalk.dim('  similarity blocks [files...]   Find similar code blocks'));
    console.log();
    console.log('Examples:');
    console.log(chalk.dim('  archcodex similarity scan                        # Scan all files'));
    console.log(chalk.dim('  archcodex similarity scan src/services/          # Specific directory'));
    console.log(chalk.dim('  archcodex similarity check src/UserService.ts    # Check one file'));
    console.log(chalk.dim('  archcodex similarity blocks --threshold 90       # Find code clones'));
  });

  return cmd;
}

/**
 * Scan for similar files across codebase.
 */
async function runScan(files: string[], options: ScanOptions): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  const archIgnore = await loadArchIgnore(projectRoot);

  // Resolve files
  let filePaths = await resolveFiles(files, projectRoot, config, archIgnore);
  filePaths = filePaths.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

  if (filePaths.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'No files to analyze' }));
    } else {
      logger.warn('No TypeScript files found to analyze.');
    }
    return;
  }

  const threshold = parseInt(options.threshold || '50', 10) / 100;

  console.log(chalk.dim(`Scanning ${filePaths.length} files for similarity...`));

  const duplicates = await detectDuplicates(projectRoot, filePaths, threshold);

  if (options.json) {
    console.log(JSON.stringify({ pairs: duplicates, threshold: options.threshold }, null, 2));
    return;
  }

  if (duplicates.length === 0) {
    console.log();
    console.log(chalk.green(`✓ No similar files found above ${options.threshold}% threshold.`));
    return;
  }

  console.log();
  console.log(chalk.bold(`🔍 Similar Files (${duplicates.length} pairs above ${options.threshold}%)`));
  console.log();

  for (const { file, matches } of duplicates) {
    for (const match of matches) {
      const pct = Math.round(match.similarity * 100);
      console.log(`  ${chalk.cyan(file)} ${chalk.dim('≈')} ${chalk.cyan(match.file)} ${chalk.yellow(`(${pct}%)`)}`);

      // Show what matched
      for (const aspect of match.matchedAspects) {
        if (aspect.items.length > 0) {
          const items = aspect.items.slice(0, 5).join(', ');
          const more = aspect.items.length > 5 ? ` +${aspect.items.length - 5} more` : '';
          console.log(`    ${chalk.dim(aspect.type + ':')} ${items}${more}`);
        }
      }
      console.log();
    }
  }

  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.yellow('Consider consolidating similar files or extracting shared logic.'));
}

/**
 * Check file consistency against similar peers.
 */
async function runCheck(file: string, options: CheckOptions): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  const archIgnore = await loadArchIgnore(projectRoot);

  // Get all candidate files
  const patterns = config.files?.scan?.include || ['**/*.ts', '**/*.tsx'];
  const exclude = config.files?.scan?.exclude || ['**/node_modules/**', '**/dist/**'];
  let allFiles: string[] = [];
  for (const pattern of patterns) {
    const matches = await globFiles(pattern, { cwd: projectRoot, absolute: true, ignore: exclude });
    allFiles.push(...matches);
  }
  allFiles = archIgnore.filter(allFiles);

  const threshold = parseInt(options.threshold || '60', 10) / 100;
  const sameArchOnly = options.sameArch !== false; // default true

  const analyzer = new SimilarityAnalyzer(projectRoot);
  try {
    const issues = await analyzer.findInconsistencies(file, allFiles, {
      threshold,
      sameArchOnly,
      minDiff: 1,
    });

    if (options.json) {
      console.log(JSON.stringify({ file, issues }, null, 2));
      return;
    }

    if (issues.length === 0) {
      console.log();
      console.log(chalk.green(`✓ No consistency issues found for ${file}`));
      return;
    }

    console.log();
    console.log(chalk.bold(`🔍 Consistency Issues for ${chalk.cyan(file)}`));
    console.log();

    for (const issue of issues) {
      const pct = Math.round(issue.similarity * 100);
      console.log(`  Compared to: ${chalk.cyan(issue.referenceFile)} ${chalk.yellow(`(${pct}% similar)`)}`);

      if (issue.missing.methods.length > 0) {
        console.log(`    ${chalk.red('Missing methods:')} ${issue.missing.methods.join(', ')}`);
      }
      if (issue.missing.exports.length > 0) {
        console.log(`    ${chalk.red('Missing exports:')} ${issue.missing.exports.join(', ')}`);
      }
      if (issue.extra.methods.length > 0) {
        console.log(`    ${chalk.dim('Extra methods:')} ${issue.extra.methods.join(', ')}`);
      }
      if (issue.extra.exports.length > 0) {
        console.log(`    ${chalk.dim('Extra exports:')} ${issue.extra.exports.join(', ')}`);
      }
      console.log();
    }
  } finally {
    analyzer.dispose();
  }
}

/**
 * Find similar code blocks across files.
 */
async function runBlocks(files: string[], options: BlocksOptions): Promise<void> {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);
  const archIgnore = await loadArchIgnore(projectRoot);

  // Resolve files
  let filePaths = await resolveFiles(files, projectRoot, config, archIgnore);
  filePaths = filePaths.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));

  if (filePaths.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'No files to analyze' }));
    } else {
      logger.warn('No TypeScript files found to analyze.');
    }
    return;
  }

  const threshold = parseInt(options.threshold || '80', 10) / 100;
  const minLines = parseInt(options.minLines || '5', 10);

  console.log(chalk.dim(`Scanning ${filePaths.length} files for similar code blocks...`));

  const matches = await findSimilarBlocks(projectRoot, filePaths, { threshold, minLines });

  if (options.json) {
    console.log(JSON.stringify({ matches, threshold: options.threshold, minLines }, null, 2));
    return;
  }

  if (matches.length === 0) {
    console.log();
    console.log(chalk.green(`✓ No similar code blocks found above ${options.threshold}% threshold.`));
    return;
  }

  console.log();
  console.log(chalk.bold(`🔍 Similar Code Blocks (${matches.length} pairs above ${options.threshold}%)`));
  console.log();

  for (const match of matches) {
    const pct = Math.round(match.similarity * 100);
    console.log(`  ${chalk.cyan(match.block1.name)} ${chalk.dim('in')} ${match.block1.file}:${match.block1.line}`);
    console.log(`  ${chalk.dim('≈')} ${chalk.cyan(match.block2.name)} ${chalk.dim('in')} ${match.block2.file}:${match.block2.line} ${chalk.yellow(`(${pct}%)`)}`);
    console.log(`    ${chalk.dim(`${match.block1.lines} lines each`)}`);
    console.log();
  }

  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.yellow('Consider extracting similar code into shared functions.'));
}

/**
 * Resolve file patterns to absolute paths.
 * Handles directories by expanding them to include all TypeScript files.
 */
async function resolveFiles(
  files: string[],
  projectRoot: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  archIgnore: Awaited<ReturnType<typeof loadArchIgnore>>
): Promise<string[]> {
  let filePaths: string[];
  const exclude = config.files?.scan?.exclude || ['**/node_modules/**', '**/dist/**'];

  if (files.length > 0) {
    filePaths = [];
    for (let pattern of files) {
      // Check if pattern is a directory and expand to glob
      const fullPath = path.isAbsolute(pattern) ? pattern : path.resolve(projectRoot, pattern);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          // Expand directory to include all TypeScript files
          pattern = path.join(pattern, '**/*.{ts,tsx}');
        }
      } catch {
        // Path doesn't exist or can't be accessed - treat as glob pattern
      }
      const matches = await globFiles(pattern, { cwd: projectRoot, absolute: false, ignore: exclude });
      filePaths.push(...matches);
    }
  } else {
    const patterns = config.files?.scan?.include || ['**/*.ts', '**/*.tsx'];
    filePaths = [];
    for (const pattern of patterns) {
      const matches = await globFiles(pattern, { cwd: projectRoot, absolute: false, ignore: exclude });
      filePaths.push(...matches);
    }
  }

  return archIgnore.filter(filePaths);
}
