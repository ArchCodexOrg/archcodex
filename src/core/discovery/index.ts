/**
 * @arch archcodex.core.barrel
 *
 * Discovery index exports barrel file.
 */
export { IndexSchema, IndexEntrySchema, type Index, type IndexEntry } from './schema.js';
export { matchQuery, getAllEntries, findByArchId, type MatchResult, type MatchOptions } from './matcher.js';
export { loadIndex, getIndexPath, indexExists, loadDecisionTree, getDecisionTreePath, decisionTreeExists } from './loader.js';
export { extractKeywords, extractAllKeywords } from './keyword-extractor.js';
export {
  checkIndexStaleness,
  getStalenessMessage,
  type StalenessResult,
  type StalenessReason,
} from './staleness.js';
export {
  DecisionTreeSchema,
  type DecisionTree,
  type DecisionNode,
  type QuestionNode,
  type ResultNode,
  type TreeNavigationState,
  type DecisionResult,
  validateDecisionTree,
  startNavigation,
  getCurrentNode,
  answerQuestion,
  isDecisionResult,
} from './decision-tree.js';
