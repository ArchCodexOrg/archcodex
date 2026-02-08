/**
 * @arch archcodex.core.barrel
 *
 * Barrel export for the analysis engine.
 */

export * from './types.js';
export { buildCrossReferenceGraph } from './graph.js';
export { runAllAnalyses, formatAnalysisResult } from './engine.js';
export {
  securityChecker,
  logicChecker,
  dataChecker,
  consistencyChecker,
  completenessChecker,
  otherChecker,
} from './checkers/index.js';
