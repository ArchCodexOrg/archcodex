/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { createMigrationPlan, applyMigrations } from '../../core/migrate/index.js';
import type { MigrationPlan, MigrationTask, MigrationResult } from '../../core/migrate/types.js';
import { logger as log } from '../../utils/logger.js';

interface MigrateOptions {
  json?: boolean;
  apply?: boolean;
  dryRun?: boolean;
  files?: boolean;  // Commander sets files=false for --no-files
  verbose?: boolean;
}

/**
 * Create the migrate command.
 */
export function createMigrateCommand(): Command {
  return new Command('migrate')
    .description('Generate and apply migration tasks for architecture changes')
    .argument('<range>', 'Git range (e.g., main..feature, HEAD~3, v1.0..v2.0)')
    .option('--json', 'Output as JSON')
    .option('--apply', 'Apply auto-fixable migrations')
    .option('--dry-run', 'Show what would be applied without making changes')
    .option('--no-files', 'Skip scanning for affected files')
    .option('--verbose', 'Show detailed migration steps')
    .action(async (range: string, options: MigrateOptions) => {
      try {
        await runMigrate(range, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runMigrate(range: string, options: MigrateOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Generate migration plan
  // Commander's --no-files sets options.files = false
  const plan = await createMigrationPlan(projectRoot, range, {
    includeFiles: options.files !== false,
  });

  if (options.json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  // Print plan
  printMigrationPlan(plan, options.verbose);

  // Apply if requested
  if (options.apply || options.dryRun) {
    console.log();
    if (options.dryRun) {
      console.log(chalk.yellow.bold('DRY RUN - No changes will be made'));
    } else {
      console.log(chalk.green.bold('Applying migrations...'));
    }
    console.log();

    const result = await applyMigrations(plan, {
      dryRun: options.dryRun,
      skipManual: true,
    });

    printMigrationResult(result, options.dryRun);
  }
}

function printMigrationPlan(plan: MigrationPlan, verbose?: boolean): void {
  console.log();
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan(`MIGRATION PLAN: ${plan.fromRef} → ${plan.toRef}`));
  console.log(chalk.bold('═══════════════════════════════════════════════════════════════════'));

  if (plan.tasks.length === 0) {
    console.log();
    console.log(chalk.green('No migrations needed.'));
    console.log();
    return;
  }

  // Print each task
  for (let i = 0; i < plan.tasks.length; i++) {
    const task = plan.tasks[i];
    printMigrationTask(i + 1, task, verbose);
  }

  // Summary
  console.log();
  console.log(chalk.dim('────────────────────────────────────────'));
  console.log(chalk.bold('Summary:'));
  console.log(`  Tasks: ${plan.summary.totalTasks}`);
  console.log(`  Files: ${plan.summary.totalFiles}`);
  console.log(`  Auto-applicable: ${chalk.green(plan.summary.autoApplicableFiles)}`);
  console.log(`  Manual review: ${chalk.yellow(plan.summary.manualReviewFiles)}`);

  if (plan.summary.autoApplicableFiles > 0) {
    console.log();
    console.log(chalk.dim('To apply auto-fixable migrations:'));
    console.log(chalk.cyan(`  archcodex migrate ${plan.fromRef}..${plan.toRef} --apply`));
  }

  console.log();
}

function printMigrationTask(num: number, task: MigrationTask, verbose?: boolean): void {
  console.log();
  console.log(chalk.bold(`${num}. ${task.archId}`));

  // Change type indicator
  const typeColor = task.changeType === 'added' ? chalk.green :
                    task.changeType === 'removed' ? chalk.red : chalk.yellow;
  console.log(`   ${typeColor(`[${task.changeType.toUpperCase()}]`)} ${task.summary}`);

  // Details
  if (task.details.length > 0 && verbose) {
    for (const detail of task.details) {
      console.log(`   ${chalk.dim('•')} ${detail}`);
    }
  }

  // File count
  if (task.fileCount > 0) {
    console.log(`   ${chalk.dim('Files:')} ${task.fileCount}`);

    // Show affected files if verbose
    if (verbose && task.affectedFiles.length > 0) {
      const maxFiles = 5;
      for (const file of task.affectedFiles.slice(0, maxFiles)) {
        const autoSteps = file.steps.filter(s => s.autoApplicable).length;
        const manualSteps = file.steps.filter(s => !s.autoApplicable).length;
        const status = manualSteps > 0
          ? chalk.yellow(`(${manualSteps} manual)`)
          : chalk.green(`(${autoSteps} auto)`);
        console.log(`     ${chalk.dim('•')} ${file.filePath} ${status}`);

        // Show steps
        for (const step of file.steps) {
          const stepIcon = step.autoApplicable ? chalk.green('✓') : chalk.yellow('⚠');
          console.log(`       ${stepIcon} ${step.description}`);
        }
      }
      if (task.affectedFiles.length > maxFiles) {
        console.log(`     ${chalk.dim(`... and ${task.affectedFiles.length - maxFiles} more`)}`);
      }
    }
  }

  // Action summary
  if (!verbose && task.affectedFiles.length > 0) {
    const actions = new Set<string>();
    for (const file of task.affectedFiles) {
      for (const step of file.steps) {
        actions.add(step.action);
      }
    }
    if (actions.size > 0) {
      console.log(`   ${chalk.dim('Actions:')} ${[...actions].join(', ')}`);
    }
  }
}

function printMigrationResult(result: MigrationResult, dryRun?: boolean): void {
  const verb = dryRun ? 'Would apply' : 'Applied';

  if (result.success.length > 0) {
    console.log(chalk.green.bold(`${verb} to ${result.success.length} file(s):`));
    for (const item of result.success.slice(0, 10)) {
      console.log(`  ${chalk.green('✓')} ${item.filePath} (${item.stepsApplied} steps)`);
    }
    if (result.success.length > 10) {
      console.log(`  ${chalk.dim(`... and ${result.success.length - 10} more`)}`);
    }
  }

  if (result.failed.length > 0) {
    console.log();
    console.log(chalk.red.bold(`Failed: ${result.failed.length} file(s)`));
    for (const item of result.failed) {
      console.log(`  ${chalk.red('✗')} ${item.filePath}: ${item.error}`);
    }
  }

  if (result.skipped.length > 0) {
    console.log();
    console.log(chalk.yellow.bold(`Skipped: ${result.skipped.length} file(s) (manual review required)`));
    for (const item of result.skipped.slice(0, 5)) {
      console.log(`  ${chalk.yellow('⚠')} ${item.filePath}`);
      console.log(`    ${chalk.dim(item.reason)}`);
    }
    if (result.skipped.length > 5) {
      console.log(`  ${chalk.dim(`... and ${result.skipped.length - 5} more`)}`);
    }
  }

  console.log();
}
