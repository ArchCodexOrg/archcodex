/**
 * @arch archcodex.core.engine
 * @intent:stateless
 *
 * Multi-signal ranking system using Reciprocal Rank Fusion (RRF).
 * Combines path, entity, architecture, import graph, recency, and feedback signals.
 */

import type {
  RankingSignal,
  RankedModule,
  RankingWeights,
} from './types.js';
import { DEFAULT_WEIGHTS } from './types.js';

/**
 * Reciprocal Rank Fusion constant.
 * Higher k = more weight to lower-ranked items.
 */
const RRF_K = 60;

/**
 * Calculate RRF score from multiple rank positions.
 * Formula: score = Σ (1 / (k + rank_i))
 */
export function calculateRRF(ranks: number[], k = RRF_K): number {
  return ranks.reduce((sum, rank) => sum + 1 / (k + rank), 0);
}

/**
 * Combine multiple ranking signals into a final score.
 */
export function combineSignals(
  signals: RankingSignal[],
  weights: RankingWeights = DEFAULT_WEIGHTS
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const signal of signals) {
    const weight = weights[signal.type] ?? 0;
    weightedSum += signal.score * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return (weightedSum / totalWeight) * 100;
}

/**
 * Rank modules by combining all signals.
 */
export function rankModules(
  moduleSignals: Map<string, RankingSignal[]>,
  weights: RankingWeights = DEFAULT_WEIGHTS
): RankedModule[] {
  const results: RankedModule[] = [];

  for (const [path, signals] of moduleSignals) {
    const confidence = combineSignals(signals, weights);

    // Find the highest-scoring signal for primary reason
    const primarySignal = signals.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    // Extract file count and architecture from metadata
    const fileCount = signals.find(s => s.metadata?.fileCount)?.metadata?.fileCount as number ?? 0;
    const architecture = signals.find(s => s.metadata?.architecture)?.metadata?.architecture as string | undefined;

    results.push({
      path,
      confidence: Math.round(confidence * 10) / 10, // Round to 1 decimal
      signals,
      primaryReason: primarySignal.reason,
      fileCount,
      architecture,
    });
  }

  // Sort by confidence descending
  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Merge multiple ranked lists using RRF.
 * Each list contributes independently to the final ranking.
 */
export function mergeRankedLists(
  lists: Map<string, number>[], // path -> score
  k = RRF_K
): Map<string, number> {
  const rrfScores = new Map<string, number>();

  for (const list of lists) {
    // Convert scores to ranks
    const sorted = [...list.entries()].sort((a, b) => b[1] - a[1]);

    sorted.forEach(([path], rank) => {
      const rrfContribution = 1 / (k + rank + 1); // +1 because rank is 0-indexed
      rrfScores.set(path, (rrfScores.get(path) ?? 0) + rrfContribution);
    });
  }

  return rrfScores;
}

/**
 * Normalize scores to 0-1 range.
 */
export function normalizeScores(scores: Map<string, number>): Map<string, number> {
  const values = [...scores.values()];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const normalized = new Map<string, number>();
  for (const [path, score] of scores) {
    normalized.set(path, (score - min) / range);
  }
  return normalized;
}

/**
 * Check if results are ambiguous and need clarification.
 * Returns true if top results are within threshold of each other.
 */
export function needsClarification(
  modules: RankedModule[],
  topN = 3,
  threshold = 10
): boolean {
  if (modules.length < 2) return false;

  const top = modules.slice(0, topN);
  const maxConfidence = top[0].confidence;
  const minConfidence = top[top.length - 1].confidence;

  // If top results are within threshold, clarification helps
  return (maxConfidence - minConfidence) < threshold;
}

/**
 * Apply boost from clarifying question answers.
 */
export function applyBoosts(
  modules: RankedModule[],
  boostKeywords: string[],
  boostPaths: string[]
): RankedModule[] {
  return modules.map(module => {
    let boost = 0;

    // Boost if path matches boosted paths
    for (const boostPath of boostPaths) {
      if (module.path.toLowerCase().includes(boostPath.toLowerCase())) {
        boost += 15;
        break;
      }
    }

    // Boost if signals mention boosted keywords
    for (const signal of module.signals) {
      for (const keyword of boostKeywords) {
        if (signal.reason.toLowerCase().includes(keyword.toLowerCase())) {
          boost += 10;
          break;
        }
      }
    }

    return {
      ...module,
      confidence: Math.min(100, module.confidence + boost),
    };
  }).sort((a, b) => b.confidence - a.confidence);
}
