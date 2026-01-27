/**
 * @arch archcodex.cli.command
 * @intent:cli-output
 */
import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import { loadConfig } from '../../core/config/loader.js';
import { SkeletonExtractor, formatSkeletonForPrompt } from '../../core/learn/index.js';
import { getAvailableProvider, listProviders } from '../../llm/providers/factory.js';
import { PromptProvider } from '../../llm/providers/prompt.js';
import { loadArchConfig } from '../../utils/archconfig.js';
import { writeFile, fileExists } from '../../utils/file-system.js';
import { logger } from '../../utils/logger.js';
import type { LLMProvider } from '../../llm/types.js';

interface LearnOptions {
  output?: string;
  provider?: string;
  dryRun?: boolean;
  json?: boolean;
  maxFiles?: number;
  hints?: string;
  listProviders?: boolean;
}

const DEFAULT_OUTPUT = '.arch/registry-draft.yaml';

/**
 * Create the learn command.
 */
export function createLearnCommand(): Command {
  return new Command('learn')
    .description('(Experimental) Bootstrap architecture by analyzing codebase with LLM')
    .argument('[path]', 'Path to analyze (default: src/)')
    .option('-o, --output <path>', `Output path for draft registry (default: ${DEFAULT_OUTPUT})`)
    .option('-p, --provider <name>', 'LLM provider: openai, anthropic, or prompt (default: auto)')
    .option('--dry-run', 'Extract skeleton only, do not call LLM')
    .option('--json', 'Output skeleton as JSON')
    .option('--max-files <n>', 'Maximum files to analyze', parseInt)
    .option('--hints <text>', 'Additional hints for the LLM')
    .option('--list-providers', 'List available LLM providers')
    .action(async (inputPath: string | undefined, options: LearnOptions) => {
      try {
        await runLearn(inputPath, options);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}

async function runLearn(
  inputPath: string | undefined,
  options: LearnOptions
): Promise<void> {
  const projectRoot = process.cwd();

  // Load config and archconfig
  const config = await loadConfig(projectRoot);
  const archConfig = await loadArchConfig(projectRoot);

  // Handle --list-providers
  if (options.listProviders) {
    const providers = listProviders(config.llm, archConfig);
    console.log();
    console.log(chalk.bold('Available LLM Providers'));
    console.log(chalk.dim('────────────────────────────────────────'));
    for (const p of providers) {
      const status = p.available ? chalk.green('✓') : chalk.red('✗');
      const model = p.model ? chalk.dim(` (${p.model})`) : '';
      console.log(`  ${status} ${p.name}${model}`);
    }
    console.log();
    return;
  }

  // Determine path to analyze
  const analyzePath = inputPath || 'src/';
  const fullPath = path.resolve(projectRoot, analyzePath);

  // Check path exists
  const pathExists = await fileExists(fullPath);
  if (!pathExists) {
    throw new Error(`Path not found: ${analyzePath}`);
  }

  console.log();
  console.log(chalk.bold('═'.repeat(60)));
  console.log(chalk.bold.cyan('  ARCHCODEX LEARN'));
  console.log(chalk.bold('═'.repeat(60)));
  console.log();
  console.log(`Analyzing: ${chalk.cyan(analyzePath)}`);

  // Extract skeleton
  const extractor = new SkeletonExtractor(projectRoot);
  const extractResult = await extractor.extract({
    include: [`${analyzePath}**/*.ts`, `${analyzePath}**/*.tsx`],
    maxFiles: options.maxFiles,
  });
  extractor.dispose();

  const { skeleton, extractionTimeMs, warnings } = extractResult;

  console.log(`Found: ${chalk.green(skeleton.totalFiles)} files in ${extractionTimeMs.toFixed(0)}ms`);
  console.log(`Clusters: ${chalk.green(skeleton.importClusters.length)}`);
  console.log(`Existing tags: ${chalk.green(skeleton.existingTags.length)}`);

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.log(chalk.yellow(`  ⚠ ${warning}`));
    }
  }

  // Dry run - just output skeleton
  if (options.dryRun) {
    console.log();
    console.log(chalk.bold('─'.repeat(60)));
    console.log(chalk.bold('PROJECT SKELETON'));
    console.log(chalk.bold('─'.repeat(60)));
    console.log();

    if (options.json) {
      console.log(JSON.stringify(skeleton, null, 2));
    } else {
      console.log(formatSkeletonForPrompt(skeleton));
    }
    return;
  }

  // Format skeleton for LLM
  const skeletonYaml = formatSkeletonForPrompt(skeleton);

  // Get provider
  const providerName = (options.provider as LLMProvider) || undefined;
  const provider = getAvailableProvider(providerName, config.llm, archConfig);

  console.log(`Provider: ${chalk.cyan(provider.name)}`);
  console.log();

  // Handle prompt mode specially
  if (provider.name === 'prompt') {
    const promptProvider = provider as PromptProvider;
    const prompt = promptProvider.formatLearnPrompt({
      skeletonYaml,
      userHints: options.hints,
    });

    console.log(prompt);
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log(chalk.yellow('Prompt mode: Copy the above prompt to Claude Code or another LLM.'));
    console.log(chalk.yellow('Paste the generated YAML into: ' + (options.output || DEFAULT_OUTPUT)));
    console.log(chalk.yellow('Then run: archcodex migrate-registry ' + (options.output || DEFAULT_OUTPUT) + ' to convert to multi-file format'));
    console.log();
    return;
  }

  // Call LLM
  console.log(chalk.dim('Generating registry...'));

  const response = await provider.learn({
    skeletonYaml,
    userHints: options.hints,
  });

  if (response.error) {
    throw new Error(`LLM error: ${response.error}`);
  }

  if (!response.registryYaml) {
    throw new Error('LLM returned empty registry');
  }

  // Write output
  const outputPath = options.output || DEFAULT_OUTPUT;
  const fullOutputPath = path.resolve(projectRoot, outputPath);
  await writeFile(fullOutputPath, response.registryYaml);

  // Output results
  console.log();
  console.log(chalk.bold('─'.repeat(60)));
  console.log(chalk.bold.green('GENERATED REGISTRY'));
  console.log(chalk.bold('─'.repeat(60)));
  console.log();
  console.log(`Output: ${chalk.cyan(outputPath)}`);
  console.log(`Confidence: ${chalk.cyan((response.confidence * 100).toFixed(0) + '%')}`);

  if (response.tokenUsage) {
    console.log(`Tokens: ${response.tokenUsage.total} (${response.tokenUsage.input} in, ${response.tokenUsage.output} out)`);
  }

  console.log();
  console.log(chalk.bold('Explanation:'));
  console.log(chalk.dim(response.explanation));

  if (response.suggestions.length > 0) {
    console.log();
    console.log(chalk.bold('Next Steps:'));
    for (const suggestion of response.suggestions) {
      console.log(`  ${chalk.cyan('→')} ${suggestion}`);
    }
  }

  console.log();
  console.log(chalk.bold('─'.repeat(60)));
  console.log();
  console.log('Preview the generated registry:');
  console.log(chalk.cyan(`  cat ${outputPath}`));
  console.log();
  console.log('Simulate the impact before applying:');
  console.log(chalk.cyan(`  archcodex simulate ${outputPath}`));
  console.log();
  console.log('Convert to multi-file registry (recommended):');
  console.log(chalk.cyan(`  archcodex migrate-registry ${outputPath}`));
  console.log();
}
