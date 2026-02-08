/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Infer command - Suggest architecture based on file content analysis.
 */
import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import { readFile, globFiles } from '../../utils/file-system.js';
import { inferArchitecture, buildRulesFromSettings } from '../../core/infer/index.js';
import { parseArchTags } from '../../core/arch-tag/parser.js';
import { logger } from '../../utils/logger.js';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry, hasArchitecture, registryExists, loadIntentRegistry, suggestIntents, type IntentSuggestion } from '../../core/registry/loader.js';
import type { Registry, IntentRegistry } from '../../core/registry/schema.js';

interface InferOptions {
  json?: boolean;
  quiet?: boolean;
  untaggedOnly?: boolean;
}

/**
 * Create the infer command.
 */
export function createInferCommand(): Command {
  return new Command('infer')
    .description('Suggest architecture for file(s) based on content analysis')
    .argument('<pattern>', 'File path or glob pattern')
    .option('--json', 'Output as JSON')
    .option('-q, --quiet', 'Only output suggestions, no explanations')
    .option('-u, --untagged-only', 'Only analyze files without @arch tags')
    .action(async (pattern: string, options: InferOptions) => {
      try {
        await runInfer(pattern, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface InferResult {
  file: string;
  currentArch: string | null;
  suggestedArch: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  reason: string | null;
  archIdValid?: boolean;
  warning?: string;
  suggestedIntents?: IntentSuggestion[];
}

async function runInfer(pattern: string, options: InferOptions): Promise<void> {
  const projectRoot = process.cwd();

  // Load config for inference settings
  const config = await loadConfig(projectRoot);
  const inferenceSettings = config.inference;

  // Build rules from settings (includes custom rules if configured)
  const rules = buildRulesFromSettings(inferenceSettings);

  // Load registry for archId validation (if enabled and registry exists)
  let registry: Registry | null = null;
  const shouldValidate = inferenceSettings.validate_arch_ids !== false;
  if (shouldValidate && await registryExists(projectRoot)) {
    try {
      registry = await loadRegistry(projectRoot, config.registry);
    } catch { /* registry load failed - continue without validation */
      if (!options.quiet) {
        logger.warn('Could not load registry for archId validation');
      }
    }
  }

  // Load intent registry for intent suggestions
  let intentRegistry: IntentRegistry | null = null;
  try {
    intentRegistry = await loadIntentRegistry(projectRoot);
  } catch { /* intent registry load failed - continue without suggestions */ }

  // Get files
  let files: string[];
  if (pattern.includes('*') || pattern.includes('?')) {
    files = await globFiles(pattern, {
      cwd: projectRoot, absolute: false,
      ignore: ['node_modules/**', 'dist/**', 'build/**'],
    });
  } else {
    files = [pattern];
  }

  if (files.length === 0) {
    logger.warn('No files found matching the pattern.');
    return;
  }

  if (!options.quiet && inferenceSettings.custom_rules?.length) {
    logger.info(`Using ${inferenceSettings.custom_rules.length} custom inference rule(s)`);
  }

  const results: InferResult[] = [];

  for (const file of files) {
    const fullPath = path.join(projectRoot, file);
    const content = await readFile(fullPath);

    // Check current @arch tag
    const { archTag } = parseArchTags(content);
    const currentArch = archTag?.archId || null;

    // Skip if already tagged and --untagged-only
    if (options.untaggedOnly && currentArch) {
      continue;
    }

    // Infer architecture using configured rules
    // Pass full relative path so filePattern can match directories
    const inference = inferArchitecture(file, content, rules);

    // Check if suggested archId is valid in registry
    const archIdValid = inference && registry
      ? hasArchitecture(registry, inference.archId)
      : undefined;

    const warning = inference && registry && !archIdValid
      ? `Architecture '${inference.archId}' not found in registry`
      : undefined;

    // Suggest intents based on path and architecture
    let suggestedIntents: IntentSuggestion[] | undefined;
    if (intentRegistry && Object.keys(intentRegistry.intents).length > 0) {
      const suggestions = suggestIntents(intentRegistry, {
        filePath: file,
        archId: inference?.archId,
      });
      if (suggestions.length > 0) {
        suggestedIntents = suggestions;
      }
    }

    results.push({
      file,
      currentArch,
      suggestedArch: inference?.archId || null,
      confidence: inference?.confidence || null,
      reason: inference?.reason || null,
      archIdValid,
      warning,
      suggestedIntents,
    });
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(chalk.gray('No untagged files found.'));
    return;
  }

  // Group by suggestion
  const withSuggestions = results.filter(r => r.suggestedArch);
  const noSuggestions = results.filter(r => !r.suggestedArch);

  if (withSuggestions.length > 0) {
    console.log(chalk.bold('\nSuggested architectures:\n'));

    for (const r of withSuggestions) {
      const confColor = r.confidence === 'high' ? chalk.green
        : r.confidence === 'medium' ? chalk.yellow : chalk.gray;
      const confBadge = confColor(`[${r.confidence}]`);
      const validBadge = r.archIdValid === false ? chalk.red(' ⚠ unknown') : '';

      if (r.currentArch) {
        // Already tagged - show comparison
        if (r.currentArch === r.suggestedArch) {
          console.log(`${chalk.green('✓')} ${r.file}`);
          console.log(`   Current: ${chalk.green(r.currentArch)} (matches suggestion)`);
        } else {
          console.log(`${chalk.yellow('?')} ${r.file}`);
          console.log(`   Current:   ${chalk.dim(r.currentArch)}`);
          console.log(`   Suggested: ${chalk.cyan(r.suggestedArch)} ${confBadge}${validBadge}`);
          if (!options.quiet && r.reason) {
            console.log(`   Reason:    ${chalk.gray(r.reason)}`);
          }
          if (r.warning) {
            console.log(`   Warning:   ${chalk.yellow(r.warning)}`);
          }
        }
      } else {
        // Untagged
        console.log(`${chalk.cyan('→')} ${r.file}`);
        console.log(`   Suggested: ${chalk.cyan(r.suggestedArch)} ${confBadge}${validBadge}`);
        if (!options.quiet && r.reason) {
          console.log(`   Reason:    ${chalk.gray(r.reason)}`);
        }
        if (r.warning) {
          console.log(`   Warning:   ${chalk.yellow(r.warning)}`);
        }
      }

      // Show suggested intents
      if (r.suggestedIntents && r.suggestedIntents.length > 0) {
        const intentNames = r.suggestedIntents.map(i => `@intent:${i.name}`).join(', ');
        console.log(`   Intents:   ${chalk.magenta(intentNames)}`);
        if (!options.quiet) {
          for (const intent of r.suggestedIntents) {
            const reason = intent.reason === 'path' ? 'path match' : 'arch match';
            console.log(`              ${chalk.dim(`└ ${intent.name}: ${intent.description} (${reason})`)}`);
          }
        }
      }

      console.log();
    }
  }

  if (noSuggestions.length > 0 && !options.quiet) {
    console.log(chalk.dim(`\n${noSuggestions.length} file(s) could not be inferred (no matching patterns)`));
  }

  // Summary
  const unknownArchCount = withSuggestions.filter(r => r.archIdValid === false).length;

  console.log(chalk.bold('\nSummary:'));
  console.log(`  Files analyzed:   ${results.length}`);
  console.log(`  Suggestions:      ${withSuggestions.length}`);
  console.log(`  High confidence:  ${withSuggestions.filter(r => r.confidence === 'high').length}`);
  if (unknownArchCount > 0) {
    console.log(`  Unknown archIds:  ${chalk.yellow(unknownArchCount)}`);
  }

  // Show tag command hint
  if (withSuggestions.length > 0) {
    const example = withSuggestions.find(r => !r.currentArch && r.confidence === 'high');
    if (example) {
      console.log(chalk.dim(`\nTo apply: archcodex tag "${pattern}" --arch ${example.suggestedArch} --dry-run`));
    }
  }
}
