/**
 * @arch archcodex.core.barrel
 *
 * Similarity analysis exports.
 */
export { SimilarityAnalyzer, detectDuplicates } from './analyzer.js';
export { findSimilarBlocks } from './block-analyzer.js';
export type {
  FileSignature,
  SimilarityMatch,
  SimilarityOptions,
  MatchedAspect,
  ConsistencyIssue,
  ConsistencyOptions,
} from './types.js';
export type { CodeBlock, BlockMatch, BlockAnalysisOptions } from './block-analyzer.js';
