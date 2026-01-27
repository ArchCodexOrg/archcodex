/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { loadRegistry } from '../../core/registry/loader.js';
import {
  compareRegistries,
  loadRegistryFromRef,
  parseGitRange,
  getShortHash,
} from '../../core/diff/index.js';
import type { RegistryDiff, ArchitectureChange, ConstraintChange } from '../../core/diff/types.js';
import { logger as log } from '../../utils/logger.js';
import { formatConstraintValue } from '../../utils/format.js';

interface DiffOptions {
  json?: boolean;
  files?: boolean;
  verbose?: boolean;
}

/**
 * Create the diff command.
 */
export function createDiffCommand(): Command {
  return new Command('diff')
    .description('Show architecture changes between commits or branches')
    .argument('<range>', 'Git range (e.g., main..feature, HEAD~3, commit-sha)')
    .option('--json', 'Output as JSON')
    .option('--no-files', 'Skip scanning for affected files')
    .option('--verbose', 'Show detailed constraint changes')
    .action(async (range: string, options: DiffOptions) => {
      try {
        await runDiff(range, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runDiff(range: string, options: DiffOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Parse the git range
  const { from, to } = parseGitRange(range);

  // Get short hashes for display
  const fromDisplay = await getShortHash(projectRoot, from);
  const toDisplay = to === 'HEAD' ? 'HEAD' : await getShortHash(projectRoot, to);

  // Load registries from git refs
  let fromRegistry, toRegistry;

  try {
    fromRegistry = await loadRegistryFromRef(projectRoot, from);
  } catch (error) {
    // If 'from' ref doesn't have registry, try loading current
    if (to === 'HEAD') {
      throw error;
    }
    throw new Error(`Cannot load registry from '${from}': ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  try {
    if (to === 'HEAD') {
      // Load current registry from filesystem for HEAD
      toRegistry = await loadRegistry(projectRoot);
    } else {
      toRegistry = await loadRegistryFromRef(projectRoot, to);
    }
  } catch (error) {
    throw new Error(`Cannot load registry from '${to}': ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Compare registries
  const diff = await compareRegistries(
    fromRegistry,
    toRegistry,
    fromDisplay,
    toDisplay,
    projectRoot,
    { includeAffectedFiles: options.files !== false }
  );

  // Output results
  if (options.json) {
    console.log(JSON.stringify(diff, null, 2));
    return;
  }

  printHumanOutput(diff, options.verbose);
}

function printHumanOutput(diff: RegistryDiff, verbose?: boolean): void {
  const { summary } = diff;
  const hasChanges =
    summary.architecturesAdded > 0 ||
    summary.architecturesRemoved > 0 ||
    summary.architecturesModified > 0 ||
    summary.mixinsAdded > 0 ||
    summary.mixinsRemoved > 0 ||
    summary.mixinsModified > 0;

  console.log();
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan(`ARCHITECTURE CHANGES: ${diff.fromRef}..${diff.toRef}`));
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));

  if (!hasChanges) {
    console.log();
    console.log(chalk.green('No architecture changes detected.'));
    console.log();
    return;
  }

  // Added architectures
  const added = diff.architectureChanges.filter(c => c.type === 'added');
  if (added.length > 0) {
    console.log();
    console.log(chalk.green.bold('ADDED'));
    console.log(chalk.dim('────────────────────────────────────────'));
    for (const change of added) {
      console.log(`  ${chalk.green('+')} ${chalk.bold(change.archId)}`);
      if (change.newNode?.description) {
        console.log(`    ${chalk.dim(change.newNode.description)}`);
      }
    }
  }

  // Modified architectures
  const modified = diff.architectureChanges.filter(c => c.type === 'modified');
  if (modified.length > 0) {
    console.log();
    console.log(chalk.yellow.bold('MODIFIED'));
    console.log(chalk.dim('────────────────────────────────────────'));
    for (const change of modified) {
      console.log(`  ${chalk.yellow('~')} ${chalk.bold(change.archId)}`);
      printArchitectureChanges(change, verbose);
    }
  }

  // Removed architectures
  const removed = diff.architectureChanges.filter(c => c.type === 'removed');
  if (removed.length > 0) {
    console.log();
    console.log(chalk.red.bold('REMOVED'));
    console.log(chalk.dim('────────────────────────────────────────'));
    for (const change of removed) {
      console.log(`  ${chalk.red('-')} ${chalk.bold(change.archId)}`);
      if (change.oldNode?.description) {
        console.log(`    ${chalk.dim(change.oldNode.description)}`);
      }
    }
  }

  // Mixin changes
  if (diff.mixinChanges.length > 0) {
    console.log();
    console.log(chalk.magenta.bold('MIXINS'));
    console.log(chalk.dim('────────────────────────────────────────'));
    for (const change of diff.mixinChanges) {
      const symbol = change.type === 'added' ? chalk.green('+') :
                     change.type === 'removed' ? chalk.red('-') : chalk.yellow('~');
      console.log(`  ${symbol} ${chalk.bold(change.mixinId)}`);
      if (change.type === 'modified' && change.constraintChanges) {
        printConstraintChanges(change.constraintChanges, '    ');
      }
    }
  }

  // Affected files
  if (diff.affectedFiles.length > 0) {
    console.log();
    console.log(chalk.blue.bold(`AFFECTED FILES: ${diff.affectedFiles.length}`));
    console.log(chalk.dim('────────────────────────────────────────'));

    // Group by reason
    const byReason: Record<string, typeof diff.affectedFiles> = {};
    for (const file of diff.affectedFiles) {
      if (!byReason[file.reason]) byReason[file.reason] = [];
      byReason[file.reason].push(file);
    }

    for (const [reason, files] of Object.entries(byReason)) {
      const reasonLabel = formatReason(reason);
      console.log(`  ${chalk.dim(reasonLabel)}`);
      for (const file of files.slice(0, 10)) {
        console.log(`    ${file.filePath} ${chalk.dim(`(${file.archId})`)}`);
      }
      if (files.length > 10) {
        console.log(`    ${chalk.dim(`... and ${files.length - 10} more`)}`);
      }
    }
  }

  // Summary
  console.log();
  console.log(chalk.dim('────────────────────────────────────────'));
  console.log(chalk.bold('Summary:'));
  console.log(`  Architectures: ${chalk.green(`+${summary.architecturesAdded}`)} ${chalk.yellow(`~${summary.architecturesModified}`)} ${chalk.red(`-${summary.architecturesRemoved}`)}`);
  console.log(`  Mixins: ${chalk.green(`+${summary.mixinsAdded}`)} ${chalk.yellow(`~${summary.mixinsModified}`)} ${chalk.red(`-${summary.mixinsRemoved}`)}`);
  if (summary.totalAffectedFiles > 0) {
    console.log(`  Affected files: ${summary.totalAffectedFiles}`);
  }
  console.log();
}

function printArchitectureChanges(change: ArchitectureChange, verbose?: boolean): void {
  // Inheritance change
  if (change.inheritsChange) {
    const { old: oldVal, new: newVal } = change.inheritsChange;
    if (oldVal && newVal) {
      console.log(`    ${chalk.dim('inherits:')} ${oldVal} ${chalk.yellow('→')} ${newVal}`);
    } else if (newVal) {
      console.log(`    ${chalk.green('+')} ${chalk.dim('inherits:')} ${newVal}`);
    } else if (oldVal) {
      console.log(`    ${chalk.red('-')} ${chalk.dim('inherits:')} ${oldVal}`);
    }
  }

  // Mixin changes
  if (change.mixinChanges) {
    for (const added of change.mixinChanges.added) {
      console.log(`    ${chalk.green('+')} ${chalk.dim('mixin:')} ${added}`);
    }
    for (const removed of change.mixinChanges.removed) {
      console.log(`    ${chalk.red('-')} ${chalk.dim('mixin:')} ${removed}`);
    }
  }

  // Constraint changes
  if (change.constraintChanges && (verbose || change.constraintChanges.length <= 5)) {
    printConstraintChanges(change.constraintChanges, '    ');
  } else if (change.constraintChanges && change.constraintChanges.length > 5) {
    console.log(`    ${chalk.dim(`${change.constraintChanges.length} constraint changes (use --verbose to see all)`)}`);
  }
}

function printConstraintChanges(changes: ConstraintChange[], indent: string): void {
  for (const change of changes) {
    const value = formatDiffValue(change.newValue || change.oldValue);

    if (change.type === 'added') {
      console.log(`${indent}${chalk.green('+')} ${chalk.dim('constraint:')} ${change.rule}: ${value}`);
    } else if (change.type === 'removed') {
      console.log(`${indent}${chalk.red('-')} ${chalk.dim('constraint:')} ${change.rule}: ${value}`);
    } else if (change.type === 'modified') {
      if (change.oldSeverity !== change.newSeverity) {
        console.log(`${indent}${chalk.yellow('~')} ${chalk.dim('constraint:')} ${change.rule} severity: ${change.oldSeverity} ${chalk.yellow('→')} ${change.newSeverity}`);
      }
    }
  }
}

// Using shared formatConstraintValue from ../../utils/format.js with options:
// { handleUndefined: true, wrapArrays: true, arraySeparator: ', ', objectFallback: 'json' }
const formatDiffValue = (value: unknown): string =>
  formatConstraintValue(value, { handleUndefined: true, wrapArrays: true, arraySeparator: ', ', objectFallback: 'json' });

function formatReason(reason: string): string {
  switch (reason) {
    case 'new_arch': return 'Using new architecture:';
    case 'removed_arch': return 'Using removed architecture:';
    case 'constraint_change': return 'Affected by constraint changes:';
    case 'mixin_change': return 'Affected by mixin changes:';
    default: return reason;
  }
}
