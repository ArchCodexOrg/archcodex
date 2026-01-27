/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Validate-plan command - checks proposed changes against architectural constraints
 * BEFORE execution. Catches violations during the planning phase.
 */
import { Command } from 'commander';
import { logger } from '../../utils/logger.js';
import { validatePlan, formatValidationResult } from '../../core/validate-plan/index.js';
import type { PlanValidationInput } from '../../core/validate-plan/index.js';

interface ValidatePlanOptions {
  stdin?: boolean;
  json?: boolean;
  config: string;
}

/**
 * Create the validate-plan command.
 */
export function createValidatePlanCommand(): Command {
  return new Command('validate-plan')
    .description('Validate a proposed change set against architectural constraints (pre-execution)')
    .argument('[planFile]', 'Path to a JSON plan file with proposed changes')
    .option('--stdin', 'Read plan from stdin', false)
    .option('--json', 'Output as structured JSON', false)
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .action(async (planFile: string | undefined, options: ValidatePlanOptions) => {
      try {
        await runValidatePlan(planFile, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runValidatePlan(
  planFile: string | undefined,
  options: ValidatePlanOptions
): Promise<void> {
  const projectRoot = process.cwd();

  // Read plan input
  let planJson: string;

  if (options.stdin) {
    planJson = await readStdin();
  } else if (planFile) {
    const { readFile } = await import('../../utils/file-system.js');
    const path = await import('node:path');
    planJson = await readFile(path.resolve(projectRoot, planFile));
  } else {
    logger.error('Provide a plan file path or use --stdin');
    process.exit(1);
  }

  let input: PlanValidationInput;
  try {
    input = JSON.parse(planJson) as PlanValidationInput;
  } catch {
    logger.error('Invalid JSON input. Expected: {"changes": [...]}');
    process.exit(1);
  }

  if (!input.changes || !Array.isArray(input.changes)) {
    logger.error('Plan must contain a "changes" array');
    process.exit(1);
  }

  const result = await validatePlan(projectRoot, input);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatValidationResult(result));
  }

  // Exit with code 1 if validation fails
  if (!result.valid) {
    process.exit(1);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      reject(new Error('No input on stdin. Pipe JSON or use a plan file.'));
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}
