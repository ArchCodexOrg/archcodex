/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Promote @override tags to @intent annotations.
 * Automates the override → intent lifecycle:
 * 1. Define intent in _intents.yaml (if new)
 * 2. Add unless clause to constraint in registry
 * 3. Replace @override with @intent in source files
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { PromoteEngine, type PromoteResult } from '../../core/promote/index.js';
import { logger as log } from '../../utils/logger.js';

interface PromoteOptions {
  intent: string;
  description?: string;
  category?: string;
  apply?: boolean;
  json?: boolean;
  config: string;
}

/**
 * Create the promote command.
 */
export function createPromoteCommand(): Command {
  return new Command('promote')
    .description('Promote @override tags to @intent annotations')
    .argument('<constraint>', 'Constraint pattern (rule:value, e.g., forbid_pattern:console)')
    .requiredOption('--intent <name>', 'Intent name to promote to')
    .option('--description <text>', 'Description for new intent definition')
    .option('--category <name>', 'Category for new intent (cli, lifecycle, auth, etc.)')
    .option('--apply', 'Apply changes (default is preview/dry-run)')
    .option('--json', 'Output as JSON')
    .option('-c, --config <path>', 'Config file path', '.arch/config.yaml')
    .action(async (constraint: string, options: PromoteOptions) => {
      try {
        await runPromote(constraint, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runPromote(constraint: string, options: PromoteOptions): Promise<void> {
  // Parse constraint argument: "rule:value"
  const colonIdx = constraint.indexOf(':');
  if (colonIdx === -1) {
    console.error(chalk.red('Invalid constraint format. Use rule:value (e.g., forbid_pattern:console)'));
    process.exit(1);
  }

  const rule = constraint.slice(0, colonIdx);
  const value = constraint.slice(colonIdx + 1);

  const projectRoot = process.cwd();
  const engine = new PromoteEngine(projectRoot);

  const result = await engine.promote({
    rule,
    value,
    intentName: options.intent,
    description: options.description,
    category: options.category,
    apply: options.apply ?? false,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printResult(result, rule, value, options.intent);
}

function printResult(result: PromoteResult, rule: string, value: string, intentName: string): void {
  console.log();
  console.log(chalk.bold(`Promote: ${rule}:${value} → @intent:${intentName}`));
  console.log();

  // Errors
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.log(chalk.red(`  ✗ ${err}`));
    }
    console.log();
  }

  // Intent change
  if (result.intentChange.isNew) {
    console.log(chalk.bold('Intent:'));
    console.log(`  ${chalk.green('+')} NEW: ${result.intentChange.name} - "${result.intentChange.description ?? '(no description)'}"`);
    if (result.intentChange.category) {
      console.log(`    Category: ${result.intentChange.category}`);
    }
    console.log();
  } else {
    console.log(chalk.dim(`  Intent "${result.intentChange.name}" already defined.`));
    console.log();
  }

  // Registry changes
  if (result.registryChanges.length > 0) {
    console.log(chalk.bold('Registry changes:'));
    for (const change of result.registryChanges) {
      const relPath = change.filePath.replace(process.cwd() + '/', '');
      console.log(`  ${chalk.cyan(relPath)}`);
      if (change.intentAlreadyInUnless) {
        console.log(chalk.dim(`    unless: ["@intent:${intentName}"] (already present, skipping)`));
      } else if (change.unlessAlreadyExists) {
        console.log(`    ${chalk.green('+')} Append to unless: "@intent:${intentName}"`);
      } else {
        console.log(`    ${chalk.green('+')} Add unless: ["@intent:${intentName}"]`);
      }
    }
    console.log();
  }

  // File changes
  if (result.fileChanges.length > 0) {
    console.log(chalk.bold(`File changes (${result.fileChanges.length} files):`));
    for (const change of result.fileChanges) {
      console.log(`  ${chalk.cyan(change.filePath)}`);
      console.log(`    ${chalk.red('-')} Remove @override ${change.overrideRule}:${change.overrideValue} (lines ${change.overrideStartLine}-${change.overrideEndLine})`);
      if (change.intentAlreadyPresent) {
        console.log(chalk.dim(`    @intent:${intentName} (already present, skipping)`));
      } else {
        console.log(`    ${chalk.green('+')} Add @intent:${intentName}`);
      }
    }
    console.log();
  }

  // Warnings
  if (result.warnings.length > 0) {
    for (const warn of result.warnings) {
      console.log(chalk.yellow(`  ⚠ ${warn}`));
    }
    console.log();
  }

  // Mode indicator
  if (result.applied) {
    console.log(chalk.green('Changes applied successfully.'));
  } else if (result.errors.length > 0) {
    console.log(chalk.red('Blocked: fix errors above before applying.'));
  } else {
    console.log(chalk.dim('Mode: DRY RUN (use --apply to execute)'));
  }
  console.log();
}
