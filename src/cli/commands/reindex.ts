/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * reindex command - Auto-generate keywords for discovery.
 */

import { Command } from 'commander';
import { resolve } from 'path';
import chalk from 'chalk';
import { loadRegistry } from '../../core/registry/loader.js';
import { loadConfig } from '../../core/config/loader.js';
import { loadArchConfig } from '../../utils/index.js';
import {
  reindexArchitecture,
  reindexAll,
  formatReindexResult,
  formatReindexSummary,
} from '../../llm/reindexer.js';
import { listProviders } from '../../llm/providers/index.js';
import type { LLMProvider } from '../../llm/types.js';

/**
 * Create the reindex command.
 */
export function createReindexCommand(): Command {
  return new Command('reindex')
  .description('Auto-generate keywords for architecture discovery')
  .argument('[arch-id]', 'Specific architecture to reindex (or all if not specified)')
  .option('-p, --provider <provider>', 'LLM provider (openai, anthropic, prompt)', 'prompt')
  .option('--prompt', 'Output prompts for external agent (same as --provider=prompt)')
  .option('--dry-run', 'Show what would be updated without writing')
  .option('--list-providers', 'List available LLM providers')
  .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
  .option('--json', 'Output as JSON')
  .action(async (archId: string | undefined, options) => {
    try {
      // Load config, registry, and archconfig
      const projectRoot = process.cwd();
      const config = await loadConfig(projectRoot, options.config);
      const archConfig = await loadArchConfig(projectRoot);

      // List providers if requested
      if (options.listProviders) {
        const providers = listProviders(config.llm, archConfig);
        console.log(chalk.bold('\nAvailable LLM Providers:\n'));
        for (const p of providers) {
          const status = p.available
            ? chalk.green('available')
            : chalk.gray('not configured');
          const modelInfo = p.model ? ` (model: ${p.model})` : '';
          const urlInfo = p.baseUrl ? ` [${p.baseUrl}]` : '';
          console.log(`  ${p.name}: ${status}${modelInfo}${urlInfo}`);
        }
        console.log('\nConfigure providers in .arch/config.yaml under llm.providers');
        console.log('Or set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variables.');
        console.log('Use --provider=prompt to output prompts for Claude Code.\n');
        return;
      }

      // Load registry
      const registry = await loadRegistry(projectRoot);

      // Determine provider
      const provider: LLMProvider = options.prompt ? 'prompt' : (options.provider as LLMProvider);
      const outputPrompt = provider === 'prompt';

      // Show mode
      if (outputPrompt) {
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan.bold('ARCHCODEX REINDEX - PROMPT MODE'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════'));
        console.log(chalk.gray('\nOutputting prompts for external agent to generate keywords.'));
        console.log(chalk.gray('Provide keywords as JSON array: ["keyword1", "keyword2", ...]\n'));
      }

      // Single architecture or all
      if (archId) {
        const result = await reindexArchitecture(archId, registry, {
          provider,
          outputPrompt,
          dryRun: options.dryRun,
          llmSettings: config.llm,
          archConfig,
        });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(formatReindexResult(result));
      } else {
        // Reindex all
        const indexPath = resolve(projectRoot, '.arch/index.yaml');
        const summary = await reindexAll(registry, indexPath, {
          provider,
          outputPrompt,
          dryRun: options.dryRun,
          llmSettings: config.llm,
          archConfig,
        });

        if (options.json) {
          console.log(JSON.stringify(summary, null, 2));
          return;
        }

        console.log(formatReindexSummary(summary));

        if (options.dryRun) {
          console.log(chalk.yellow('\n(Dry run - no files were modified)'));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
}
