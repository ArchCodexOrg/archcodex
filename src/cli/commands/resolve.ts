/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry } from '../../core/registry/loader.js';
import { resolveArchitecture } from '../../core/registry/resolver.js';
import { logger as log } from '../../utils/logger.js';

/**
 * Create the resolve command.
 */
export function createResolveCommand(): Command {
  return new Command('resolve')
    .description('Debug: show flattened architecture rules for an arch ID')
    .argument('<archId>', 'Architecture ID to resolve (e.g., domain.service)')
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .option('--json', 'Output as JSON')
    .action(async (archId: string, options: ResolveOptions) => {
      try {
        await runResolve(archId, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface ResolveOptions {
  config: string;
  json?: boolean;
}

async function runResolve(archId: string, options: ResolveOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Load configuration
  const configPath = path.resolve(projectRoot, options.config);
  const config = await loadConfig(configPath);

  // Load registry
  const registry = await loadRegistry(projectRoot, config.registry);

  // Resolve the architecture
  const result = resolveArchitecture(registry, archId);
  const { architecture, conflicts } = result;

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Human-readable output
  console.log();
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan(`ARCHITECTURE: ${architecture.archId}`));
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));

  if (architecture.description) {
    console.log();
    console.log(chalk.dim('Description:'));
    console.log(`  ${architecture.description}`);
  }

  if (architecture.contract) {
    console.log();
    console.log(chalk.dim('Contract:'));
    console.log(`  ${architecture.contract}`);
  }

  // Inheritance chain
  console.log();
  console.log(chalk.dim('Inheritance Chain:'));
  console.log(`  ${architecture.inheritanceChain.join(chalk.dim(' → '))}`);

  // Applied mixins
  if (architecture.appliedMixins.length > 0) {
    console.log();
    console.log(chalk.dim('Applied Mixins:'));
    for (const mixin of architecture.appliedMixins) {
      console.log(`  • ${mixin}`);
    }
  }

  // Constraints
  if (architecture.constraints.length > 0) {
    console.log();
    console.log(chalk.dim('Constraints:'));

    for (const constraint of architecture.constraints) {
      const value = Array.isArray(constraint.value)
        ? constraint.value.join(', ')
        : String(constraint.value);

      const severityColor =
        constraint.severity === 'error' ? chalk.red :
        constraint.severity === 'warning' ? chalk.yellow : chalk.blue;

      console.log(
        `  ${severityColor(`[${constraint.severity.toUpperCase()}]`)} ${constraint.rule}: ${value}`
      );
      console.log(`    ${chalk.dim(`Source: ${constraint.source}`)}`);
      if (constraint.why) {
        console.log(`    ${chalk.dim(`Why: ${constraint.why}`)}`);
      }
    }
  }

  // Hints
  if (architecture.hints.length > 0) {
    console.log();
    console.log(chalk.dim('Hints:'));
    for (const hint of architecture.hints) {
      console.log(`  • ${hint.text}`);
      if (hint.example) {
        console.log(`    ${chalk.dim('Example:')} ${chalk.cyan(hint.example)}`);
      }
    }
  }

  // Pointers
  if (architecture.pointers.length > 0) {
    console.log();
    console.log(chalk.dim('Documentation Pointers:'));
    for (const pointer of architecture.pointers) {
      console.log(`  📖 ${pointer.label}: ${chalk.cyan(pointer.uri)}`);
    }
  }

  // Conflicts
  if (conflicts.length > 0) {
    console.log();

    // Group by severity
    const errors = conflicts.filter((c) => c.severity === 'error');
    const warnings = conflicts.filter((c) => c.severity === 'warning');
    const info = conflicts.filter((c) => c.severity === 'info');

    if (errors.length > 0) {
      console.log(chalk.red.bold('Conflicts (Errors):'));
      for (const conflict of errors) {
        console.log(`  ${chalk.red('✗')} ${conflict.rule}: ${conflict.value}`);
        console.log(`    ${chalk.dim(conflict.resolution)}`);
      }
      console.log();
    }

    if (warnings.length > 0) {
      console.log(chalk.yellow.bold('Conflicts (Warnings):'));
      for (const conflict of warnings) {
        console.log(`  ${chalk.yellow('⚠')} ${conflict.rule}: ${conflict.value}`);
        console.log(`    ${chalk.dim(conflict.resolution)}`);
      }
      console.log();
    }

    if (info.length > 0) {
      console.log(chalk.blue.bold('Conflicts (Resolved):'));
      for (const conflict of info) {
        console.log(`  ${chalk.blue('ℹ')} ${conflict.rule}: ${conflict.value}`);
        console.log(`    ${chalk.dim(conflict.resolution)}`);
      }
    }
  }

  console.log();
}
