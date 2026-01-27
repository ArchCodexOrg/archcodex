/**
 * @arch archcodex.cli.command.meta
 * @intent:cli-output
 */
import { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import { fileExists, ensureDir, writeFile } from '../../utils/file-system.js';
import { logger as log } from '../../utils/logger.js';
import {
  CONFIG_TEMPLATE,
  BASE_REGISTRY_TEMPLATE,
  MIXINS_TEMPLATE,
  INTENTS_TEMPLATE,
  ACTIONS_TEMPLATE,
  FEATURES_TEMPLATE,
  INDEX_TEMPLATE,
  CONCEPTS_TEMPLATE,
  SERVICE_TEMPLATE,
  ARCHIGNORE_TEMPLATE,
  CLAUDE_MD_TEMPLATE,
} from './init-templates.js';

/**
 * Create the init command.
 */
export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize ArchCodex in the current project')
    .option('--force', 'Overwrite existing configuration')
    .action(async (options: InitOptions) => {
      try {
        await runInit(options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface InitOptions {
  force?: boolean;
}

async function runInit(options: InitOptions): Promise<void> {
  const projectRoot = process.cwd();
  const archDir = path.join(projectRoot, '.arch');
  const registryDir = path.join(archDir, 'registry');

  // Check if already initialized
  if (!options.force && (await fileExists(path.join(archDir, 'config.yaml')))) {
    log.warn('.arch/ already exists. Use --force to reinitialize.');
    return;
  }

  console.log();
  console.log(chalk.bold('Initializing ArchCodex...'));
  console.log();

  // Create directories
  await ensureDir(archDir);
  await ensureDir(registryDir);
  await ensureDir(path.join(archDir, 'docs'));
  await ensureDir(path.join(archDir, 'templates'));

  // Create config.yaml
  await writeFile(path.join(archDir, 'config.yaml'), CONFIG_TEMPLATE);
  log.success('Created .arch/config.yaml');

  // Create modular registry structure
  await writeFile(path.join(registryDir, 'base.yaml'), BASE_REGISTRY_TEMPLATE);
  log.success('Created .arch/registry/base.yaml');

  await writeFile(path.join(registryDir, '_mixins.yaml'), MIXINS_TEMPLATE);
  log.success('Created .arch/registry/_mixins.yaml');

  await writeFile(path.join(registryDir, '_intents.yaml'), INTENTS_TEMPLATE);
  log.success('Created .arch/registry/_intents.yaml');

  await writeFile(path.join(registryDir, '_actions.yaml'), ACTIONS_TEMPLATE);
  log.success('Created .arch/registry/_actions.yaml');

  await writeFile(path.join(registryDir, '_features.yaml'), FEATURES_TEMPLATE);
  log.success('Created .arch/registry/_features.yaml');

  // Create index.yaml
  await writeFile(path.join(archDir, 'index.yaml'), INDEX_TEMPLATE);
  log.success('Created .arch/index.yaml');

  // Create concepts.yaml (semantic discovery)
  await writeFile(path.join(archDir, 'concepts.yaml'), CONCEPTS_TEMPLATE);
  log.success('Created .arch/concepts.yaml');

  // Create sample template
  await writeFile(
    path.join(archDir, 'templates', 'service.hbs'),
    SERVICE_TEMPLATE
  );
  log.success('Created .arch/templates/service.hbs');

  // Create .archignore (in project root, not .arch/)
  const archignorePath = path.join(projectRoot, '.archignore');
  if (options.force || !(await fileExists(archignorePath))) {
    await writeFile(archignorePath, ARCHIGNORE_TEMPLATE);
    log.success('Created .archignore');
  }

  // Create CLAUDE.md (AI agent instructions in project root)
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  if (options.force || !(await fileExists(claudeMdPath))) {
    await writeFile(claudeMdPath, CLAUDE_MD_TEMPLATE);
    log.success('Created CLAUDE.md (AI agent instructions)');
  }

  console.log();
  console.log(chalk.bold.green('ArchCodex initialized successfully!'));
  console.log();
  console.log(chalk.dim('Next steps:'));
  console.log(`  1. Edit ${chalk.cyan('.arch/registry/base.yaml')} to define your architecture patterns`);
  console.log(`  2. Add more architectures in ${chalk.cyan('.arch/registry/')} (e.g., domain.yaml, infra.yaml)`);
  console.log(`  3. Run ${chalk.cyan('archcodex learn src/')} to auto-generate architectures from your codebase`);
  console.log(`  4. Add ${chalk.cyan('@arch <namespace.id>')} tags to your source files`);
  console.log(`  5. Run ${chalk.cyan('archcodex check <file>')} to validate`);
  console.log();
}
