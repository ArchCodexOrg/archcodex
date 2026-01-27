/**
 * @arch archcodex.cli.mcp
 *
 * Re-exports all MCP tool handlers.
 */

// Meta handlers
export { handleHelp, handleSchema } from './meta.js';
export type { HelpOptions, SchemaOptions } from './meta.js';

// Validation handlers
export { handleCheck, handleRead } from './validation.js';
export type { CheckOptions } from './validation.js';

// Discovery handlers
export { handleDiscover, handleResolve, handleNeighborhood, handleDiffArch } from './discovery.js';
export type { DiscoverOptions } from './discovery.js';

// Health handlers
export { handleHealth, handleSyncIndex, handleConsistency, handleTypes } from './health.js';
export type { ConsistencyOptions, TypesToolOptions } from './health.js';

// Intent handlers
export { handleIntents, handleAction, handleFeature, handleInfer } from './intents.js';
export type { IntentsOptions, ActionToolOptions, FeatureToolOptions, InferOptions } from './intents.js';

// Context handlers
export {
  handleSessionContext,
  handlePlanContext,
  handleValidatePlan,
  handleImpact,
  handleWhy,
  handleDecide,
} from './context.js';
export type {
  SessionContextHandlerOptions,
  PlanContextHandlerOptions,
  ValidatePlanOptions,
  ImpactOptions,
  WhyOptions,
  DecideOptions,
} from './context.js';

// Scaffold handlers
export { handleScaffold } from './scaffold.js';
export type { ScaffoldOptions } from './scaffold.js';
