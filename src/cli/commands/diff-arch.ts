/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Diff-arch command - Compare two architectures to see constraint differences.
 * Helps coding agents understand what changes when switching @arch tags.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { loadRegistry } from '../../core/registry/loader.js';
import { resolveArchitecture } from '../../core/registry/resolver.js';
import type { ResolvedConstraint, ResolvedHint } from '../../core/registry/types.js';
import { logger } from '../../utils/logger.js';
import { formatConstraintValue } from '../../utils/format.js';

interface DiffOptions {
  json?: boolean;
}

interface ConstraintDiff {
  added: ResolvedConstraint[];
  removed: ResolvedConstraint[];
  changed: Array<{
    rule: string;
    from: ResolvedConstraint;
    to: ResolvedConstraint;
  }>;
}

interface ArchDiff {
  from: string;
  to: string;
  constraints: ConstraintDiff;
  mixins: {
    added: string[];
    removed: string[];
  };
  hints: {
    added: string[];
    removed: string[];
  };
}

/**
 * Create the diff-arch command.
 */
export function createDiffArchCommand(): Command {
  return new Command('diff-arch')
    .description('Compare two architectures to see constraint differences')
    .argument('<from-arch>', 'Source architecture ID')
    .argument('<to-arch>', 'Target architecture ID')
    .option('--json', 'Output as JSON')
    .action(async (fromArch: string, toArch: string, options: DiffOptions) => {
      try {
        const projectRoot = process.cwd();
        const registry = await loadRegistry(projectRoot);

        // Resolve both architectures
        let fromResolution, toResolution;
        try {
          fromResolution = resolveArchitecture(registry, fromArch);
        } catch {
          logger.error(`Architecture '${fromArch}' not found in registry`);
          process.exit(1);
        }

        try {
          toResolution = resolveArchitecture(registry, toArch);
        } catch {
          logger.error(`Architecture '${toArch}' not found in registry`);
          process.exit(1);
        }

        // Calculate diff
        const diff = calculateDiff(
          fromArch,
          toArch,
          fromResolution.architecture,
          toResolution.architecture
        );

        if (options.json) {
          console.log(JSON.stringify(diff, null, 2));
        } else {
          formatHumanDiff(diff);
        }
      } catch (error) {
        logger.error('Failed to compare architectures', error instanceof Error ? error : undefined);
        process.exit(1);
      }
    });
}

/**
 * Calculate differences between two resolved architectures.
 */
function calculateDiff(
  fromId: string,
  toId: string,
  from: { constraints: ResolvedConstraint[]; appliedMixins: string[]; hints: ResolvedHint[] },
  to: { constraints: ResolvedConstraint[]; appliedMixins: string[]; hints: ResolvedHint[] }
): ArchDiff {
  // Compare constraints
  const fromConstraintKeys = new Map<string, ResolvedConstraint>();
  const toConstraintKeys = new Map<string, ResolvedConstraint>();

  for (const c of from.constraints) {
    const key = `${c.rule}:${formatConstraintValue(c.value)}`;
    fromConstraintKeys.set(key, c);
  }

  for (const c of to.constraints) {
    const key = `${c.rule}:${formatConstraintValue(c.value)}`;
    toConstraintKeys.set(key, c);
  }

  const added: ResolvedConstraint[] = [];
  const removed: ResolvedConstraint[] = [];
  const changed: Array<{ rule: string; from: ResolvedConstraint; to: ResolvedConstraint }> = [];

  // Find added and changed constraints
  for (const [key, constraint] of toConstraintKeys) {
    const fromConstraint = fromConstraintKeys.get(key);
    if (!fromConstraint) {
      added.push(constraint);
    } else if (fromConstraint.severity !== constraint.severity) {
      changed.push({ rule: key, from: fromConstraint, to: constraint });
    }
  }

  // Find removed constraints
  for (const [key, constraint] of fromConstraintKeys) {
    if (!toConstraintKeys.has(key)) {
      removed.push(constraint);
    }
  }

  // Compare mixins
  const fromMixins = new Set(from.appliedMixins);
  const toMixins = new Set(to.appliedMixins);
  const addedMixins = [...toMixins].filter(m => !fromMixins.has(m));
  const removedMixins = [...fromMixins].filter(m => !toMixins.has(m));

  // Compare hints (by text)
  const fromHintTexts = new Set(from.hints.map(h => h.text));
  const toHintTexts = new Set(to.hints.map(h => h.text));
  const addedHints = [...toHintTexts].filter(h => !fromHintTexts.has(h));
  const removedHints = [...fromHintTexts].filter(h => !toHintTexts.has(h));

  return {
    from: fromId,
    to: toId,
    constraints: { added, removed, changed },
    mixins: { added: addedMixins, removed: removedMixins },
    hints: { added: addedHints, removed: removedHints },
  };
}


