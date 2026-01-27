/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 * @intent:stateless
 *
 * CLI command for intent discovery and validation.
 * Orchestrates subcommands: list, show, usage, validate.
 */
import { Command } from 'commander';
import * as path from 'node:path';
import { loadConfig } from '../../../core/config/loader.js';
import { loadIntentRegistry } from '../../../core/registry/loader.js';
import { logger as log } from '../../../utils/logger.js';
import type { IntentsOptions } from './types.js';
import { listIntents } from './list.js';
import { showIntent } from './show.js';
import { showUsage } from './usage.js';
import { validateIntents } from './validate.js';

/**
 * Create the intents command.
 */
export function createIntentsCommand(): Command {
  return new Command('intents')
    .description('Discover and manage semantic intent annotations')
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .option('-l, --list', 'List all defined intents')
    .option('-s, --show <name>', 'Show details for a specific intent')
    .option('-u, --usage', 'Show intent usage across codebase')
    .option('-v, --validate', 'Validate all intent usage')
    .option('--json', 'Output as JSON')
    .action(async (options: IntentsOptions) => {
      try {
        await runIntents(options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runIntents(options: IntentsOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Load configuration
  const configPath = path.resolve(projectRoot, options.config);
  const config = await loadConfig(configPath);

  // Load intent registry
  const intentRegistry = await loadIntentRegistry(projectRoot);

  if (options.show) {
    await showIntent(intentRegistry, options.show, options.json);
  } else if (options.usage) {
    await showUsage(projectRoot, config, intentRegistry, options.json);
  } else if (options.validate) {
    await validateIntents(projectRoot, config, intentRegistry, options.json);
  } else {
    // Default to list
    listIntents(intentRegistry, options.json);
  }
}
