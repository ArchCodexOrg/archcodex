/**
 * @arch archcodex.core.barrel
 *
 * Drift detection module exports.
 */
export {
  findUnwiredSpecs,
  formatUnwiredReport,
  type FindUnwiredOptions,
  type FindUnwiredResult,
  type UnwiredSpec,
  type WiringCoverage,
} from './unwired.js';

export {
  findUndocumentedImplementations,
  formatUndocumentedReport,
  type FindUndocumentedOptions,
  type FindUndocumentedResult,
  type UndocumentedFile,
  type UndocumentedSummary,
} from './undocumented.js';

export {
  generateDriftReport,
  formatDriftReport,
  type DriftReportOptions,
  type DriftReportResult,
  type DriftReportSummary,
  type DriftIssue,
  type IssueType,
  type IssueSeverity,
} from './report.js';
