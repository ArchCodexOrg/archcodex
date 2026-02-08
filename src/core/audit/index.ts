/**
 * @arch archcodex.core.barrel
 *
 * Audit module exports.
 */
export {
  featureAudit,
  auditBackendLayer,
  auditFrontendLayer,
  auditUILayer,
  deriveHandlerName,
  type FeatureAuditResult,
  type FeatureAuditOptions,
  type BackendAuditResult,
  type FrontendAuditResult,
  type UIAuditResult,
  type AuditCheck,
  type UICheck,
  type AuditStatus,
  type LayerStatus,
  type CheckStatus,
  type UICheckStatus,
  type ImplementationStatus,
  type ImplementationAnalysis,
  analyzeImplementationStatus,
} from './feature-audit.js';

export { AuditScanner } from './scanner.js';
export { clusterOverrides } from './cluster.js';
export {
  type AuditReport,
  type AuditedOverride,
  type OverrideCluster,
  type OverrideStatus,
  type FileAuditResult,
  type AuditSummary,
  type AuditOptions,
} from './types.js';
