/** @arch archcodex.test @intent:cli-output */
/**
 * Types for LLM evaluation framework.
 * Tests the archcodex_context tool with different models and configurations.
 */

export type Model = 'haiku' | 'opus';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type PromptStyle = 'detailed' | 'oneliner';

export interface ModelConfig {
  id: Model;
  apiName: string;
  maxTokens: number;
}

export const MODELS: Record<Model, ModelConfig> = {
  haiku: {
    id: 'haiku',
    apiName: 'claude-3-5-haiku-20241022',
    maxTokens: 4096,
  },
  opus: {
    id: 'opus',
    apiName: 'claude-opus-4-5-20251101',
    maxTokens: 4096,
  },
};

export interface Scenario {
  id: string;
  difficulty: Difficulty;
  task: string;
  module: string;
  prompts: {
    detailed: string;
    oneliner: string;
  };
  expected: {
    filesModified: string[];
    modificationOrder: string[];
    mustPass: boolean;
    rubric: string[];
    consumers?: string[];
  };
}

export interface RunConfig {
  scenario: Scenario;
  model: Model;
  withContext: boolean;
  promptStyle: PromptStyle;
  runNumber: number;
}

export interface CodeBlock {
  language: string;
  filename?: string;
  content: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface Violation {
  file: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface RawResult {
  id: string;
  timestamp: string;
  scenarioId: string;
  model: Model;
  withContext: boolean;
  promptStyle: PromptStyle;
  runNumber: number;

  // API response
  responseText: string;
  codeBlocks: CodeBlock[];

  // Metrics
  tokens: TokenUsage;
  durationMs: number;

  // Validation
  violations: Violation[];

  // Context that was provided (if withContext=true)
  contextProvided?: string;
}

export interface Grades {
  /** Did the model produce code? */
  completion: boolean;
  /** 0-5 rubric score */
  correctness: number;
  /** archcodex_check passed? */
  constraintAdherence: boolean;
  /** Files modified in correct order? */
  modificationOrder: boolean;
  /** No layer boundary violations? */
  layerCompliance: boolean;
  /** 0-3 score for consumer awareness */
  impactAwareness: number;
}

export interface EvaluatedResult extends RawResult {
  grades: Grades;
  needsReview: boolean;
  reviewNotes?: string;
}

export interface AggregateStats {
  n: number;
  completionRate: number;
  correctnessMean: number;
  correctnessStd: number;
  constraintAdherenceRate: number;
  modificationOrderRate: number;
  layerComplianceRate: number;
  impactAwarenessMean: number;
  tokensInputMean: number;
  tokensOutputMean: number;
}

export interface Finding {
  category: string;
  observation: string;
  significance: 'high' | 'medium' | 'low';
}

export interface SummaryReport {
  generatedAt: string;
  totalRuns: number;

  byModel: {
    haiku: AggregateStats;
    opus: AggregateStats;
  };

  byContext: {
    with: AggregateStats;
    without: AggregateStats;
  };

  byDifficulty: {
    easy: AggregateStats;
    medium: AggregateStats;
    hard: AggregateStats;
  };

  byPromptStyle: {
    detailed: AggregateStats;
    oneliner: AggregateStats;
  };

  modelXContext: {
    haikuWith: AggregateStats;
    haikuWithout: AggregateStats;
    opusWith: AggregateStats;
    opusWithout: AggregateStats;
  };

  findings: Finding[];
}