/**
 * Format diff for human-readable output.
 */
function formatHumanDiff(diff: ArchDiff): void {
  console.log('');
  console.log(chalk.bold('════════════════════════════════════════════════════════════'));
  console.log(chalk.bold(`ARCHITECTURE DIFF: ${diff.from} → ${diff.to}`));
  console.log(chalk.bold('════════════════════════════════════════════════════════════'));
  console.log('');

  const hasChanges =
    diff.constraints.added.length > 0 ||
    diff.constraints.removed.length > 0 ||
    diff.constraints.changed.length > 0 ||
    diff.mixins.added.length > 0 ||
    diff.mixins.removed.length > 0;

  if (!hasChanges) {
    console.log(chalk.green('  No differences found.'));
    console.log('');
    return;
  }

  // Constraints section
  if (diff.constraints.added.length > 0 || diff.constraints.removed.length > 0 || diff.constraints.changed.length > 0) {
    console.log(chalk.bold('CONSTRAINTS'));
    console.log('');

    // Added constraints (new requirements)
    if (diff.constraints.added.length > 0) {
      console.log(chalk.red.bold('  + NEW REQUIREMENTS (you will need to satisfy these):'));
      for (const c of diff.constraints.added) {
        const severity = c.severity === 'error' ? chalk.red('[ERROR]') : chalk.yellow('[WARN]');
        console.log(`    ${severity} ${c.rule}: ${formatConstraintValue(c.value)}`);
        if (c.why) {
          console.log(chalk.dim(`         ${c.why}`));
        }
      }
      console.log('');
    }

    // Removed constraints (no longer required)
    if (diff.constraints.removed.length > 0) {
      console.log(chalk.green.bold('  - REMOVED (no longer required):'));
      for (const c of diff.constraints.removed) {
        console.log(`    ${c.rule}: ${formatConstraintValue(c.value)}`);
      }
      console.log('');
    }

    // Changed severity
    if (diff.constraints.changed.length > 0) {
      console.log(chalk.yellow.bold('  ~ SEVERITY CHANGED:'));
      for (const { rule, from, to } of diff.constraints.changed) {
        console.log(`    ${rule}: ${from.severity} → ${to.severity}`);
      }
      console.log('');
    }
  }

  // Mixins section
  if (diff.mixins.added.length > 0 || diff.mixins.removed.length > 0) {
    console.log(chalk.bold('MIXINS'));
    console.log('');

    if (diff.mixins.added.length > 0) {
      console.log(chalk.cyan(`  + Added: ${diff.mixins.added.join(', ')}`));
    }
    if (diff.mixins.removed.length > 0) {
      console.log(chalk.dim(`  - Removed: ${diff.mixins.removed.join(', ')}`));
    }
    console.log('');
  }

  // Hints section
  if (diff.hints.added.length > 0 || diff.hints.removed.length > 0) {
    console.log(chalk.bold('HINTS'));
    console.log('');

    if (diff.hints.added.length > 0) {
      console.log(chalk.cyan('  + New hints:'));
      for (const hint of diff.hints.added) {
        console.log(`      ${hint}`);
      }
    }
    if (diff.hints.removed.length > 0) {
      console.log(chalk.dim('  - Removed hints:'));
      for (const hint of diff.hints.removed) {
        console.log(`      ${hint}`);
      }
    }
    console.log('');
  }

  // Summary
  console.log(chalk.bold('SUMMARY'));
  console.log(`  Switching from ${chalk.cyan(diff.from)} to ${chalk.cyan(diff.to)}:`);
  if (diff.constraints.added.length > 0) {
    console.log(chalk.red(`    ${diff.constraints.added.length} new constraint(s) to satisfy`));
  }
  if (diff.constraints.removed.length > 0) {
    console.log(chalk.green(`    ${diff.constraints.removed.length} constraint(s) no longer apply`));
  }
  console.log('');
}
