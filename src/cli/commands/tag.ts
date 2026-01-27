/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Bulk tagging command - Add @arch tags to multiple files.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { globFiles, readFile, writeFile } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';
import { parseArchTags } from '../../core/arch-tag/parser.js';
import { logger } from '../../utils/logger.js';
import { insertArchTag, replaceArchTag } from '../../utils/arch-tag.js';

interface TagOptions {
  arch: string;
  dryRun?: boolean;
  force?: boolean;
  quiet?: boolean;
}

/**
 * Create the tag command.
 */
export function createTagCommand(): Command {
  return new Command('tag')
    .description('Add @arch tags to files in bulk')
    .argument('<pattern>', 'Glob pattern for files to tag (e.g., "src/hooks/**/*.ts")')
    .requiredOption('-a, --arch <archId>', 'Architecture ID to apply')
    .option('--dry-run', 'Show what would be changed without modifying files')
    .option('-f, --force', 'Overwrite existing @arch tags')
    .option('-q, --quiet', 'Suppress detailed output')
    .action(async (pattern: string, options: TagOptions) => {
      try {
        await runTag(pattern, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runTag(pattern: string, options: TagOptions): Promise<void> {
  const projectRoot = process.cwd();
  const allFiles = await globFiles(pattern, {
    cwd: projectRoot, absolute: false, ignore: ['node_modules/**', 'dist/**', 'build/**'],
  });
  const archIgnore = await loadArchIgnore(projectRoot);
  const files = archIgnore.filter(allFiles);

  if (files.length === 0) {
    logger.warn('No files found matching the pattern.');
    return;
  }

  if (!options.quiet) {
    logger.info(`Found ${files.length} file(s) matching "${pattern}"`);
  }

  let tagged = 0, skipped = 0, errors = 0;

  for (const file of files) {
    try {
      const result = await tagFile(projectRoot, file, options.arch, {
        dryRun: options.dryRun, force: options.force,
      });
      if (result === 'tagged') {
        tagged++;
        if (!options.quiet) {
          const prefix = options.dryRun ? chalk.cyan('[dry-run]') : chalk.green('✓');
          console.log(`${prefix} ${file} → @arch ${options.arch}`);
        }
      } else if (result === 'skipped') {
        skipped++;
        if (!options.quiet && !options.dryRun) {
          console.log(`${chalk.yellow('○')} ${file} (already tagged)`);
        }
      }
    } catch (error) {
      errors++;
      if (!options.quiet) {
        console.log(`${chalk.red('✗')} ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  console.log();
  if (options.dryRun) {
    console.log(chalk.cyan(`Dry run: Would tag ${tagged} file(s), skip ${skipped} (already tagged)`));
  } else {
    console.log(chalk.green(`Tagged ${tagged} file(s)`));
    if (skipped > 0) console.log(chalk.yellow(`Skipped ${skipped} (use --force to overwrite)`));
  }
  if (errors > 0) console.log(chalk.red(`Errors: ${errors}`));
}

async function tagFile(
  projectRoot: string, filePath: string, archId: string,
  options: { dryRun?: boolean; force?: boolean }
): Promise<'tagged' | 'skipped'> {
  const fullPath = `${projectRoot}/${filePath}`;
  const content = await readFile(fullPath);
  const { archTag } = parseArchTags(content);

  if (archTag && !options.force) return 'skipped';

  const newContent = archTag && options.force
    ? replaceArchTag(content, archId)
    : insertArchTag(content, archId);

  if (!options.dryRun) await writeFile(fullPath, newContent);
  return 'tagged';
}

