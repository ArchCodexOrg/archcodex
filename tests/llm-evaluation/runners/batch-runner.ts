/** @arch archcodex.test @intent:cli-output */
/**
 * Batch runner for LLM evaluation.
 * Runs the full test matrix across all scenarios, models, and configurations.
 */

import type {
  Model,
  PromptStyle,
  Scenario,
  RunConfig,
  RawResult,
  EvaluatedResult,
  AggregateStats,
  SummaryReport,
  Finding,
} from '../types.js';
import { runScenario, getAllScenarios, getScenario } from './scenario-runner.js';
import { gradeResult } from './grader.js';

const MODELS: Model[] = ['haiku', 'opus'];
const PROMPT_STYLES: PromptStyle[] = ['detailed', 'oneliner'];
const CONTEXT_OPTIONS = [true, false];

export interface BatchOptions {
  /** Specific scenario IDs to run (default: all) */
  scenarios?: string[];
  /** Specific models to test (default: all) */
  models?: Model[];
  /** Number of runs per configuration (default: 3) */
  runsPerConfig?: number;
  /** Callback for progress updates */
  onProgress?: (completed: number, total: number, current: string) => void;
  /** Delay between API calls in ms (default: 1000) */
  delayMs?: number;
}

export interface BatchResult {
  results: EvaluatedResult[];
  summary: SummaryReport;
}

/**
 * Run the full evaluation matrix.
 */
