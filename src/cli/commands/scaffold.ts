/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { loadIndex } from '../../core/discovery/index.js';
import { loadRegistry, loadIntentRegistry, suggestIntents } from '../../core/registry/loader.js';
import { ScaffoldEngine } from '../../core/scaffold/index.js';
import type { ScaffoldLanguage } from '../../core/scaffold/index.js';
import { logger as log } from '../../utils/logger.js';

/** Valid language options */
const VALID_LANGUAGES = ['typescript', 'python', 'go', 'ts', 'py'];

/**
 * Normalize language option to ScaffoldLanguage.
 */
function normalizeLanguage(lang: string): ScaffoldLanguage {
  switch (lang.toLowerCase()) {
    case 'python':
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'typescript':
    case 'ts':
    default:
      return 'typescript';
  }
}

/**
 * Create the scaffold command.
 */
export function createScaffoldCommand(): Command {
  return new Command('scaffold')
    .description('Generate a new file from an architecture template')
    .argument('<archId>', 'Architecture ID to use (e.g., domain.service)')
    .option('-n, --name <name>', 'Name for the generated class/component')
    .option('-o, --output <path>', 'Output directory')
    .option('-t, --template <template>', 'Template file to use')
    .option('-l, --lang <language>', 'Target language: typescript (default), python, go')
    .option('--overwrite', 'Overwrite existing files')
    .option('--dry-run', 'Show what would be generated without writing')
    .action(async (archId: string, options: ScaffoldOptions) => {
      try {
        await runScaffold(archId, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface ScaffoldOptions {
  name?: string;
  output?: string;
  template?: string;
  lang?: string;
  overwrite?: boolean;
  dryRun?: boolean;
}

async function runScaffold(archId: string, options: ScaffoldOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Name is required
  if (!options.name) {
    log.error('--name is required. Example: archcodex scaffold domain.service --name UserService');
    process.exit(1);
  }

  // Validate language option
  if (options.lang && !VALID_LANGUAGES.includes(options.lang.toLowerCase())) {
    log.error(`Invalid language: ${options.lang}. Valid options: typescript, python, go`);
    process.exit(1);
  }

  const language = options.lang ? normalizeLanguage(options.lang) : undefined;

  // Load index for suggested path and template
  const index = await loadIndex(projectRoot);

  // Load registry for reference_implementations and file_pattern
  let registry;
  try {
    registry = await loadRegistry(projectRoot);
  } catch {
    // Registry is optional for scaffolding
  }

  // Load intent registry for suggestions
  let intentRegistry;
  try {
    intentRegistry = await loadIntentRegistry(projectRoot);
  } catch {
    // Intent registry is optional
  }

  // Create scaffold engine
  const engine = new ScaffoldEngine(projectRoot, '.arch/templates', registry);

  // Generate
  const result = await engine.scaffold(
    {
      archId,
      name: options.name,
      outputPath: options.output,
      template: options.template,
      overwrite: options.overwrite,
      language,
    },
    index
  );

  if (options.dryRun) {
    console.log();
    console.log(chalk.bold('Dry Run - Would generate:'));
    console.log();
    console.log(chalk.dim(`Path: ${result.filePath || 'Unknown'}`));

    // Show suggested intents in dry run too
    if (intentRegistry && Object.keys(intentRegistry.intents).length > 0 && result.filePath) {
      const suggestions = suggestIntents(intentRegistry, {
        filePath: result.filePath,
        archId,
      });
      if (suggestions.length > 0) {
        console.log();
        console.log(chalk.dim('Suggested intents:'));
        for (const intent of suggestions) {
          console.log(`  ${chalk.magenta(`@intent:${intent.name}`)} - ${intent.description}`);
        }
      }
    }

    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log(result.content);
    console.log(chalk.dim('─'.repeat(60)));
    return;
  }

  if (!result.success) {
    log.error(result.error || 'Unknown error');
    process.exit(1);
  }

  console.log();
  log.success(`Created ${result.filePath}`);

  // Show suggested intents based on path and architecture
  if (intentRegistry && Object.keys(intentRegistry.intents).length > 0 && result.filePath) {
    const suggestions = suggestIntents(intentRegistry, {
      filePath: result.filePath,
      archId,
    });
    if (suggestions.length > 0) {
      console.log();
      console.log(chalk.dim('Suggested intents for this file:'));
      for (const intent of suggestions) {
        const reason = intent.reason === 'path' ? 'path match' : 'arch match';
        console.log(`  ${chalk.magenta(`@intent:${intent.name}`)} - ${intent.description} (${chalk.dim(reason)})`);
      }
      console.log();
      console.log(chalk.dim('Add relevant intents to your @arch comment block:'));
      console.log(chalk.dim(`  /**`));
      console.log(chalk.dim(`   * @arch ${archId}`));
      for (const intent of suggestions.slice(0, 2)) {
        console.log(chalk.dim(`   * @intent:${intent.name}`));
      }
      console.log(chalk.dim(`   */`));
    }
  }

  console.log();
  console.log(chalk.dim('Next steps:'));
  console.log(`  1. Open ${chalk.cyan(result.filePath!)}`);
  console.log(`  2. Implement the class`);
  console.log(`  3. Run ${chalk.cyan(`archcodex check ${result.filePath}`)} to validate`);
}
