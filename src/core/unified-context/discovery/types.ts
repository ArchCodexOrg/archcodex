/**
 * @arch archcodex.core.types
 *
 * Types for task-to-module discovery system.
 */

/**
 * Individual ranking signal with score and metadata.
 */
export interface RankingSignal {
  /** Signal type identifier */
  type: 'path' | 'entity' | 'architecture' | 'import' | 'recency' | 'feedback';
  /** Raw score (0-1) */
  score: number;
  /** Human-readable reason */
  reason: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Module suggestion with multi-signal ranking.
 */
export interface RankedModule {
  /** Module path */
  path: string;
  /** Final combined score (0-100) */
  confidence: number;
  /** Individual signal scores */
  signals: RankingSignal[];
  /** Primary reason (highest signal) */
  primaryReason: string;
  /** File count in module */
  fileCount: number;
  /** Dominant architecture */
  architecture?: string;
}

/**
 * Clarifying question for query refinement.
 */
export interface ClarifyingQuestion {
  /** Question ID for tracking */
  id: string;
  /** Display text */
  question: string;
  /** Available options */
  options: ClarifyingOption[];
  /** Question category */
  category: 'layer' | 'resource' | 'action' | 'scope';
}

/**
 * Option for a clarifying question.
 */
export interface ClarifyingOption {
  /** Option ID */
  id: string;
  /** Display label */
  label: string;
  /** Keywords to boost if selected */
  boostKeywords: string[];
  /** Paths to prioritize if selected */
  boostPaths: string[];
}

/**
 * User's answers to clarifying questions.
 */
export interface ClarifyingAnswers {
  [questionId: string]: string; // optionId
}

/**
 * Feedback record for learning-to-rank.
 */
export interface SelectionFeedback {
  /** Hash of original task description */
  taskHash: string;
  /** Extracted keywords */
  keywords: string[];
  /** Modules that were selected */
  selectedModules: string[];
  /** Modules that were shown but not selected */
  ignoredModules: string[];
  /** When feedback was recorded */
  timestamp: number;
}

/**
 * Configuration for ranking weights.
 */
export interface RankingWeights {
  path: number;
  entity: number;
  architecture: number;
  import: number;
  recency: number;
  feedback: number;
}

/**
 * Default ranking weights.
 */
export const DEFAULT_WEIGHTS: RankingWeights = {
  path: 0.35,
  entity: 0.25,
  architecture: 0.20,
  import: 0.10,
  recency: 0.05,
  feedback: 0.05,
};

/**
 * Result of task analysis with multi-signal ranking.
 */
export interface EnhancedTaskAnalysis {
  /** Original task description */
  task: string;
  /** Extracted keywords */
  keywords: string[];
  /** Detected entities */
  entities: string[];
  /** Detected action type */
  actionType: 'add' | 'modify' | 'refactor' | 'delete' | 'fix' | 'unknown';
  /** Ranked module suggestions */
  suggestions: RankedModule[];
  /** Generated clarifying questions (if ambiguous) */
  clarifyingQuestions: ClarifyingQuestion[];
  /** Recommended scope */
  scope: 'single-file' | 'single-module' | 'multi-module';
  /** Whether results need clarification */
  needsClarification: boolean;
}
