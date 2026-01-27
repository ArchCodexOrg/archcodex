/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import * as path from 'node:path';
import { loadConfig } from '../../core/config/loader.js';
import { PointerResolver } from '../../core/pointers/resolver.js';
import { logger as log } from '../../utils/logger.js';
import type { PointerScheme } from '../../core/pointers/types.js';

/**
 * Create the fetch command.
 */
export function createFetchCommand(): Command {
  return new Command('fetch')
    .description('Fetch content from a pointer URI (arch://, code://, template://)')
    .argument('<uri>', 'Pointer URI to fetch')
    .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
    .option('--json', 'Output as JSON')
    .action(async (uri: string, options: FetchOptions) => {
      try {
        await runFetch(uri, options);
      } catch (error) {
        log.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface FetchOptions {
  config: string;
  json?: boolean;
}

async function runFetch(uri: string, options: FetchOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Load configuration
  const configPath = path.resolve(projectRoot, options.config);
  const config = await loadConfig(configPath);

  // Create pointer resolver
  const resolver = new PointerResolver(projectRoot, {
    archBasePath: config.pointers.base_paths.arch,
    codeBasePath: config.pointers.base_paths.code,
    templateBasePath: config.pointers.base_paths.template,
    allowedSchemes: ['arch', 'code', 'template'] as PointerScheme[],
  });

  // Resolve the pointer
  const result = await resolver.resolve(uri);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.success) {
    log.error(`Failed to fetch: ${result.error}`);
    process.exit(1);
  }

  // Output content
  if (result.fragmentContent !== undefined) {
    // Fragment was specified - output just the fragment
    console.log(result.fragmentContent);
    log.info(`Fragment from: ${result.filePath}`);
  } else {
    // Output full content
    console.log(result.content);
    log.info(`Source: ${result.filePath}`);
  }
}
