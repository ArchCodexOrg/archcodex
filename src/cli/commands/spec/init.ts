/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Init subcommand and runSpecInit utility for SpecCodex initialization.
 */
import type { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import { fileExists, ensureDir, writeFile, readFile } from '../../../utils/file-system.js';
import { logger } from '../../../utils/logger.js';
import {
  SPEC_BASE_TEMPLATE,
  SPEC_MIXINS_TEMPLATE,
  SPEC_EXAMPLE_TEMPLATE,
  SPEC_CONFIG_SECTION,
} from '../spec-init-templates.js';

/**
 * Options for spec initialization.
 */
export interface SpecInitOptions {
  force?: boolean;
  minimal?: boolean;
  projectRoot?: string;
}

/**
 * Result of spec initialization.
 */
export interface SpecInitResult {
  success: boolean;
  filesCreated: string[];
  filesSkipped: string[];
  errors: Array<{ code: string; message: string }>;
}

/**
 * Initialize SpecCodex in a project.
 * Creates base specs, mixins, and optional example.
 */
export async function runSpecInit(args: { options: SpecInitOptions }): Promise<SpecInitResult> {
  const { options } = args;
  const projectRoot = options.projectRoot || process.cwd();
  const archDir = path.join(projectRoot, '.arch');
  const specsDir = path.join(archDir, 'specs');

  const filesCreated: string[] = [];
  const filesSkipped: string[] = [];
  const errors: Array<{ code: string; message: string }> = [];

  // Check .arch/ exists
  if (!(await fileExists(archDir))) {
    const error = new Error('ARCH_NOT_INITIALIZED: .arch/ directory not found. Run "archcodex init" first.');
    throw error;
  }

  // Create specs directory
  await ensureDir(specsDir);

  // Helper to write file with skip logic
  const writeIfNotExists = async (filePath: string, content: string): Promise<boolean> => {
    const relativePath = path.relative(projectRoot, filePath);
    if (!options.force && (await fileExists(filePath))) {
      filesSkipped.push(relativePath);
      return false;
    }
    await writeFile(filePath, content);
    filesCreated.push(relativePath);
    return true;
  };

  // Create _base.yaml
  await writeIfNotExists(
    path.join(specsDir, '_base.yaml'),
    SPEC_BASE_TEMPLATE
  );

  // Create _mixins.yaml
  await writeIfNotExists(
    path.join(specsDir, '_mixins.yaml'),
    SPEC_MIXINS_TEMPLATE
  );

  // Create example.spec.yaml (unless minimal mode)
  if (!options.minimal) {
    await writeIfNotExists(
      path.join(specsDir, 'example.spec.yaml'),
      SPEC_EXAMPLE_TEMPLATE
    );
  }

  // Update config.yaml with speccodex section if not present
  const configPath = path.join(archDir, 'config.yaml');
  if (await fileExists(configPath)) {
    const configContent = await readFile(configPath);
    if (!configContent.includes('speccodex:')) {
      await writeFile(configPath, configContent + SPEC_CONFIG_SECTION);
      filesCreated.push('.arch/config.yaml (updated)');
    }
  }

  return {
    success: errors.length === 0,
    filesCreated,
    filesSkipped,
    errors,
  };
}

/**
 * Register the init subcommand on the spec command.
 */
export function registerInitCommand(spec: Command): void {
  spec
    .command('init')
    .description('Initialize SpecCodex with base specs and mixins')
    .option('--force', 'Overwrite existing files')
    .option('--minimal', 'Only create essential files (no example)')
    .action(async (options: { force?: boolean; minimal?: boolean }) => {
      try {
        const result = await runSpecInit({ options });

        if (result.success) {
          console.log();
          console.log(chalk.bold.green('SpecCodex initialized successfully!'));
          console.log();

          if (result.filesCreated.length > 0) {
            console.log(chalk.dim('Created:'));
            for (const file of result.filesCreated) {
              console.log(`  ${chalk.green('+')} ${file}`);
            }
          }

          if (result.filesSkipped.length > 0) {
            console.log();
            console.log(chalk.dim('Skipped (already exist):'));
            for (const file of result.filesSkipped) {
              console.log(`  ${chalk.yellow('~')} ${file}`);
            }
          }

          console.log();
          console.log(chalk.dim('Next steps:'));
          console.log(`  1. Review ${chalk.cyan('.arch/specs/_base.yaml')} for base spec patterns`);
          console.log(`  2. Review ${chalk.cyan('.arch/specs/_mixins.yaml')} for reusable behaviors`);
          if (!options.minimal) {
            console.log(`  3. Study ${chalk.cyan('.arch/specs/example.spec.yaml')} for spec syntax`);
          }
          console.log(`  4. Create your first spec: ${chalk.cyan('.arch/specs/your-feature.spec.yaml')}`);
          console.log(`  5. Generate tests: ${chalk.cyan('archcodex spec generate spec.your.feature --type unit')}`);
          console.log();
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('ARCH_NOT_INITIALIZED')) {
          logger.error('.arch/ directory not found. Run "archcodex init" first.');
        } else {
          logger.error(`Initialization failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
