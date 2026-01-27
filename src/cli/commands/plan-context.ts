/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Plan context command - provides scope-aware architecture context for plan-mode agents.
 * Single call that replaces session-context + N×read + neighborhood + impact.
 */
import { Command } from 'commander';
import { logger } from '../../utils/logger.js';
import { getPlanContext, formatPlanContextCompact } from '../../core/plan-context/index.js';
import type { PlanContextScope } from '../../core/plan-context/index.js';

interface PlanContextOptions {
  files?: string[];
  json?: boolean;
  config: string;
}

/**
 * Create the plan-context command.
 */
export function createPlanContextCommand(): Command {
  return new Command('plan-context')
    .description('Get scope-aware architecture context for plan-mode agents (single call)')
    .argument('[scope...]', 'Directory paths or glob patterns to scope context to')
    .option('--files <paths...>', 'Specific file paths to include in scope')
    .option('--json', 'Output as structured JSON', false)
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .action(async (scopePaths: string[], options: PlanContextOptions) => {
      try {
        await runPlanContext(scopePaths, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runPlanContext(
  scopePaths: string[],
  options: PlanContextOptions
): Promise<void> {
  const projectRoot = process.cwd();

  const scope: PlanContextScope = {
    paths: scopePaths.length > 0 ? scopePaths : ['src/'],
    targetFiles: options.files,
  };

  const result = await getPlanContext(projectRoot, scope);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const output = formatPlanContextCompact(result);
    console.log(output);
  }
}