export async function runBatch(options: BatchOptions = {}): Promise<BatchResult> {
  const {
    scenarios: scenarioIds,
    models = MODELS,
    runsPerConfig = 3,
    onProgress,
    delayMs = 1000,
  } = options;

  // Get scenarios to run
  const allScenarios = getAllScenarios();
  const scenarios = scenarioIds
    ? allScenarios.filter(s => scenarioIds.includes(s.id))
    : allScenarios;

  if (scenarios.length === 0) {
    throw new Error('No scenarios to run');
  }

  // Build run configurations
  const configs: RunConfig[] = [];
  for (const scenario of scenarios) {
    for (const model of models) {
      for (const withContext of CONTEXT_OPTIONS) {
        for (const promptStyle of PROMPT_STYLES) {
          for (let runNumber = 1; runNumber <= runsPerConfig; runNumber++) {
            configs.push({
              scenario,
              model,
              withContext,
              promptStyle,
              runNumber,
            });
          }
        }
      }
    }
  }

  const total = configs.length;
  const results: EvaluatedResult[] = [];

  // Run each configuration
  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const label = `${config.scenario.id}/${config.model}/${config.withContext ? 'ctx' : 'no-ctx'}/${config.promptStyle}/#${config.runNumber}`;

    onProgress?.(i, total, label);

    try {
      const rawResult = await runScenario(config);
      const evaluatedResult = gradeResult(rawResult, config.scenario);
      results.push(evaluatedResult);
    } catch (error) {
      console.error(`Error running ${label}:`, error);
      // Continue with other runs
    }

    // Delay between API calls to avoid rate limiting
    if (i < configs.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  onProgress?.(total, total, 'Complete');

  // Generate summary
  const summary = generateSummary(results);

  return { results, summary };
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate summary statistics from results.
 */
function generateSummary(results: EvaluatedResult[]): SummaryReport {
  return {
    generatedAt: new Date().toISOString(),
    totalRuns: results.length,

    byModel: {
      haiku: computeStats(results.filter(r => r.model === 'haiku')),
      opus: computeStats(results.filter(r => r.model === 'opus')),
    },

    byContext: {
      with: computeStats(results.filter(r => r.withContext)),
      without: computeStats(results.filter(r => !r.withContext)),
    },

    byDifficulty: {
      easy: computeStats(results.filter(r => getScenario(r.scenarioId)?.difficulty === 'easy')),
      medium: computeStats(results.filter(r => getScenario(r.scenarioId)?.difficulty === 'medium')),
      hard: computeStats(results.filter(r => getScenario(r.scenarioId)?.difficulty === 'hard')),
    },

    byPromptStyle: {
      detailed: computeStats(results.filter(r => r.promptStyle === 'detailed')),
      oneliner: computeStats(results.filter(r => r.promptStyle === 'oneliner')),
    },

    modelXContext: {
      haikuWith: computeStats(results.filter(r => r.model === 'haiku' && r.withContext)),
      haikuWithout: computeStats(results.filter(r => r.model === 'haiku' && !r.withContext)),
      opusWith: computeStats(results.filter(r => r.model === 'opus' && r.withContext)),
      opusWithout: computeStats(results.filter(r => r.model === 'opus' && !r.withContext)),
    },

    findings: generateFindings(results),
  };
}

/**
 * Compute aggregate statistics for a set of results.
 */
function computeStats(results: EvaluatedResult[]): AggregateStats {
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

  // Completion rate
  const completionRate = results.filter(r => r.grades.completion).length / n;

  // Correctness
  const correctnessValues = results.map(r => r.grades.correctness);
  const correctnessMean = mean(correctnessValues);
  const correctnessStd = std(correctnessValues);

  // Constraint adherence
  const constraintAdherenceRate = results.filter(r => r.grades.constraintAdherence).length / n;

  // Modification order
  const modificationOrderRate = results.filter(r => r.grades.modificationOrder).length / n;

  // Layer compliance
  const layerComplianceRate = results.filter(r => r.grades.layerCompliance).length / n;

  // Impact awareness
  const impactAwarenessMean = mean(results.map(r => r.grades.impactAwareness));

  // Token usage
  const tokensInputMean = mean(results.map(r => r.tokens.input));
  const tokensOutputMean = mean(results.map(r => r.tokens.output));

  return {
    n,
    completionRate,
    correctnessMean,
    correctnessStd,
    constraintAdherenceRate,
    modificationOrderRate,
    layerComplianceRate,
    impactAwarenessMean,
    tokensInputMean,
    tokensOutputMean,
  };
}

/**
 * Calculate mean of an array.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculate standard deviation of an array.
 */
function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Generate key findings from results.
 */
function generateFindings(results: EvaluatedResult[]): Finding[] {
  const findings: Finding[] = [];

  // Compare with vs without context
  const withContext = results.filter(r => r.withContext);
  const withoutContext = results.filter(r => !r.withContext);

  if (withContext.length > 0 && withoutContext.length > 0) {
    const withStats = computeStats(withContext);
    const withoutStats = computeStats(withoutContext);

    const correctnessImprovement = withStats.correctnessMean - withoutStats.correctnessMean;
    if (Math.abs(correctnessImprovement) > 0.5) {
      findings.push({
        category: 'context_value',
        observation: `Context ${correctnessImprovement > 0 ? 'improves' : 'reduces'} correctness by ${Math.abs(correctnessImprovement).toFixed(1)} points on average`,
        significance: Math.abs(correctnessImprovement) > 1 ? 'high' : 'medium',
      });
    }

    const layerImprovement = withStats.layerComplianceRate - withoutStats.layerComplianceRate;
    if (Math.abs(layerImprovement) > 0.2) {
      findings.push({
        category: 'layer_compliance',
        observation: `Layer compliance: ${(withStats.layerComplianceRate * 100).toFixed(0)}% with context vs ${(withoutStats.layerComplianceRate * 100).toFixed(0)}% without`,
        significance: Math.abs(layerImprovement) > 0.5 ? 'high' : 'medium',
      });
    }
  }

  // Compare models
  const haiku = results.filter(r => r.model === 'haiku');
  const opus = results.filter(r => r.model === 'opus');

  if (haiku.length > 0 && opus.length > 0) {
    const haikuStats = computeStats(haiku);
    const opusStats = computeStats(opus);

    const correctnessDiff = opusStats.correctnessMean - haikuStats.correctnessMean;
    if (Math.abs(correctnessDiff) > 0.5) {
      findings.push({
        category: 'model_comparison',
        observation: `Opus scores ${correctnessDiff > 0 ? 'higher' : 'lower'} than Haiku by ${Math.abs(correctnessDiff).toFixed(1)} points on correctness`,
        significance: Math.abs(correctnessDiff) > 1 ? 'high' : 'medium',
      });
    }
  }

  // Check prompt style impact
  const detailed = results.filter(r => r.promptStyle === 'detailed');
  const oneliner = results.filter(r => r.promptStyle === 'oneliner');

  if (detailed.length > 0 && oneliner.length > 0) {
    const detailedStats = computeStats(detailed);
    const onelinerStats = computeStats(oneliner);

    const promptDiff = detailedStats.correctnessMean - onelinerStats.correctnessMean;
    if (Math.abs(promptDiff) > 0.5) {
      findings.push({
        category: 'prompt_style',
        observation: `Detailed prompts ${promptDiff > 0 ? 'outperform' : 'underperform'} one-liners by ${Math.abs(promptDiff).toFixed(1)} points`,
        significance: Math.abs(promptDiff) > 1 ? 'high' : 'medium',
      });
    }
  }

  return findings;
}
