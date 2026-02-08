/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Infer subcommand - generate spec YAML from existing implementation.
 */
import type { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import {
  inferSpec,
  inferSpecUpdate,
  parseImplementationPath,
} from '../../../core/spec/index.js';
import { ensureDir, writeFile, readFile } from '../../../utils/file-system.js';
import { logger } from '../../../utils/logger.js';

/**
 * Register the infer subcommand on the spec command.
 */
export function registerInferCommand(spec: Command): void {
  spec
    .command('infer <implementation>')
    .description('Generate spec YAML from existing TypeScript implementation')
    .option('--output <path>', 'Write to file instead of stdout')
    .option('--update <specId>', 'Update existing spec (merge mode)')
    .option('--dry-run', 'Preview without writing')
    .option('--inherits <base>', 'Override auto-detected base spec')
    .option('--enrich', 'Use LLM to generate goal, intent, examples, invariants')
    .option('--provider <name>', 'LLM provider: openai, anthropic, prompt (default: auto)')
    .option('--json', 'Machine-readable output')
    .action(async (implementation: string, options) => {
      const projectRoot = process.cwd();

      try {
        // Update mode
        if (options.update) {
          const result = await inferSpecUpdate({
            specId: options.update,
            implementationPath: implementation,
            options: { projectRoot },
          });

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else if (!result.valid) {
            for (const err of result.errors) {
              logger.error(`${err.code}: ${err.message}`);
            }
          } else {
            const report = result.mergeReport;
            if (report.addedInputs.length > 0) {
              logger.info(`Added inputs: ${report.addedInputs.join(', ')}`);
            }
            if (report.removedInputs.length > 0) {
              logger.warn(`Removed inputs: ${report.removedInputs.join(', ')}`);
            }
            if (report.addedOutputs.length > 0) {
              logger.info(`Added outputs: ${report.addedOutputs.join(', ')}`);
            }
            if (report.removedOutputs.length > 0) {
              logger.warn(`Removed outputs: ${report.removedOutputs.join(', ')}`);
            }
            logger.info(`Preserved: ${report.preservedSections.join(', ')}`);

            if (options.output && !options.dryRun) {
              await ensureDir(path.dirname(options.output));
              await writeFile(options.output, result.yaml);
              logger.info(`Updated spec written to ${options.output}`);
            } else {
              console.log(result.yaml);
            }
          }

          process.exit(result.valid ? 0 : 1);
          return;
        }

        // Infer mode
        const result = inferSpec({
          implementationPath: implementation,
          options: {
            projectRoot,
            inherits: options.inherits,
          },
        });

        if (!result.valid) {
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            for (const err of result.errors) {
              logger.error(`${err.code}: ${err.message}`);
            }
          }
          process.exit(1);
          return;
        }

        // Enrich with LLM if requested
        let finalYaml = result.yaml;
        if (options.enrich) {
          try {
            const { getAvailableProvider } = await import('../../../llm/providers/factory.js');
            const { gatherCodeContext } = await import('../../../core/spec/infer-context.js');
            const { buildEnrichmentPrompt, parseEnrichmentResponse, mergeEnrichedSections } =
              await import('../../../core/spec/infer-prompts.js');

            // Load archconfig for API keys
            let archConfig;
            try {
              const { loadArchConfig } = await import('../../../utils/archconfig.js');
              archConfig = await loadArchConfig(projectRoot);
            } catch { /* archconfig is optional, provider falls back to env vars */ }

            // Validate provider option
            const validProviders = ['openai', 'anthropic', 'prompt'] as const;
            type LLMProviderName = (typeof validProviders)[number];
            let preferredProvider: LLMProviderName | undefined;
            if (options.provider) {
              if (!validProviders.includes(options.provider as LLMProviderName)) {
                logger.error(`Unknown provider '${options.provider}'. Valid: ${validProviders.join(', ')}`);
                process.exit(1);
                return;
              }
              preferredProvider = options.provider as LLMProviderName;
            }

            const provider = getAvailableProvider(
              preferredProvider,
              undefined,
              archConfig,
            );

            // Parse implementation path (reuse existing parser)
            const parsed = parseImplementationPath(implementation);
            if (!parsed) {
              logger.error('--enrich requires format: path/to/file.ts#exportName');
              process.exit(1);
              return;
            }

            // Gather code context
            const context = gatherCodeContext(parsed.filePath, parsed.exportName, { projectRoot });

            // Read implementation content
            const implContent = await readFile(path.resolve(projectRoot, parsed.filePath));

            // Build prompt
            const prompt = buildEnrichmentPrompt({
              filePath: parsed.filePath,
              content: implContent,
              exportName: parsed.exportName,
              skeleton: result,
              context,
            });

            if (provider.name === 'prompt') {
              // Output prompt for manual LLM use
              if (!options.json) {
                console.log('');
                console.log(chalk.bold('Enrichment Prompt (paste into an LLM):'));
                console.log(chalk.dim('─'.repeat(70)));
                console.log(prompt);
                console.log(chalk.dim('─'.repeat(70)));
                console.log('');
                console.log(chalk.dim('No API key configured. Paste this prompt into an LLM,'));
                console.log(chalk.dim('then update the spec YAML with the response.'));
              }
            } else {
              if (!options.json && !options.dryRun) {
                logger.info(`Enriching with ${chalk.cyan(provider.name)}...`);
              }
              const llmResponse = await provider.generate(prompt);
              const enriched = parseEnrichmentResponse(llmResponse);
              finalYaml = mergeEnrichedSections(result.yaml, enriched);

              if (!options.json && !options.dryRun) {
                logger.info(chalk.green('Enrichment complete'));
              }
            }
          } catch (error) {
            if (!options.json) {
              logger.warn(`Enrichment failed: ${error instanceof Error ? error.message : error}`);
              logger.warn('Falling back to structural skeleton');
            }
          }
        }

        if (options.json) {
          console.log(JSON.stringify({ ...result, yaml: finalYaml }, null, 2));
        } else {
          if (!options.dryRun) {
            logger.info(`Spec ID: ${chalk.cyan(result.specId)}`);
            logger.info(`Base: ${chalk.yellow(result.detectedPatterns.baseSpec)}`);
            if (result.detectedPatterns.security.authentication !== 'none') {
              logger.info(`Auth: ${chalk.red(result.detectedPatterns.security.authentication)}`);
            }
            if (result.detectedPatterns.effects.length > 0) {
              logger.info(`Effects: ${result.detectedPatterns.effects.map(e => e.type).join(', ')}`);
            }
            if (result.detectedPatterns.errorCodes.length > 0) {
              logger.info(`Error codes: ${result.detectedPatterns.errorCodes.join(', ')}`);
            }
            console.log('');
          }

          if (options.output && !options.dryRun) {
            await ensureDir(path.dirname(options.output));
            await writeFile(options.output, finalYaml);
            logger.info(`Spec written to ${options.output}`);
          } else {
            console.log(finalYaml);
          }
        }

        process.exit(0);
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: String(error) }));
        } else {
          logger.error(`Inference failed: ${error}`);
        }
        process.exit(1);
      }
    });
}
