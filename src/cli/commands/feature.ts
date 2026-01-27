/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * CLI command for multi-file feature scaffolding.
 * Scaffolds multiple related files based on feature templates.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadFeatureRegistry,
  listFeatureNames,
  getFeature,
  hasFeature,
} from '../../core/registry/loader.js';
import { loadRegistry } from '../../core/registry/loader.js';
import { loadIndex } from '../../core/discovery/index.js';
import { FeatureEngine } from '../../core/scaffold/feature-engine.js';
import { logger } from '../../utils/logger.js';

interface FeatureCommandOptions {
  name?: string;
  dryRun?: boolean;
  overwrite?: boolean;
  skipOptional?: boolean;
  json?: boolean;
  [key: string]: string | boolean | undefined;
}

/**
 * Create the feature command.
 */
export function createFeatureCommand(): Command {
  const cmd = new Command('feature')
    .description('Scaffold multiple related files based on feature templates')
    .argument('[feature-name]', 'Feature template name')
    .option('--name <name>', 'Primary name for the feature (e.g., "UserValidator")')
    .option('--dry-run', 'Preview what would be created without writing files')
    .option('--overwrite', 'Overwrite existing files')
    .option('--skip-optional', 'Skip optional components')
    .option('--json', 'Output as JSON')
    .allowUnknownOption(true) // Allow custom variables like --constraint-name
    .action(async (featureName: string | undefined, options: FeatureCommandOptions) => {
      try {
        await runFeature(featureName, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Subcommand: list all features
  cmd.addCommand(
    new Command('list')
      .description('List all available feature templates')
      .option('--json', 'Output as JSON')
      .action(async (options: FeatureCommandOptions) => {
        try {
          await runFeatureList(options);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  );

  // Subcommand: show feature details
  cmd.addCommand(
    new Command('show')
      .description('Show details for a specific feature template')
      .argument('<name>', 'Feature name')
      .option('--json', 'Output as JSON')
      .action(async (name: string, options: FeatureCommandOptions) => {
        try {
          await runFeatureShow(name, options);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  );

  return cmd;
}

/**
 * Run feature scaffold.
 */
async function runFeature(featureName: string | undefined, options: FeatureCommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const featureRegistry = await loadFeatureRegistry(projectRoot);

  if (!featureName) {
    // No feature name - show help
    const featureNames = listFeatureNames(featureRegistry);

    if (options.json) {
      console.log(JSON.stringify({
        hint: 'Provide a feature name',
        available: featureNames,
      }));
    } else {
      console.log();
      console.log(chalk.bold('Feature Scaffolding'));
      console.log();
      console.log('Usage: archcodex feature <feature-name> --name <PrimaryName>');
      console.log();
      if (featureNames.length > 0) {
        console.log('Available features:');
        for (const name of featureNames) {
          console.log(`  ${chalk.cyan(name)}`);
        }
      } else {
        console.log(chalk.yellow('No features defined.'));
        console.log(chalk.dim('Create .arch/registry/_features.yaml to define features.'));
      }
    }
    return;
  }

  if (!hasFeature(featureRegistry, featureName)) {
    if (options.json) {
      console.log(JSON.stringify({
        error: `Feature not found: ${featureName}`,
        available: listFeatureNames(featureRegistry),
      }));
    } else {
      logger.error(`Feature not found: ${featureName}`);
      console.log(chalk.dim('Run `archcodex feature list` to see available features.'));
    }
    process.exit(1);
  }

  const feature = getFeature(featureRegistry, featureName)!;

  // Get the primary name
  const primaryName = options.name;
  if (!primaryName) {
    if (options.json) {
      console.log(JSON.stringify({
        error: 'Missing required --name option',
        hint: 'Provide the primary name for the feature',
      }));
    } else {
      logger.error('Missing required --name option');
      console.log(chalk.dim('Example: archcodex feature add-constraint --name ForbidConsole'));
    }
    process.exit(1);
  }

  // Build variables from options (any unknown options become variables)
  const variables: Record<string, string> = { name: primaryName };
  for (const [key, value] of Object.entries(options)) {
    if (
      typeof value === 'string' &&
      !['name', 'dryRun', 'overwrite', 'skipOptional', 'json'].includes(key)
    ) {
      variables[key] = value;
    }
  }

  // Load registry and index
  const registry = await loadRegistry(projectRoot);
  const index = await loadIndex(projectRoot);

  // Create feature engine
  const engine = new FeatureEngine(projectRoot, '.arch/templates', registry);

  if (options.dryRun) {
    // Preview mode
    const preview = await engine.previewFeature(feature, featureName, { name: primaryName, ...variables });

    if (options.json) {
      console.log(JSON.stringify({
        featureName,
        variables,
        dryRun: true,
        ...preview,
      }, null, 2));
    } else {
      console.log();
      console.log(chalk.bold(`Preview: ${featureName}`));
      console.log();
      console.log('Would create:');
      for (const comp of preview.components) {
        const existsMarker = comp.exists ? chalk.yellow(' (exists)') : chalk.green(' (new)');
        const optionalMarker = comp.optional ? chalk.dim(' [optional]') : '';
        console.log(`  ${chalk.dim('→')} ${comp.role}: ${comp.path}${existsMarker}${optionalMarker}`);
      }

      if (feature.checklist && feature.checklist.length > 0) {
        console.log();
        console.log('Manual steps after scaffolding:');
        for (const item of feature.checklist) {
          console.log(`  ${chalk.dim('☐')} ${item}`);
        }
      }
    }
    return;
  }

  // Actually scaffold
  const result = await engine.scaffoldFeature(
    {
      feature,
      featureName,
      variables: { name: primaryName, ...variables },
      overwrite: options.overwrite,
      skipOptional: options.skipOptional,
    },
    index
  );

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log();
    if (result.success) {
      console.log(chalk.bold.green(`✓ Feature scaffolded: ${featureName}`));
    } else {
      console.log(chalk.bold.red(`✗ Feature scaffold failed: ${featureName}`));
    }
    console.log();

    console.log('Components:');
    for (const comp of result.components) {
      if (comp.skipped) {
        console.log(`  ${chalk.dim('○')} ${comp.role}: ${chalk.dim('skipped (optional)')}`);
      } else if (comp.success) {
        console.log(`  ${chalk.green('✓')} ${comp.role}: ${comp.path}`);
      } else {
        console.log(`  ${chalk.red('✗')} ${comp.role}: ${comp.error}`);
      }
    }

    if (result.checklist.length > 0) {
      console.log();
      console.log('Remaining manual steps:');
      for (const item of result.checklist) {
        console.log(`  ${chalk.dim('→')} ${item}`);
      }
    }
  }

  if (!result.success) {
    process.exit(1);
  }
}

/**
 * List all available features.
 */
async function runFeatureList(options: FeatureCommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const featureRegistry = await loadFeatureRegistry(projectRoot);
  const featureNames = listFeatureNames(featureRegistry);

  if (featureNames.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ features: [], hint: 'Create .arch/registry/_features.yaml' }));
    } else {
      logger.warn('No features defined.');
      console.log(chalk.dim('Create .arch/registry/_features.yaml to define features.'));
    }
    return;
  }

  if (options.json) {
    const features = featureNames.map(name => ({
      name,
      ...featureRegistry.features[name],
    }));
    console.log(JSON.stringify(features, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold('Available Feature Templates:'));
  console.log();

  for (const name of featureNames) {
    const feature = featureRegistry.features[name];
    console.log(`  ${chalk.cyan(name)}`);
    console.log(`    ${feature.description}`);
    console.log(`    ${chalk.dim('Components:')} ${feature.components.map(c => c.role).join(', ')}`);
    console.log();
  }

  console.log(chalk.dim('Use `archcodex feature show <name>` to see full details.'));
}

/**
 * Show details for a specific feature.
 */
async function runFeatureShow(name: string, options: FeatureCommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const featureRegistry = await loadFeatureRegistry(projectRoot);

  if (!hasFeature(featureRegistry, name)) {
    if (options.json) {
      console.log(JSON.stringify({ error: `Feature not found: ${name}` }));
    } else {
      logger.error(`Feature not found: ${name}`);
      console.log(chalk.dim('Run `archcodex feature list` to see available features.'));
    }
    process.exit(1);
  }

  const feature = getFeature(featureRegistry, name)!;

  if (options.json) {
    console.log(JSON.stringify({ name, ...feature }, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold.cyan(`📦 Feature: ${name}`));
  console.log();
  console.log(`  ${feature.description}`);
  console.log();

  console.log(chalk.dim('Components:'));
  for (const comp of feature.components) {
    const optional = comp.optional ? chalk.dim(' (optional)') : '';
    console.log(`  ${chalk.dim('→')} ${comp.role}: ${chalk.cyan(comp.architecture)}${optional}`);
    console.log(`    ${chalk.dim(comp.path)}`);
  }
  console.log();

  if (feature.shared_variables && Object.keys(feature.shared_variables).length > 0) {
    console.log(chalk.dim('Shared Variables:'));
    for (const [key, value] of Object.entries(feature.shared_variables)) {
      console.log(`  ${chalk.cyan(`\${${key}}`)} = ${value}`);
    }
    console.log();
  }

  if (feature.checklist && feature.checklist.length > 0) {
    console.log(chalk.dim('Checklist (manual steps after scaffold):'));
    for (const item of feature.checklist) {
      console.log(`  ${chalk.dim('☐')} ${item}`);
    }
    console.log();
  }

  console.log(chalk.dim(`Usage: archcodex feature ${name} --name <PrimaryName>`));
}
