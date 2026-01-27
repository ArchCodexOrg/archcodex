/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * CLI command for action-based discovery.
 * Transforms "I want to add X" into architecture + checklist guidance.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import {
  loadActionRegistry,
  loadFeatureRegistry,
  listActionNames,
  getAction,
  matchAction,
  hasAction,
  findFeatureByAction,
} from '../../core/registry/loader.js';
import { logger } from '../../utils/logger.js';
import type { ActionDefinition } from '../../core/registry/schema.js';

interface ActionCommandOptions {
  json?: boolean;
}

/**
 * Create the action command.
 */
export function createActionCommand(): Command {
  const cmd = new Command('action')
    .description('Find guidance for common tasks (intent-based discovery)')
    .argument('[query]', 'What you want to do (e.g., "add a view", "create endpoint")')
    .option('--json', 'Output as JSON')
    .action(async (query: string | undefined, options: ActionCommandOptions) => {
      try {
        await runAction(query, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  // Subcommand: list all actions
  cmd.addCommand(
    new Command('list')
      .description('List all available actions')
      .option('--json', 'Output as JSON')
      .action(async (options: ActionCommandOptions) => {
        try {
          await runActionList(options);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  );

  // Subcommand: show action details
  cmd.addCommand(
    new Command('show')
      .description('Show details for a specific action')
      .argument('<name>', 'Action name')
      .option('--json', 'Output as JSON')
      .action(async (name: string, options: ActionCommandOptions) => {
        try {
          await runActionShow(name, options);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : 'Unknown error');
          process.exit(1);
        }
      })
  );

  return cmd;
}

/**
 * Run action query/match.
 */
async function runAction(query: string | undefined, options: ActionCommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const actionRegistry = await loadActionRegistry(projectRoot);

  if (Object.keys(actionRegistry.actions).length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'No actions defined', hint: 'Create .arch/registry/_actions.yaml' }));
    } else {
      logger.warn('No actions defined yet.');
      console.log(chalk.dim('Create .arch/registry/_actions.yaml to define actions.'));
    }
    return;
  }

  if (!query) {
    // No query - show help
    if (options.json) {
      console.log(JSON.stringify({
        hint: 'Provide a query describing what you want to do',
        examples: ['add a view', 'create endpoint', 'add validation'],
        available_actions: listActionNames(actionRegistry),
      }));
    } else {
      console.log();
      console.log(chalk.bold('Action-Based Discovery'));
      console.log();
      console.log('Describe what you want to do:');
      console.log(chalk.dim('  archcodex action "add a view"'));
      console.log(chalk.dim('  archcodex action "create api endpoint"'));
      console.log();
      console.log('Or use subcommands:');
      console.log(chalk.dim('  archcodex action list        # List all actions'));
      console.log(chalk.dim('  archcodex action show <name> # Show action details'));
    }
    return;
  }

  // Match query to actions
  const matches = matchAction(actionRegistry, query);

  if (options.json) {
    console.log(JSON.stringify(matches, null, 2));
    return;
  }

  if (matches.length === 0) {
    console.log();
    console.log(chalk.yellow('No matching actions found.'));
    console.log(chalk.dim('Try different words or run `archcodex action list` to see available actions.'));
    return;
  }

  console.log();
  console.log(chalk.bold(`Actions matching: "${query}"`));
  console.log();

  for (const match of matches.slice(0, 5)) {
    const scorePercent = Math.round(match.score * 100);
    console.log(`  ${chalk.cyan(match.name)} ${chalk.dim(`(${scorePercent}% match via ${match.matchType})`)}`);
    console.log(`    ${match.action.description}`);
    console.log();
  }

  // Show details for the best match
  const bestMatch = matches[0];
  console.log(chalk.bold('─'.repeat(50)));
  console.log();
  await printActionDetails(bestMatch.name, bestMatch.action, projectRoot);

  console.log();
  console.log(chalk.dim(`For full details: archcodex action show ${bestMatch.name}`));
}

/**
 * List all available actions.
 */
async function runActionList(options: ActionCommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const actionRegistry = await loadActionRegistry(projectRoot);
  const actionNames = listActionNames(actionRegistry);

  if (actionNames.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ actions: [], hint: 'Create .arch/registry/_actions.yaml' }));
    } else {
      logger.warn('No actions defined.');
      console.log(chalk.dim('Create .arch/registry/_actions.yaml to define actions.'));
    }
    return;
  }

  if (options.json) {
    const actions = actionNames.map(name => ({
      name,
      ...actionRegistry.actions[name],
    }));
    console.log(JSON.stringify(actions, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold('Available Actions:'));
  console.log();

  for (const name of actionNames) {
    const action = actionRegistry.actions[name];
    console.log(`  ${chalk.cyan(name)}`);
    console.log(`    ${action.description}`);
    if (action.aliases && action.aliases.length > 0) {
      console.log(`    ${chalk.dim('Aliases:')} ${action.aliases.join(', ')}`);
    }
    console.log();
  }

  console.log(chalk.dim('Use `archcodex action show <name>` to see full details.'));
}

/**
 * Show details for a specific action.
 */
async function runActionShow(name: string, options: ActionCommandOptions): Promise<void> {
  const projectRoot = process.cwd();
  const actionRegistry = await loadActionRegistry(projectRoot);

  if (!hasAction(actionRegistry, name)) {
    if (options.json) {
      console.log(JSON.stringify({ error: `Action not found: ${name}` }));
    } else {
      logger.error(`Action not found: ${name}`);
      console.log(chalk.dim('Run `archcodex action list` to see available actions.'));
    }
    process.exit(1);
  }

  const action = getAction(actionRegistry, name)!;

  if (options.json) {
    // Include feature info if linked
    const featureRegistry = await loadFeatureRegistry(projectRoot);
    const linkedFeature = findFeatureByAction(featureRegistry, name);

    console.log(JSON.stringify({
      name,
      ...action,
      linked_feature: linkedFeature ? {
        components: linkedFeature.components.map(c => ({
          role: c.role,
          architecture: c.architecture,
          path: c.path,
        })),
      } : undefined,
    }, null, 2));
    return;
  }

  console.log();
  await printActionDetails(name, action, projectRoot, true);
}

/**
 * Print action details to console.
 */
async function printActionDetails(
  name: string,
  action: ActionDefinition,
  projectRoot: string,
  verbose: boolean = false
): Promise<void> {
  console.log(chalk.bold.cyan(`📋 Action: ${name}`));
  console.log();
  console.log(`  ${action.description}`);
  console.log();

  if (action.aliases && action.aliases.length > 0) {
    console.log(chalk.dim('Aliases:'));
    console.log(`  ${action.aliases.join(', ')}`);
    console.log();
  }

  if (action.architecture) {
    console.log(chalk.dim('Architecture:'));
    console.log(`  ${chalk.cyan(action.architecture)}`);
    console.log();
  }

  if (action.intents && action.intents.length > 0) {
    console.log(chalk.dim('Suggested Intents:'));
    for (const intent of action.intents) {
      console.log(`  ${chalk.yellow(`@intent: ${intent}`)}`);
    }
    console.log();
  }

  if (action.checklist.length > 0) {
    console.log(chalk.dim('Checklist:'));
    for (const item of action.checklist) {
      console.log(`  ${chalk.dim('☐')} ${item}`);
    }
    console.log();
  }

  if (verbose) {
    if (action.suggested_path) {
      console.log(chalk.dim('Suggested Path:'));
      console.log(`  ${action.suggested_path}`);
      console.log();
    }

    if (action.file_pattern) {
      console.log(chalk.dim('File Pattern:'));
      console.log(`  ${action.file_pattern}`);
      console.log();
    }

    if (action.test_pattern) {
      console.log(chalk.dim('Test Pattern:'));
      console.log(`  ${action.test_pattern}`);
      console.log();
    }

    if (action.variables && action.variables.length > 0) {
      console.log(chalk.dim('Variables:'));
      for (const variable of action.variables) {
        const defaultVal = variable.default ? ` (default: ${variable.default})` : '';
        console.log(`  ${chalk.cyan(`\${${variable.name}}`)} - ${variable.prompt}${chalk.dim(defaultVal)}`);
      }
      console.log();
    }

    // Check for linked feature
    const featureRegistry = await loadFeatureRegistry(projectRoot);
    const linkedFeature = findFeatureByAction(featureRegistry, name);

    if (linkedFeature) {
      console.log(chalk.dim('Linked Feature (multi-file scaffold):'));
      for (const component of linkedFeature.components) {
        const optional = component.optional ? chalk.dim(' (optional)') : '';
        console.log(`  ${chalk.dim('→')} ${component.role}: ${chalk.cyan(component.architecture)}${optional}`);
        console.log(`    ${chalk.dim(component.path)}`);
      }
      console.log();
      console.log(chalk.dim(`Use: archcodex feature ${name} --name <Name>`));
    } else if (action.architecture) {
      console.log(chalk.dim(`Use: archcodex scaffold ${action.architecture} --name <ClassName>`));
    }
  }
}
