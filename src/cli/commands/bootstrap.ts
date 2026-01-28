/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 *
 * Bootstrap command - Infer and tag all untagged files in a codebase.
 */
import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import { readFile, writeFile, globFiles } from '../../utils/file-system.js';
import { loadArchIgnore } from '../../utils/archignore.js';
import { inferArchitecture, buildRulesFromSettings } from '../../core/infer/index.js';
import { parseArchTags } from '../../core/arch-tag/parser.js';
import { logger } from '../../utils/logger.js';
import { loadConfig } from '../../core/config/loader.js';
import { loadRegistry, hasArchitecture, registryExists } from '../../core/registry/loader.js';
import { insertArchTag } from '../../utils/arch-tag.js';
import type { Registry } from '../../core/registry/schema.js';

interface BootstrapOptions {
  dryRun?: boolean;
  minConfidence?: 'high' | 'medium' | 'low';
  interactive?: boolean;
  json?: boolean;
}

/**
 * Create the bootstrap command.
 */
export function createBootstrapCommand(): Command {
  return new Command('bootstrap')
    .description('Infer and tag all untagged files in a codebase')
    .argument('[pattern]', 'Glob pattern (default: uses config.files.scan patterns)')
    .option('--dry-run', 'Show what would be tagged without modifying files')
    .option('-c, --min-confidence <level>', 'Minimum confidence to auto-tag (high, medium, low)', 'high')
    .option('--json', 'Output results as JSON')
    .action(async (pattern: string | undefined, options: BootstrapOptions) => {
      try {
        await runBootstrap(pattern, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

interface BootstrapResult {
  file: string;
  action: 'tagged' | 'skipped-tagged' | 'skipped-low-confidence' | 'skipped-no-match' | 'skipped-unknown-arch';
  archId?: string;
  confidence?: 'high' | 'medium' | 'low';
  reason?: string;
  warning?: string;
}

async function runBootstrap(pattern: string | undefined, options: BootstrapOptions): Promise<void> {
  const projectRoot = process.cwd();
  const minConfidence = options.minConfidence || 'high';
  const confidenceLevels = ['high', 'medium', 'low'];
  const minConfidenceIndex = confidenceLevels.indexOf(minConfidence);

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
    } catch {
      // Registry load failed - continue without validation
      logger.warn('Could not load registry for archId validation');
    }
  }

  // Get file patterns from config or use provided pattern
  // Default patterns include TypeScript, JavaScript, Python, and Go files
  const defaultPatterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.go'];
  const includePatterns = pattern ? [pattern] : (config.files?.scan?.include ?? defaultPatterns);
  const excludePatterns = config.files?.scan?.exclude ?? [
    '**/node_modules/**', '**/dist/**', '**/build/**', '**/*.d.ts',
  ];

  // Get files using config patterns
  const allFiles: string[] = [];
  for (const p of includePatterns) {
    const matches = await globFiles(p, {
      cwd: projectRoot, absolute: false,
      ignore: excludePatterns,
    });
    allFiles.push(...matches);
  }

  const archIgnore = await loadArchIgnore(projectRoot);
  const uniqueFiles = [...new Set(allFiles)]; // Dedupe
  const files = archIgnore.filter(uniqueFiles);

  if (files.length === 0) {
    logger.warn('No files found matching the pattern.');
    return;
  }

  logger.info(`Analyzing ${files.length} file(s)...`);
  if (inferenceSettings.custom_rules?.length) {
    logger.info(`Using ${inferenceSettings.custom_rules.length} custom inference rule(s)`);
  }

  const results: BootstrapResult[] = [];
  let tagged = 0, skippedTagged = 0, skippedLowConf = 0, skippedNoMatch = 0, skippedUnknownArch = 0;

  for (const file of files) {
    const fullPath = path.join(projectRoot, file);
    const content = await readFile(fullPath);

    // Check if already tagged
    const { archTag } = parseArchTags(content);
    if (archTag) {
      results.push({ file, action: 'skipped-tagged', archId: archTag.archId });
      skippedTagged++;
      continue;
    }

    // Infer architecture using configured rules
    // Pass full relative path so filePattern can match directories
    const inference = inferArchitecture(file, content, rules);

    if (!inference) {
      results.push({ file, action: 'skipped-no-match' });
      skippedNoMatch++;
      continue;
    }

    // Validate archId exists in registry (if enabled)
    if (registry && !hasArchitecture(registry, inference.archId)) {
      results.push({
        file, action: 'skipped-unknown-arch',
        archId: inference.archId, confidence: inference.confidence, reason: inference.reason,
        warning: `Architecture '${inference.archId}' not found in registry`,
      });
      skippedUnknownArch++;
      console.log(`${chalk.yellow('⚠')} ${file} → @arch ${inference.archId} [${inference.confidence}] - unknown archId`);
      continue;
    }

    // Check confidence threshold
    const inferenceConfIndex = confidenceLevels.indexOf(inference.confidence);
    if (inferenceConfIndex > minConfidenceIndex) {
      results.push({
        file, action: 'skipped-low-confidence',
        archId: inference.archId, confidence: inference.confidence, reason: inference.reason,
      });
      skippedLowConf++;
      continue;
    }

    // Tag the file (pass file path for language-aware comment syntax)
    if (!options.dryRun) {
      const newContent = insertArchTag(content, inference.archId, file);
      await writeFile(fullPath, newContent);
    }

    results.push({
      file, action: 'tagged',
      archId: inference.archId, confidence: inference.confidence, reason: inference.reason,
    });
    tagged++;

    // Show progress
    const prefix = options.dryRun ? chalk.cyan('[dry-run]') : chalk.green('✓');
    console.log(`${prefix} ${file} → @arch ${inference.archId} [${inference.confidence}]`);
  }

  // JSON output
  if (options.json) {
    console.log(JSON.stringify({ results, summary: { tagged, skippedTagged, skippedLowConf, skippedNoMatch, skippedUnknownArch } }, null, 2));
    return;
  }

  // Summary
  console.log('\n' + chalk.bold('Bootstrap Summary:'));
  console.log(`  ${options.dryRun ? 'Would tag' : 'Tagged'}:       ${chalk.green(tagged)}`);
  console.log(`  Already tagged:  ${chalk.dim(skippedTagged)}`);
  console.log(`  Low confidence:  ${chalk.yellow(skippedLowConf)} (below ${minConfidence})`);
  console.log(`  Unknown archId:  ${chalk.yellow(skippedUnknownArch)}`);
  console.log(`  No match:        ${chalk.dim(skippedNoMatch)}`);

  if (options.dryRun && tagged > 0) {
    console.log(chalk.dim('\nRun without --dry-run to apply changes.'));
  }

  if (skippedLowConf > 0) {
    console.log(chalk.dim(`\nTo include medium/low confidence: --min-confidence medium`));
  }

  if (skippedUnknownArch > 0) {
    console.log(chalk.yellow(`\n${skippedUnknownArch} file(s) matched unknown architectures. Add them to .arch/registry/ or update inference rules.`));
  }

  // Show files that need manual review
  const needsReview = results.filter(r => r.action === 'skipped-low-confidence' || r.action === 'skipped-no-match' || r.action === 'skipped-unknown-arch');
  if (needsReview.length > 0 && needsReview.length <= 20) {
    console.log(chalk.yellow('\nFiles needing manual review:'));
    for (const r of needsReview.slice(0, 10)) {
      if (r.archId) {
        console.log(`  ${chalk.dim('?')} ${r.file} → ${r.archId} [${r.confidence}]`);
      } else {
        console.log(`  ${chalk.dim('?')} ${r.file} (no pattern match)`);
      }
    }
    if (needsReview.length > 10) {
      console.log(chalk.dim(`  ... and ${needsReview.length - 10} more`));
    }
  }
}

