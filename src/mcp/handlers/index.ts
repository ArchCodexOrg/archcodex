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

// Entity context handler
export { handleEntityContext } from './entity-context.js';
export type { EntityContextOptions } from './entity-context.js';

// Scaffold handlers
export { handleScaffold } from './scaffold.js';
export type { ScaffoldOptions } from './scaffold.js';

// Architecture map handler
export { handleArchitectureMap } from './architecture-map.js';
export type { ArchitectureMapOptions } from './architecture-map.js';

// Unified context handler
export { handleUnifiedContext } from './unified-context.js';
export type { UnifiedContextOptions } from './unified-context.js';

// Spec handlers
export { handleSpecInit, handleSpecScaffoldTouchpoints } from './spec.js';
export type { SpecInitMcpOptions, SpecScaffoldTouchpointsOptions } from './spec.js';

// Feature audit handler
export { handleFeatureAudit } from './feature-audit.js';
export type { FeatureAuditOptions } from './feature-audit.js';

// Analysis handler
export { handleAnalyze } from './analyze.js';
export type { AnalyzeOptions as AnalyzeToolOptions } from './analyze.js';
