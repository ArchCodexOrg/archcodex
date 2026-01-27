/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 * @intent:cli-subcommand
 *
 * Show details for a specific intent.
 */
import chalk from 'chalk';
import { listIntentNames } from '../../../core/registry/loader.js';
import type { IntentRegistry } from '../../../core/registry/schema.js';

/**
 * Show details for a specific intent.
 */
export async function showIntent(registry: IntentRegistry, name: string, json?: boolean): Promise<void> {
  const definition = registry.intents[name];

  if (!definition) {
    const available = listIntentNames(registry);
    const similar = available.filter(n => n.includes(name) || name.includes(n));

    if (json) {
      console.log(JSON.stringify({ error: 'Intent not found', name, similar }, null, 2));
    } else {
      console.log(chalk.red(`\nIntent '${name}' not found.`));
      if (similar.length > 0) {
        console.log(chalk.yellow(`Did you mean: ${similar.join(', ')}?`));
      }
    }
    process.exit(1);
  }

  if (json) {
    console.log(JSON.stringify({ name, ...definition }, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold(`@intent:${name}`));
  console.log(chalk.dim('-'.repeat(40)));
  console.log(`  ${chalk.cyan('Description:')} ${definition.description}`);

  if (definition.category) {
    console.log(`  ${chalk.cyan('Category:')} ${definition.category}`);
  }

  if (definition.requires && definition.requires.length > 0) {
    console.log(`  ${chalk.green('Requires:')}`);
    for (const pattern of definition.requires) {
      console.log(`    - ${pattern}`);
    }
  }

  if (definition.forbids && definition.forbids.length > 0) {
    console.log(`  ${chalk.red('Forbids:')}`);
    for (const pattern of definition.forbids) {
      console.log(`    - ${pattern}`);
    }
  }

  if (definition.conflicts_with && definition.conflicts_with.length > 0) {
    console.log(`  ${chalk.yellow('Conflicts with:')}`);
    for (const intent of definition.conflicts_with) {
      console.log(`    - @intent:${intent}`);
    }
  }

  if (definition.requires_intent && definition.requires_intent.length > 0) {
    console.log(`  ${chalk.magenta('Requires intents:')}`);
    for (const intent of definition.requires_intent) {
      console.log(`    - @intent:${intent}`);
    }
  }

  console.log();
}
