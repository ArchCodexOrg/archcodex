/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 * @intent:cli-subcommand
 *
 * List all defined intents.
 */
import chalk from 'chalk';
import { getIntentsByCategory, listIntentNames } from '../../../core/registry/loader.js';
import type { IntentRegistry } from '../../../core/registry/schema.js';

/**
 * List all defined intents.
 */
export function listIntents(registry: IntentRegistry, json?: boolean): void {
  const categories = getIntentsByCategory(registry);
  const intentNames = listIntentNames(registry);

  if (json) {
    const output = {
      total: intentNames.length,
      byCategory: Object.fromEntries(categories),
      intents: registry.intents,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log();
  console.log(chalk.bold('DEFINED INTENTS'));
  console.log(chalk.dim('═'.repeat(60)));

  if (intentNames.length === 0) {
    console.log(chalk.yellow('\n  No intents defined. Create .arch/registry/_intents.yaml'));
    return;
  }

  // Sort categories
  const sortedCategories = Array.from(categories.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [category, intents] of sortedCategories) {
    console.log();
    console.log(chalk.bold.cyan(`  ${category}`));

    for (const intentName of intents.sort()) {
      const definition = registry.intents[intentName];
      const hasRequires = definition.requires && definition.requires.length > 0;
      const hasForbids = definition.forbids && definition.forbids.length > 0;
      const hasConflicts = definition.conflicts_with && definition.conflicts_with.length > 0;

      let badges = '';
      if (hasRequires) badges += chalk.green(' [req]');
      if (hasForbids) badges += chalk.red(' [forb]');
      if (hasConflicts) badges += chalk.yellow(' [conf]');

      console.log(`    ${chalk.white(intentName.padEnd(20))} ${chalk.dim(definition.description)}${badges}`);
    }
  }

  console.log();
  console.log(chalk.dim(`  Total: ${intentNames.length} intents`));
  console.log();
}
