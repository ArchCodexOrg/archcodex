/** @arch archcodex.test @intent:cli-output */
#!/usr/bin/env npx tsx
/**
 * LLM Evaluation Runner
 *
 * Tests the archcodex_context tool with Haiku and Opus models.
 *
 * Usage:
 *   npx tsx tests/llm-evaluation/run-evaluation.ts                    # Run full matrix
 *   npx tsx tests/llm-evaluation/run-evaluation.ts --scenario E1      # Run single scenario
 *   npx tsx tests/llm-evaluation/run-evaluation.ts --model haiku      # Run with specific model
 *   npx tsx tests/llm-evaluation/run-evaluation.ts --dry-run          # Show what would run
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runBatch, type BatchOptions } from './runners/batch-runner.js';
import { runScenario, getScenario, getAllScenarios } from './runners/scenario-runner.js';
import { gradeResult } from './runners/grader.js';
import type { Model, PromptStyle, EvaluatedResult, SummaryReport } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CLIOptions {
  scenario?: string;
  model?: Model;
  withContext?: boolean;
  promptStyle?: PromptStyle;
  runs?: number;
  dryRun?: boolean;
  outputDir?: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--scenario' || arg === '-s') {
      options.scenario = args[++i];
    } else if (arg === '--model' || arg === '-m') {
      options.model = args[++i] as Model;
    } else if (arg === '--with-context') {
      options.withContext = true;
    } else if (arg === '--without-context') {
      options.withContext = false;
    } else if (arg === '--detailed') {
      options.promptStyle = 'detailed';
    } else if (arg === '--oneliner') {
      options.promptStyle = 'oneliner';
    } else if (arg === '--runs' || arg === '-r') {
      options.runs = parseInt(args[++i], 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--output' || arg === '-o') {
      options.outputDir = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
LLM Evaluation Runner

Tests the archcodex_context tool with Haiku and Opus models.

Usage:
  npx tsx tests/llm-evaluation/run-evaluation.ts [options]

Options:
  --scenario, -s <id>    Run specific scenario (E1, M1, H1, etc.)
  --model, -m <model>    Run with specific model (haiku, opus)
  --with-context         Only run with context
  --without-context      Only run without context
  --detailed             Only run detailed prompts
  --oneliner             Only run one-liner prompts
  --runs, -r <n>         Number of runs per config (default: 3)
  --dry-run              Show what would run without executing
  --output, -o <dir>     Output directory for results
  --help, -h             Show this help

Examples:
  # Run full evaluation matrix
  npx tsx tests/llm-evaluation/run-evaluation.ts

  # Run single scenario with all configurations
  npx tsx tests/llm-evaluation/run-evaluation.ts --scenario E1

  # Run Haiku only, with context
  npx tsx tests/llm-evaluation/run-evaluation.ts --model haiku --with-context

  # Dry run to see what would execute
  npx tsx tests/llm-evaluation/run-evaluation.ts --dry-run
`);
}

function getResultsDir(options: CLIOptions): string {
  if (options.outputDir) {
    return options.outputDir;
  }

  const date = new Date().toISOString().split('T')[0];
  const time = new Date().toISOString().split('T')[1].slice(0, 5).replace(':', '');
  return join(__dirname, 'results', `${date}-${time}`);
}

function saveResults(
  resultsDir: string,
  results: EvaluatedResult[],
  summary: SummaryReport
): void {
  // Create directories
  mkdirSync(join(resultsDir, 'raw'), { recursive: true });
  mkdirSync(join(resultsDir, 'evaluated'), { recursive: true });

  // Save raw results
  for (const result of results) {
    const filename = `${result.scenarioId}-${result.model}-${result.withContext ? 'ctx' : 'noctx'}-${result.promptStyle}-${result.runNumber}.json`;
    writeFileSync(
      join(resultsDir, 'raw', filename),
      JSON.stringify(result, null, 2)
    );
  }

  // Save all evaluated results
  writeFileSync(
    join(resultsDir, 'evaluated', 'all-results.json'),
    JSON.stringify(results, null, 2)
  );

  // Save summary
  writeFileSync(
    join(resultsDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  // Save human-readable summary
  writeFileSync(
    join(resultsDir, 'summary.md'),
    formatSummaryMarkdown(summary)
  );
}

function formatSummaryMarkdown(summary: SummaryReport): string {
  const lines: string[] = [];

  lines.push('# LLM Evaluation Summary');
  lines.push('');
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Total Runs: ${summary.totalRuns}`);
  lines.push('');

  lines.push('## By Model');
  lines.push('');
  lines.push('| Model | N | Completion | Correctness | Constraint Adherence | Layer Compliance |');
  lines.push('|-------|---|------------|-------------|----------------------|------------------|');
  lines.push(formatStatsRow('Haiku', summary.byModel.haiku));
  lines.push(formatStatsRow('Opus', summary.byModel.opus));
  lines.push('');

  lines.push('## By Context');
  lines.push('');
  lines.push('| Context | N | Completion | Correctness | Constraint Adherence | Layer Compliance |');
  lines.push('|---------|---|------------|-------------|----------------------|------------------|');
  lines.push(formatStatsRow('With', summary.byContext.with));
  lines.push(formatStatsRow('Without', summary.byContext.without));
  lines.push('');

  lines.push('## Model × Context');
  lines.push('');
  lines.push('| Condition | N | Completion | Correctness | Layer Compliance |');
  lines.push('|-----------|---|------------|-------------|------------------|');
  lines.push(formatStatsRow('Haiku + Context', summary.modelXContext.haikuWith));
  lines.push(formatStatsRow('Haiku - Context', summary.modelXContext.haikuWithout));
  lines.push(formatStatsRow('Opus + Context', summary.modelXContext.opusWith));
  lines.push(formatStatsRow('Opus - Context', summary.modelXContext.opusWithout));
  lines.push('');

  lines.push('## By Difficulty');
  lines.push('');
  lines.push('| Difficulty | N | Completion | Correctness | Layer Compliance |');
  lines.push('|------------|---|------------|-------------|------------------|');
  lines.push(formatStatsRow('Easy', summary.byDifficulty.easy));
  lines.push(formatStatsRow('Medium', summary.byDifficulty.medium));
  lines.push(formatStatsRow('Hard', summary.byDifficulty.hard));
  lines.push('');

  lines.push('## By Prompt Style');
  lines.push('');
  lines.push('| Style | N | Completion | Correctness | Layer Compliance |');
  lines.push('|-------|---|------------|-------------|------------------|');
  lines.push(formatStatsRow('Detailed', summary.byPromptStyle.detailed));
  lines.push(formatStatsRow('One-liner', summary.byPromptStyle.oneliner));
  lines.push('');

  if (summary.findings.length > 0) {
    lines.push('## Key Findings');
    lines.push('');
    for (const finding of summary.findings) {
      const icon = finding.significance === 'high' ? '🔴' : finding.significance === 'medium' ? '🟡' : '🟢';
      lines.push(`- ${icon} **${finding.category}**: ${finding.observation}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatStatsRow(label: string, stats: { n: number; completionRate: number; correctnessMean: number; constraintAdherenceRate: number; layerComplianceRate: number }): string {
  return `| ${label} | ${stats.n} | ${(stats.completionRate * 100).toFixed(0)}% | ${stats.correctnessMean.toFixed(1)}/5 | ${(stats.constraintAdherenceRate * 100).toFixed(0)}% | ${(stats.layerComplianceRate * 100).toFixed(0)}% |`;
}

async function runSingleScenario(options: CLIOptions): Promise<void> {
  const scenarioId = options.scenario!;
  const scenario = getScenario(scenarioId);

  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioId}`);
    console.log('Available scenarios:', getAllScenarios().map(s => s.id).join(', '));
    process.exit(1);
  }

  console.log(`Running scenario: ${scenarioId} - ${scenario.task}`);
  console.log(`Module: ${scenario.module}`);
  console.log('');

  const models: Model[] = options.model ? [options.model] : ['haiku', 'opus'];
  const promptStyles: PromptStyle[] = options.promptStyle ? [options.promptStyle] : ['detailed', 'oneliner'];
  const contextOptions = options.withContext !== undefined ? [options.withContext] : [true, false];
  const runs = options.runs ?? 1;

  const results: EvaluatedResult[] = [];
  let completed = 0;
  const total = models.length * promptStyles.length * contextOptions.length * runs;

  for (const model of models) {
    for (const withContext of contextOptions) {
      for (const promptStyle of promptStyles) {
        for (let runNumber = 1; runNumber <= runs; runNumber++) {
          completed++;
          const label = `[${completed}/${total}] ${model}/${withContext ? 'ctx' : 'no-ctx'}/${promptStyle}/#${runNumber}`;
          process.stdout.write(`${label}... `);

          try {
            const rawResult = await runScenario({
              scenario,
              model,
              withContext,
              promptStyle,
              runNumber,
            });

            const evaluatedResult = gradeResult(rawResult, scenario);
            results.push(evaluatedResult);

            console.log(`Done (correctness: ${evaluatedResult.grades.correctness}/5, tokens: ${rawResult.tokens.total})`);
          } catch (error) {
            console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
          }

          // Small delay between runs
          if (completed < total) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    }
  }

  // Print summary
  console.log('');
  console.log('=== Results Summary ===');
  console.log('');

  for (const result of results) {
    const { grades } = result;
    const ctx = result.withContext ? '✓ ctx' : '✗ ctx';
    const completion = grades.completion ? '✓' : '✗';
    const layer = grades.layerCompliance ? '✓' : '✗';
    const order = grades.modificationOrder ? '✓' : '✗';

    console.log(`${result.model.padEnd(6)} ${ctx.padEnd(8)} ${result.promptStyle.padEnd(10)} | completion:${completion} correctness:${grades.correctness}/5 layer:${layer} order:${order} impact:${grades.impactAwareness}/3`);
  }

  // Save results if output specified
  if (options.outputDir || results.length > 1) {
    const resultsDir = getResultsDir(options);
    const summary = generateQuickSummary(results);
    saveResults(resultsDir, results, summary);
    console.log('');
    console.log(`Results saved to: ${resultsDir}`);
  }
}

function generateQuickSummary(results: EvaluatedResult[]): SummaryReport {
  // Import the full summary generation from batch-runner
  // For now, create a minimal summary
  return {
    generatedAt: new Date().toISOString(),
    totalRuns: results.length,
    byModel: {
      haiku: computeQuickStats(results.filter(r => r.model === 'haiku')),
      opus: computeQuickStats(results.filter(r => r.model === 'opus')),
    },
    byContext: {
      with: computeQuickStats(results.filter(r => r.withContext)),
      without: computeQuickStats(results.filter(r => !r.withContext)),
    },
    byDifficulty: {
      easy: computeQuickStats([]),
      medium: computeQuickStats([]),
      hard: computeQuickStats([]),
    },
    byPromptStyle: {
      detailed: computeQuickStats(results.filter(r => r.promptStyle === 'detailed')),
      oneliner: computeQuickStats(results.filter(r => r.promptStyle === 'oneliner')),
    },
    modelXContext: {
      haikuWith: computeQuickStats(results.filter(r => r.model === 'haiku' && r.withContext)),
      haikuWithout: computeQuickStats(results.filter(r => r.model === 'haiku' && !r.withContext)),
      opusWith: computeQuickStats(results.filter(r => r.model === 'opus' && r.withContext)),
      opusWithout: computeQuickStats(results.filter(r => r.model === 'opus' && !r.withContext)),
    },
    findings: [],
  };
}

function computeQuickStats(results: EvaluatedResult[]) {
  if (results.length === 0) {
    return {
      n: 0,
      completionRate: 0,
      correctnessMean: 0,
      correctnessStd: 0,
      constraintAdherenceRate: 0,
      modificationOrderRate: 0,
      layerComplianceRate: 0,
      impactAwarenessMean: 0,
      tokensInputMean: 0,
      tokensOutputMean: 0,
    };
  }

  const n = results.length;
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    n,
    completionRate: results.filter(r => r.grades.completion).length / n,
    correctnessMean: mean(results.map(r => r.grades.correctness)),
    correctnessStd: 0,
    constraintAdherenceRate: results.filter(r => r.grades.constraintAdherence).length / n,
    modificationOrderRate: results.filter(r => r.grades.modificationOrder).length / n,
    layerComplianceRate: results.filter(r => r.grades.layerCompliance).length / n,
    impactAwarenessMean: mean(results.map(r => r.grades.impactAwareness)),
    tokensInputMean: mean(results.map(r => r.tokens.input)),
    tokensOutputMean: mean(results.map(r => r.tokens.output)),
  };
}

async function runFullBatch(options: CLIOptions): Promise<void> {
  console.log('Running full evaluation matrix...');
  console.log('');

  const batchOptions: BatchOptions = {
    models: options.model ? [options.model] : undefined,
    runsPerConfig: options.runs ?? 3,
    onProgress: (completed, total, current) => {
      const pct = Math.round((completed / total) * 100);
      process.stdout.write(`\r[${pct}%] ${completed}/${total} - ${current}`.padEnd(80));
    },
    delayMs: 1500, // Slightly longer delay for full batch
  };

  const { results, summary } = await runBatch(batchOptions);

  console.log('\n');

  // Save results
  const resultsDir = getResultsDir(options);
  saveResults(resultsDir, results, summary);

  // Print summary
  console.log(formatSummaryMarkdown(summary));
  console.log(`\nResults saved to: ${resultsDir}`);
}

function showDryRun(options: CLIOptions): void {
  const scenarios = options.scenario
    ? [getScenario(options.scenario)].filter(Boolean)
    : getAllScenarios();

  const models: Model[] = options.model ? [options.model] : ['haiku', 'opus'];
  const promptStyles: PromptStyle[] = options.promptStyle ? [options.promptStyle] : ['detailed', 'oneliner'];
  const contextOptions = options.withContext !== undefined ? [options.withContext] : [true, false];
  const runs = options.runs ?? 3;

  console.log('=== Dry Run ===');
  console.log('');
  console.log(`Scenarios: ${scenarios.map(s => s!.id).join(', ')}`);
  console.log(`Models: ${models.join(', ')}`);
  console.log(`Prompt styles: ${promptStyles.join(', ')}`);
  console.log(`Context options: ${contextOptions.map(c => c ? 'with' : 'without').join(', ')}`);
  console.log(`Runs per config: ${runs}`);
  console.log('');

  const total = scenarios.length * models.length * promptStyles.length * contextOptions.length * runs;
  console.log(`Total runs: ${total}`);

  // Estimate cost
  const haikuRuns = models.includes('haiku') ? total / models.length : 0;
  const opusRuns = models.includes('opus') ? total / models.length : 0;
  const estimatedCost = (haikuRuns * 0.003) + (opusRuns * 0.20);
  console.log(`Estimated cost: ~$${estimatedCost.toFixed(2)}`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY && !options.dryRun) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    console.log('Set it with: export ANTHROPIC_API_KEY=your-key-here');
    process.exit(1);
  }

  if (options.dryRun) {
    showDryRun(options);
  } else if (options.scenario) {
    await runSingleScenario(options);
  } else {
    await runFullBatch(options);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
