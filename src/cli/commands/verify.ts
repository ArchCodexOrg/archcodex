/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * verify command - LLM-based behavioral verification.
 */

import { Command } from 'commander';
import { relative } from 'path';
import chalk from 'chalk';
import { loadRegistry } from '../../core/registry/loader.js';
import { loadConfig } from '../../core/config/loader.js';
import { loadArchIgnore, globFiles, loadArchConfig } from '../../utils/index.js';
import { verifyFile, formatVerificationResult } from '../../llm/verifier.js';
import { listProviders } from '../../llm/providers/index.js';
import type { LLMProvider } from '../../llm/types.js';

/**
 * Create the verify command.
 */
export function createVerifyCommand(): Command {
  return new Command('verify')
  .description('Verify code against behavioral hints using LLM analysis')
  .argument('[files...]', 'Files or globs to verify')
  .option('-p, --provider <provider>', 'LLM provider (openai, anthropic, prompt)', 'prompt')
  .option('--prompt', 'Output verification prompts for external agent (same as --provider=prompt)')
  .option('--list-providers', 'List available LLM providers')
  .option('-c, --config <path>', 'Path to config file', '.arch/config.yaml')
  .option('--json', 'Output as JSON')
  .action(async (files: string[], options) => {
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
        console.log('Use --provider=prompt to output prompts for Claude Code verification.\n');
        return;
      }

      // Load registry and archignore
      const registry = await loadRegistry(projectRoot);
      const archIgnore = await loadArchIgnore(projectRoot);

      // Determine provider
      const provider: LLMProvider = options.prompt ? 'prompt' : (options.provider as LLMProvider);

      // Resolve file paths
      let allFilePaths: string[] = [];
      if (files.length === 0) {
        // Default: use config patterns
        const includePatterns = config.files?.scan?.include ?? ['**/*.ts', '**/*.tsx'];
        const excludePatterns = config.files?.scan?.exclude ?? [
          '**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/*.spec.ts',
        ];
        for (const pattern of includePatterns) {
          const matches = await globFiles(pattern, {
            cwd: projectRoot,
            ignore: excludePatterns,
            absolute: true,
          });
          allFilePaths.push(...matches);
        }
        allFilePaths = [...new Set(allFilePaths)]; // Dedupe
      } else {
        for (const pattern of files) {
          const matches = await globFiles(pattern, {
            cwd: projectRoot,
            absolute: true,
          });
          allFilePaths.push(...matches);
        }
      }

      // Filter with archignore (need relative paths)
      const filePaths = allFilePaths.filter(fp => {
        const relativePath = relative(projectRoot, fp);
        return !archIgnore.ignores(relativePath);
      });

      if (filePaths.length === 0) {
        console.log(chalk.yellow('No files to verify.'));
        return;
      }

      // Show mode
      if (provider === 'prompt') {
        console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
        console.log(chalk.cyan.bold('ARCHCODEX VERIFICATION - PROMPT MODE'));
        console.log(chalk.cyan('═══════════════════════════════════════════════════════════════'));
        console.log(chalk.gray('\nOutputting verification prompts for external agent analysis.'));
        console.log(chalk.gray('Use these prompts with Claude Code or another LLM to verify hints.\n'));
      } else {
        console.log(chalk.cyan(`\nVerifying ${filePaths.length} file(s) with ${provider}...\n`));
      }

      // Process files
      const results = [];
      for (const filePath of filePaths) {
        const result = await verifyFile(filePath, registry, {
          provider,
          outputPrompt: provider === 'prompt',
          llmSettings: config.llm,
          archConfig,
        });
        results.push(result);

        if (options.json) {
          continue; // Collect all, output at end
        }

        // Output result
        if (result.promptOutput) {
          console.log(result.promptOutput);
          console.log('');
        } else if (result.llmVerification) {
          console.log(formatVerificationResult(result));
          console.log('');
        } else if (!result.archId) {
          console.log(chalk.gray(`Skipping ${relative(projectRoot, filePath)} - no @arch tag`));
        }
      }

      // JSON output
      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      // Summary
      if (provider !== 'prompt') {
        const verified = results.filter(r => r.llmVerification);
        const passed = verified.filter(
          r => r.llmVerification?.results.every(c => c.passed)
        );

        console.log(chalk.bold('\n─────────────────────────────────────────'));
        console.log(`Files checked: ${results.length}`);
        console.log(`Verified: ${verified.length}`);
        if (verified.length > 0) {
          console.log(`Passed: ${passed.length}/${verified.length}`);
        }
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
}
